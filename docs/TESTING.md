# Guia de Testes — Zetel

## Pirâmide de testes

```
         ┌─────────────┐
         │   E2E live  │  (requer OpenRouter + vault real)
         ├─────────────┤
         │  E2E mock   │  (servidor + fixtures; sem LLM)
         ├─────────────┤
         │ Integration │  (SQLite/vault em HOME/tmpdir — Módulo 12.0B)
         ├─────────────┤
         │    Unit     │  (funções puras; sem I/O externo) ← aqui estamos
         └─────────────┘
```

Os testes unitários (Módulo 12.0A) cobrem funções puras e lógica de negócio isolada das dependências externas. Integration tests e E2E são implementados a partir do Módulo 12.0B.

---

## Comandos

| Comando | O que faz |
|---------|-----------|
| `pnpm test` | Executa todos os testes unitários (sem coverage) |
| `pnpm test:watch` | Executa em modo watch (desenvolvimento) |
| `pnpm test:coverage` | Executa com relatório de coverage V8 |
| `pnpm test:ci` | Executa com reporter verbose (usado no CI) |
| `pnpm test:e2e` | Executa testes E2E com Playwright (requer servidor) |

---

## Tipos de teste e diferenças

### Unit tests (`tests/unit/`)

Testam funções puras ou lógica de negócio sem dependências externas:
- Nenhuma chamada ao OpenRouter
- Nenhum acesso a `~/.zetel`
- Nenhum uso de vault real
- Banco SQLite não é inicializado
- Usa Vitest + V8 coverage

### Integration tests (Módulo 12.0B — pendente)

Testam serviços que dependem de SQLite ou filesystem, usando um HOME/vault temporário isolado:
- `better-sqlite3` em `tmpdir` dedicado
- Vault criado e destruído por `beforeAll`/`afterAll`
- Sem vault real, sem `~/.zetel` real
- Separados em `tests/integration/`

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

1. **Nunca usar OpenRouter** — nenhum teste em `tests/` chama `streamChat`, `requestJson` ou importa `lib/openrouter`.
2. **Nunca usar vault real** — testes que precisam de arquivos usam `os.tmpdir()`.
3. **Nunca tocar `~/.zetel` real** — nenhum teste acessa `DB_PATH`, `CONFIG_PATH` ou `LOG_FILE` do módulo `lib/paths.ts`.
4. **Não importar `getDb()`** nos testes do Módulo 12.0A — `lib/db.ts` inicializa SQLite em `~/.zetel/zetel.db`.

---

## Alertas importantes

### `lib/paths.ts`
Exporta `DB_PATH`, `CONFIG_PATH`, `LOG_FILE` etc., todos apontando para `~/.zetel`. Importar este módulo em testes é seguro (apenas define strings), mas **usar esses caminhos para ler/escrever** toca o ambiente real.

### `lib/db.ts`
Exporta `getDb()` que abre/cria `~/.zetel/zetel.db` na primeira chamada. **Não importar em testes unitários** — isso criaria o banco real. Integration tests (Módulo 12.0B) usarão um harness com banco em `tmpdir`.

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

## Módulo 12.0B (pendente)

O Módulo 12.0B implementará:
- Integration tests com `better-sqlite3` em `tmpdir`
- Harness temporário (HOME/vault isolados) para `processZetel`, `generateStudyGuide`, etc.
- E2E mock com intercept do OpenRouter via Playwright
- Reorganização dos specs E2E existentes

**Motivo:** os módulos que requerem SQLite ou vault dependem de `~/.zetel` por padrão. O harness precisará de injeção de caminhos ou variáveis de ambiente para redirecionar para `tmpdir` — tarefa de escopo próprio para não quebrar produção.
