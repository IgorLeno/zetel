# Plano — Ajustes finais de consistência no PRD v2 antes do Módulo 0

## Contexto

O PRD v2 está em `/home/ifernandes/Projetos/zetel/piped-pondering-dahl2.md` e foi aprovado como base de execução. Antes de iniciar o Módulo 0 (spikes + mock visual), restam cinco ajustes finais de consistência apontados pelo dono do projeto. São edições textuais cirúrgicas no PRD — nenhuma muda a essência das decisões já tomadas; todas alinham trechos que ficaram desatualizados em relação à versão mais forte do mesmo conceito em outro ponto do documento.

Objetivo: deixar o PRD internamente coerente para que o Módulo 0 comece a partir de uma fonte única de verdade, sem fricções entre seções que dizem coisas levemente diferentes sobre o mesmo tema.

## Arquivo a modificar

Único arquivo afetado:

- `/home/ifernandes/Projetos/zetel/piped-pondering-dahl2.md`

Nenhum código é tocado nesta etapa.

## Edições

### 1. Alinhar D8 com o contrato final do chat

**Onde:** linha 844, célula da decisão D8 na tabela da Parte C.

**Estado atual (resumido):** "Cliente envia identificador e conteúdo da página atual a cada turno do chat. Servidor não mantém estado de página."

**Problema:** a §8.7 e o Módulo 6 já dizem que o servidor valida `page_id` contra `zetel_pages` e usa `content_text` armazenado como fonte autoritativa, mas o D8 ainda sugere que o cliente é a fonte do conteúdo.

**Nova redação (D8, coluna "Resolução"):**

> Cliente envia `page_id` (ou anchor canônico) a cada turno do chat. Pode enviar `content_text` apenas como otimização. **Servidor valida `page_id` contra `zetel_pages` e usa `zetel_pages.content_text` como fonte autoritativa do conteúdo injetado no prompt.** Divergência de `content_hash` é registrada em `chat_messages.meta.page_hash_match = false` e o conteúdo do cliente é descartado. Servidor não mantém estado de "página corrente" entre turnos.

---

### 2. Alinhar a redação sobre HTML autocontido e CSS inline

**Problema:** ainda existem três resquícios de "CSS injetado pelo app", o que conflita com a meta de gerar HTML autocontido com CSS inline já no `leitura.html` (linha 584 já diz isso corretamente).

**Locais a corrigir:**

- **Linha 150 (§8.5 Leitura):**
  - De: "A aba Leitura abre o HTML em `<iframe sandbox>` com CSS injetado pelo app para integração visual."
  - Para: "A aba Leitura abre o `artefatos/leitura.html` em `<iframe sandbox>`. O HTML é **autocontido**: já sai do pipeline com CSS inline e referências de imagem resolvidas. O app não injeta CSS no iframe — apenas renderiza."

- **Linha 403 (§16, Requisitos não funcionais):**
  - De: "Renderização do HTML gerado dentro de `<iframe sandbox>` com CSS injetado."
  - Para: "Renderização do HTML gerado dentro de `<iframe sandbox>`. O HTML é autocontido (CSS inline); o app não injeta estilos no iframe."

- **Linha 430 (§17, Isolamento da leitura):**
  - De: "Isolamento da leitura: `<iframe sandbox=\"allow-same-origin\">` apenas o suficiente para CSS aplicar."
  - Para: "Isolamento da leitura: `<iframe sandbox>` sem flags adicionais por padrão. `allow-same-origin` só é adicionado **se o Spike B do Módulo 0 justificar** (por exemplo, para mini-índice via âncoras dentro do iframe). A decisão final fica registrada como saída do spike."

- **Linha 849 (D13, tabela Parte C):**
  - De: "`<iframe sandbox=\"allow-same-origin\">` com CSS injetado pelo app + `rehype-sanitize` no caminho do HTML."
  - Para: "HTML autocontido (CSS inline) gerado por `rehype` + `rehype-sanitize` com allowlist explícita. Renderização em `<iframe sandbox>`; `allow-same-origin` só se o Spike B justificar."

- **Linha 585 (Módulo 4):** trocar `<iframe sandbox="allow-same-origin">` por `<iframe sandbox>` com nota "(flags revisitadas após Spike B)".

---

### 3. Corrigir a terminologia de better-sqlite3

**Onde:** linha 426 (§17 Arquitetura técnica).

- De: "SQLite: `better-sqlite3` com pool único."
- Para: "SQLite: `better-sqlite3` em **instância única (conexão singleton)** por processo — a biblioteca é síncrona e não usa pool de conexões."

---

### 4. Tornar a unicidade de `anchor` precisa no esquema

**Onde:** linha 253 (tabela §13.1) e parágrafo na linha 260.

**Linha 253 — substituir a célula `zetel_pages`:**

- De: "`id INT PK`, `zetel_id FK`, `page_index INT`, `heading TEXT`, `anchor TEXT UNIQUE` (escopo do Zetel), `content_text TEXT`, `content_hash TEXT`, `created_at`"
- Para: "`id INT PK`, `zetel_id FK`, `page_index INT`, `heading TEXT`, `anchor TEXT`, `content_text TEXT`, `content_hash TEXT`, `created_at` — com **`UNIQUE (zetel_id, anchor)`** declarado como constraint composta."

**Linha 260 — ajuste menor de redação para deixar o escopo explícito:**

- De: "`anchor` em `zetel_pages` é único por Zetel..."
- Para: "`anchor` em `zetel_pages` é único **dentro de cada Zetel** (constraint composta `UNIQUE (zetel_id, anchor)`) e é o que o cliente envia no chat — derivado dos headings do Markdown via slugify estável."

---

### 5. Suavizar a promessa de abertura externa de notas e memórias

**Problema:** o PRD promete "Abrir no editor externo" e "via link `file://`" como se sempre funcionasse. Na prática depende de o Obsidian estar instalado, da URI `obsidian://` estar registrada, e do SO. Melhor declarar uma cascata de fallbacks.

**Locais a corrigir:**

- **Linha 685 (Módulo 7, lista de itens):**
  - De: "Abas \"Notas rápidas\" e \"Notas de literatura\" listam arquivos do vault, com link \"Abrir no editor externo\"."
  - Para: "Abas \"Notas rápidas\" e \"Notas de literatura\" listam arquivos do vault. Para cada nota, o app oferece **abertura externa em cascata**: (1) tentar `obsidian://open?vault=...&file=...` se a URI estiver disponível; (2) fallback primário: **copiar o caminho absoluto** para o clipboard com toast; (3) fallback secundário: **abrir a pasta que contém o arquivo** via shell do SO."

- **Linha 712 (Módulo 8):**
  - De: "Aba \"Memória\" no menu principal listando os arquivos com preview e botão \"Abrir no editor externo\"."
  - Para: "Aba \"Memória\" no menu principal listando os arquivos com preview e botão de abertura externa seguindo a **mesma cascata definida no Módulo 7** (Obsidian URI → copiar caminho → abrir pasta)."

- **Linha 850 (D14, tabela Parte C):**
  - De: "Apenas externo (Obsidian) no MVP. App lista e abre via link `file://` quando possível; sem editor embutido."
  - Para: "Apenas externo no MVP; sem editor embutido. App tenta abrir no Obsidian via URI `obsidian://` quando disponível, com fallbacks: copiar caminho absoluto para o clipboard e, em último caso, abrir a pasta que contém o arquivo no shell do SO."

---

## Notas adicionais

- O changelog v1→v2 (linhas 22–44) **não precisa de novas entradas** — esses ajustes não criam decisões novas, apenas reescrevem trechos para refletir decisões que já estavam no documento de forma mais fraca.
- Nenhuma migração de dados, nenhuma quebra de contrato: as edições apenas alinham linguagem.
- Após as edições, o gate de início do Módulo 0 (mock visual aprovado + spikes A/B/C/D rodando) permanece exatamente o mesmo.

## Verificação

Após aplicar as edições, validar manualmente:

1. **Coerência interna** — grep no arquivo por termos que devem ter sumido ou aparecido:
   - `grep -n "CSS injetado" piped-pondering-dahl2.md` → não deve retornar resultados.
   - `grep -n "pool único" piped-pondering-dahl2.md` → não deve retornar resultados.
   - `grep -n "anchor TEXT UNIQUE" piped-pondering-dahl2.md` → não deve retornar resultados.
   - `grep -n "UNIQUE (zetel_id, anchor)" piped-pondering-dahl2.md` → deve aparecer ao menos uma vez.
   - `grep -n "obsidian://" piped-pondering-dahl2.md` → deve aparecer ao menos uma vez.
   - `grep -n "autocontido" piped-pondering-dahl2.md` → deve aparecer em §8.5, §16, D13 e Módulo 4.

2. **Leitura linear** das seções tocadas (§8.5, §8.7, §13.1, §16, §17, Módulo 4, Módulo 7, Módulo 8, D8, D13, D14) para confirmar fluência e ausência de contradições.

3. **Sanity check no D8** — confirmar que ele agora diz a mesma coisa que §8.7 e o Módulo 6.

4. **Sem mudanças laterais** — nenhuma outra seção do PRD deve ter sido alterada. Comparar mentalmente a tabela de §13.1 e o roadmap (Parte B) — devem permanecer intactos exceto pelos pontos listados acima.

Se a verificação passar, o PRD fica oficialmente em estado "aprovado para iniciar Módulo 0".
