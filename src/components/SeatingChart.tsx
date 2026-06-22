import type { Player } from "../types";

interface Props {
  players: Player[]; // active players, already sorted by seat
}

/**
 * Renders the active players around a poker table pushed against the top wall:
 * seats run down the right side, across the bottom, then up the left side (a
 * U shape) — there are no seats above the table.
 */
export default function SeatingChart({ players }: Props) {
  const seated = players
    .filter((p) => p.seat !== null)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const n = seated.length;
  if (n === 0) return null;

  const positions = uSeatPositions(n);

  return (
    <div className="seating-chart">
      <div className="seating-wall" />
      <div className="seating-table" />
      {seated.map((player, i) => (
        <div
          key={player.id}
          className="seat item-animated"
          style={{
            left: `${positions[i].x}%`,
            top: `${positions[i].y}%`,
            animationDelay: `${i * 0.05}s`,
          }}
        >
          <span className="seat-number">{player.seat}</span>
          <span className="seat-name">{player.name}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Distribute n seats evenly along a U-shaped path that hugs the right edge,
 * the bottom edge, then the left edge of the container (percent coords).
 */
function uSeatPositions(n: number): { x: number; y: number }[] {
  // Seat centers live on a U that hugs three sides. Coordinates are clamped so a
  // ~16%-wide seat (translate -50%) never overflows the container or the table.
  const sideX = { left: 11, right: 89 }; // seat-center columns beside the table
  const topY = 24; // first side seat (kept clear of the top wall)
  const sideBottomY = 70; // last side seat (above the table's bottom edge)
  const bottomY = 90; // bottom row (short end, away from the wall)
  const bottomX = { left: 38, right: 62 }; // 2-seat head, centered under the table

  // Long table against the wall: most seats line the two long sides, with a
  // small "head" of seats at the bottom (short end). Sides get the majority and
  // stay balanced; the bottom holds 1-2 seats (0 only when there aren't enough).
  const bottom = n <= 2 ? n : 2;
  const sideTotal = n - bottom;
  const right = Math.ceil(sideTotal / 2);
  const left = sideTotal - right;

  const pos: { x: number; y: number }[] = [];

  // Down the right side (seat 1 at top-right, going down).
  for (let i = 0; i < right; i++) {
    const t = right === 1 ? 0 : i / (right - 1);
    pos.push({ x: sideX.right, y: topY + t * (sideBottomY - topY) });
  }
  // Across the bottom (right -> left).
  for (let i = 0; i < bottom; i++) {
    const t = bottom === 1 ? 0.5 : i / (bottom - 1);
    pos.push({ x: bottomX.right - t * (bottomX.right - bottomX.left), y: bottomY });
  }
  // Up the left side (bottom -> top).
  for (let i = 0; i < left; i++) {
    const t = left === 1 ? 0 : i / (left - 1);
    pos.push({ x: sideX.left, y: sideBottomY - t * (sideBottomY - topY) });
  }

  return pos;
}
