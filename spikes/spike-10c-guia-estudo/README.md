# Spike 10C — Guia de Estudo com LLM

Spike **descartável e isolado** do app (`package.json` + `node_modules` próprios).
Valida, com evidência auditável e **antes** de tocar produção no Módulo 10D, o
pipeline editorial do Guia de Estudo (PRD v3 Parte C, decisões D26/D27):

> Markdown original → **LLM gera apenas JSON estruturado** → template
> determinístico renderiza HTML. A LLM **nunca** gera HTML final (R2/D26).

A pergunta central: *a LLM consegue produzir um JSON conforme o schema D26 com
rastreabilidade suficiente para mapear cada bloco do guia de volta ao Markdown
original?* — **Resposta: sim.**

- Toolchain: Node 22.22.2, pnpm 10.33.0.
- Deps paritárias com produção: `remark@15`, `remark-gfm@4`, `remark-frontmatter@5`,
  `remark-math@6` (mesmas versões de `package.json` raiz).

## Como reproduzir

```bash
cd spikes/spike-10c-guia-estudo
pnpm install
node run-guia.mjs     # precisa de chave OpenRouter (env ou ~/.zetel/config); consome tokens
node run-render.mjs   # offline, sem LLM
# abrir output/guia-estudo.html no browser
```

`run-guia.mjs` lê a chave e o modelo da **mesma fonte do app** (`readApiKey()` /
`lib/config.ts`): `OPENROUTER_API_KEY` no ambiente → `~/.zetel/config`. Modelo:
`GUIA_MODEL` (env) → `OPENROUTER_MODEL` (config). Sem credenciais hardcoded (R4).

## Arquivos

```
spike-10c-guia-estudo/
├── README.md            ← este arquivo
├── package.json         ← deps isoladas
├── input.md             ← doc técnico sintético (Transformada de Fourier)
├── lib-source-index.mjs ← catálogo de blocos com sha256 (base da rastreabilidade)
├── run-guia.mjs         ← Markdown → OpenRouter → JSON + validação
├── run-render.mjs       ← JSON → HTML (template determinístico, sem LLM)
└── output/
    ├── guia-estudo.json        ← guia estruturado (schema D26)
    ├── guia-estudo.source.json ← mapa guide_block_id → origem no Markdown (D27)
    ├── source-index.json       ← catálogo de blocos (auditoria da rastreabilidade)
    └── guia-estudo.html         ← guia renderizado
```

`input.md` (~2000 palavras) contém, deliberadamente, todos os recursos exigidos:
H1–H3 hierárquicos, equações inline (`$…$`) e em bloco (`$$…$$`), duas tabelas
GFM, listas (numerada e com marcadores), blockquotes e ≥3 seções distintas. Foi
preferido a um material real (o DFT do vault não tem tabelas nem equações em
bloco) para garantir cobertura total do checklist do spike.

---

## A estratégia de rastreabilidade (o achado central)

Rastreabilidade confiável **não** pode depender de a LLM inventar identificadores.
A solução adotada — e recomendada para o 10D:

1. **Pré-segmentar** o Markdown em blocos de topo com o **mesmo parser de
   produção** (`parseMarkdownForSegmentation`: `remark-gfm` → `remark-frontmatter`
   → `remark-math`, depois strip do YAML). Cada bloco recebe um `sha256` do seu
   texto plano (mesma técnica `sha256` de `lib/render-service.ts`) e a trilha de
   headings ativa (`heading_path`).
2. **Injetar esse catálogo no prompt** (`block_id`, `heading_path`, `sha256`,
   trecho truncado). A LLM é instruída a citar **apenas hashes do catálogo** em
   `source_block_hashes` — copiando-os, não gerando-os.
3. **Validar** após a resposta: cada hash citado tem de existir no catálogo.
   Hashes inexistentes são contados como **órfãos** (alucinação) e a cobertura é
   medida como `% de itens com ≥1 hash válido`.

Isso transforma rastreabilidade de "promessa do prompt" em **invariante
verificável** — exatamente o que D26/D27 exigem para o parceiro mapear
`guide_block_id` → origem no Markdown.

---

## Resultado da execução

| Métrica | Valor |
|---------|-------|
| Modelo usado | `anthropic/claude-3.5-haiku` (default na época do spike; hoje: `openai/gpt-4o-mini` em `lib/openrouter-constants.ts`) |
| Blocos no catálogo | 43 |
| Prompt (estimado) | ~25.771 chars / ~6.443 tokens |
| **Tokens reais (usage)** | prompt **9.670**, completion **4.042**, total **13.712** |
| Schema D26 | **OK ✅** (todos os campos presentes e não vazios) |
| **Rastreabilidade** | **18/18 itens com hash válido — 100% cobertura, 0 órfãos** |
| Itens gerados | 4 cards · 3 seções · 4 termos de glossário · 3 quiz · 3 Zettelkasten |
| HTML gerado | 13.677 bytes, sem nenhuma chamada de LLM |

### Qualidade da rastreabilidade

Verificação cruzada manual: o card **"Transformada Discreta de Fourier (DFT)"**
cita `heading_path = ["3. A Transformada Discreta e a FFT", "3.1 DFT"]` e os dois
hashes apontam para o heading `3.1 DFT` e o parágrafo que define a DFT no
`input.md`. As citações são **semanticamente corretas**, não apenas formalmente
válidas. Mesmo um modelo barato (haiku) copiou os hashes literalmente sem
alucinar nenhum.

### Qualidade editorial

Conteúdo fiel ao material, com forma didática: título/subtítulo editoriais,
resumo coeso, cards conceituais, quiz com resposta correta verificável (a
`resposta_correta` bate com uma das `opcoes`), glossário e perguntas
Zettelkasten abertas e conectivas. Nada inventado fora do documento.

---

## Limitações encontradas

- **`max_tokens`:** o guia completo consumiu ~4.000 tokens de completion. Para
  documentos maiores (o DFT real tem ~4.000 palavras → catálogo bem maior), o
  prompt cresce e a resposta pode encostar no teto. O 10D deve **dimensionar
  `max_tokens` por tamanho do material** e considerar truncar/paginar o catálogo.
- **Custo do catálogo no prompt:** o catálogo dominou o prompt (9.670 tokens de
  input). Para materiais grandes vale truncar o `text` dos blocos (já truncado a
  220 chars aqui) ou enviar só `block_id` + `heading_path` + `sha256` sem trecho.
- **Determinismo:** a etapa LLM **não** é determinística (≠ Documento Técnico).
  O catálogo de blocos e o render, sim. `temperature: 0.4` foi um meio-termo;
  para JSON estruturado, valores ainda mais baixos tendem a ser mais estáveis.
- **`response_format: json_object`** funcionou com o modelo testado; nem todo
  modelo do OpenRouter suporta — o 10D precisa de fallback (parser tolerante a
  cerca ```json já implementado aqui em `extractJson`).
- **Validação de quiz:** validamos presença de campos, mas não que
  `resposta_correta ∈ opcoes`. O 10D deveria endurecer isso no validador.
- **`source_headings` redundante com o catálogo:** poderia ser derivado
  server-side a partir dos `source_block_hashes` (mais confiável que pedir à
  LLM). Avaliar no 10D.

---

## Recomendação: **GO ✅ para o Módulo 10D**

O pipeline editorial é viável e a rastreabilidade exigida por D26/D27 é
**alcançável e verificável** — confirmada em 100% mesmo com modelo barato. A
arquitetura "catálogo de blocos com hash injetado no prompt + validação
pós-resposta" deve ser **portada para produção** como espinha dorsal da
rastreabilidade.

Ajustes a incorporar no 10D antes/durante a implementação:

1. **Reusar o parser/segmentação de produção** (`parseMarkdownForSegmentation`,
   `segmentFile`, `sha256` de `lib/ingestao-service.ts`) para construir o catálogo
   — não duplicar lógica; idealmente derivar os blocos de `zetel_pages.content_text`
   já persistido, mantendo paridade com o Documento Técnico.
2. **Gerar `guia-estudo.source.json` server-side** a partir dos hashes validados
   (como neste spike), descartando itens com 0 hashes válidos ou sinalizando-os.
3. **Template determinístico em produção** espelhando `lib/render-service.ts`
   (CSS inline autocontido, sem CDN, `<iframe sandbox>`), sem injeção de CSS pelo
   app (Regra #2). O `run-render.mjs` aqui é o protótipo desse template.
4. **Dimensionar `max_tokens`/temperatura** e validar `response_format` por modelo
   (ver Módulo 10E — `study_guide_model`), com fallback de parsing.
5. **Endurecer o validador**: `resposta_correta ∈ opcoes`, faixas de contagem por
   coleção, e rejeição de itens sem rastreabilidade válida.

Nenhum arquivo de produção foi tocado por este spike (R1). `pnpm build` na raiz
continua limpo.
