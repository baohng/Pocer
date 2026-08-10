// Round-trip + tamper test for utils/share.ts.
// Run: node --experimental-strip-types scripts/test-share.mjs
import { encodeSession, decodeSession } from "../src/utils/share.ts";

// --- Shim browser globals the module relies on ---
const origin = "https://pocer.vercel.app";
const pathname = "/";
globalThis.window = {
  location: { origin, pathname, hash: "" },
  crypto: globalThis.crypto,
};
globalThis.history = {
  replaceState() {},
};

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ✓ " + msg);
  } else {
    failed++;
    console.error("  ✗ " + msg);
  }
}

function makeSession() {
  return {
    phase: "playing",
    players: [
      { id: "a", name: "Đạt", active: true, stacksBought: 3, chipsReturned: null, cashedOut: false },
      { id: "b", name: "Hải", active: true, stacksBought: 1, chipsReturned: 5000, cashedOut: true },
      { id: "c", name: "Bình", active: false, stacksBought: 0, chipsReturned: null, cashedOut: false },
    ],
    buyLog: [
      { playerId: "a", playerName: "Đạt" },
      { playerId: "a", playerName: "Đạt" },
    ],
    undoneEntry: null,
  };
}

async function main() {
  const session = makeSession();

  // 1. Encode produces a URL with #join=
  const payload = await encodeSession(session);
  assert(payload.url.includes("#join="), "encoded URL contains #join=");
  assert(payload.url.startsWith(origin + pathname + "#join="), "URL is built from window.location");
  assert(/^[A-Z0-9]{4}$/.test(payload.code), "share code is 4 uppercase alnum chars");

  // 2. Round-trip: decode(token) === original (deep equal on fields we sent)
  const token = payload.url.split("#join=")[1];
  const decoded = await decodeSession(token);
  assert(decoded !== null, "decoded token is not null");
  assert(decoded.phase === "playing", "phase round-trips");
  assert(decoded.players.length === 3, "player count round-trips");
  assert(decoded.players[0].name === "Đạt", "unicode name round-trips");
  assert(decoded.players[0].stacksBought === 3, "stacksBought round-trips");
  assert(decoded.players[1].chipsReturned === 5000, "chipsReturned round-trips");
  assert(decoded.players[2].active === false, "inactive flag round-trips");
  assert(decoded.buyLog.length === 2, "buyLog round-trips");

  // 3. Tamper detection: flip one byte in the payload, signature should fail
  const [payloadB64, sigB64] = token.split(".");
  // Corrupt by swapping first payload char
  const corruptPayload =
    (payloadB64[0] === "A" ? "B" : "A") + payloadB64.slice(1);
  const tampered = corruptPayload + "." + sigB64;
  const tamperedDecoded = await decodeSession(tampered);
  assert(tamperedDecoded === null, "tampered payload is rejected");

  // 4. Tamper the signature instead
  const corruptSig = (sigB64[0] === "A" ? "B" : "A") + sigB64.slice(1);
  const tamperedSig = payloadB64 + "." + corruptSig;
  const tamperedSigDecoded = await decodeSession(tamperedSig);
  assert(tamperedSigDecoded === null, "tampered signature is rejected");

  // 5. Garbage token rejected
  const garbage = await decodeSession("not-a-real-token");
  assert(garbage === null, "garbage token is rejected");

  // 6. Migration: payload missing newer fields still loads with defaults
  const legacyJson = JSON.stringify({
    phase: "playing",
    players: [
      { id: "x", name: "Old", stacksBought: 2 }, // no active/cashedOut/chipsReturned
      { id: "y", name: "Other", stacksBought: 1 },
    ],
    buyLog: [],
    undoneEntry: null,
  });
  // Re-encode via the same HMAC path by constructing a token manually:
  // we can't access internals, so instead decode a token we craft from
  // encodeSession of a normalized legacy session.
  const legacySession = {
    phase: "playing",
    players: [
      { id: "x", name: "Old", active: undefined, stacksBought: 2, chipsReturned: undefined, cashedOut: undefined },
      { id: "y", name: "Other", active: undefined, stacksBought: 1, chipsReturned: undefined, cashedOut: undefined },
    ],
    buyLog: [],
    undoneEntry: null,
  };
  const legacyPayload = await encodeSession(legacySession);
  const legacyDecoded = await decodeSession(legacyPayload.url.split("#join=")[1]);
  assert(legacyDecoded !== null, "legacy-shape payload decodes");
  assert(legacyDecoded.players[0].active === true, "missing active backfilled to true");
  assert(legacyDecoded.players[0].cashedOut === false, "missing cashedOut backfilled to false");
  assert(legacyDecoded.players[0].chipsReturned === null, "missing chipsReturned backfilled to null");

  // suppress unused warning
  void legacyJson;

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
