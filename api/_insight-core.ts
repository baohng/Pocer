// Shared core for the AI insight endpoint. Kept free of any HTTP framework so
// both the Vercel function (api/insight.ts) and the Vite dev middleware
// (vite.config.ts) can call it directly. The `_` prefix keeps Vercel from
// routing it as an endpoint of its own.
//
// Type-only imports of client code: erased at build time, so this file carries
// no runtime dependency on the React app or on Supabase.
import type { MonthFacts, PlayerFacts } from "../src/utils/analytics";
import type { Insight, InsightRequest, InsightResponse } from "../src/utils/insight";

type Env = Record<string, string | undefined>;

const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";

/** Below this many games in a month, every read is noise -- the prompt is
 *  required to say so out loud rather than declaring anyone a crusher. */
const SMALL_SAMPLE = 15;

const SYSTEM_PROMPT = `Bạn là một reg poker cash game khó tính, viết bình luận bankroll cho một nhóm bạn chơi tiền mặt ở Việt Nam. Giọng thẳng, sắc, hơi cà khịa nhưng không xúc phạm. Giữ nguyên jargon poker (EV, variance, drawdown, run hot, snowball, downswing, sample).

DỮ LIỆU BẠN CÓ: chỉ là tiền vào / tiền ra của mỗi buổi. KHÔNG có hand history, không có vị trí, không có bài, không có thời lượng buổi chơi.

LUẬT BẮT BUỘC:
1. Chỉ dùng những con số xuất hiện trong FACTS. Tuyệt đối không tự tính toán, không cộng trừ, không suy ra số mới.
2. Khi nhắc tới tiền, chép nguyên chuỗi trong các trường "text" (ví dụ "+708.750 VND"). Không viết lại số theo cách khác.
3. Không bao giờ nói về cách chơi từng ván bài, kiểu bluff, hay tay bài cụ thể — bạn không có dữ liệu đó. Chỉ được suy luận từ hình dạng đường tiền, và khi suy luận thì phải nói rõ đó là suy đoán ("có vẻ", "nhiều khả năng", "hoặc ... hoặc ...").
4. Nếu gameCount < ${SMALL_SAMPLE}, bắt buộc có ít nhất một bullet cảnh báo cỡ mẫu còn nhỏ.
5. Nếu một người có concentration > 0.5, phải nói rõ lợi nhuận của họ phụ thuộc vào một buổi spike duy nhất, KHÔNG được gọi đó là thống trị hay skill gap.
6. Trường "curve" chỉ để bạn đọc hình dạng (tăng đều / nhấp nhô / gãy). Đơn vị là NGHÌN VND. Không trích số từ curve.
7. Mỗi bullet là một câu ngắn, tối đa khoảng 15 từ. Không viết đoạn văn dài.

ĐỊNH DẠNG TRẢ VỀ: chỉ JSON thuần, không markdown, không rào \`\`\`. Schema:
{
  "headline": "một câu tóm gọn cả tháng, có thể kèm tên người nổi bật",
  "sections": [
    { "title": "tiêu đề ngắn", "quote": "câu chốt đắt giá (tuỳ chọn, bỏ qua được)", "bullets": ["...", "..."] }
  ]
}
Trả về 3 đến 5 section, mỗi section 2 đến 5 bullet.`;

/** Trims the facts down to what the model should reason over: internal keys
 *  dropped, the curve rescaled to thousands so it reads as a shape rather than
 *  a list of quotable numbers. */
function toPromptFacts(facts: MonthFacts, focus: string | null) {
  const player = (p: PlayerFacts) => ({
    name: p.name,
    net: p.netText,
    sessions: p.sessions,
    wins: p.wins,
    losses: p.losses,
    best: p.best && { label: p.best.label, text: p.best.text },
    worst: p.worst && { label: p.worst.label, text: p.worst.text },
    topSessions: p.topSessions.map((s) => ({ label: s.label, text: s.text })),
    longestWinStreak: p.longestWinStreak,
    longestLoseStreak: p.longestLoseStreak,
    currentStreak: p.currentStreak,
    maxDrawdown: p.maxDrawdownText,
    stdev: p.stdevText,
    avgStacks: p.avgStacks,
    concentration: p.concentration,
    curve: p.curve.map((v) => Math.round(v / 1000)),
  });

  return {
    month: facts.monthKey,
    gameCount: facts.gameCount,
    totalMoved: facts.totalMovedText,
    focus: focus ? facts.players.find((p) => p.key === focus)?.name ?? null : null,
    players: facts.players.map(player),
  };
}

function buildUserPrompt(facts: MonthFacts, focus: string | null): string {
  const target = focus ? facts.players.find((p) => p.key === focus) : null;
  const task = target
    ? `Mổ xẻ riêng đường bankroll của ${target.name} trong tháng ${facts.monthKey}, đặt trong tương quan với cả bàn. Trọng tâm là ${target.name}, những người khác chỉ dùng để so sánh.`
    : `Phân tích cả bàn trong tháng ${facts.monthKey}: ai đang ăn tiền của ai, đường tiền của từng người có hình dạng gì, ai kiểm soát variance tốt, ai đang trong downswing.`;

  return `${task}

FACTS:
${JSON.stringify(toPromptFacts(facts, focus), null, 1)}`;
}

/** Accepts the model's raw text and returns an Insight, or throws. Tolerates a
 *  ```json fence even though the prompt forbids one. */
function parseInsight(raw: string): Insight {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Model trả về JSON không hợp lệ");
  }

  const obj = parsed as Partial<Insight>;
  if (typeof obj.headline !== "string" || !Array.isArray(obj.sections)) {
    throw new Error("Model trả về thiếu headline hoặc sections");
  }

  const sections = obj.sections
    .filter((s): s is Insight["sections"][number] => !!s && typeof s.title === "string")
    .map((s) => ({
      title: s.title,
      ...(typeof s.quote === "string" && s.quote.trim() ? { quote: s.quote } : {}),
      bullets: Array.isArray(s.bullets) ? s.bullets.filter((b) => typeof b === "string") : [],
    }))
    .filter((s) => s.bullets.length > 0 || s.quote);

  if (sections.length === 0) throw new Error("Model không trả về section nào dùng được");
  return { headline: obj.headline, sections };
}

/** Stand-in used when no API key is configured: a real-numbers summary built
 *  straight from the facts, so the UI can be built and styled before anyone
 *  pays for a token. Never cached -- see StatsScreen. */
function mockInsight(facts: MonthFacts, focus: string | null): Insight {
  const target = focus ? facts.players.find((p) => p.key === focus) : null;
  const top = facts.players[0];
  const bottom = facts.players[facts.players.length - 1];
  const subject = target ?? top;

  const sections: Insight["sections"] = [];

  if (subject) {
    sections.push({
      title: `Đường tiền của ${subject.name}`,
      quote: `${subject.sessions} buổi, kết tháng ở ${subject.netText}`,
      bullets: [
        `Thắng ${subject.wins} / thua ${subject.losses} buổi.`,
        subject.best ? `Buổi đậm nhất: ${subject.best.text} (${subject.best.label}).` : "Chưa có buổi thắng nào.",
        subject.worst ? `Buổi tệ nhất: ${subject.worst.text} (${subject.worst.label}).` : "Chưa có buổi thua nào.",
        `Drawdown sâu nhất: ${subject.maxDrawdownText}.`,
        `Độ lệch chuẩn mỗi buổi: ${subject.stdevText}.`,
      ],
    });
  }

  if (top && bottom && top !== bottom) {
    sections.push({
      title: "Dòng tiền cả bàn",
      bullets: [
        `Tổng tiền đổi chủ: ${facts.totalMovedText}.`,
        `Ăn đậm nhất: ${top.name} (${top.netText}).`,
        `Nạp nhiều nhất: ${bottom.name} (${bottom.netText}).`,
      ],
    });
  }

  sections.push({
    title: "Cảnh báo",
    bullets: [
      "Đây là bản mock, chưa gọi AI thật.",
      "Điền DEEPSEEK_API_KEY để có phân tích thật.",
      ...(facts.gameCount < SMALL_SAMPLE
        ? [`Cỡ mẫu mới ${facts.gameCount} buổi, mọi kết luận đều còn yếu.`]
        : []),
    ],
  });

  return {
    headline: subject
      ? `${subject.name} kết tháng ${facts.monthKey} ở ${subject.netText}`
      : `Tháng ${facts.monthKey}: chưa có dữ liệu`,
    sections,
  };
}

function assertValidRequest(body: unknown): asserts body is InsightRequest {
  const req = body as Partial<InsightRequest>;
  if (!req || typeof req !== "object") throw new Error("Body không hợp lệ");
  if (!req.facts || !Array.isArray(req.facts.players)) throw new Error("Thiếu facts");
  if (req.facts.players.length === 0) throw new Error("Tháng này chưa có dữ liệu để phân tích");
}

export async function generateInsight(body: unknown, env: Env): Promise<InsightResponse> {
  assertValidRequest(body);
  const { facts, focus } = body;

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { insight: mockInsight(facts, focus ?? null), model: "mock" };
  }

  const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const baseUrl = (env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(facts, focus ?? null) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`DeepSeek trả về ${res.status}: ${detail}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek trả về phản hồi rỗng");

  return { insight: parseInsight(content), model };
}
