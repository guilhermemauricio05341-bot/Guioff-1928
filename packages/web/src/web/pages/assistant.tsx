import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Trash2 } from "lucide-react";
import { client, orpc } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAction } from "../queries";
import { PageHead, Spinner } from "../components/brand";

const transport = new DefaultChatTransport({
  api: "/api/agent/messages",
  headers: async (): Promise<Record<string, string>> => { const t = await getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; },
});

function Chat({ initial }: { initial: UIMessage[] }) {
  const { messages, sendMessage, status, error, setMessages } = useChat({ transport, messages: initial });
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const clear = useAction(() => client.assistant.clear(), () => setMessages([]));
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  const busy = status === "submitted" || status === "streaming";
  const paid = error && /PAID_PLAN_REQUIRED|402/.test(error.message);
  const ask = (t: string) => { if (!t.trim() || busy) return; sendMessage({ text: t }); setText(""); };
  return (
    <div className="card flex h-[70vh] flex-col !p-0">
      <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
        {!messages.length && <div className="space-y-2 text-sm text-muted-foreground"><p>Pergunte sobre seus gastos, metas ou investimentos.</p>
          {["Quanto gastei este mês e quanto sobra?", "Quais assinaturas eu tenho?", "CDB ou LCI para 2 anos?"].map((s) => <button key={s} onClick={() => ask(s)} className="btn-outline mr-2 !py-1.5 text-xs">{s}</button>)}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`prose-chat max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-white" : "bg-muted"}`}>
              {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : p.type.startsWith("tool-") ? <span key={i} className="block text-xs text-muted-foreground">consultando dados…</span> : null))}
            </div>
          </div>
        ))}
        {status === "submitted" && <Spinner label="Pensando…" />}
        {error && <p className="text-sm text-primary">{paid ? "O assistente de IA requer um plano pago da Runable." : error.message}</p>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <button type="button" className="btn-ghost !p-2.5" onClick={() => clear.mutate(undefined)}><Trash2 className="size-4" /></button>
        <input className="field flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite sua pergunta…" />
        <button className="btn-primary !px-4" disabled={busy}><Send className="size-4" /></button>
      </form>
    </div>
  );
}

export default function Assistente() {
  const q = useQuery(orpc.assistant.thread.queryOptions());
  return (
    <div>
      <PageHead eyebrow="Inteligência artificial" title="Assistente" />
      {q.isLoading ? <Spinner /> : <Chat initial={(q.data?.messages ?? []) as UIMessage[]} />}
      <p className="mt-3 text-xs text-muted-foreground">Conteúdo educativo. Não é recomendação de investimento e não há garantia de retorno.</p>
    </div>
  );
}
