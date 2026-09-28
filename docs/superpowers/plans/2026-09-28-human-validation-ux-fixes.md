# Correções da primeira validação humana — 2026-09-28

Perfil: STANDARD. São correções de comportamento em componentes de UI e leitura
do estado de fontes já persistido, sem mudança de schema, serviço ou API.
Autorização: pedido do proprietário para trabalhar diretamente em `main`.

- [x] Fechar Mais áreas em clique externo, Escape e mudanças de navegação; manter todos os links.
- [x] Corrigir área clicável e sincronização visual do toggle; simplificar a marca.
- [x] Corrigir seleção do menu de Zetels, dialogs e atualização após PATCH/DELETE.
- [x] Usar a presença de fontes no servidor para abrir onboarding; reutilizar upload existente.
- [x] Redirecionar a criação pelo slug retornado do POST.
- [x] Testar os fluxos estruturalmente, executar testes focados, `pnpm typecheck` e `git diff --check`.
- [x] Revisar diff e registrar o resultado antes do commit.

Próxima feature aprovada: **Web source discovery/import** (busca e importação de
fontes da internet). Backend e fornecedor ficam para outra execução; nenhuma
ação de busca é apresentada como funcional agora.

Resultado: 4 testes focados passaram; `pnpm typecheck` e `git diff --check`
passaram. O contrato antigo `module-14-2-contract.test.ts` falhou por exigir
`chat-avatar` em `ChatPanel`; a ausência já existe em `HEAD`, e esse componente
está fora do escopo desta correção. Nenhuma validação visual automatizada foi
executada. Validação humana visual permanece com o proprietário.
