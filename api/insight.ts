import { generateInsight } from "./_insight-core";

// Edge runtime: the handler is a plain Request -> Response function, which is
// the same shape the Vite dev middleware emulates, so dev and prod run one
// code path. Note the platform's 25s initial-response budget -- max_tokens in
// _insight-core.ts is capped with that in mind.
export const config = { runtime: "edge" };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Chỉ nhận POST" }, 405);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body không phải JSON" }, 400);
  }

  try {
    return json(await generateInsight(body, process.env), 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    console.error("[insight]", message);
    return json({ error: message }, 502);
  }
}
