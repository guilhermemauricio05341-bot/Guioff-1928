import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { FaInstagram, FaWhatsapp } from "react-icons/fa";
import { ArrowRight, Loader2, X } from "lucide-react";
import { INSTAGRAM_URL, WHATSAPP_DISPLAY, waLink } from "../lib/site-config";

export function Logo({ size = 28, text = true }: { size?: number; text?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M16 2 28 9v14l-12 7L4 23V9z" stroke="#e11d2e" strokeWidth="1.6" />
        <path d="M21 12.5a6 6 0 1 0 0 7h-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {text && <span className="text-sm font-light tracking-[0.42em] text-white">GUIOFF</span>}
    </Link>
  );
}

function Cube({ x, y, s }: { x: number; y: number; s: number }) {
  const h = s * 0.58;
  return (
    <g>
      <path d={`M${x} ${y} l${s} ${-h} l${s} ${h} l${-s} ${h}z`} />
      <path d={`M${x} ${y} v${s * 1.15} l${s} ${h} v${-s * 1.15}`} />
      <path d={`M${x + 2 * s} ${y} v${s * 1.15} l${-s} ${h}`} />
    </g>
  );
}

export function IsoArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 420" fill="none" stroke="#e11d2e" strokeWidth="1.2" className={`draw floaty ${className}`}>
      <Cube x={110} y={120} s={100} />
      <Cube x={60} y={250} s={55} />
      <Cube x={250} y={270} s={45} />
      <Cube x={290} y={80} s={30} />
      <line x1="20" y1="400" x2="400" y2="400" stroke="rgb(255 255 255 / 15%)" />
    </svg>
  );
}

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-primary" /> {label}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-light">{title}</h3>
          <button className="btn-ghost !p-2" onClick={onClose}><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function WhatsAppFloat() {
  return (
    <a href={waLink()} target="_blank" rel="noreferrer" aria-label="WhatsApp"
      className="fixed bottom-20 right-5 z-40 grid size-13 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_8px_30px_-6px_#25D36688] transition-transform hover:scale-110">
      <FaWhatsapp className="size-7" />
    </a>
  );
}

export function WhatsInput() {
  const [msg, setMsg] = useState("");
  return (
    <form className="flex items-center gap-3 border-b border-white/30 focus-within:border-primary"
      onSubmit={(e) => { e.preventDefault(); window.open(waLink(msg || undefined), "_blank"); }}>
      <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Escreva sua mensagem…"
        className="w-full bg-transparent py-3 text-base font-light outline-none placeholder:text-white/35" />
      <button className="text-primary transition-transform hover:translate-x-1" aria-label="Enviar"><ArrowRight /></button>
    </form>
  );
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="red-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-3">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm font-light text-muted-foreground">Controle financeiro e investimentos com clareza. Seus dados, protegidos.</p>
        </div>
        <div className="space-y-3 text-sm">
          <p className="eyebrow">Contato</p>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-white/80 hover:text-white"><FaInstagram /> @_guioff</a>
          <a href={waLink()} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-white/80 hover:text-white"><FaWhatsapp /> {WHATSAPP_DISPLAY}</a>
        </div>
        <div className="space-y-3">
          <p className="eyebrow">Fale com a gente</p>
          <WhatsInput />
        </div>
      </div>
      <p className="relative pb-6 text-center text-[11px] tracking-widest text-white/40">© {new Date().getFullYear()} GUIOFF · Rentabilidade passada não garante rentabilidade futura.</p>
    </footer>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`num text-xl md:text-2xl font-light ${tone === "neg" ? "text-primary" : "text-white"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-light tracking-tight md:text-4xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Bar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full transition-all duration-700 ${danger || p >= 100 ? "bg-primary" : "bg-white"}`} style={{ width: `${p}%` }} />
    </div>
  );
}
