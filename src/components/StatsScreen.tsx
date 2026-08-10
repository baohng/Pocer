import { useCallback, useEffect, useMemo, useState, type Dispatch } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GameRecord, Action } from "../types";
import { buildNetWorthSeries, groupGamesByAccountingMonth } from "../utils/history";
import { displayName, formatVND } from "../utils/format";
import { buildMonthFacts } from "../utils/analytics";
import {
  fetchCachedInsight,
  hashFacts,
  insightKey,
  requestInsight,
  saveInsight,
  type Insight,
} from "../utils/insight";
import { useMediaQuery } from "../hooks/useMediaQuery";

interface Props {
  history: GameRecord[];
  dispatch: Dispatch<Action>;
}

const LINE_COLORS = [
  "#ef4444", "#eab308", "#a5b4fc", "#f9a8d4", "#14b8a6",
  "#6366f1", "#22c55e", "#9ca3af", "#a855f7", "#22d3ee",
  "#f97316", "#84cc16",
];

const POINT_WIDTH = 56; // px per session column, drives horizontal scroll on mobile
const WIDE_QUERY = "(min-width: 900px)";

export default function StatsScreen({ history, dispatch }: Props) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const monthGroups = useMemo(() => groupGamesByAccountingMonth(history), [history]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedIndex = selectedKey
    ? monthGroups.findIndex((g) => g.key === selectedKey)
    : -1;
  const activeIndex = selectedIndex === -1 ? monthGroups.length - 1 : selectedIndex;
  const activeGroup = monthGroups[activeIndex];
  const monthGames = useMemo(() => activeGroup?.games ?? [], [activeGroup]);

  const series = useMemo(() => buildNetWorthSeries(monthGames), [monthGames]);

  // null means "every line is shown". A non-null set is an explicit selection;
  // it never goes empty — emptying it falls back to null so the chart is never
  // blank. Months don't share a roster, so changing month resets the selection.
  const [visible, setVisible] = useState<Set<string> | null>(null);
  const isVisible = (name: string) => visible === null || visible.has(name);
  const isSoloed = (name: string) => visible !== null && visible.size === 1 && visible.has(name);

  function goPrevMonth() {
    if (activeIndex > 0) {
      setSelectedKey(monthGroups[activeIndex - 1].key);
      setVisible(null);
    }
  }
  function goNextMonth() {
    if (activeIndex < monthGroups.length - 1) {
      setSelectedKey(monthGroups[activeIndex + 1].key);
      setVisible(null);
    }
  }

  /** Row tap: isolate this line, or restore every line if it is already alone. */
  function solo(name: string) {
    setVisible((prev) =>
      prev !== null && prev.size === 1 && prev.has(name) ? null : new Set([name])
    );
  }

  /** Chip tap: add this line to the current selection, or drop it from it. */
  function toggle(name: string) {
    setVisible((prev) => {
      const next = new Set(prev ?? series.map((s) => s.name));
      if (next.has(name)) next.delete(name);
      else next.add(name);
      if (next.size === 0 || next.size === series.length) return null;
      return next;
    });
  }

  // --- AI insight -------------------------------------------------------
  // Scope follows the chart: soloing a player switches the analysis to them.
  const focus = visible !== null && visible.size === 1 ? Array.from(visible)[0] : null;
  const facts = useMemo(
    () => buildMonthFacts(activeGroup?.key ?? "", monthGames),
    [activeGroup, monthGames]
  );
  const cacheKey = insightKey(facts.monthKey, focus);
  const factsHash = useMemo(() => hashFacts(facts), [facts]);

  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightMeta, setInsightMeta] = useState<{ model: string; createdAt: string } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  // Changing month or focus swaps to a different insight entirely. A cached one
  // only counts when it was generated from these exact facts -- otherwise the
  // panel falls back to the generate button rather than showing a summary that
  // no longer matches the chart.
  useEffect(() => {
    let cancelled = false;
    setInsight(null);
    setInsightMeta(null);
    setInsightError(null);
    fetchCachedInsight(cacheKey, factsHash).then((cached) => {
      if (cancelled || !cached) return;
      setInsight(cached.insight);
      setInsightMeta({ model: cached.model, createdAt: cached.createdAt });
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, factsHash]);

  const generateInsight = useCallback(async () => {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const response = await requestInsight({ facts, focus });
      setInsight(response.insight);
      // Mock output never reaches the cache -- it would otherwise sit there
      // masking the real thing once a key is configured.
      const createdAt =
        response.model === "mock"
          ? new Date().toISOString()
          : await saveInsight(cacheKey, factsHash, response);
      setInsightMeta({ model: response.model, createdAt });
    } catch (error) {
      setInsightError(error instanceof Error ? error.message : "Gọi AI thất bại");
    } finally {
      setInsightLoading(false);
    }
  }, [facts, focus, cacheKey, factsHash]);

  const pointCount = series[0]?.points.length ?? 0;
  const chartData = useMemo(() => {
    if (pointCount === 0) return [];
    return Array.from({ length: pointCount }, (_, i) => {
      const row: Record<string, string | number> = {
        label: series[0].points[i].label,
      };
      for (const s of series) row[s.name] = s.points[i].cumulative;
      return row;
    });
  }, [series, pointCount]);

  const chartWidth = Math.max(pointCount * POINT_WIDTH, 280);

  return (
    <div className="screen stats-screen">
      <div className="section-header">
        <button
          className="btn-back"
          onClick={() => dispatch({ type: "CLOSE_STATS" })}
          aria-label="Back"
        >
          ← Back
        </button>
        <h2>Net Worth</h2>
        <span className="player-count">{monthGames.length} games</span>
      </div>

      {monthGroups.length > 0 && (
        <div className="stats-month-nav">
          <button
            className="stats-month-btn"
            onClick={goPrevMonth}
            disabled={activeIndex <= 0}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="stats-month-label">{activeGroup?.key ?? ""}</span>
          <button
            className="stats-month-btn"
            onClick={goNextMonth}
            disabled={activeIndex >= monthGroups.length - 1}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      )}

      {pointCount === 0 ? (
        <p className="history-empty">No finished games this month.</p>
      ) : (
        <>
        <div className="stats-body">
          <div className="stats-chart-scroll">
            {/* On a wide screen the chart fills the column; on mobile it keeps a
                fixed per-point width and the wrapper scrolls horizontally. */}
            <div style={{ width: isWide ? "100%" : chartWidth, height: isWide ? 480 : 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: isWide ? 24 : 12, bottom: 0, left: isWide ? 4 : -12 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    stroke="var(--text-muted)"
                    fontSize={isWide ? 13 : 11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={isWide ? 13 : 11}
                    tickLine={false}
                    width={isWide ? 64 : undefined}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--text-heading)" }}
                    formatter={(value, name) => [formatVND(Number(value)), name]}
                    itemSorter={(item) => -Number(item.value)}
                  />
                  {series.map((s, i) =>
                    !isVisible(s.name) ? null : (
                      <Line
                        key={s.name}
                        type="monotone"
                        dataKey={s.name}
                        name={displayName(s.name)}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    )
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="stats-legend">
            {visible !== null && (
              <button className="stats-legend-reset" onClick={() => setVisible(null)}>
                Show all {series.length}
              </button>
            )}
            {series
              .map((s, i) => ({ s, i, last: s.points[s.points.length - 1]?.cumulative ?? 0 }))
              .sort((a, b) => b.last - a.last)
              .map(({ s, i, last }) => {
                const shown = isVisible(s.name);
                const soloed = isSoloed(s.name);
                return (
                  <div
                    key={s.name}
                    className={`stats-legend-item${shown ? "" : " dimmed"}${soloed ? " soloed" : ""}`}
                  >
                    <button
                      className="stats-legend-main"
                      onClick={() => solo(s.name)}
                      aria-label={soloed ? `Show all players` : `Show only ${displayName(s.name)}`}
                    >
                      <span
                        className="stats-legend-dot"
                        style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
                      />
                      <span className="stats-legend-name">{displayName(s.name)}</span>
                      <span className={`stats-legend-value ${last > 0 ? "winner" : last < 0 ? "loser" : ""}`}>
                        {formatVND(last)}
                      </span>
                    </button>
                    <button
                      className="stats-legend-chip"
                      onClick={() => toggle(s.name)}
                      aria-label={shown ? `Hide ${displayName(s.name)}` : `Add ${displayName(s.name)}`}
                    >
                      {shown ? "−" : "+"}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="ai-block">
          <div className="ai-actions">
            <button
              className="ai-generate"
              onClick={generateInsight}
              disabled={insightLoading}
            >
              {insightLoading
                ? "Đang phân tích…"
                : insight
                  ? "↻ Tạo lại"
                  : focus
                    ? `✨ Mổ xẻ ${displayName(focus)}`
                    : "✨ AI phân tích tháng này"}
            </button>
            {focus && (
              <span className="ai-scope-hint">
                phạm vi: {displayName(focus)}
              </span>
            )}
          </div>

          {insightError && <p className="ai-error">{insightError}</p>}

          {insightLoading && !insight && (
            <div className="ai-panel ai-panel-skeleton" aria-hidden="true">
              <div className="ai-skeleton-line lg" />
              <div className="ai-skeleton-line sm" />
              <div className="ai-skeleton-line" />
              <div className="ai-skeleton-line" />
              <div className="ai-skeleton-line sm" />
            </div>
          )}

          {insight && (
            <div className="ai-panel">
              <h3 className="ai-headline">{insight.headline}</h3>
              {insight.sections.map((section, i) => (
                <section className="ai-section" key={i}>
                  <h4>{section.title}</h4>
                  {section.quote && <blockquote>{section.quote}</blockquote>}
                  {section.bullets.length > 0 && (
                    <ul>
                      {section.bullets.map((bullet, j) => (
                        <li key={j}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {insightMeta && (
                <p className="ai-footer">
                  {/* The model name is still returned and stored, just not shown.
                      Mock output stays flagged -- otherwise a placeholder summary
                      is indistinguishable from a real one. */}
                  {insightMeta.model === "mock" && "bản mock — chưa cấu hình DEEPSEEK_API_KEY · "}
                  {new Date(insightMeta.createdAt).toLocaleString("vi-VN")}
                </p>
              )}
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
