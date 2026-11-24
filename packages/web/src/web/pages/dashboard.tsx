import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { orpc } from "../queries";
import { brl, brlShort, catLabel, dateBR, monthLabel } from "../lib/format";
import { Bar, Empty, PageHead, Spinner, Stat } from "../components/brand";

const tip = { contentStyle: { background: "#0a0a0a", border: "1px solid #222", borderRadius: 12 }, formatter: (v: unknown) => brl(Number(v)) };

export default function Dashboard() {
  const q = useQuery(orpc.finance.dashboard.queryOptions({ input: {} }));
  if (q.isLoading || !q.data) return <Spinner />;
  const { summary: s, recent, bills, budgets } = q.data;
  const evo = s.evolution.map((e) => ({ ...e, m: monthLabel(e.month) }));
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Painel" title="Visão geral" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Patrimônio líquido" value={brl(s.netWorth)} />
        <Stat label="Saldo em contas" value={brl(s.totalBalance)} hint={`Disponível: ${brl(s.available)}`} />
        <Stat label="Total investido" value={brl(s.totalInvested)} />
        <Stat label="Receitas do mês" value={brl(s.income)} hint={`Mês anterior: ${brl(s.previousIncome)}`} />
        <Stat label="Gastos do mês" value={brl(s.expense)} tone="neg" hint={`Mês anterior: ${brl(s.previousExpense)}`} />
        <Stat label="Resultado" value={brl(s.result)} tone={s.result < 0 ? "neg" : "pos"} hint={s.result >= 0 ? "Sobrou no mês" : "Faltou no mês"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <p className="label">Evolução do patrimônio</p>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={evo}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e11d2e" stopOpacity={0.5} /><stop offset="1" stopColor="#e11d2e" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="m" stroke="#666" fontSize={11} /><YAxis stroke="#666" fontSize={11} tickFormatter={brlShort} width={70} />
                <Tooltip {...tip} />
                <Area dataKey="netWorth" name="Patrimônio" stroke="#e11d2e" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <p className="label">Entradas x saídas por mês</p>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={evo}>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="m" stroke="#666" fontSize={11} /><YAxis stroke="#666" fontSize={11} tickFormatter={brlShort} width={70} />
                <Tooltip {...tip} cursor={{ fill: "#ffffff08" }} />
                <RBar dataKey="income" name="Entradas" fill="#f5f5f5" radius={[4, 4, 0, 0]} />
                <RBar dataKey="expense" name="Saídas" fill="#e11d2e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <p className="label">Últimas transações</p>
          {!recent.length ? <Empty>Conecte um banco ou adicione transações.</Empty> : recent.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
              <div><p>{t.description}</p><p className="text-xs text-muted-foreground">{catLabel(t.category)} · {dateBR(t.date)} · {t.accountName}</p></div>
              <span className={`num ${t.amount < 0 ? "text-primary" : ""}`}>{brl(t.amount)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="card">
            <p className="label">Gastos por categoria (mês x anterior)</p>
            {!s.categories.length ? <p className="text-sm text-muted-foreground">Sem gastos.</p> : s.categories.slice(0, 6).map((c) => (
              <div key={c.category} className="mb-3">
                <div className="mb-1 flex justify-between text-xs"><span>{catLabel(c.category)}</span><span className="num">{brl(c.current)} <span className="text-muted-foreground">/ {brl(c.previous)}</span></span></div>
                <Bar value={c.current} max={Math.max(c.current, c.previous)} danger={c.current > c.previous} />
              </div>
            ))}
          </div>
          <div className="card">
            <p className="label">Próximos vencimentos</p>
            {!bills.length ? <p className="text-sm text-muted-foreground">Nada nos próximos 30 dias.</p> : bills.slice(0, 5).map((b) => (
              <div key={b.id} className="flex justify-between py-1.5 text-sm"><span>{b.name} <span className="text-xs text-muted-foreground">{dateBR(b.dueDate)}</span></span><span className="num">{brl(b.amount)}</span></div>
            ))}
          </div>
          {!!budgets.length && <div className="card"><p className="label">Limites</p>{budgets.map((b) => (
            <div key={b.id} className="mb-3"><div className="mb-1 flex justify-between text-xs"><span>{catLabel(b.category)}</span><span className="num">{brl(b.spent)} / {brl(b.limitAmount)}</span></div><Bar value={b.spent} max={b.limitAmount} /></div>
          ))}</div>}
        </div>
      </div>
    </div>
  );
}
