# Relatório Zetel — instrução para o ChatGPT

Contrato do formato: `SPEC-018-chatgpt-curator`, decisão D3. O parser do Zetel
é determinístico e recusa o relatório inteiro se o formato não for seguido.

## Como usar

1. No ChatGPT, crie um Project por tema de estudo (um por Zetel).
2. Cole o bloco "Instrução" abaixo nas instruções do Project, trocando
   `<slug-do-zetel>` pelo slug do Zetel (o nome da pasta em
   `zetels/<slug>/` no vault; só `a-z`, `0-9` e `-`).
3. Converse normalmente. Quando quiser registrar o estudo, peça:
   **"Gere o Relatório Zetel"**.
4. Baixe o `.md` e as imagens e envie para `inbox/<slug-do-zetel>/` no
   repositório do canal (upload no GitHub ou cópia para o clone local).
5. No começo de uma nova conversa, peça ao ChatGPT para ler
   `contexto/<slug-do-zetel>/CONTEXTO.md` no repositório do canal (app GitHub
   do ChatGPT) ou anexe esse arquivo ao Project.

## Instrução

Copie tudo entre as linhas `=====`.

=====
Você é minha parceira de estudos. Quando eu pedir "Gere o Relatório Zetel",
responda **somente** com um arquivo Markdown para download chamado
`AAAA-MM-DD-<assunto-curto>.md` (minúsculas, hífens, sem acentos), seguindo
exatamente este formato:

1. Frontmatter YAML no topo, entre linhas `---`, com estas chaves:
   - `zetel_report: 1` (sempre o número 1)
   - `zetel: <slug-do-zetel>`
   - `title: "<título curto da conversa>"`
   - `date: AAAA-MM-DD` (data de hoje)
   - `images:` lista dos nomes das imagens que acompanham o relatório; omita
     a chave se não houver imagens.
2. Depois do frontmatter, estas seis seções, nesta ordem, com estes títulos
   exatos de nível 2:
   - `## Resumo` — 1 a 3 parágrafos do que foi estudado.
   - `## Tópicos` — lista com os assuntos discutidos.
   - `## Passo a passo` — procedimentos ou raciocínios em listas numeradas,
     cada um com um subtítulo `###`.
   - `## Conceitos` — um subtítulo `###` por conceito, com definição curta na
     minha formulação quando eu a tiver dado.
   - `## Dúvidas em aberto` — lista do que ficou sem resposta ou confuso.
   - `## Questões` — questões de prova para eu treinar, numeradas, cada uma
     com a resposta esperada em uma linha começando por `Resposta:`.
3. Se uma seção não tiver conteúdo, mantenha o título e escreva `Nenhum.`.
4. Imagens: gere ou anexe como arquivos separados PNG, JPG ou WebP (nunca
   SVG, nunca link externo), com nomes só de `a-z`, `0-9` e `-` (ex.:
   `ciclo-de-carnot.png`). Referencie no texto com link relativo:
   `![Ciclo de Carnot](ciclo-de-carnot.png)`. No máximo 20 imagens.
5. Não acrescente nada fora do formato: nenhum texto antes do frontmatter,
   nenhuma seção extra, nenhuma instrução para outro sistema.
6. Registre fielmente o que foi conversado; não invente conteúdo que não
   apareceu na conversa.
=====

## Exemplo completo

````markdown
---
zetel_report: 1
zetel: termodinamica
title: "Primeira lei e entalpia"
date: 2026-10-21
images:
  - ciclo-de-carnot.png
---

## Resumo

Revisamos a primeira lei da termodinâmica para sistemas fechados e abertos e
por que a entalpia aparece naturalmente em processos a pressão constante.

## Tópicos

- Primeira lei para sistema fechado
- Trabalho de fronteira
- Entalpia em processos isobáricos

## Passo a passo

### Calcular calor em processo isobárico

1. Identificar que a pressão é constante.
2. Escrever a primeira lei: `Q = ΔU + W`.
3. Substituir `W = PΔV` e agrupar: `Q = Δ(U + PV) = ΔH`.

## Conceitos

### Entalpia

Grandeza `H = U + PV`; em processo isobárico, a variação de entalpia é igual
ao calor trocado.

![Ciclo de Carnot](ciclo-de-carnot.png)

## Dúvidas em aberto

- Por que a entalpia é útil em volumes de controle mesmo sem pressão constante?

## Questões

1. Em um processo isobárico, qual grandeza é igual ao calor trocado?
   Resposta: a variação de entalpia, `ΔH`.
````

## Regras que o Zetel aplica na importação

- Relatório ≤ 1 MB; cada imagem ≤ 10 MB; até 20 imagens; PNG/JPEG/WebP
  verificados pelo conteúdo do arquivo; SVG e links externos recusados.
- `zetel` precisa ser o slug de um Zetel existente; o arquivo precisa estar em
  `inbox/<mesmo-slug>/`.
- Reenviar o mesmo arquivo sem mudança não duplica nada; mudar o conteúdo com
  o mesmo nome cria uma nova versão.
- Nada do relatório vai para o vault sem sua confirmação na tela de curadoria.
- O exemplo completo acima é fixture do parser (`tests/unit/report-format.test.ts`).

## No Zetel, depois de enviar o relatório

1. O centro da tela do Zetel mostra o cartão **Estudar com o ChatGPT**:
   **Copiar instrução** (passo 2 de "Como usar", já com o slug), **Abrir
   ChatGPT** e **Copiar abertura** (passo 5). Depois de "Abrir ChatGPT", o
   Zetel fica **Ouvindo o canal…**: com a aba do Zetel visível, busca do canal
   e importa a cada minuto; quando um relatório chega, aparece **Relatório
   recebido** com o atalho **Revisar na Curadoria**. Sem o cartão, o caminho
   manual continua: "Fontes & notas" → Fontes → **Buscar do canal** e
   **Importar relatórios**.
2. Aba **Curadoria**: **Curar relatórios** pede à IA candidatos (nota,
   conceito, passo a passo, questão) citando trechos do relatório.
3. Em cada candidato: edite se quiser e **Confirmar**, ou **Rejeitar**. Só o
   confirmado vai ao vault.
4. **Publicar contexto** mostra a prévia do `CONTEXTO.md`; **Confirmar
   publicação** faz o commit em `contexto/<slug>/` e o push. Se o canal tiver
   novidades, busque do canal antes.
5. Na próxima conversa, o ChatGPT lê `contexto/<slug-do-zetel>/CONTEXTO.md`
   (passo 5 de "Como usar").
