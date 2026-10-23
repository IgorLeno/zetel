---
id: "007"
title: "Contexto de volta: CONTEXTO.md e publicacao explicita"
status: DONE
blocked_by: ["004", "006"]
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: FULL
profile_justification: "Envia conteudo do usuario a servico externo (push git) e escreve no clone do canal; superficie de seguranca e vazamento de dado privado."
validation: PASS
validated_at: "2026-10-23T04:13:13.775Z"
---

## Objetivo
O Zetel publica um `CONTEXTO.md` por Zetel que o ChatGPT lê na próxima
conversa.

## Perfil planejado
`FULL`, uma revisão `security`. Envia conteúdo do usuário a serviço externo.

## Criterios de aceitacao
- Render determinístico (sem LLM) só com conteúdo confirmado, ≤ 200 KB;
  mesma entrada → mesmo arquivo.
- Escreve `contexto/<slug>/CONTEXTO.md` no clone; commit local restrito a
  `contexto/`.
- "Publicar contexto" mostra prévia; push só após confirmação; falha → erro
  genérico, nada logado além de status.
- Memória global e notas não confirmadas nunca saem.

## Testes
Snapshot do render; integração com bare local (commit só em `contexto/`,
push ok, push rejeitado).

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:coverage`,
`pnpm build`, `git diff --check`.

## Escopo
`lib/context-export.ts`, `publishContext` em `lib/channel-git.ts`,
`app/api/zetels/[id]/context/publish/route.ts`, UI, testes.

## Riscos
Vazamento de dado privado → allowlist de origens no render e teste que
garante ausência de memória global.
