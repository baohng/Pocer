import { BadRequestError, generateInsight } from "./_insight-core";
import { clientIp, rateLimit } from "./_rate-limit";

// Edge runtime: the handler is a plain Request -> Response function, which is
// the same shape the Vite dev middleware emulates, so dev and prod run one
// code path. Note the platform's 25s initial-response budget -- max_tokens in
// _insight-core.ts is capped with that in mind.
export const config = { runtime: "edge" };

/** A real month's facts run a few KB. This is the outermost cap on how much
 *  prompt a caller can buy with someone else's API key; the per-field caps in
 *  _insight-core.ts do the fine-grained work. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Chỉ nhận POST" }, 405);

  const limit = rateLimit(clientIp(request.headers));
  if (!limit.allowed) {
    return json(
      { error: `Bạn gọi hơi nhiều, thử lại sau ${limit.retryAfterSeconds}s` },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "Payload quá lớn" }, 413);

  let body: unknown;
  try {
    const raw = await request.text();
    // Content-Length can lie or be absent, so measure what actually arrived.
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Payload quá lớn" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Body không phải JSON" }, 400);
  }

  try {
    return json(await generateInsight(body, process.env), 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    // A malformed request is the caller's fault and says so; anything else is
    // an upstream failure and is logged for us rather than blamed on them.
    if (error instanceof BadRequestError) return json({ error: message }, 400);
    console.error("[insight]", message);
    return json({ error: message }, 502);
  }
}
