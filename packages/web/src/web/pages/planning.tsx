import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { client, orpc } from "../lib/api";
import { useAction } from "../queries";
import { brl, catLabel, CATEGORY_KEYS, dateBR, today, toCents } from "../lib/format";
import { Bar, Empty, Modal, PageHead, Spinner } from "../components/brand";

type F = FormData;
const s = (f: F, k: string) => String(f.get(k) ?? "");

function Shell({ eyebrow, title, form, children }: { eyebrow: string; title: string; form: (close: () => void) => React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <PageHead eyebrow={eyebrow} title={title} action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Adicionar</button>} />
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={title}>{form(() => setOpen(false))}</Modal>
    </div>
  );
}

export function Metas() {
  const q = useQuery(orpc.planning.goals.queryOptions());
  const dep = useAction((i: { id: string; amount: number }) => client.planning.depositGoal(i));
  const rm = useAction((id: string) => client.planning.removeGoal({ id }));
  return (
    <Shell eyebrow="Planejamento" title="Metas" form={(close) => <GoalForm close={close} />}>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty>Crie sua primeira meta de economia.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2">{q.data.map((g) => (
          <div key={g.id} className="card space-y-3">
            <div className="flex justify-between"><p className="text-lg font-light">{g.name}</p><button className="text-white/30 hover:text-primary" onClick={() => confirm("Excluir?") && rm.mutate(g.id)}><Trash2 className="size-4" /></button></div>
            <p className="num">{brl(g.currentAmount)} <span className="text-muted-foreground">/ {brl(g.targetAmount)}</span></p>
            <Bar value={g.currentAmount} max={g.targetAmount} />
            <p className="text-xs text-muted-foreground">Prazo: {dateBR(g.deadline)} · falta {brl(Math.max(0, g.targetAmount - g.currentAmount))}</p>
            <button className="btn-outline !py-1.5 text-xs" onClick={() => { const v = prompt("Valor a depositar (R$)"); if (v) dep.mutate({ id: g.id, amount: toCents(v) }); }}>Depositar</button>
          </div>
        ))}</div>
      )}
    </Shell>
  );
}
function GoalForm({ close }: { close: () => void }) {
  const m = useAction((i: Parameters<typeof client.planning.createGoal>[0]) => client.planning.createGoal(i), close);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); m.mutate({ name: s(f, "name"), kind: "economia", targetAmount: toCents(s(f, "t")), currentAmount: toCents(s(f, "c") || "0"), deadline: s(f, "d") || null }); }}>
      <input name="name" required className="field" placeholder="Nome da meta" />
      <div className="grid grid-cols-2 gap-3"><input name="t" required className="field" placeholder="Valor alvo (R$)" /><input name="c" className="field" placeholder="Já guardado (R$)" /></div>
      <input name="d" type="date" className="field" />
      <button className="btn-primary w-full" disabled={m.isPending}>Salvar</button>
    </form>
  );
}

export function Dividas() {
  const q = useQuery(orpc.planning.debts.queryOptions());
  const pay = useAction((i: { id: string; delta: number }) => client.planning.payInstallment(i));
  const rm = useAction((id: string) => client.planning.removeDebt({ id }));
  const m = useAction((i: Parameters<typeof client.planning.createDebt>[0]) => client.planning.createDebt(i));
  return (
    <Shell eyebrow="Planejamento" title="Dívidas e parcelas" form={(close) => (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const n = Number(s(f, "n")), p = toCents(s(f, "p"));
        m.mutate({ name: s(f, "name"), creditor: s(f, "cr") || null, totalAmount: p * n, installmentAmount: p, totalInstallments: n, paidInstallments: Number(s(f, "pd") || 0), interestRate: s(f, "j") ? Math.round(Number(s(f, "j").replace(",", ".")) * 100) : null, dueDay: Number(s(f, "dd")) }, { onSuccess: close }); }}>
        <input name="name" required className="field" placeholder="Descrição" /><input name="cr" className="field" placeholder="Credor" />
        <div className="grid grid-cols-2 gap-3"><input name="p" required className="field" placeholder="Valor da parcela" /><input name="n" type="number" min={1} required className="field" placeholder="Nº de parcelas" /></div>
        <div className="grid grid-cols-3 gap-3"><input name="pd" type="number" min={0} className="field" placeholder="Pagas" /><input name="j" className="field" placeholder="Juros % a.m." /><input name="dd" type="number" min={1} max={31} required className="field" placeholder="Dia venc." /></div>
        <button className="btn-primary w-full" disabled={m.isPending}>Salvar</button>
      </form>)}>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty>Sem dívidas cadastradas.</Empty> : q.data.map((d) => (
        <div key={d.id} className="card space-y-2">
          <div className="flex justify-between"><div><p>{d.name}</p><p className="text-xs text-muted-foreground">{d.creditor} · vence dia {d.dueDay}{d.interestRate ? ` · ${(d.interestRate / 100).toFixed(2)}% a.m.` : ""}</p></div><button className="text-white/30 hover:text-primary" onClick={() => confirm("Excluir?") && rm.mutate(d.id)}><Trash2 className="size-4" /></button></div>
          <Bar value={d.paidInstallments} max={d.totalInstallments} />
          <div className="flex items-center justify-between text-sm"><span className="num">{d.paidInstallments}/{d.totalInstallments} · {brl(d.installmentAmount)}/mês · resta {brl((d.totalInstallments - d.paidInstallments) * d.installmentAmount)}</span>
            <div className="flex gap-1"><button className="btn-ghost !p-2" onClick={() => pay.mutate({ id: d.id, delta: -1 })}><Minus className="size-4" /></button><button className="btn-outline !py-1.5 text-xs" onClick={() => pay.mutate({ id: d.id, delta: 1 })}>Pagar parcela</button></div></div>
        </div>
      ))}
    </Shell>
  );
}

export function Vencimentos() {
  const q = useQuery(orpc.planning.bills.queryOptions());
  const tog = useAction((id: string) => client.planning.toggleBillPaid({ id }));
  const rm = useAction((id: string) => client.planning.removeBill({ id }));
  const m = useAction((i: Parameters<typeof client.planning.createBill>[0]) => client.planning.createBill(i));
  const t = today();
  return (
    <Shell eyebrow="Planejamento" title="Vencimentos" form={(close) => (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); m.mutate({ name: s(f, "name"), amount: toCents(s(f, "a")), dueDate: s(f, "d"), category: s(f, "c") as never, recurrence: s(f, "r") as never }, { onSuccess: close }); }}>
        <input name="name" required className="field" placeholder="Conta (ex: Luz)" />
        <div className="grid grid-cols-2 gap-3"><input name="a" required className="field" placeholder="Valor (R$)" /><input name="d" type="date" required defaultValue={t} className="field" /></div>
        <div className="grid grid-cols-2 gap-3"><select name="c" className="field" defaultValue="contas">{CATEGORY_KEYS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select><select name="r" className="field"><option value="none">Única</option><option value="monthly">Mensal</option></select></div>
        <button className="btn-primary w-full" disabled={m.isPending}>Salvar</button>
      </form>)}>
      <div className="card !p-0">{q.isLoading ? <Spinner /> : !q.data?.length ? <div className="p-5"><Empty>Nenhum vencimento.</Empty></div> : q.data.map((b) => (
        <div key={b.id} className={`flex items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0 ${b.paid ? "opacity-50" : ""}`}>
          <button onClick={() => tog.mutate(b.id)} className={`grid size-5 place-items-center rounded-full border ${b.paid ? "border-primary bg-primary" : "border-white/30"}`}>{b.paid && <Check className="size-3" />}</button>
          <div className="flex-1"><p>{b.name} {b.recurrence === "monthly" && <span className="text-[10px] text-muted-foreground">mensal</span>}</p><p className={`text-xs ${!b.paid && b.dueDate < t ? "text-primary" : "text-muted-foreground"}`}>{dateBR(b.dueDate)}{!b.paid && b.dueDate < t ? " · atrasada" : ""}</p></div>
          <span className="num">{brl(b.amount)}</span>
          <button className="text-white/30 hover:text-primary" onClick={() => rm.mutate(b.id)}><Trash2 className="size-4" /></button>
        </div>
      ))}</div>
    </Shell>
  );
}

export function Limites() {
  const q = useQuery(orpc.finance.dashboard.queryOptions({ input: {} }));
  const up = useAction((i: { category: string; limitAmount: number }) => client.planning.upsertBudget(i as never));
  const rm = useAction((id: string) => client.planning.removeBudget({ id }));
  return (
    <Shell eyebrow="Planejamento" title="Limites por categoria" form={(close) => (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); up.mutate({ category: s(f, "c"), limitAmount: toCents(s(f, "l")) }, { onSuccess: close }); }}>
        <select name="c" className="field">{CATEGORY_KEYS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
        <input name="l" required className="field" placeholder="Limite mensal (R$)" />
        <button className="btn-primary w-full" disabled={up.isPending}>Salvar</button>
      </form>)}>
      {q.isLoading ? <Spinner /> : !q.data?.budgets.length ? <Empty>Defina limites e receba alertas ao ultrapassar.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2">{q.data.budgets.map((b) => { const over = b.spent > b.limitAmount; return (
          <div key={b.id} className={`card space-y-2 ${over ? "border-primary/50" : ""}`}>
            <div className="flex justify-between"><p>{catLabel(b.category)}</p><button className="text-white/30 hover:text-primary" onClick={() => rm.mutate(b.id)}><Trash2 className="size-4" /></button></div>
            <p className="num">{brl(b.spent)} <span className="text-muted-foreground">/ {brl(b.limitAmount)}</span></p>
            <Bar value={b.spent} max={b.limitAmount} />
            <p className={`text-xs ${over ? "text-primary" : "text-muted-foreground"}`}>{over ? `Ultrapassou em ${brl(b.spent - b.limitAmount)}` : `Restam ${brl(b.limitAmount - b.spent)}`}</p>
          </div>); })}</div>
      )}
    </Shell>
  );
}

const QUIZ = [
  { q: "Por quanto tempo pretende deixar o dinheiro investido?", o: ["Menos de 6 meses", "Até 1 ano", "1 a 3 anos", "3 a 5 anos", "Mais de 5 anos"] },
  { q: "Se seus investimentos caíssem 15% em um mês, você…", o: ["Resgataria tudo", "Resgataria parte", "Esperaria", "Manteria e estudaria", "Investiria mais"] },
  { q: "Qual sua experiência com investimentos?", o: ["Nenhuma", "Só poupança", "Renda fixa", "Fundos e ações", "Ampla, vários ativos"] },
  { q: "Qual o principal objetivo?", o: ["Preservar capital", "Reserva de emergência", "Equilíbrio", "Crescimento", "Máximo retorno"] },
  { q: "Que parte da sua renda você consegue investir?", o: ["Nada", "Até 5%", "5–10%", "10–20%", "Mais de 20%"] },
];

export function Perfil() {
  const q = useQuery(orpc.finance.profile.queryOptions());
  const [ans, setAns] = useState<number[]>([]);
  const save = useAction((answers: number[]) => client.finance.saveProfile({ answers }), () => setAns([]));
  return (
    <div className="space-y-5">
      <PageHead eyebrow="Conta" title="Perfil de investidor" />
      {q.isLoading ? <Spinner /> : (
        <div className="card"><p className="text-sm text-muted-foreground">{q.data?.name} · {q.data?.email}</p>
          <p className="mt-2 text-2xl font-light">Perfil: <span className="text-primary capitalize">{q.data?.riskProfile ?? "não definido"}</span></p></div>
      )}
      <div className="space-y-4">{QUIZ.map((item, i) => (
        <div key={i} className="card"><p className="mb-3 text-sm"><span className="num mr-2 text-primary">0{i + 1}</span>{item.q}</p>
          <div className="flex flex-wrap gap-2">{item.o.map((o, j) => <button key={o} onClick={() => { const a = [...ans]; a[i] = j; setAns(a); }} className={`rounded-full border px-3 py-1.5 text-xs ${ans[i] === j ? "border-primary bg-primary text-white" : "border-border text-white/70 hover:border-white/40"}`}>{o}</button>)}</div></div>
      ))}</div>
      <button className="btn-primary" disabled={ans.filter((x) => x !== undefined).length < 5 || save.isPending} onClick={() => save.mutate(ans)}>Salvar perfil</button>
    </div>
  );
}
