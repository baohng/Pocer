import { NICKNAMES } from "../constants";

const vndFormatter = new Intl.NumberFormat("vi-VN");

/** The name to show a player under, falling back to their stored name.
 *  Never use this where the name is a data key -- see {@link NICKNAMES}. */
export function displayName(name: string): string {
  return NICKNAMES[name.trim().toLowerCase()] ?? name;
}

export function formatVND(amount: number): string {
  const formatted = vndFormatter.format(Math.abs(amount));
  if (amount < 0) return `-${formatted} VND`;
  if (amount > 0) return `+${formatted} VND`;
  return `${formatted} VND`;
}

export function formatChips(chips: number): string {
  return vndFormatter.format(chips);
}
