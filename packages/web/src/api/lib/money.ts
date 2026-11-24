export const toCents = (reais: number) => Math.round(reais * 100);

export function monthKey(d: Date | string = new Date()) {
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 7);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
