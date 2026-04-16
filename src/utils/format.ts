const vndFormatter = new Intl.NumberFormat("vi-VN");

export function formatVND(amount: number): string {
  const formatted = vndFormatter.format(Math.abs(amount));
  if (amount < 0) return `-${formatted} VND`;
  if (amount > 0) return `+${formatted} VND`;
  return `${formatted} VND`;
}

export function formatChips(chips: number): string {
  return vndFormatter.format(chips);
}
