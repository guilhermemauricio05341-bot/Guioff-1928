import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bot, CalendarClock, CreditCard, Gauge, Landmark, LayoutDashboard, LogOut, Menu, PiggyBank, Receipt, Target, TrendingUp, User, Wallet, X } from "lucide-react";
import { authClient, signOut } from "../lib/auth";
import { orpc, useAction } from "../queries";
import { Logo, Spinner, WhatsAppFloat } from "./brand";

const NAV = [
  { href: "/app", label: "Painel", icon: LayoutDashboard },
  { href: "/app/transacoes", label: "Transações", icon: Receipt },
  { href: "/app/contas", label: "Contas", icon: Landmark },
  { href: "/app/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/app/investimentos", label: "Investimentos", icon: TrendingUp },
  { href: "/app/assistente", label: "Assistente IA", icon: Bot },
  { href: "/app/metas", label: "Metas", icon: Target },
  { href: "/app/dividas", label: "Dívidas", icon: Wallet },
  { href: "/app/vencimentos", label: "Vencimentos", icon: CalendarClock },
  { href: "/app/limites", label: "Limites", icon: Gauge },
  { href: "/app/perfil", label: "Perfil", icon: User },
];

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [, nav] = useLocation();
  useEffect(() => {
    if (!isPending && !data) nav("/entrar");
  }, [isPending, data, nav]);
  if (isPending || !data) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  return <AppShell>{children}</AppShell>;
}

function Alerts() {
  const [open, setOpen] = useState(false);
  const q = useQuery(orpc.finance.alerts.queryOptions());
  const read = useAction(() => orpc.finance.markAlertsRead.call({}));
  const clear = useAction(() => orpc.finance.clearAlerts.call());
  return (
    <div className="relative">
      <button className="btn-ghost relative !p-2.5" onClick={() => { setOpen(!open); if (q.data?.unread) read.mutate(undefined); }}>
        <Bell className="size-5" />
        {!!q.data?.unread && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />}
      </button>
      {open && (
        <div className="card absolute right-0 top-12 z-50 w-80 max-w-[85vw] !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm">Alertas</span>
            <button className="text-xs text-muted-foreground hover:text-white" onClick={() => clear.mutate(undefined)}>Limpar</button>
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {q.isLoading ? <Spinner /> : !q.data?.items.length ? <p className="p-4 text-sm text-muted-foreground">Nenhum alerta.</p> :
              q.data.items.map((a) => (
                <div key={a.id} className="border-b border-border px-4 py-3 text-sm last:border-0">
                  <p className={a.level === "danger" ? "text-primary" : "text-white"}>{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.message}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [menu, setMenu] = useState(false);
  const { data } = authClient.useSession();
  useEffect(() => setMenu(false), [loc]);
  const links = (
    <nav className="space-y-1">
      {NAV.map(({ href, label, icon: I }) => {
        const active = loc === href;
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? "bg-primary/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"}`}>
            <I className={`size-4 ${active ? "text-primary" : ""}`} /> {label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-black p-5 lg:flex">
        <div className="mb-8"><Logo /></div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">{links}</div>
        <div className="border-t border-border pt-4">
          <p className="truncate text-xs text-muted-foreground">{data?.user.email}</p>
          <button className="btn-ghost mt-2 !px-0" onClick={signOut}><LogOut className="size-4" /> Sair</button>
        </div>
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 bg-black/95 p-6 lg:hidden">
          <div className="mb-8 flex items-center justify-between"><Logo /><button onClick={() => setMenu(false)}><X /></button></div>
          {links}
          <button className="btn-ghost mt-6 !px-3" onClick={signOut}><LogOut className="size-4" /> Sair</button>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-black/80 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3 lg:hidden">
            <button onClick={() => setMenu(true)}><Menu /></button>
            <Logo size={24} />
          </div>
          <p className="hidden text-sm font-light text-muted-foreground lg:block">Olá, <span className="text-white">{data?.user.name?.split(" ")[0] || "investidor"}</span></p>
          <div className="flex items-center gap-1">
            <Link href="/app/metas" className="btn-ghost !p-2.5"><PiggyBank className="size-5" /></Link>
            <Alerts />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 pb-24">{children}</main>
      </div>
      <WhatsAppFloat />
    </div>
  );
}
