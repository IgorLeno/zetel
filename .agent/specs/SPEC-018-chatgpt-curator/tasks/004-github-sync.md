---
id: "004"
title: "Canal GitHub: sincronizar clone local por fast-forward"
status: DONE
blocked_by: ["003"]
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: FULL
profile_justification: "Executa processo externo (git) com rede sobre clone do usuario; superficie de seguranca (credenciais, hooks, saida do git) e rota nova."
validation: PASS
validated_at: "2026-10-22T19:27:41.261Z"
---

## Objetivo
"Buscar do canal" atualiza o clone local do repositório do canal sem merge,
sem credencial no Zetel.

## Perfil planejado
`FULL`, uma revisão `security`. Executa processo externo com rede.

## Criterios de aceitacao
- `syncChannel()` roda `git fetch` e `git merge --ff-only` via `execFile`,
  args fixos, `GIT_TERMINAL_PROMPT=0`, timeout 30 s, `cwd = channel_dir`.
- `channel_dir` sem `.git` → `not_a_repo`; divergência → `diverged`, clone
  intocado; falha de rede/auth → `error` genérico.
- Saída do git, URL do remoto e caminhos nunca logados nem devolvidos.
- Sem credencial em SQLite, vault ou `~/.zetel/config`.

## Testes
Integração com repositório bare local criado no teste: ff ok, sem novidades,
divergente, diretório sem git. Sem rede.

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:coverage`,
`pnpm build`, `git diff --check`.

## Escopo
`lib/channel-git.ts` (`syncChannel`), `app/api/channel/sync/route.ts`, botão,
testes.

## Riscos
Hooks locais do clone rodam em merge → o clone é do Igor; documentar e
passar `-c core.hooksPath=` vazio para não executar hooks.
