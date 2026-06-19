import type { Session, Player } from "../types";

/** Baked-in HMAC key. This provides INTEGRITY (stops URL tampering with
 *  buy-ins), not secrecy — anyone with the link can read the session, which
 *  matches the "anyone with the code" access model. Changing this key
 *  invalidates all outstanding share links. */
const SHARE_SECRET = "pocer-share-v1-7f3a9b2e";

const JOIN_PREFIX = "join=";

/** Migrate a decoded player payload so a link shared from an older app version
 *  still loads — mirrors the migration-on-load pattern in storage.ts. */
function migratePlayers(players: unknown[]): Player[] {
  return players.map((p) => {
    const player = p as Partial<Player>;
    return {
      id: String(player.id ?? crypto.randomUUID()),
      name: String(player.name ?? "Player"),
      active: player.active ?? true,
      stacksBought: Number(player.stacksBought ?? 0),
      chipsReturned:
        player.chipsReturned === null || player.chipsReturned === undefined
          ? null
          : Number(player.chipsReturned),
      cashedOut: player.cashedOut ?? false,
    };
  });
}

/** Shape-check + migrate a raw decoded session. Returns null if invalid. */
function normalizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.players) || obj.players.length < 2) return null;

  const phase = obj.phase as Session["phase"];
  if (phase !== "setup" && phase !== "playing" && phase !== "cashout" && phase !== "summary") {
    return null;
  }

  const buyLog = Array.isArray(obj.buyLog) ? obj.buyLog : [];
  const undoneEntry =
    obj.undoneEntry && typeof obj.undoneEntry === "object"
      ? (obj.undoneEntry as Session["undoneEntry"])
      : null;

  return {
    phase,
    players: migratePlayers(obj.players),
    buyLog,
    undoneEntry,
  };
}

// --- base64url helpers (UTF-8 safe) ---

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode base64url to bytes backed by a plain ArrayBuffer (satisfies Web
 *  Crypto's BufferSource under TS's stricter Uint8Array<ArrayBufferLike>). */
function base64urlToBytes(str: string): ArrayBuffer | null {
  try {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer.slice(0, bin.length) as ArrayBuffer;
  } catch {
    return null;
  }
}

/** Coerce a Uint8Array (which may be ArrayBufferLike-backed) into a plain
 *  ArrayBuffer so it satisfies Web Crypto's BufferSource under TS's stricter
 *  Uint8Array<ArrayBufferLike> typing. */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBuffer(new TextEncoder().encode(SHARE_SECRET)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface SharePayload {
  /** Full shareable URL with the session encoded in the fragment. */
  url: string;
  /** The raw token (everything after `#join=`), for QR codes / fallbacks. */
  token: string;
  /** Short human-readable slug derived from the signature, for display. */
  code: string;
}

/** Serialize + sign the session and build a shareable URL.
 *  Only the current session travels — history stays on the sender's device. */
export async function encodeSession(session: Session): Promise<SharePayload> {
  const json = JSON.stringify({
    phase: session.phase,
    players: session.players,
    buyLog: session.buyLog,
    undoneEntry: session.undoneEntry,
  });
  const payloadBytes = new TextEncoder().encode(json);

  const key = await hmacKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toBuffer(payloadBytes))
  );

  // Token = payload . signature (both base64url), joined by ".".
  const token =
    bytesToBase64url(payloadBytes) + "." + bytesToBase64url(sig);

  const base = `${window.location.origin}${window.location.pathname}`;
  const url = `${base}#${JOIN_PREFIX}${token}`;
  const code = bytesToBase64url(sig.slice(0, 4)).toUpperCase().slice(0, 4);

  return { url, token, code };
}

/** Read the join token from the current URL fragment, if present. */
export function readJoinTokenFromUrl(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.startsWith(JOIN_PREFIX)) return null;
  return hash.slice(JOIN_PREFIX.length) || null;
}

/** Verify the signature and decode the session. Returns null on any failure
 *  (bad signature, truncation, or invalid shape). */
export async function decodeSession(token: string): Promise<Session | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const payloadBytes = base64urlToBytes(payloadB64);
  const sigBytes = base64urlToBytes(sigB64);
  if (!payloadBytes || !sigBytes) return null;

  const key = await hmacKey();
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
  if (!ok) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  return normalizeSession(parsed);
}

/** Strip the `#join=...` fragment from the current URL so a refresh or
 *  back-navigation doesn't re-trigger the join screen. */
export function clearJoinTokenFromUrl(): void {
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
