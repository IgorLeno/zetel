# Perfis adaptativos de execução

O perfil controla contexto, testes, revisão e tempo. A classificação e sua
justificativa ficam no arquivo da tarefa:

```yaml
execution_profile: FAST | STANDARD | FULL
profile_justification: <riscos e alcance observados>
profile_approved_by: <identidade humana, quando houver downgrade>
```

## Classificação determinística

1. A classificação inicial começa pelo menor perfil compatível com a mudança
   real.
2. O agente pode elevar o perfil autonomamente quando surgir qualquer fator de
   risco.
3. Depois que um perfil foi registrado ou elevado, qualquer redução é um
   downgrade.
4. Downgrade exige justificativa registrada, aprovação humana explícita e
   identidade registrada em `profile_approved_by`.
5. O mesmo agente não pode reverter autonomamente sua própria elevação.
6. Alterar a implementação, o schema, as guardas ou os contratos da state
   machine, da escrita atômica, da segurança ou do banco é sempre FULL.
7. O uso normal do lifecycle de uma tarefa não eleva automaticamente a tarefa
   para FULL; isso inclui usar `assertTransition`, `validateState`,
   `writeJsonAtomic` e `expectedRevision` para registrar seu estado.
8. Uma alteração documental que apenas registra transições autorizadas pode
   permanecer FAST ou STANDARD conforme o risco real.
9. Quantidade de arquivos, isoladamente, não decide o perfil.
10. Registre perfil e justificativa antes da implementação; reclassifique se o
    escopo ou o risco mudar.

## FAST

### Aplicável a

Documentação, comentários, JSDoc, mensagens, metadados, pequenos ajustes de
configuração e correções localizadas sem mudança de comportamento. Não pode
envolver persistência, segurança, concorrência ou API pública.

### Processo

- Mini-spec curta ou tarefa já aprovada; somente arquivos relacionados.
- Teste focado ou verificação estática aplicável; `git diff --check`.
- Nenhuma suíte ampla ou review externo obrigatório por padrão.
- Nenhuma espera por bots externos; objetivo de até 15 minutos.
- Follow-up documental não cria automaticamente outra tarefa.
- Não criar subagentes para tarefas FAST.

## STANDARD

### Aplicável a

Comportamento localizado, poucos módulos, bug de risco moderado, CLI ou
componente isolado, sem migration, autenticação, concorrência ou mudança
arquitetural.

### Processo

- Testes focados durante a implementação e integrações diretamente relacionadas.
- Typecheck quando houver TypeScript criado ou alterado.
- `pnpm test:ci` somente quando código compartilhado puder ser afetado.
- `git diff --check`; no máximo uma revisão independente e uma rodada.
- Não repetir gates amplos após mudança puramente documental.
- Objetivo de até 35 minutos; no máximo um subagente ou revisor.

## FULL

### Aplicável a

State machine, persistência, escrita atômica, concorrência, segurança,
autenticação, migrations, contratos públicos amplos, mudanças arquiteturais ou
cross-cutting e risco material de perda/corrupção de dados.

### Processo

- Testes focados, `pnpm build`, `pnpm test:ci`, `pnpm test:coverage`,
  `pnpm typecheck` e `git diff --check`.
- Até duas revisões independentes quando conformidade e qualidade forem eixos
  materialmente úteis; achado bloqueante impede fechamento.
- Handoff completo.
- Checkpoint obrigatório quando a execução ultrapassar 45 minutos.

## Tempo e contexto

- Não reler arquivos sem necessidade; não carregar transcripts, tarefas
  concluídas, todos os reviews ou todos os PRDs.
- Contexto inicial preferencial de até 8 arquivos.
- Registrar decisões e evidências, não raciocínio completo.
- Rodar testes focados durante o ciclo; gates amplos no máximo uma vez no fixed
  point.
- Após correção material, repetir testes impactados e somente gates aplicáveis.
- Não usar review externo para ortografia ou documentação trivial.
- Em FAST, objetivo de 15 minutos. Em STANDARD, objetivo de 35 minutos. Em FULL,
  registrar checkpoint ao ultrapassar 45 minutos.

## Serviços externos

CodeRabbit, Vercel e GitHub Actions são assíncronos:

1. Faça push quando autorizado e registre que checks foram iniciados.
2. Não mantenha a sessão ativa esperando um bot responder.
3. Uma consulta opcional pode ocorrer uma vez, por no máximo 2 minutos.
4. Depois do limite, registre checks como `pending` e encerre.
5. Findings posteriores só abrem nova sessão quando bloqueantes ou materialmente
   relevantes.

Espera síncrona ou polling indefinido por serviços externos é proibido.
