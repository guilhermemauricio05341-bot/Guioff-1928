/** Portfolio analysis: allocation, return, risk score and profile adherence. */

export const RISK_LEVEL: Record<string, number> = {
  poupanca: 1,
  tesouro: 1,
  cdb: 2,
  lci: 2,
  lca: 2,
  fundo: 3,
  fii: 4,
  acao: 5,
  cripto: 5,
  outro: 3,
};

export const FIXED_INCOME = new Set(["poupanca", "tesouro", "cdb", "lci", "lca"]);

const TARGET_VARIABLE: Record<string, [number, number]> = {
  conservador: [0, 15],
  moderado: [15, 40],
  arrojado: [35, 80],
};

interface Inv {
  type: string;
  investedAmount: number;
  currentValue: number;
}

export function analyzePortfolio(items: Inv[], riskProfile: string | null) {
  const total = items.reduce((s, i) => s + i.currentValue, 0);
  const principal = items.reduce((s, i) => s + i.investedAmount, 0);
  const byType = new Map<string, number>();
  for (const i of items) byType.set(i.type, (byType.get(i.type) ?? 0) + i.currentValue);
  const allocation = [...byType.entries()]
    .map(([type, value]) => ({ type, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  const variable = items.filter((i) => !FIXED_INCOME.has(i.type)).reduce((s, i) => s + i.currentValue, 0);
  const variablePct = total ? (variable / total) * 100 : 0;
  const riskScore = total
    ? items.reduce((s, i) => s + (RISK_LEVEL[i.type] ?? 3) * i.currentValue, 0) / total
    : 0;
  const concentration = allocation[0]?.pct ?? 0;

  const notes: string[] = [];
  if (!items.length) notes.push("Você ainda não cadastrou investimentos. Comece pela reserva de emergência em renda fixa com liquidez diária.");
  if (concentration > 70 && items.length > 0)
    notes.push(`Carteira concentrada: ${concentration.toFixed(0)}% em um único tipo de ativo. Diversificar reduz o risco específico.`);
  if (riskProfile && TARGET_VARIABLE[riskProfile]) {
    const [min, max] = TARGET_VARIABLE[riskProfile]!;
    if (variablePct > max)
      notes.push(`Renda variável (${variablePct.toFixed(0)}%) acima da faixa sugerida para o perfil ${riskProfile} (${min}–${max}%).`);
    else if (variablePct < min && total > 0)
      notes.push(`Renda variável (${variablePct.toFixed(0)}%) abaixo da faixa usual do perfil ${riskProfile} (${min}–${max}%).`);
    else if (total > 0) notes.push(`Alocação em renda variável compatível com o perfil ${riskProfile}.`);
  } else notes.push("Responda o questionário de perfil de investidor para uma análise de adequação.");

  return {
    total,
    principal,
    profit: total - principal,
    returnPct: principal ? ((total - principal) / principal) * 100 : 0,
    allocation,
    fixedPct: 100 - variablePct,
    variablePct,
    riskScore: Math.round(riskScore * 10) / 10,
    riskLabel: riskScore === 0 ? "—" : riskScore < 2 ? "Baixo" : riskScore < 3.2 ? "Moderado" : riskScore < 4.2 ? "Alto" : "Muito alto",
    notes,
  };
}
