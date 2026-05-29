# Spikes — Módulo 0

Protótipos descartáveis para eliminar incertezas técnicas antes do código de produto.

**Pré-requisitos:** Node.js 20+, pnpm instalado (`npm install -g pnpm`).

---

## Spike A — Pipeline Markdown → HTML paginado

```bash
cd spike-a
pnpm install
node run.mjs inputs/curto.md
node run.mjs inputs/medio.md
node run.mjs inputs/longo.md
# outputs em spike-a/outputs/
```

Validar idempotência:
```bash
sha256sum outputs/*.html > /tmp/h1.txt
node run.mjs inputs/curto.md && node run.mjs inputs/medio.md && node run.mjs inputs/longo.md
sha256sum outputs/*.html > /tmp/h2.txt
diff /tmp/h1.txt /tmp/h2.txt   # deve estar vazio
```

Abrir no browser: `xdg-open outputs/medio.html`

---

## Spike B — Mock visual

```bash
xdg-open spike-b/mock.html
```

Gate de saída: aprovação manual do Igor. Sem aprovação, Módulo 4 não começa.

---

## Spike C — better-sqlite3 em Next.js App Router

```bash
cd spike-c
pnpm install
pnpm dev
```

Em outro terminal:
```bash
# 10 requests seguidos
for i in $(seq 1 10); do curl -s localhost:3000/api/test-db | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['count'])"; done

# Confirmar DB criado
ls -la ~/.zetel/spike-c.db
```

Hot-reload: editar `app/page.tsx`, salvar, re-bater `/api/test-db`. Log `[spike-c] DB connected` deve aparecer **exatamente uma vez** no console do dev desde o boot.

---

## Spike D — OpenRouter SSE + modelos

```bash
cd spike-d
pnpm install

# Requer chave OpenRouter
export OPENROUTER_API_KEY=sk-or-...
node run.mjs chat     # resposta em PT-BR + TTFT + tokens
node run.mjs models   # 10 modelos mais baratos com preço
```

Override de modelo: `OPENROUTER_MODEL=google/gemini-flash-1.5 node run.mjs chat`

---

## Gate de saída (Módulo 0 → 1)

- [ ] Mock visual aprovado por Igor.
- [ ] Pipeline A: outputs reproduzíveis nos 3 inputs (diff vazio).
- [ ] Spike C: zero crashes em hot-reload; DB em `~/.zetel/spike-c.db`.
- [ ] Spike D: TTFT < 5s; resposta em PT-BR; ≥ 5 modelos listados.
- [ ] `lessons.md` preenchido com calibrações e dívidas para o Módulo 1.
