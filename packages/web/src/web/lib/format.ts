export { CATEGORY_LABELS } from "../../api/lib/labels";
import { CATEGORY_LABELS } from "../../api/lib/labels";

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (cents: number | null | undefined) => fmt.format((cents ?? 0) / 100);
export const brlShort = (cents: number) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
};
/** "1.234,56" | "1234.56" -> cents */
export function toCents(v: string | number): number {
  if (typeof v === "number") return Math.round(v * 100);
  const s = v.trim().replace(/[^\d,.-]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const catLabel = (c: string) => CATEGORY_LABELS[c] ?? c;
export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm) - 1]}/${y?.slice(2)}`;
};
export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const shiftMonth = (m: string, d: number) => {
  const [y, mm] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, mm! - 1 + d, 1));
  return dt.toISOString().slice(0, 7);
};
export const dateBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
export const pct = (n: number, d = 1) => `${n.toFixed(d).replace(".", ",")}%`;
export const today = () => new Date().toISOString().slice(0, 10);
