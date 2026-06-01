# Guia de Testes — Zetel

## Pirâmide de testes

```
         ┌─────────────┐
         │   E2E live  │  (requer OpenRouter + vault real)
         ├─────────────┤
         │  E2E mock   │  (servidor + fixtures; sem LLM)
         ├─────────────┤
         │ Integration │  (SQLite/vault em tmpdir isolado — Módulo 12.0B)
         ├─────────────┤
         │    Unit     │  (funções puras; sem I/O externo)
         └─────────────┘
```

Os testes unitários (Módulo 12.0A) cobrem funções puras e lógica de negócio isolada das dependências externas. Integration tests (Módulo 12.0B) exercitam serviços com SQLite e vault temporários.

---

## Comandos

| Comando | O que faz |
|---------|-----------|
| `pnpm test` | Executa todos os testes (unit + integration) |
| `pnpm test:unit` | Executa apenas `tests/unit/` |
| `pnpm test:integration` | Executa apenas `tests/integration/` |
| `pnpm test:watch` | Executa em modo watch (desenvolvimento) |
| `pnpm test:coverage` | Executa com relatório de coverage V8 |
| `pnpm test:ci` | Executa `test:unit` e `test:integration` em sequência (usado no CI) |
| `pnpm test:e2e` | Executa testes E2E com Playwright (requer servidor) |

---

## Tipos de teste e diferenças

### Unit tests (`tests/unit/`)

Testam funções puras ou lógica de negócio sem dependências externas:
- Nenhuma chamada real ao OpenRouter
- Nenhum acesso a `~/.zetel`
- Nenhum uso de vault real
- Banco SQLite não é inicializado
- Usa Vitest + V8 coverage

### Integration tests (`tests/integration/`)

Testam serviços que dependem de SQLite ou filesystem, usando um HOME/vault temporário isolado via `tests/helpers/temp-env.ts`:
- `better-sqlite3` em `:memory:` (injetado diretamente — **sem** `getDb()` singleton)
- Vault criado e destruído por `beforeEach`/`afterEach`
- Sem vault real, sem `~/.zetel` real
- OpenRouter mockado com `vi.mock('@/lib/openrouter')` quando necessário

Domínios cobertos:
- **Ingestão** — `tests/integration/ingestao/process-zetel.test.ts`: `processZetel` grava páginas com anchor/hash idempotente
- **Geração de guia** — `tests/integration/study-guide/generate-study-guide.test.ts` e `full-flow.test.ts`: pipeline completo com LLM mockado, artefatos HTML/meta/source
- **Rastreabilidade** — `tests/integration/study-guide/traceability-pipeline.test.ts`: endurecimento de quiz inválido e cobertura de hashes

### E2E mock (`e2e/`)

Testam o app completo via Playwright com servidor real e respostas de chat mockadas:
- Requerem `pnpm dev` ou `pnpm start` rodando
- Mockam chamadas ao OpenRouter via intercept
- Configurados via `.env.e2e`
- Não dependem de `OPENROUTER_API_KEY`

### E2E live

Igual ao mock, mas com LLM real:
- Requerem `OPENROUTER_API_KEY` válida
- Não rodam no CI padrão
- Opcionais — validação manual pelo dev

---

## Regras dos testes padrão

1. **Nenhuma chamada real ao OpenRouter** — nenhum teste realiza chamada real ao OpenRouter. Imports de `lib/openrouter` são permitidos apenas quando o módulo é mockado com `vi.mock` no próprio teste.
2. **Nunca usar vault real** — testes que precisam de arquivos usam `os.tmpdir()`.
3. **Nunca tocar `~/.zetel` real** — nenhum teste acessa `DB_PATH`, `CONFIG_PATH` ou `LOG_FILE` do módulo `lib/paths.ts` para leitura/escrita.
4. **Não importar `getDb()` nos testes unitários** — `lib/db.ts` inicializa SQLite em `~/.zetel/zetel.db`. Integration tests usam o harness `temp-env.ts` com banco injetado.

---

## Alertas importantes

### `lib/paths.ts`
Exporta `DB_PATH`, `CONFIG_PATH`, `LOG_FILE` etc., todos apontando para `~/.zetel`. Importar este módulo em testes é seguro (apenas define strings), mas **usar esses caminhos para ler/escrever** toca o ambiente real.

### `lib/db.ts`
Exporta `getDb()` que abre/cria `~/.zetel/zetel.db` na primeira chamada. **Não importar em testes unitários** — isso criaria o banco real. Integration tests usam `makeTempEnv()` com banco `:memory:` injetado diretamente nos serviços.

---

## Coverage

Coverage configurado com V8 via `vitest.config.ts`. Thresholds por arquivo:

| Arquivo | Lines | Functions | Branches |
|---------|-------|-----------|----------|
| `lib/source-index.ts` | 80% | 80% | 70% |
| `lib/format-utils.ts` | 90% | 90% | — |
| `lib/relative-time.ts` | 80% | 80% | — |

Os demais arquivos são reportados sem threshold bloqueante nesta fase.

---

## E2E Live com OpenRouter (Módulo 12.1)

### Diferença entre E2E legado e E2E live

| | E2E legado (`e2e/`) | E2E live (`e2e/live/`) |
|---|---|---|
| OpenRouter | Mockado via intercept Playwright | Real (requer chave) |
| Porta | 3000 | 3001 |
| ZETEL_HOME | `~/.zetel` do dev | `tmpdir()` exclusivo |
| CI padrão | Sim (quando servidor disponível) | Não — opt-in manual |
| Budget guard | N/A | `ZETEL_E2E_MAX_CALLS` (default 3) |

### Isolamento

O servidor live roda na porta 3001 via `pnpm dev:live`. O `ZETEL_HOME` é um diretório temporário em `tmpdir()` gerado automaticamente pelo `playwright.config.ts` — nunca usa `~/.zetel` real.

**Limitação conhecida:** não misture `ZETEL_E2E_LIVE=1` com `--project=e2e-legacy` no mesmo comando. Quando o modo live está ativo, o servidor legado (porta 3000) é omitido do array `webServer`.

### Configurar `.env.e2e.live`

Copiar o exemplo e preencher:

```bash
cp .env.e2e.live.example .env.e2e.live
# editar .env.e2e.live e adicionar OPENROUTER_API_KEY=sk-or-...
```

Variáveis disponíveis:

| Variável | Padrão | Descrição |
|---|---|---|
| `OPENROUTER_API_KEY` | — | **Obrigatória** para testes live |
| `ZETEL_E2E_MODEL` | `''` | Modelo padrão (chat + guia se `_STUDY_GUIDE_MODEL` omitido) |
| `ZETEL_E2E_STUDY_GUIDE_MODEL` | `ZETEL_E2E_MODEL` | Modelo específico para guia de estudo |
| `ZETEL_E2E_MAX_CALLS` | `3` | Limite de chamadas ao OpenRouter por run |
| `ZETEL_E2E_MAX_TOKENS` | `2048` | Tokens máximos para geração do guia |
| `ZETEL_E2E_TIMEOUT_MS` | `90000` | Timeout de cada chamada LLM em ms |
| `ZETEL_E2E_FIXTURE` | `dft-mini` | Fixture a usar (nome sem extensão) |

### Escolher modelo barato

Para desenvolvimento, prefira modelos de baixo custo:
- `openai/gpt-4o-mini` — barato, rápido, bom para validação estrutural
- `deepseek/deepseek-chat` — custo muito baixo, aceita JSON estruturado
- `google/gemma-3-12b-it:free` — gratuito no tier free do OpenRouter

### Rodar localmente

**Sem chave** (specs pulam com mensagem clara):

```bash
pnpm test:e2e:live
```

**Com chave** (testes live executam de verdade):

```bash
# garantir que .env.e2e.live tem OPENROUTER_API_KEY
pnpm test:e2e:live
```

O output do console registra para cada chamada LLM:
- modelo usado
- latência em ms
- status HTTP
- tokens in / out

### Rodar pelo GitHub Actions (workflow_dispatch)

1. Acessar **Actions → E2E Live (manual)** no repositório
2. Clicar em **Run workflow**
3. Preencher os inputs (model, max_calls etc.)
4. O secret `OPENROUTER_API_KEY` deve estar configurado nas configurações do repositório

Se o secret não estiver configurado, o workflow falha imediatamente no primeiro step com mensagem clara.

### Artefatos gerados

Em caso de falha, os artefatos são salvos em `test-results/e2e-live/<titulo-do-teste>/`:

| Arquivo | Conteúdo |
|---|---|
| `screenshot.png` | Captura de tela no momento da falha |
| `console-errors.json` | Erros capturados por `page.on('console')` e `pageerror` |
| `network-errors.json` | Requests falhos capturados por `page.on('requestfailed')` |
| `chat-response.txt` | Texto da última resposta do assistente (spec de chat) |
| `artefatos/guia-estudo.html` | HTML do guia gerado |
| `artefatos/guia-estudo.meta.json` | Metadados do guia |
| `artefatos/guia-estudo.source.json` | Rastreabilidade guide_block_id → Markdown |
| `e2e-live-report.json` | Relatório estruturado completo (ver abaixo) |

O `e2e-live-report.json` contém: timestamp, commitSha, fixture, modelos, callCount, maxCalls, título do teste, status, erros, erros de console/rede e lista de artefatos coletados. **Nunca inclui OPENROUTER_API_KEY nem conteúdo real do usuário.**

### Summarizer

Para gerar um resumo de falha após um run:

```bash
# Usa o relatório mais recente automaticamente
node scripts/e2e-live-summarize.mjs

# Ou aponta para um relatório específico
node scripts/e2e-live-summarize.mjs test-results/e2e-live/meu-teste/e2e-live-report.json
```

Gera `test-results/e2e-live/e2e-live-summary.md` e `e2e-live-summary.json`.

- **Sem chave:** summary estático com os dados do relatório.
- **Com chave:** análise LLM classifica a falha em uma categoria (`app`, `prompt`, `modelo`, `timeout`, `json-invalido`, `stream-vazio`, `navegacao-ui`, `rastreabilidade`, `outro`) e sugere arquivos prováveis.

### Entregar artefatos para Claude Code / Codex

Após uma run com falha, os artefatos ficam em `test-results/e2e-live/`. Para compartilhar com uma sessão de debugging:

1. Apontar para `e2e-live-report.json` e `e2e-live-summary.json`
2. Incluir `artefatos/guia-estudo.meta.json` para contexto do modelo e contagens
3. O `chat-response.txt` é útil para diagnóstico de corrupção de stream

### Nota sobre `OPENROUTER_API_KEY` no CI

O `playwright.config.ts` usa `toStringEnv(process.env)` para passar o ambiente completo ao webServer live. No CI, isso significa que a chave do runner é repassada ao servidor Next.js — **nunca logar o ambiente do servidor em CI** (conforme DT4: logs apenas IDs e contagens).
