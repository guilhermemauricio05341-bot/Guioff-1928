import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "motion/react";
import { ArrowRight, Bot, Landmark, LineChart, ShieldCheck, Target, Wallet } from "lucide-react";
import { FaGoogle, FaInstagram, FaWhatsapp } from "react-icons/fa";
import { authClient, captureToken, signInGoogle } from "../lib/auth";
import { INSTAGRAM_URL, WHATSAPP_DISPLAY, waLink } from "../lib/site-config";
import { Footer, IsoArt, Logo, WhatsAppFloat, WhatsInput } from "../components/brand";

function TopBar() {
  const { data } = authClient.useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-light text-white/70 md:flex">
          <a href="/#recursos" className="hover:text-white">Recursos</a>
          <a href="/#seguranca" className="hover:text-white">Segurança</a>
          <Link href="/contato" className="hover:text-white">Contato</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/contato" className="btn-outline hidden !py-2 sm:inline-flex">Contato</Link>
          <Link href={data ? "/app" : "/entrar"} className="btn-primary !py-2">{data ? "Abrir painel" : "Entrar"}</Link>
        </div>
      </div>
    </header>
  );
}

const FEATURES = [
  { icon: Landmark, n: "01", t: "Open Finance", d: "Conecte bancos e cartões com segurança. Saldos e movimentações sincronizados automaticamente." },
  { icon: Wallet, n: "02", t: "Gastos inteligentes", d: "Categorização automática, assinaturas e pagamentos recorrentes detectados para você." },
  { icon: LineChart, n: "03", t: "Investimentos", d: "Simulador de juros compostos, comparação CDB, Tesouro, LCI, LCA, fundos e ações com IR." },
  { icon: Target, n: "04", t: "Planejamento", d: "Metas, dívidas, parcelas, vencimentos e limites por categoria com alertas." },
  { icon: Bot, n: "05", t: "Assistente IA", d: "Tire dúvidas e analise suas finanças. Sem promessas de retorno — só clareza." },
  { icon: ShieldCheck, n: "06", t: "Privacidade", d: "Dados isolados por usuário e campos sensíveis criptografados. Nunca guardamos senhas de banco." },
];

export function Landing() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <section className="grid-bg relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2 md:py-28">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <p className="eyebrow">Finanças · Investimentos · Open Finance</p>
            <h1 className="mt-5 text-5xl font-extralight leading-[1.05] tracking-tight md:text-7xl">
              Seu dinheiro,<br /><span className="text-primary">sob controle.</span>
            </h1>
            <p className="mt-6 max-w-md text-base font-light text-white/60">
              Patrimônio, gastos, cartões e investimentos em um só lugar. Simule, planeje e decida com dados reais.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/entrar" className="btn-primary">Começar agora <ArrowRight className="size-4" /></Link>
              <a href="#recursos" className="btn-outline">Ver recursos</a>
            </div>
          </motion.div>
          <IsoArt className="mx-auto w-full max-w-md" />
        </div>
      </section>
      <section id="recursos" className="mx-auto max-w-6xl px-6 py-24">
        <p className="eyebrow">Recursos</p>
        <h2 className="mt-3 max-w-xl text-3xl font-extralight md:text-5xl">Tudo o que você precisa para decidir melhor.</h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="group bg-black p-8 transition-colors hover:bg-[#0c0c0c]">
              <div className="flex items-center justify-between">
                <f.icon className="size-6 text-primary" strokeWidth={1.3} />
                <span className="num text-xs text-white/30">{f.n}</span>
              </div>
              <h3 className="mt-8 text-xl font-light">{f.t}</h3>
              <p className="mt-2 text-sm font-light text-white/55">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>
      <section id="seguranca" className="border-y border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
          <h2 className="text-3xl font-extralight md:text-4xl">Segurança em primeiro lugar.</h2>
          <ul className="space-y-4 text-sm font-light text-white/70">
            {["Conexão bancária via Pluggy (Open Finance regulado pelo Banco Central)", "Nunca armazenamos senhas de banco", "Dados sensíveis criptografados (AES-256-GCM)", "Você pode desconectar qualquer banco a qualquer momento"].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{t}</li>
            ))}
          </ul>
        </div>
      </section>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

export function Contato() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <p className="eyebrow">Contato</p>
          <h1 className="mt-4 text-5xl font-extralight tracking-tight md:text-6xl">Vamos conversar.</h1>
          <p className="mt-5 max-w-md font-light text-white/60">Escreva sua mensagem abaixo e ela abre direto no nosso WhatsApp.</p>
          <div className="mt-10 max-w-md"><WhatsInput /></div>
          <div className="mt-10 space-y-4 text-sm">
            <a className="flex items-center gap-3 text-white/80 hover:text-white" href={waLink()} target="_blank" rel="noreferrer"><FaWhatsapp className="text-primary" /> {WHATSAPP_DISPLAY}</a>
            <a className="flex items-center gap-3 text-white/80 hover:text-white" href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><FaInstagram className="text-primary" /> @_guioff</a>
          </div>
        </div>
        <IsoArt className="mx-auto w-full max-w-sm" />
      </section>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

export function Entrar() {
  const [tab, setTab] = useState<"in" | "up">("in");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [, nav] = useLocation();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const opts = { onSuccess: captureToken };
    const res = tab === "in"
      ? await authClient.signIn.email({ email: form.email, password: form.password }, opts)
      : await authClient.signUp.email({ name: form.name || form.email.split("@")[0]!, email: form.email, password: form.password }, opts);
    setBusy(false);
    if (res.error) setErr(res.error.message || "Não foi possível entrar. Verifique os dados.");
    else nav("/app");
  }

  async function google() {
    setErr("");
    try { await signInGoogle(); const s = await authClient.getSession(); if (s.data) nav("/app"); }
    catch { setErr("Não foi possível entrar com Google."); }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border md:block">
        <div className="grid-bg absolute inset-0" />
        <div className="red-glow absolute inset-0 opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo />
          <IsoArt className="mx-auto w-3/4" />
          <p className="text-sm font-light text-white/50">Controle financeiro com clareza.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="mb-8 md:hidden"><Logo /></div>
          <h1 className="text-4xl font-extralight">{tab === "in" ? "Entrar" : "Criar conta"}</h1>
          <div className="mt-6 flex gap-1 rounded-full border border-border p-1 text-sm">
            {(["in", "up"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-2 transition-colors ${tab === t ? "bg-white text-black" : "text-white/60"}`}>
                {t === "in" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {tab === "up" && <div><label className="label">Nome</label><input className="field" value={form.name} onChange={set("name")} /></div>}
            <div><label className="label">E-mail</label><input className="field" type="email" required value={form.email} onChange={set("email")} /></div>
            <div><label className="label">Senha</label><input className="field" type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="mín. 8 caracteres" /></div>
            {err && <p className="text-sm text-primary">{err}</p>}
            <button disabled={busy} className="btn-primary w-full">{busy ? "Aguarde…" : tab === "in" ? "Entrar" : "Criar conta"}</button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-white/30"><span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" /></div>
          <button onClick={google} className="btn-outline w-full"><FaGoogle /> Continuar com Google</button>
          <Link href="/" className="mt-6 block text-center text-xs text-white/40 hover:text-white">← Voltar ao site</Link>
        </motion.div>
      </div>
    </div>
  );
}
