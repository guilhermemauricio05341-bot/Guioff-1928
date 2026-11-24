/**
 * Automatic categorization. Uses keyword rules on the description/merchant first
 * (Brazilian merchants), then falls back to the Pluggy category.
 */
export const CATEGORIES = [
  "alimentacao",
  "mercado",
  "transporte",
  "lazer",
  "contas",
  "moradia",
  "saude",
  "educacao",
  "compras",
  "assinaturas",
  "viagem",
  "impostos",
  "investimentos",
  "transferencias",
  "receitas",
  "outros",
] as const;
export type Category = (typeof CATEGORIES)[number];

const RULES: [Category, RegExp][] = [
  ["assinaturas", /netflix|spotify|disney|hbo|max\.com|prime video|amazon prime|youtube premium|google one|icloud|apple\.com|deezer|globoplay|paramount|crunchyroll|chatgpt|openai|adobe|microsoft 365|xbox|playstation|smart ?fit|bluefit|gympass|wellhub|totalpass/i],
  ["alimentacao", /ifood|rappi|restaurante|lanchonete|padaria|burger|mcdonald|bk |habib|outback|pizza|sushi|cafe|caf[eé]|starbucks|bar |churrasc|aiqfome|ze delivery|z[eé] delivery/i],
  ["mercado", /mercado|supermerc|carrefour|p[aã]o de a[cç]ucar|extra |assai|assaí|atacad|dia %|hortifruti|sams club|big |savegnago|condor|zaffari|st marche|oba/i],
  ["transporte", /uber|99 ?app|99pop|99 tecnologia|cabify|posto|shell|ipiranga|petrobras|br mania|combust|estaciona|sem parar|conectcar|veloe|metr[oô]|cptm|bilhete|sptrans|ped[aá]gio|localiza|movida/i],
  ["contas", /enel|light |cemig|copel|sabesp|cedae|comgas|celesc|energia|[aá]gua e esgoto|vivo|claro|tim |oi |net |internet|telefon|condom[ií]nio/i],
  ["moradia", /aluguel|imobili|quinto andar|quintoandar|iptu|leroy|tok ?stok|casa e video/i],
  ["saude", /farm[aá]cia|drogaria|droga ?raia|drogasil|pague menos|hospital|cl[ií]nica|laborat|unimed|amil|bradesco sa[uú]de|sulamerica|odonto|m[eé]dic|dentista/i],
  ["educacao", /escola|faculdade|universidade|curso|udemy|alura|coursera|livraria|saraiva|col[eé]gio|mensalidade/i],
  ["lazer", /cinema|cinemark|ingresso|sympla|eventim|show|teatro|steam|parque|bar e|balada|clube/i],
  ["viagem", /hotel|airbnb|booking|decolar|latam|gol linhas|azul linhas|123milhas|passagem/i],
  ["compras", /amazon|mercado ?livre|mercadolivre|shopee|shein|magalu|magazine|americanas|casas bahia|aliexpress|renner|riachuelo|c&a|zara|centauro|netshoes|kabum/i],
  ["impostos", /darf|imposto|ipva|licenciamento|detran|receita federal|tributo/i],
  ["investimentos", /aplica[cç][aã]o|resgate|tesouro|cdb|corretora|xp invest|rico |clear |nuinvest|b3 /i],
  ["transferencias", /pix|ted |doc |transfer[eê]ncia|transf /i],
];

const PLUGGY_MAP: [RegExp, Category][] = [
  [/groceries|supermarket/i, "mercado"],
  [/eating out|food|restaurant|delivery/i, "alimentacao"],
  [/transport|taxi|ride|gas station|fuel|parking|toll|public transportation/i, "transporte"],
  [/streaming|subscription|digital services/i, "assinaturas"],
  [/leisure|entertainment|culture|sports|gaming|tickets/i, "lazer"],
  [/utilities|electricity|water|telecommunication|internet|mobile/i, "contas"],
  [/housing|rent|home/i, "moradia"],
  [/health|pharmacy|dentist|hospital|wellness/i, "saude"],
  [/education|school|university|book/i, "educacao"],
  [/travel|accommodation|airport|airline/i, "viagem"],
  [/shopping|clothing|electronics|online shopping/i, "compras"],
  [/tax/i, "impostos"],
  [/investment/i, "investimentos"],
  [/transfer/i, "transferencias"],
  [/salary|income|retirement|entrepreneurial/i, "receitas"],
];

export function categorize(input: {
  description: string;
  merchant?: string | null;
  providerCategory?: string | null;
  amount: number;
}): Category {
  const text = `${input.description} ${input.merchant ?? ""}`;
  // Receitas: salary / incoming money
  if (input.amount > 0) {
    if (/sal[aá]rio|folha|pagamento recebido|proventos|dividendos|rendimento|reembolso|pix recebido|ted recebida|cr[eé]dito/i.test(text))
      return "receitas";
  }
  for (const [cat, re] of RULES) if (re.test(text)) {
    if (cat === "transferencias" && input.amount > 0) return "receitas";
    return cat;
  }
  if (input.providerCategory) {
    for (const [re, cat] of PLUGGY_MAP) if (re.test(input.providerCategory)) return cat;
  }
  return input.amount > 0 ? "receitas" : "outros";
}

export function isSubscriptionLike(description: string) {
  return RULES[0]![1].test(description);
}
