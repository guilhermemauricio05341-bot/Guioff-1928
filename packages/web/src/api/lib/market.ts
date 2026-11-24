/**
 * Reference rates from the official Banco Central do Brasil SGS API.
 * 432 = Meta Selic (% a.a.), 4389 = CDI anualizado (% a.a.), 13522 = IPCA 12 meses (%).
 */
const SERIES = { selic: 432, cdi: 4389, ipca: 13522 } as const;
const FALLBACK = { selic: 13.75, cdi: 13.65, ipca: 4.63 };

let cache: { at: number; data: MarketRates } | null = null;

export interface MarketRates {
  selic: number;
  cdi: number;
  ipca: number;
  poupanca: number;
  updatedAt: string;
  source: "bcb" | "fallback";
}

async function fetchSeries(code: number): Promise<{ value: number; date: string } | null> {
  try {
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const [row] = (await res.json()) as { data: string; valor: string }[];
    if (!row) return null;
    return { value: Number(row.valor), date: row.data };
  } catch {
    return null;
  }
}

export async function getMarketRates(): Promise<MarketRates> {
  if (cache && Date.now() - cache.at < 6 * 3600 * 1000) return cache.data;
  const [selic, cdi, ipca] = await Promise.all([
    fetchSeries(SERIES.selic),
    fetchSeries(SERIES.cdi),
    fetchSeries(SERIES.ipca),
  ]);
  const s = selic?.value ?? FALLBACK.selic;
  // Poupança: 0,5% a.m. + TR when Selic > 8,5%; otherwise 70% da Selic (TR ≈ 0 simplification).
  const poupanca = s > 8.5 ? (Math.pow(1.005, 12) - 1) * 100 : s * 0.7;
  const data: MarketRates = {
    selic: s,
    cdi: cdi?.value ?? FALLBACK.cdi,
    ipca: ipca?.value ?? FALLBACK.ipca,
    poupanca: Math.round(poupanca * 100) / 100,
    updatedAt: new Date().toISOString(),
    source: selic && cdi && ipca ? "bcb" : "fallback",
  };
  cache = { at: Date.now(), data };
  return data;
}
