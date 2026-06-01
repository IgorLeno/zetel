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
