import type { Player } from "../types";
import { CHIPS_PER_STACK, VND_PER_CHIP } from "../constants";

export const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzE0eNse-aXyazbQFNZMmLX9VJJd6gdlUrppuw0nu7oA3BtO0OYOxBAhaUrsnrOFVUc2Q/exec";

function formatEndTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function submitGameResult(
  endTime: Date,
  players: Player[]
): Promise<void> {
  const shifted = new Date(endTime);
  if (shifted.getDate() >= 26) {
    shifted.setMonth(shifted.getMonth() + 1);
  }
  const sheetName = `${shifted.getMonth() + 1}/${shifted.getFullYear()}`;

  const netsK = players.map((p) => {
    const boughtIn = p.stacksBought * CHIPS_PER_STACK;
    const returned = p.chipsReturned ?? 0;
    return ((returned - boughtIn) * VND_PER_CHIP) / 1000;
  });

  const totalBuyInK = players.reduce(
    (sum, p) => sum + (p.stacksBought * CHIPS_PER_STACK * VND_PER_CHIP) / 1000,
    0
  );

  const row = [formatEndTime(endTime), ...netsK, totalBuyInK];

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ sheetName, row }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
}
