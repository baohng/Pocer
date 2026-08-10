// Shared core for the AI insight endpoint. Kept free of any HTTP framework so
// both the Vercel function (api/insight.ts) and the Vite dev middleware
// (vite.config.ts) can call it directly. The `_` prefix keeps Vercel from
// routing it as an endpoint of its own.
//
// Type-only imports of client code: erased at build time, so this file carries
// no runtime dependency on the React app or on Supabase.
import type { MonthFacts, PlayerFacts, SessionResult } from "../src/utils/analytics";
import type { Insight, InsightRequest, InsightResponse } from "../src/utils/insight";

type Env = Record<string, string | undefined>;

const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";

/** Below this many games in a month, every read is noise -- the prompt is
 *  required to say so out loud rather than declaring anyone a crusher. */
const SMALL_SAMPLE = 15;

/** Rules that hold whatever the scope is: what the data can support, and what
 *  the model is never allowed to invent. Deliberately separate from the tone
 *  and length rules below -- loosening the writing must not loosen these. */
const TRUTH_RULES = `DỮ LIỆU BẠN CÓ: chỉ là tiền vào / tiền ra của mỗi buổi. KHÔNG có hand history, không có vị trí, không có bài, không có thời lượng buổi chơi.

LUẬT BẮT BUỘC (không được vi phạm dù chỉ để câu chữ hay hơn):
1. Chỉ dùng những con số xuất hiện trong FACTS. Tuyệt đối không tự tính toán, không cộng trừ, không suy ra số mới.
2. Khi nhắc tới tiền, chép nguyên chuỗi trong các trường "text" (ví dụ "+708.750 VND"). Không viết lại số theo cách khác.
3. Không bao giờ nói về cách chơi từng ván bài, kiểu bluff, hay tay bài cụ thể — bạn không có dữ liệu đó. Chỉ được suy luận từ hình dạng đường tiền, và khi suy luận thì phải nói rõ đó là suy đoán ("có vẻ", "nhiều khả năng", "hoặc ... hoặc ...").
4. Nếu gameCount < ${SMALL_SAMPLE}, bắt buộc có ít nhất một bullet cảnh báo cỡ mẫu còn nhỏ.
5. Nếu một người có concentration > 0.5, phải nói rõ lợi nhuận của họ phụ thuộc vào một buổi spike duy nhất, KHÔNG được gọi đó là thống trị hay skill gap.
6. Trường "curve" chỉ để bạn đọc hình dạng (tăng đều / nhấp nhô / gãy). Đơn vị là NGHÌN VND. Không trích số từ curve.`;

/** Tone. The group wants to be roasted, so the guardrail is about targets --
 *  the data is fair game, the person is not. */
const TONE_RULES = `GIỌNG VĂN: bạn là thằng bạn trong nhóm mồm độc nhất, vừa đọc bảng tiền vừa cà khịa cả hội. Hài hước, ví von đời thường, cường điệu có duyên. Được đặt biệt danh vui cho từng người, nhưng biệt danh phải bắt nguồn từ số liệu của họ (chuỗi thua dài, drawdown sâu, mua nhiều stack, ăn một cú rồi im...).

Được cà khịa thoải mái chuyện thắng thua, xui, tilt, nạp tiền. TUYỆT ĐỐI không đụng tới ngoại hình, gia đình, công việc, hay tình hình tài chính thật của ai — bạn không biết gì về những thứ đó. Không văng tục. Cà khịa xong vẫn phải có nhận xét tử tế và chính xác về mặt số liệu, đừng biến cả bài thành trò đùa.

Giữ nguyên jargon poker (EV, variance, drawdown, run hot, snowball, downswing, sample, tilt).`;

const JSON_SCHEMA = `ĐỊNH DẠNG TRẢ VỀ: chỉ JSON thuần, không markdown, không rào \`\`\`. Schema:
{
  "headline": "một câu tóm gọn, có thể kèm tên người nổi bật",
  "sections": [
    { "title": "tiêu đề ngắn, được phép giật tít", "quote": "câu chốt đắt giá (tuỳ chọn, bỏ qua được)", "bullets": ["...", "..."] }
  ]
}`;

/** Length and coverage. Split by scope: a whole-table read has to carry eight
 *  people and needs room, while a soloed player gets the tight punchy format
 *  the group asked for in the first place. */
const TABLE_LENGTH_RULES = `ĐỘ DÀI & PHỦ SÓNG:
- Trả về 5 đến 7 section, mỗi section 2 đến 6 bullet. Mỗi bullet tối đa khoảng 25 từ, được phép là câu hoàn chỉnh có vế.
- BẮT BUỘC: mọi người có tên trong FACTS đều phải được nhắc tới ít nhất một lần. Không ai bị bỏ quên, kể cả người chơi ít buổi hay kết quả nhạt nhoà.
- Trong đó phải có đúng một section tên "Điểm danh cả bàn": mỗi người một bullet, gọn, kèm số của họ, cà khịa một câu.
- Các section còn lại thì tự do: ai đang ăn tiền của ai, ai kiểm soát variance tốt, ai đang downswing, cú spike nào đáng nhớ, ai nạp đều như đóng học phí.
- Ưu tiên nhiều section ngắn hơn là ít section dài.`;

const PLAYER_LENGTH_RULES = `ĐỘ DÀI:
- Trả về 4 đến 6 section, mỗi section 2 đến 5 bullet. Mỗi bullet tối đa khoảng 20 từ.
- Viết sắc và dồn, kiểu bình luận highlight — không lan man.
- Được so sánh với người khác trong FACTS để làm nổi bật nhân vật chính, nhưng trọng tâm luôn là họ.`;

function buildSystemPrompt(focused: boolean): string {
  return [
    "Bạn viết bình luận bankroll cho một nhóm bạn chơi poker cash game tiền mặt ở Việt Nam. Họ chơi với nhau lâu năm và thích bị cà khịa.",
    TRUTH_RULES,
    TONE_RULES,
    focused ? PLAYER_LENGTH_RULES : TABLE_LENGTH_RULES,
    JSON_SCHEMA,
  ].join("\n\n");
}

// Caps on anything that reaches the prompt. The endpoint is public and the
// whole facts object is client-supplied, so without these a caller could pad
// the payload into an expensive prompt and spend the account's credit. Sized
// well above what a real month produces: 20 players, 80 games.
const MAX_PLAYERS = 20;
const MAX_CURVE = 80;
const MAX_TOP_SESSIONS = 5;
const MAX_NAME = 40;
const MAX_MONEY = 32;
const MAX_LABEL = 24;

/** Coerces to a single-line string of bounded length. Newlines and control
 *  characters go first: they are what lets injected text pose as a new
 *  instruction block once the facts are stringified into the prompt. */
function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, max);
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asArray<T>(value: T[] | undefined, max: number): T[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/** The single gate every request passes through: rebuilds the facts field by
 *  field, so unknown properties are dropped and every string and array is
 *  clamped. Everything downstream -- prompt and mock alike -- reads the result
 *  of this rather than the raw request. */
function sanitizeFacts(facts: MonthFacts): MonthFacts {
  const session = (s: SessionResult | undefined) => ({
    label: text(s?.label, MAX_LABEL),
    net: num(s?.net),
    text: text(s?.text, MAX_MONEY),
  });

  return {
    monthKey: text(facts.monthKey, MAX_LABEL),
    gameCount: num(facts.gameCount),
    totalMoved: num(facts.totalMoved),
    totalMovedText: text(facts.totalMovedText, MAX_MONEY),
    players: asArray(facts.players, MAX_PLAYERS).map((p) => ({
      key: text(p?.key, MAX_NAME),
      name: text(p?.name, MAX_NAME),
      net: num(p?.net),
      netText: text(p?.netText, MAX_MONEY),
      sessions: num(p?.sessions),
      wins: num(p?.wins),
      losses: num(p?.losses),
      best: p?.best ? session(p.best) : null,
      worst: p?.worst ? session(p.worst) : null,
      topSessions: asArray(p?.topSessions, MAX_TOP_SESSIONS).map(session),
      longestWinStreak: num(p?.longestWinStreak),
      longestLoseStreak: num(p?.longestLoseStreak),
      currentStreak: num(p?.currentStreak),
      maxDrawdown: num(p?.maxDrawdown),
      maxDrawdownText: text(p?.maxDrawdownText, MAX_MONEY),
      stdev: num(p?.stdev),
      stdevText: text(p?.stdevText, MAX_MONEY),
      avgStacks: num(p?.avgStacks),
      concentration: typeof p?.concentration === "number" ? num(p.concentration) : null,
      curve: asArray(p?.curve, MAX_CURVE).map(num),
    })),
  };
}

/** Reshapes already-sanitised facts into what the model should reason over:
 *  internal keys dropped, money reduced to its pre-formatted string, and the
 *  curve rescaled to thousands so it reads as a shape rather than a list of
 *  quotable numbers. */
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
    focus: (focus && facts.players.find((p) => p.key === focus)?.name) || null,
    players: facts.players.map(player),
  };
}

function buildUserPrompt(facts: MonthFacts, focus: string | null): string {
  const safe = toPromptFacts(facts, focus);
  const task = safe.focus
    ? `Mổ xẻ riêng đường bankroll của ${safe.focus} trong tháng ${safe.month}, đặt trong tương quan với cả bàn. Trọng tâm là ${safe.focus}, những người khác chỉ dùng để so sánh.`
    : `Phân tích cả bàn ${safe.players.length} người trong tháng ${safe.month}: ai đang ăn tiền của ai, đường tiền của từng người có hình dạng gì, ai kiểm soát variance tốt, ai đang trong downswing. Nhớ là cả ${safe.players.length} người đều phải được gọi tên.`;

  return `${task}

FACTS:
${JSON.stringify(safe, null, 1)}`;
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

/** The caller sent something malformed, as opposed to an upstream failure.
 *  `name` is set explicitly so the Vite dev middleware can recognise it across
 *  a module boundary without an instanceof check. */
export class BadRequestError extends Error {
  name = "BadRequestError";
}

function assertValidRequest(body: unknown): asserts body is InsightRequest {
  const req = body as Partial<InsightRequest>;
  if (!req || typeof req !== "object") throw new BadRequestError("Body không hợp lệ");
  if (!req.facts || !Array.isArray(req.facts.players)) {
    throw new BadRequestError("Thiếu facts");
  }
  if (req.facts.players.length === 0) {
    throw new BadRequestError("Tháng này chưa có dữ liệu để phân tích");
  }
  if (req.facts.players.length > MAX_PLAYERS) {
    throw new BadRequestError(`Tối đa ${MAX_PLAYERS} người chơi mỗi lần phân tích`);
  }
  if (req.focus != null && typeof req.focus !== "string") {
    throw new BadRequestError("focus phải là chuỗi hoặc null");
  }
}

export async function generateInsight(body: unknown, env: Env): Promise<InsightResponse> {
  assertValidRequest(body);
  // Nothing below this line ever touches the raw request again.
  const facts = sanitizeFacts(body.facts);
  const focus = body.focus ? text(body.focus, MAX_NAME) : null;

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { insight: mockInsight(facts, focus), model: "mock" };
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
        { role: "system", content: buildSystemPrompt(!!focus) },
        { role: "user", content: buildUserPrompt(facts, focus) },
      ],
      response_format: { type: "json_object" },
      // Warmer than default: the group asked to be roasted, and a dry model
      // writes dry jokes. The truth rules, not the temperature, keep it honest.
      temperature: 1.0,
      // A whole-table read has to name everyone, so it needs roughly double the
      // room of a single-player one. Both stay inside the edge function's 25s
      // initial-response budget on a fast model.
      max_tokens: focus ? 1600 : 3000,
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
