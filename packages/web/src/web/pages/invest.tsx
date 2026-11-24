import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { client, orpc } from "../lib/api";
import { useAction } from "../queries";
import { brl, brlShort, pct, toCents } from "../lib/format";
import { Empty, Modal, PageHead, Spinner, Stat } from "../components/brand";

const TYPES: Record<string, string> = { cdb: "CDB", tesouro: "Tesouro", lci: "LCI", lca: "LCA", fundo: "Fundo", acao: "Ações", fii: "FII", cripto: "Cripto", poupanca: "Poupança", outro: "Outro" };
const irRate = (months: number) => (months <= 6 ? 0.225 : months <= 12 ? 0.2 : months <= 24 ? 0.175 : 0.15);

function simulate(initial: number, monthly: number, annualPct: number, months: number) {
  const r = Math.pow(1 + annualPct / 100, 1 / 12) - 1;
  let v = initial; let inv = initial; const pts = [];
  for (let m = 0; m <= months; m++) {
    if (m > 0) { v = v * (1 + r) + monthly; inv += monthly; }
    if (m % Math.max(1, Math.floor(months / 40)) === 0 || m === months) pts.push({ m, value: Math.round(v), invested: Math.round(inv) });
  }
  return { final: v, invested: inv, pts };
}

export default function Investimentos() {
  const q = useQuery(orpc.investments.list.queryOptions());
  const rates = useQuery(orpc.investments.marketRates.queryOptions());
  const [open, setOpen] = useState(false);
  const [sim, setSim] = useState({ initial: "10000", monthly: "500", rate: "", years: 10 });
  const create = useAction((i: Parameters<typeof client.investments.create>[0]) => client.investments.create(i), () => setOpen(false));
  const rm = useAction((id: string) => client.investments.remove({ id }));
  const cdi = rates.data?.cdi ?? 10.5;
  const rate = sim.rate ? Number(sim.rate.replace(",", ".")) : cdi;
  const months = sim.years * 12;
  const ini = toCents(sim.initial), mon = toCents(sim.monthly);
  const res = useMemo(() => simulate(ini, mon, rate, months), [ini, mon, rate, months]);
  const compare = useMemo(() => {
    const opts = [
      { n: "CDB 100% CDI", r: cdi, tax: true, risk: "Baixo (FGC)" },
      { n: "Tesouro Selic", r: rates.data?.selic ?? cdi, tax: true, risk: "Muito baixo" },
      { n: "LCI/LCA 90% CDI", r: cdi * 0.9, tax: false, risk: "Baixo (FGC)" },
      { n: "Poupança", r: rates.data?.poupanca ?? 6.2, tax: false, risk: "Muito baixo" },
      { n: "Fundo RF (est.)", r: cdi * 0.95, tax: true, risk: "Baixo/Moderado" },
      { n: "Ações (hipótese 12% a.a.)", r: 12, tax: true, risk: "Alto — volátil" },
    ];
    return opts.map((o) => { const s = simulate(ini, mon, o.r, months); const gain = s.final - s.invested; const net = s.invested + gain * (o.tax ? 1 - irRate(months) : 1); return { ...o, gross: s.final, net }; }).sort((a, b) => b.net - a.net);
  }, [ini, mon, months, cdi, rates.data]);
  const a = q.data?.analysis;
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Carteira" title="Investimentos" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Adicionar</button>} />
      {q.isLoading ? <Spinner /> : a && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Valor atual" value={brl(a.total)} /><Stat label="Aplicado" value={brl(a.principal)} />
            <Stat label="Rentabilidade" value={pct(a.returnPct)} hint={brl(a.profit)} tone={a.profit < 0 ? "neg" : "pos"} />
            <Stat label="Risco da carteira" value={a.riskLabel} hint={`RF ${pct(a.fixedPct, 0)} · RV ${pct(a.variablePct, 0)}`} />
          </div>
          {!!a.notes.length && <div className="card text-sm text-white/70">{a.notes.map((n) => <p key={n}>• {n}</p>)}</div>}
          <div className="card !p-0">{!q.data?.items.length ? <div className="p-5"><Empty>Nenhum investimento cadastrado.</Empty></div> : q.data.items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
              <span className="w-16 text-xs text-primary">{TYPES[i.type]}</span>
              <div className="flex-1"><p>{i.name}</p><p className="text-xs text-muted-foreground">{i.institution} {i.rateDescription}</p></div>
              <span className="num">{brl(i.currentValue)}</span>
              {i.source === "manual" && <button className="text-white/30 hover:text-primary" onClick={() => confirm("Excluir?") && rm.mutate(i.id)}><Trash2 className="size-4" /></button>}
            </div>
          ))}</div>
        </>
      )}
      <div className="card">
        <p className="eyebrow">Simulador de juros compostos</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><label className="label">Inicial (R$)</label><input className="field" value={sim.initial} onChange={(e) => setSim({ ...sim, initial: e.target.value })} /></div>
          <div><label className="label">Aporte mensal</label><input className="field" value={sim.monthly} onChange={(e) => setSim({ ...sim, monthly: e.target.value })} /></div>
          <div><label className="label">Taxa a.a. (%)</label><input className="field" placeholder={`CDI ${cdi}`} value={sim.rate} onChange={(e) => setSim({ ...sim, rate: e.target.value })} /></div>
          <div><label className="label">Prazo</label><div className="flex gap-1">{[1, 5, 10, 20].map((y) => <button key={y} onClick={() => setSim({ ...sim, years: y })} className={`flex-1 rounded-full border py-2 text-sm ${sim.years === y ? "border-primary bg-primary text-white" : "border-border"}`}>{y}a</button>)}</div></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Total investido" value={brl(res.invested)} /><Stat label="Valor bruto" value={brl(res.final)} /><Stat label="Juros" value={brl(res.final - res.invested)} />
        </div>
        <div className="mt-4 h-64"><ResponsiveContainer><AreaChart data={res.pts}>
          <CartesianGrid stroke="#1a1a1a" vertical={false} /><XAxis dataKey="m" stroke="#666" fontSize={11} tickFormatter={(m) => `${Math.round(m / 12)}a`} /><YAxis stroke="#666" fontSize={11} tickFormatter={brlShort} width={70} />
          <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 12 }} formatter={(v) => brl(Number(v))} labelFormatter={(m) => `Mês ${m}`} />
          <Area dataKey="value" name="Valor" stroke="#e11d2e" fill="#e11d2e33" strokeWidth={2} /><Area dataKey="invested" name="Investido" stroke="#fff" fill="transparent" strokeDasharray="4 4" />
        </AreaChart></ResponsiveContainer></div>
      </div>
      <div className="card">
        <p className="eyebrow">Comparativo em {sim.years} ano(s) · IR {pct(irRate(months) * 100)}</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Opção</th><th>Taxa a.a.</th><th>Bruto</th><th>Líquido</th><th>Risco</th></tr></thead>
          <tbody>{compare.map((c) => <tr key={c.n} className="border-t border-border"><td className="py-2.5">{c.n}{!c.tax && <span className="ml-2 text-[10px] text-primary">isento IR</span>}</td><td className="num">{pct(c.r, 2)}</td><td className="num">{brl(c.gross)}</td><td className="num text-white">{brl(c.net)}</td><td className="text-xs text-muted-foreground">{c.risk}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-xs text-muted-foreground">IR regressivo: 22,5% (até 6m), 20% (até 12m), 17,5% (até 24m), 15% (acima). Taxas: {rates.data?.source === "bcb" ? "Banco Central" : "estimadas"}. Simulação educativa — rentabilidade passada não garante rentabilidade futura.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card"><p className="eyebrow">Renda fixa</p><p className="mt-3 text-sm font-light text-white/70">Regras de remuneração definidas na aplicação (pré, pós-fixado ao CDI/Selic ou IPCA+). Menor volatilidade, previsibilidade e, em CDB/LCI/LCA, proteção do FGC até R$ 250 mil. Ex.: CDB, Tesouro Direto, LCI, LCA.</p></div>
        <div className="card"><p className="eyebrow">Renda variável</p><p className="mt-3 text-sm font-light text-white/70">Retorno não é conhecido antecipadamente e oscila com o mercado. Maior potencial no longo prazo, com maior risco de perdas. Ex.: ações, FIIs, ETFs, cripto. Diversificação e horizonte longo são essenciais.</p></div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo investimento">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
          create.mutate({ name: String(f.get("name")), type: String(f.get("type")) as never, institution: String(f.get("inst")) || null, investedAmount: toCents(String(f.get("inv"))), currentValue: toCents(String(f.get("cur") || f.get("inv"))), rateDescription: String(f.get("rate")) || null }); }}>
          <input name="name" required className="field" placeholder="Nome (ex: CDB Banco X)" />
          <select name="type" className="field">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="inst" className="field" placeholder="Instituição" />
          <div className="grid grid-cols-2 gap-3"><input name="inv" required className="field" placeholder="Aplicado (R$)" /><input name="cur" className="field" placeholder="Valor atual (R$)" /></div>
          <input name="rate" className="field" placeholder="Taxa (ex: 110% CDI)" />
          <button className="btn-primary w-full" disabled={create.isPending}>Salvar</button>
        </form>
      </Modal>
    </div>
  );
}
