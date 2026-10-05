# SPEC-012-web-sources: Fontes da web com curadoria

Kind: `full`

## Problema
O Zetel só estuda fontes que o usuário já tem (Markdown/PDF). O Igor quer um
fluxo parecido com o NotebookLM: escrever um tema, receber fontes candidatas
de sites confiáveis, escolher quais entram e estudar sobre elas com o mesmo
pipeline de Documento Técnico e Guia de Estudo.

### Conflito de escopo registrado
`prd-v5.md` coloca pesquisa e importação web fora da V1 (linhas ~41–45,
~110–111, R32 ~600–610 e ~846). Esta spec é uma **mudança de escopo pedida
explicitamente pelo Igor** (2026-10-04), que considera a feature essencial
para começar a testar o app. Ela segue a condição do R32 e de
`docs/PRODUCT_VISION.md` (~161–163): a pesquisa é uma **ferramenta explícita**
("Pesquisar na web"), nunca automática. Nada entra sem confirmação, e a
conversa continua baseada nas fontes do Zetel. O chat não ganha acesso à web.

## Resultado esperado
- Na aba Arquivos de um Zetel, o usuário pode **adicionar uma fonte por link**
  (URL pública) ou **pesquisar na web** por um tema.
- A pesquisa devolve até 8 candidatas com título, site, resumo curto e link,
  marcadas como "lista confiável" ou "fora da lista".
- O usuário marca até 5 candidatas e confirma. Só então o servidor baixa
  cada página e grava um snapshot `.md` em `arquivos/` (ou o PDF original,
  quando o link é um PDF público) com URL, título, site e data de acesso.
- Quando a página não pode ser baixada (bloqueio, paywall, erro), a candidata
  pode ser importada como **trecho**: o resumo que o próprio servidor recebeu
  da busca, marcado como trecho no snapshot.
- Depois disso, o fluxo atual não muda: Processar, Documento Técnico e Guia
  de Estudo. Cada arquivo importado mostra o link "abrir original".

## Requisitos funcionais
- RF1 (importar por link): `POST /api/zetels/[id]/web-sources/import` com
  `{ urls: string[] }` (1–5). Para cada URL, o servidor baixa com segurança
  (RNF1), converte e chama o `addFile` existente. A resposta traz um
  resultado por URL: `ok` (com `file`) ou `error` (com mensagem genérica e
  sem eco da URL).
- RF2 (snapshot Markdown): HTML vira Markdown determinístico, sem LLM, com
  frontmatter YAML `source_url`, `source_title`, `source_site`,
  `accessed_at` e `extraction: full | excerpt`. O título vira `# H1`. O nome
  do arquivo é `web-<slug-do-titulo>.md` (sem colisão, via `addFile`).
  Script, style, nav, header, footer, aside, form, iframe, svg, noscript e
  imagens são descartados (regra 8). Links ficam só como texto.
- RF3 (PDF por link): `Content-Type: application/pdf` dentro de 50 MB entra
  como `.pdf` pelo pipeline de PDF existente, com a mesma proveniência.
- RF4 (proveniência): `zetel_files` ganha `source_url`, `source_title` e
  `source_accessed_at` (nullable; migration 011). `GET .../files` os expõe,
  e a aba Arquivos mostra o site e o link "abrir original" (`target=_blank`,
  `rel="noopener noreferrer"`), sem buscar favicon ou imagem externa.
- RF5 (pesquisar): `POST /api/zetels/[id]/web-sources/search` com
  `{ query: string (2–200 chars), openWeb: boolean }`. O servidor chama o
  OpenRouter com o plugin `web` (engine `exa`, `max_results: 8`). Com
  `openWeb=false`, envia `include_domains` = lista confiável. Retorna
  `{ searchId, candidates: [{ id, title, site, snippet (≤300 chars), url,
  trusted }] }`, deduplicado por URL normalizada, no máximo 8.
- RF6 (importar candidatas): `POST .../web-sources/import` aceita
  alternativamente `{ searchId, candidateIds: string[], allowExcerpt: boolean }`.
  O servidor resolve URL e trecho pelo cache de busca do próprio processo
  (TTL 30 min, por Zetel), nunca pelo texto enviado pelo cliente (regra 3).
  Se o download falha e `allowExcerpt=true`, grava o trecho com
  `extraction: excerpt`.
- RF7 (lista confiável): setting `web_search_domains` (JSON array de
  domínios). Na ausência, vale o padrão em código: `wikipedia.org`,
  `wikibooks.org`, `arxiv.org`, `scielo.org`, `scielo.br`, `*.gov`,
  `*.gov.br`, `*.edu`, `*.edu.br`, `developer.mozilla.org`,
  `docs.python.org`, `nature.com`, `ncbi.nlm.nih.gov`, `khanacademy.org`,
  `stanford.edu`, `mit.edu`. Ela é editável em Configurações > Geral, com
  validação de formato de domínio e no máximo 50 entradas.
- RF8 (orçamento): no máximo 1 chamada de busca por pedido e teto diário
  (padrão 20, configurável de 1 a 200) em `web_search_daily_limit`. O
  contador do dia guarda só data e contagem. Ao estourar o teto, a rota
  responde 429 com mensagem clara, sem chamar o OpenRouter.
- RF9 (confirmação): nada é baixado ou gravado sem um clique explícito de
  importar. A busca não persiste tema nem candidatas em SQLite ou no vault.

## Requisitos nao funcionais
- RNF1 (SSRF/rede): somente `http:`/`https:`, portas 80/443, sem userinfo.
  O host é resolvido por `dns.lookup` com `all: true`, e todo endereço
  precisa ser público: são bloqueados loopback, privados RFC1918, CGNAT,
  link-local (incl. `169.254.169.254`), `0.0.0.0/8`, multicast, reservados,
  ULA/link-local IPv6 e IPv4-mapped privados. A conexão usa o IP validado
  (`lookup` customizado em `node:http/https`, sem nova resolução, o que evita
  DNS rebinding). Redirects são manuais, no máximo 5, e cada destino é
  revalidado. Timeout total de 15 s. Corpo HTML/texto limitado a 5 MB e PDF
  a 50 MB, aplicado também após descompressão (gzip/deflate/br via
  `node:zlib`). Content-types permitidos: `text/html`,
  `application/xhtml+xml`, `text/plain`, `text/markdown`, `application/pdf`.
  Nada da página é executado.
- RNF2 (direitos/paywall): só conteúdo público. 401/402/403/407/451 e
  respostas que exigem login viram erro "fonte não acessível publicamente".
  Não há cookies, credenciais, contorno de paywall/CAPTCHA nem retry com
  outro User-Agent. O User-Agent é fixo e identificável (`Zetel/0.1`).
- RNF3 (logs, regra 6): somente IDs, contagens e categorias de erro
  (`blocked_host`, `timeout`, `too_large`, `bad_type`, `http_status`). Nunca
  URL, domínio, tema pesquisado, título, trecho ou chave. As mensagens de
  erro das rotas (que são logadas) não ecoam URL.
- RNF4 (artefatos): o snapshot passa pelo mesmo sanitizador e renderer.
  Artefatos HTML continuam autocontidos, sem `allow-same-origin` (regra 2),
  e imagens externas continuam bloqueadas (regra 8).
- RNF5 (dados): `better-sqlite3` singleton (regra 7); slug/pasta imutáveis
  (regra 4); a chave OpenRouter continua só em `~/.zetel/config` (regra 9).
  O texto importado é dado, nunca instrução, e entra no prompt pelos
  delimitadores `<fonte>` existentes.
- RNF6 (custo): cerca de US$ 0,007 por busca (Exa) mais os tokens do modelo
  configurado. Testes padrão nunca chamam OpenRouter nem a rede real.

## Arquitetura
- `lib/web-fetch.ts`: `assertPublicUrl`, `isPublicAddress`, `safeFetch(url,
  opts)` (http/https nativos com `lookup` validado, redirects manuais,
  limites, descompressão). É injetável em testes (`resolver`/`transport`).
- `lib/html-to-markdown.ts`: `htmlToMarkdown(html, baseUrl)` via
  `hast-util-from-html` (passa a ser dependência direta, versão `^2.0.3`, já
  instalada no lockfile), mais um walker próprio para o subconjunto
  (h1–h6, p, ul/ol/li, pre/code, blockquote, table simples, br, hr, strong/em).
  Prefere `<main>`/`<article>`, com fallback em `<body>`.
- `lib/web-source-service.ts`: `importWebSource(db, vaultPath, zetelId,
  { url } | { candidate })` → `safeFetch` → snapshot/PDF em diretório
  temporário → `addFile` → grava a proveniência na mesma transação.
- `lib/web-search-service.ts`: `searchWeb(query, openWeb)` → OpenRouter
  `chat/completions` com `plugins: [{ id: 'web', engine: 'exa',
  max_results: 8, include_domains? }]`, lendo
  `choices[0].message.annotations[].url_citation` (`url`, `title`,
  `content`). Também guarda o cache em processo de buscas por Zetel e o
  contador diário.
- Rotas: `app/api/zetels/[id]/web-sources/search/route.ts` e
  `.../web-sources/import/route.ts` (runtime `nodejs`).
- UI: `components/WebSourcesDialog.tsx` (pesquisar, selecionar e importar),
  aberto pela `ArquivosPanel` ("Adicionar por link" e "Pesquisar na web");
  campos da lista e do teto em `ConfiguracoesForm`.
- Migration `011_web_sources.sql`: 3 colunas nullable em `zetel_files`.

## Alternativas rejeitadas
- API dedicada (Tavily/Brave/Exa direto): chave nova e custo próprio; o
  Igor escolheu o plugin web do OpenRouter.
- `:online` sem engine fixa: o comportamento varia por modelo. Fixar `exa`
  dá formato e custo previsíveis.
- Readability + linkedom/turndown: 2–3 dependências novas. A escolhida foi
  `hast-util-from-html`, já instalada.
- Parser HTML próprio: frágil com HTML malformado.
- Busca automática no chat: viola R32 e a visão de produto.
- `fetch` global: não permite fixar o IP validado, o que deixa a janela de
  DNS rebinding aberta.
- Guardar a busca em SQLite: não é necessário e amplia a superfície de
  privacidade.

## Riscos
- SSRF/rebinding: guarda por IP resolvido + conexão no IP + revalidação a cada
  redirect; testes unitários de faixas e testes de integração com
  resolver/transport falsos.
- Zip bomb/página gigante: limite após descompressão e abort do stream.
- Extração ruim (SPA sem SSR): snapshot vazio ou curto vira erro
  "sem texto extraível" (mínimo de 200 caracteres), com opção de trecho.
- Injeção de prompt via página: o texto é dado nos blocos `<fonte>`
  existentes, e o Guia continua com validação JSON server-side.
- Custo: teto diário + 1 chamada por pedido + nenhum teste com rede real.
- Resultado do plugin muda de formato: o parser é tolerante, e zero
  candidatas gera mensagem clara.
- Conflito com o PRD v5: registrado acima e aprovado pelo Igor.

## Estrategia de testes
- Unitários: `isPublicAddress` (tabela de IPv4/IPv6), `assertPublicUrl`
  (esquema, porta, userinfo), `htmlToMarkdown` (fixtures: artigo, SPA vazia,
  script/img removidos, tabela, código), parser de annotations, dedup e
  allowlist (`trusted`, curingas), contador diário.
- Integração: `safeFetch` com transport falso (redirect para IP privado
  bloqueado, limite de tamanho, gzip, content-type recusado, timeout);
  `importWebSource` com vault temporário (snapshot com frontmatter, PDF,
  proveniência em `zetel_files`, Processar gera `zetel_pages`); rotas
  search/import com OpenRouter mockado (429 no teto, cache por `searchId`,
  trecho como fallback, nenhum log com URL/tema).
- Gates FULL por tarefa. O navegador valida busca → lista → seleção →
  importação → documento. Uma chamada real só acontece com autorização
  explícita do Igor na hora.

## Rollout e rollback
- Uma branch por tarefa, `feat/spec-012-task-<nnn>-<slug>`, com
  fast-forward em main após DONE e gates verdes.
- Rollback: reverter os commits. A migration 011 só adiciona colunas
  nullable, então o código antigo ignora essas colunas. Os snapshots
  já importados são `.md` comuns e continuam válidos.
- Observabilidade: logs `web source imported|failed` e `web search done`
  só com ids, contagens e categoria de erro.

## Decisoes aprovaveis
- D1: Provedor de busca = plugin `web` do OpenRouter, engine `exa`,
  `max_results: 8`, com a chave e o modelo existentes.
- D2: "Sites recomendados" = lista editável (padrão RF7) aplicada por
  `include_domains`. O toggle "web aberta" por busca marca as candidatas
  fora da lista com `trusted: false`.
- D3: Fonte guardada = snapshot `.md` com frontmatter de proveniência em
  `arquivos/` (ou o PDF original), mais colunas de proveniência em
  `zetel_files` (migration 011).
- D4: HTML → Markdown com `hast-util-from-html` promovida a dependência
  direta (já no lockfile), sem LLM.
- D5: Limites: 1 busca por pedido, 8 candidatas, 5 importações por vez,
  HTML 5 MB, PDF 50 MB, timeout 15 s, 5 redirects e teto diário de 20
  buscas (configurável).
- D6: Fallback "trecho" só usa conteúdo que o servidor recebeu da busca
  (cache em processo, TTL 30 min). Texto vindo do cliente nunca é usado.
- D7: Chat, prompt e voz não mudam. A web só entra como fonte importada e
  confirmada.
