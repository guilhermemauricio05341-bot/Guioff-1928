import { z } from "zod";
import { tool } from "ai";
import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { db } from "../database";
import { accounts, bills, debts, goals, investments, profiles, transactions } from "../database/schema";
import { budgetsStatus, cardUsed, financialSummary } from "../lib/summary";
import { detectRecurring } from "../lib/recurring";
import { getMarketRates } from "../lib/market";
import { analyzePortfolio } from "../lib/portfolio";
import { monthKey, monthRange } from "../lib/money";
import { CATEGORY_LABELS } from "../lib/labels";

const reais = (c: number) => Math.round(c) / 100;

/** Tools are closed over the authenticated user id — the model can never read another user's data. */
export function buildTools(userId: string) {
  return {
    resumoFinanceiro: tool({
      description:
        "Resumo do mês: patrimônio líquido, saldo em contas, fatura de cartões, total investido, receitas, despesas, resultado, gastos por categoria vs mês anterior e evolução de 12 meses. Valores em reais.",
      inputSchema: z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("AAAA-MM; padrão mês atual") }),
      async execute({ mes }) {
        const s = await financialSummary(userId, mes ?? monthKey());
        return {
          mes: s.month,
          patrimonioLiquido: reais(s.netWorth),
          saldoContas: reais(s.totalBalance),
          faturaCartoes: reais(s.cardDebt),
          totalInvestido: reais(s.totalInvested),
          dividasRestantes: reais(s.debtRemaining),
          receitas: reais(s.income),
          despesas: reais(s.expense),
          resultado: reais(s.result),
          receitasMesAnterior: reais(s.previousIncome),
          despesasMesAnterior: reais(s.previousExpense),
          disponivel: reais(s.available),
          categorias: s.categories.map((c) => ({
            categoria: CATEGORY_LABELS[c.category] ?? c.category,
            atual: reais(c.current),
            anterior: reais(c.previous),
          })),
          evolucao: s.evolution.map((e) => ({
            mes: e.month,
            receitas: reais(e.income),
            despesas: reais(e.expense),
            patrimonio: reais(e.netWorth),
          })),
        };
      },
    }),

    buscarTransacoes: tool({
      description: "Busca transações do usuário por mês, categoria ou texto. Valores negativos são saídas.",
      inputSchema: z.object({
        mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        categoria: z.string().optional().describe("chave: alimentacao, mercado, transporte, lazer, contas, moradia, saude, educacao, compras, assinaturas, viagem, impostos, investimentos, transferencias, receitas, outros"),
        texto: z.string().optional(),
        limite: z.number().int().min(1).max(100).default(40),
      }),
      async execute({ mes, categoria, texto, limite }) {
        const conds = [eq(transactions.userId, userId)];
        if (mes) {
          const r = monthRange(mes);
          conds.push(gte(transactions.date, r.from), lte(transactions.date, r.to));
        }
        if (categoria) conds.push(eq(transactions.category, categoria));
        if (texto) conds.push(or(like(transactions.description, `%${texto}%`), like(transactions.merchant, `%${texto}%`))!);
        const rows = await db
          .select({
            d: transactions.date,
            desc: transactions.description,
            v: transactions.amount,
            cat: transactions.category,
            rec: transactions.isRecurring,
          })
          .from(transactions)
          .where(and(...conds))
          .orderBy(desc(transactions.date))
          .limit(limite);
        return rows.map((r) => ({ data: r.d, descricao: r.desc, valor: reais(r.v), categoria: r.cat, recorrente: r.rec }));
      },
    }),

    assinaturasERecorrentes: tool({
      description: "Lista assinaturas e pagamentos recorrentes detectados automaticamente, com valor médio mensal.",
      inputSchema: z.object({}),
      async execute() {
        const items = await detectRecurring(userId);
        return {
          totalMensal: reais(items.reduce((s, i) => s + i.averageAmount, 0)),
          itens: items.map((i) => ({
            nome: i.name,
            categoria: i.category,
            valorMedio: reais(i.averageAmount),
            ocorrencias: i.occurrences,
            assinatura: i.isSubscription,
            proximaCobranca: i.nextExpected,
          })),
        };
      },
    }),

    planejamento: tool({
      description: "Metas, dívidas/parcelamentos, vencimentos não pagos, limites por categoria e cartões de crédito.",
      inputSchema: z.object({}),
      async execute() {
        const [gls, dbts, bls, bdg, accs] = await Promise.all([
          db.select().from(goals).where(eq(goals.userId, userId)),
          db.select().from(debts).where(eq(debts.userId, userId)),
          db.select().from(bills).where(and(eq(bills.userId, userId), eq(bills.paid, false))),
          budgetsStatus(userId),
          db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.type, "credit"))),
        ]);
        return {
          metas: gls.map((g) => ({ nome: g.name, alvo: reais(g.targetAmount), atual: reais(g.currentAmount), prazo: g.deadline })),
          dividas: dbts.map((d) => ({
            nome: d.name,
            parcela: reais(d.installmentAmount),
            pagas: d.paidInstallments,
            total: d.totalInstallments,
            jurosMensalPct: d.interestRate != null ? d.interestRate / 100 : null,
            restante: reais((d.totalInstallments - d.paidInstallments) * d.installmentAmount),
          })),
          vencimentos: bls.map((b) => ({ nome: b.name, valor: reais(b.amount), vence: b.dueDate })),
          limites: bdg.map((b) => ({
            categoria: CATEGORY_LABELS[b.category] ?? b.category,
            limite: reais(b.limitAmount),
            gasto: reais(b.spent),
          })),
          cartoes: accs.map((c) => ({
            nome: c.name,
            limite: c.creditLimit != null ? reais(c.creditLimit) : null,
            usado: reais(cardUsed(c)),
            vencimentoDia: c.dueDay,
          })),
        };
      },
    }),

    carteiraInvestimentos: tool({
      description: "Carteira de investimentos, alocação, rentabilidade e análise de risco vs perfil do investidor.",
      inputSchema: z.object({}),
      async execute() {
        const [items, [p]] = await Promise.all([
          db.select().from(investments).where(eq(investments.userId, userId)),
          db.select().from(profiles).where(eq(profiles.userId, userId)),
        ]);
        const a = analyzePortfolio(items, p?.riskProfile ?? null);
        return {
          perfil: p?.riskProfile ?? "não definido",
          total: reais(a.total),
          aplicado: reais(a.principal),
          rentabilidadePct: Number(a.returnPct.toFixed(2)),
          rendaVariavelPct: Number(a.variablePct.toFixed(1)),
          risco: a.riskLabel,
          observacoes: a.notes,
          ativos: items.map((i) => ({ nome: i.name, tipo: i.type, valor: reais(i.currentValue), taxa: i.rateDescription })),
        };
      },
    }),

    taxasMercado: tool({
      description: "Taxas oficiais do Banco Central: Selic, CDI, IPCA 12 meses e rendimento da poupança (% a.a.).",
      inputSchema: z.object({}),
      execute: () => getMarketRates(),
    }),

    projetarInvestimento: tool({
      description:
        "Calcula projeção com juros compostos e aportes mensais. Retorna valor bruto, total aportado, juros e líquido após IR regressivo (se tributado). É uma SIMULAÇÃO, não garantia.",
      inputSchema: z.object({
        inicial: z.number().min(0),
        aporteMensal: z.number().min(0),
        taxaAnualPct: z.number().min(-50).max(200),
        anos: z.number().min(0.1).max(60),
        isentoIR: z.boolean().default(false),
      }),
      async execute({ inicial, aporteMensal, taxaAnualPct, anos, isentoIR }) {
        const i = Math.pow(1 + taxaAnualPct / 100, 1 / 12) - 1;
        const n = Math.round(anos * 12);
        let v = inicial;
        for (let k = 0; k < n; k++) v = v * (1 + i) + aporteMensal;
        const aportado = inicial + aporteMensal * n;
        const juros = v - aportado;
        const dias = anos * 365;
        const aliquota = isentoIR ? 0 : dias <= 180 ? 22.5 : dias <= 360 ? 20 : dias <= 720 ? 17.5 : 15;
        const liquido = v - Math.max(0, juros) * (aliquota / 100);
        const f = (x: number) => Math.round(x * 100) / 100;
        return { bruto: f(v), aportado: f(aportado), juros: f(juros), aliquotaIR: aliquota, liquido: f(liquido), aviso: "Simulação; rentabilidade passada não garante rentabilidade futura." };
      },
    }),
  };
}
