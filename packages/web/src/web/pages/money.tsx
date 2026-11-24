import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PluggyConnect } from "pluggy-connect-sdk";
import { Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { client, orpc } from "../lib/api";
import { useAction } from "../queries";
import { brl, catLabel, CATEGORY_KEYS, currentMonth, dateBR, monthLabel, shiftMonth, today, toCents } from "../lib/format";
import { Bar, Empty, Modal, PageHead, Spinner } from "../components/brand";

export function Transacoes() {
  const [month, setMonth] = useState(currentMonth());
  const [kind, setKind] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const q = useQuery(orpc.transactions.list.queryOptions({ input: { month, kind, search: search || undefined, page: 1, pageSize: 100 } }));
  const rec = useQuery(orpc.transactions.recurring.queryOptions());
  const accs = useQuery(orpc.accounts.list.queryOptions());
  const upd = useAction((i: { id: string; category: string }) => client.transactions.update(i as never));
  const del = useAction((id: string) => client.transactions.remove({ id }));
  const create = useAction((i: Parameters<typeof client.transactions.create>[0]) => client.transactions.create(i), () => setOpen(false));
  const manual = accs.data?.accounts.filter((a) => !a.connectionId) ?? [];
  return (
    <div className="space-y-5">
      <PageHead eyebrow="Movimentações" title="Transações" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Nova</button>} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-outline !px-3" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span className="num w-20 text-center">{monthLabel(month)}</span>
        <button className="btn-outline !px-3" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        <select className="field !w-auto" value={kind} onChange={(e) => setKind(e.target.value as never)}><option value="all">Todas</option><option value="in">Entradas</option><option value="out">Saídas</option></select>
        <input className="field !w-52" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.data && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="card"><p className="label">Entrou</p><p className="num text-xl">{brl(q.data.income)}</p></div><div className="card"><p className="label">Saiu</p><p className="num text-xl text-primary">{brl(q.data.expense)}</p></div><div className="card"><p className="label">Saldo do mês</p><p className="num text-xl">{brl(q.data.income - q.data.expense)}</p></div></div>}
      <div className="card !p-0">
        {q.isLoading ? <Spinner /> : !q.data?.items.length ? <div className="p-5"><Empty>Nenhuma transação neste mês.</Empty></div> : q.data.items.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
            <div className="min-w-0 flex-1"><p className="truncate">{t.description} {t.isRecurring && <span className="ml-1 rounded-full border border-primary/40 px-2 text-[10px] text-primary">recorrente</span>}</p><p className="text-xs text-muted-foreground">{dateBR(t.date)} · {t.accountName}</p></div>
            <select className="field !w-40 !py-1.5 text-xs" value={t.category} onChange={(e) => upd.mutate({ id: t.id, category: e.target.value })}>{CATEGORY_KEYS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
            <span className={`num w-28 text-right ${t.amount < 0 ? "text-primary" : ""}`}>{brl(t.amount)}</span>
            {t.source === "manual" && <button className="text-white/40 hover:text-primary" onClick={() => confirm("Excluir?") && del.mutate(t.id)}><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </div>
      <div className="card">
        <p className="label">Assinaturas e recorrentes · {brl(rec.data?.monthlyTotal ?? 0)}/mês</p>
        {rec.isLoading ? <Spinner /> : !rec.data?.items.length ? <p className="text-sm text-muted-foreground">Nada detectado ainda.</p> : rec.data.items.map((r) => (
          <div key={r.key} className="flex justify-between py-1.5 text-sm"><span>{r.name} <span className="text-xs text-muted-foreground">{r.isSubscription ? "assinatura" : catLabel(r.category)} · próx. {dateBR(r.nextExpected)}</span></span><span className="num">{brl(r.averageAmount)}</span></div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova transação">
        {!manual.length ? <p className="text-sm text-muted-foreground">Crie uma conta manual em Contas primeiro.</p> : (
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault(); const f = new FormData(e.currentTarget); const v = toCents(String(f.get("amount")));
            create.mutate({ accountId: String(f.get("acc")), description: String(f.get("desc")), amount: f.get("type") === "out" ? -Math.abs(v) : Math.abs(v), date: String(f.get("date")), category: (String(f.get("cat")) || undefined) as never, totalInstallments: Number(f.get("inst")) > 1 ? Number(f.get("inst")) : undefined });
          }}>
            <select name="acc" className="field">{manual.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <input name="desc" required className="field" placeholder="Descrição" />
            <div className="grid grid-cols-2 gap-3"><select name="type" className="field"><option value="out">Saída</option><option value="in">Entrada</option></select><input name="amount" required className="field" placeholder="Valor (R$)" /></div>
            <div className="grid grid-cols-3 gap-3"><input name="date" type="date" defaultValue={today()} className="field col-span-2" /><input name="inst" type="number" min={1} className="field" placeholder="Parcelas" /></div>
            <select name="cat" className="field"><option value="">Categoria automática</option>{CATEGORY_KEYS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
            <button className="btn-primary w-full" disabled={create.isPending}>Salvar</button>
          </form>
        )}
      </Modal>
    </div>
  );
}

function AccountForm({ credit, onDone }: { credit?: boolean; onDone: () => void }) {
  const create = useAction((i: Parameters<typeof client.accounts.create>[0]) => client.accounts.create(i), onDone);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget); const n = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
      create.mutate({ name: String(f.get("name")), institution: String(f.get("inst")), type: credit ? "credit" : (String(f.get("type")) as never), balance: toCents(String(f.get("bal") || "0")),
        ...(credit ? { creditLimit: toCents(String(f.get("limit") || "0")), availableLimit: toCents(String(f.get("limit") || "0")) - toCents(String(f.get("bal") || "0")), closingDay: n("close"), dueDay: n("due") } : {}) });
    }}>
      <input name="name" required className="field" placeholder={credit ? "Nome do cartão" : "Nome da conta"} />
      <input name="inst" required className="field" placeholder="Instituição" />
      {!credit && <select name="type" className="field"><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="wallet">Carteira digital</option><option value="cash">Dinheiro</option></select>}
      <input name="bal" className="field" placeholder={credit ? "Fatura atual (R$)" : "Saldo (R$)"} />
      {credit && <><input name="limit" className="field" placeholder="Limite (R$)" /><div className="grid grid-cols-2 gap-3"><input name="close" type="number" min={1} max={31} className="field" placeholder="Dia fechamento" /><input name="due" type="number" min={1} max={31} className="field" placeholder="Dia vencimento" /></div></>}
      <button className="btn-primary w-full" disabled={create.isPending}>Salvar</button>
    </form>
  );
}

export function Contas() {
  const q = useQuery(orpc.accounts.list.queryOptions());
  const st = useQuery(orpc.accounts.openFinanceStatus.queryOptions());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const register = useAction((itemId: string) => client.accounts.registerItem({ itemId }));
  const sync = useAction((connectionId: string) => client.accounts.sync({ connectionId }));
  const disc = useAction((connectionId: string) => client.accounts.disconnect({ connectionId }));
  const rm = useAction((id: string) => client.accounts.remove({ id }));
  async function connect(connectionId?: string) {
    setBusy(true);
    try {
      const { accessToken, includeSandbox } = await client.accounts.connectToken({ connectionId });
      await new PluggyConnect({ connectToken: accessToken, includeSandbox, theme: "dark", language: "pt",
        onSuccess: ({ item }: { item: { id: string } }) => register.mutate(item.id), onError: () => alert("Falha na conexão com o banco.") } as never).init();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      <PageHead eyebrow="Open Finance" title="Contas" action={<div className="flex gap-2"><button className="btn-outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Conta manual</button><button className="btn-primary" disabled={!st.data?.configured || busy} onClick={() => connect()}>Conectar banco</button></div>} />
      {st.data && !st.data.configured && <div className="card border-primary/40 text-sm">Open Finance ainda não configurado. Adicione <code className="text-primary">PLUGGY_CLIENT_ID</code> e <code className="text-primary">PLUGGY_CLIENT_SECRET</code> para habilitar a conexão com bancos. Enquanto isso, use contas manuais.</div>}
      {q.isLoading ? <Spinner /> : <>
        {!!q.data?.connections.length && <div className="card"><p className="label">Bancos conectados</p>{q.data.connections.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 text-sm last:border-0">
            <div><p>{c.connectorName}</p><p className="text-xs text-muted-foreground">{c.status} · {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString("pt-BR") : "—"}</p></div>
            <div className="flex gap-2"><button className="btn-ghost !px-3" onClick={() => sync.mutate(c.id)}><RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} /> Sincronizar</button><button className="btn-ghost !px-3" onClick={() => confirm("Desconectar banco e apagar seus dados?") && disc.mutate(c.id)}><Unplug className="size-4" /> Desconectar</button></div>
          </div>
        ))}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data?.accounts.filter((a) => a.type !== "credit").map((a) => (
            <div key={a.id} className="card">
              <div className="flex justify-between"><p className="label">{a.institution}</p>{!a.connectionId && <button className="text-white/30 hover:text-primary" onClick={() => confirm("Excluir conta?") && rm.mutate(a.id)}><Trash2 className="size-4" /></button>}</div>
              <p>{a.name}</p><p className="num mt-2 text-2xl font-light">{brl(a.balance)}</p>
            </div>
          ))}
        </div>
        {!q.data?.accounts.length && <Empty>Nenhuma conta ainda.</Empty>}
      </>}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova conta manual"><AccountForm onDone={() => setOpen(false)} /></Modal>
    </div>
  );
}

export function Cartoes() {
  const q = useQuery(orpc.accounts.list.queryOptions());
  const [open, setOpen] = useState(false);
  const rm = useAction((id: string) => client.accounts.remove({ id }));
  const cards = q.data?.accounts.filter((a) => a.type === "credit") ?? [];
  return (
    <div className="space-y-5">
      <PageHead eyebrow="Crédito" title="Cartões" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Cartão manual</button>} />
      {q.isLoading ? <Spinner /> : !cards.length ? <Empty>Nenhum cartão. Conecte um banco ou adicione manualmente.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2">{cards.map((c) => {
          const used = c.creditLimit && c.availableLimit != null ? c.creditLimit - c.availableLimit : c.balance;
          return (
            <div key={c.id} className="card bg-gradient-to-br from-[#1a0507] to-black">
              <div className="flex justify-between"><p className="label">{c.institution} {c.number ? `· ${c.number}` : ""}</p>{!c.connectionId && <button className="text-white/30 hover:text-primary" onClick={() => confirm("Excluir?") && rm.mutate(c.id)}><Trash2 className="size-4" /></button>}</div>
              <p className="text-lg font-light">{c.name}</p>
              <p className="num mt-4 text-2xl">{brl(c.balance)} <span className="text-xs text-muted-foreground">fatura</span></p>
              {!!c.creditLimit && <div className="mt-3"><Bar value={used} max={c.creditLimit} /><p className="mt-1 text-xs text-muted-foreground">Usado {brl(used)} de {brl(c.creditLimit)}</p></div>}
              <p className="mt-3 text-xs text-muted-foreground">Fecha dia {c.closingDay ?? "—"} · Vence dia {c.dueDay ?? "—"}</p>
            </div>
          );
        })}</div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Novo cartão"><AccountForm credit onDone={() => setOpen(false)} /></Modal>
    </div>
  );
}
