import type { ComponentType } from "react";
import { Route, Switch } from "wouter";
import { Provider } from "./components/provider";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { ProtectedRoute } from "./components/shell";
import { Contato, Entrar, Landing } from "./pages/public";
import Dashboard from "./pages/dashboard";
import { Cartoes, Contas, Transacoes } from "./pages/money";
import Investimentos from "./pages/invest";
import Assistente from "./pages/assistant";
import { Dividas, Limites, Metas, Perfil, Vencimentos } from "./pages/planning";

const P = (C: ComponentType) => () => <ProtectedRoute><C /></ProtectedRoute>;
const APP: [string, ComponentType][] = [
  ["/app", Dashboard], ["/app/transacoes", Transacoes], ["/app/contas", Contas], ["/app/cartoes", Cartoes],
  ["/app/investimentos", Investimentos], ["/app/assistente", Assistente], ["/app/metas", Metas], ["/app/dividas", Dividas],
  ["/app/vencimentos", Vencimentos], ["/app/limites", Limites], ["/app/perfil", Perfil],
];
const routes = APP.map(([p, C]) => [p, P(C)] as const);

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/entrar" component={Entrar} />
        <Route path="/contato" component={Contato} />
        {routes.map(([p, C]) => <Route key={p} path={p} component={C} />)}
        <Route component={Landing} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
