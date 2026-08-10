import { useMemo, useState, type Dispatch } from "react";
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
import { formatVND } from "../utils/format";

interface Props {
  history: GameRecord[];
  dispatch: Dispatch<Action>;
}

const LINE_COLORS = [
  "#ef4444", "#eab308", "#a5b4fc", "#f9a8d4", "#14b8a6",
  "#6366f1", "#22c55e", "#9ca3af", "#a855f7", "#22d3ee",
  "#f97316", "#84cc16",
];

const POINT_WIDTH = 56; // px per session column, drives horizontal scroll

export default function StatsScreen({ history, dispatch }: Props) {
  const monthGroups = useMemo(() => groupGamesByAccountingMonth(history), [history]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedIndex = selectedKey
    ? monthGroups.findIndex((g) => g.key === selectedKey)
    : -1;
  const activeIndex = selectedIndex === -1 ? monthGroups.length - 1 : selectedIndex;
  const activeGroup = monthGroups[activeIndex];
  const monthGames = useMemo(() => activeGroup?.games ?? [], [activeGroup]);

  const series = useMemo(() => buildNetWorthSeries(monthGames), [monthGames]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function goPrevMonth() {
    if (activeIndex > 0) setSelectedKey(monthGroups[activeIndex - 1].key);
  }
  function goNextMonth() {
    if (activeIndex < monthGroups.length - 1) setSelectedKey(monthGroups[activeIndex + 1].key);
  }

  function toggle(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

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
          <div className="stats-chart-scroll">
            <div style={{ width: chartWidth, height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
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
                  />
                  {series.map((s, i) =>
                    hidden.has(s.name) ? null : (
                      <Line
                        key={s.name}
                        type="monotone"
                        dataKey={s.name}
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
            {series.map((s, i) => {
              const last = s.points[s.points.length - 1]?.cumulative ?? 0;
              const isHidden = hidden.has(s.name);
              return (
                <button
                  key={s.name}
                  className={`stats-legend-item${isHidden ? " dimmed" : ""}`}
                  onClick={() => toggle(s.name)}
                >
                  <span
                    className="stats-legend-dot"
                    style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
                  />
                  <span className="stats-legend-name">{s.name}</span>
                  <span className={`stats-legend-value ${last > 0 ? "winner" : last < 0 ? "loser" : ""}`}>
                    {formatVND(last)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
