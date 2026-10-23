---
task_id: "007"
delivery_commit: 366c15e
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-23T04:20:00.000Z
---

# Handoff 007 — CONTEXTO.md e publicação explícita

## Tarefa

- ID: 007
- Perfil: FULL, reviews_requested: 1 (engineering-quality com foco em
  segurança).
- Lifecycle como na 005/006, sob o pedido do Igor (2026-10-22).

## Entregue

- `lib/context-export.ts`: `collectContext` (allowlist), `renderContext`
  (determinístico, ≤ 200 KB, omissões contadas), `toContextItem`,
  `writeContextFile` (temporário + rename, recusa symlink em qualquer nível).
- `lib/channel-git.ts`: `exclusive` (serializa sync e publicação) e
  `publishContext` (fetch → `behind` sem escrever → grava → commit só do
  arquivo → push se todo commit local for `contexto/<slug>/CONTEXTO.md`).
- `app/api/zetels/[id]/context/publish/route.ts`: prévia com hash (não toca
  o clone); confirmação com hash, 409 se mudou.
- `components/CuradoriaPanel.tsx`: "Publicar contexto" → prévia →
  "Confirmar publicação".

## Desvio de desenho registrado

- O commit local acontece na confirmação, e não na prévia: um commit local
  não publicado tornaria o clone divergente e o "Buscar do canal" (só
  fast-forward) passaria a falhar. Continua "commit local automático
  restrito a `contexto/`; push só pelo botão, com prévia" (D10).

## Gates

- FULL: PASS (`evidence/007-validation.json`). Review r1 PASS com F001–F004
  (prévia sujava o clone, ordenação por locale, guarda `unsafe` larga demais,
  relatórios omitidos sem contagem), corrigidos; r2 PASS
  (`reviews/007-aggregate.json`).

## Pendências não bloqueantes

- NITs r2: falha do git entre gravar e commitar deixa o arquivo modificado
  no clone (F005; a próxima publicação reconcilia); docstring do teto não
  descreve que itens menores seguintes ainda entram (F006).
- Push rejeitado depois do commit deixa o commit local; o Igor resolve com o
  git (nenhum reset automático, por regra).
- Não testado contra o GitHub real (SSH do Igor); fica para a 008/validação
  humana.

## Próximo

- 008: E2E não-live do ciclo e validação humana com o ChatGPT.
