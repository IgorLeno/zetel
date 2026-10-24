# Plano: Redesign visual aconchegante com parceiro vivo

## Arquitetura
1. Tokens e shell: `app/globals.css` (tokens novos + aliases de compatibilidade),
   fontes em `app/layout.tsx`, `Sidebar` vira trilho de ícones.
2. Identidade do parceiro: coluna `color` aditiva em perfis do usuário; mapa
   fixo de cor/descrição para built-ins em `lib/tutor-profiles.ts`; componente
   `PartnerOrb`; `TutorProfilePanel` vira galeria de parceiros + editor.
3. Estudo: `LeituraPanel`/`StudyShell`/`ChatPanel` reorganizados — conversa ao
   centro, material lateral recolhível, gaveta com arquivos/notas/artefatos.
4. Início (`ZetelList`), Memória e Configurações restilizados.

## Verificacao
Por fase: vitest focado + typecheck + smoke no navegador. No fixed point:
test:ci, build, test:coverage, `git diff --check`.
