# PRD v5 — Conversational Learning V1

## Status

`APPROVED PRODUCT DIRECTION`

## Título

**PRD v5 — Conversational Learning V1**

## Objetivo

Transformar o Zetel de um parceiro de estudos centrado em documentos, chat e artefatos em uma **experiência de aprendizagem conversacional voice-first**, mantendo o material de estudo visível, o contexto rastreável e o conhecimento construído persistente.

A V1 deve provar que estudar conversando com o Zetel é uma experiência suficientemente natural e útil para substituir o fluxo:

```text
ler documento
+
abrir chatbot separado
+
criar notas manualmente
```

por:

```text
abrir material no Zetel
→ conversar
→ compreender
→ salvar conceitos relevantes
→ continuar depois
```

---

# 1. Relação com versões anteriores

O PRD v5 altera a direção de produto anteriormente registrada como:

> prompts editáveis em runtime + modo internet.

Essa direção deixa de ser o próximo objetivo principal.

Prompts editáveis, pesquisa web, múltiplos providers e modelos locais permanecem candidatos a versões posteriores.

O PRD v4 e as implementações posteriores de voz continuam válidos como histórico e baseline técnico, exceto quando este PRD introduzir requisito incompatível.

---

# 2. Pré-condições existentes

A implementação deve preservar as invariantes atuais do projeto quando não forem explicitamente alteradas neste PRD.

Entre elas:

- servidor é autoridade sobre conteúdo processado;
- cliente não envia conteúdo de página como fonte confiável;
- HTML derivado continua sanitizado e determinístico;
- Study Guide não permite LLM gerar HTML diretamente;
- logs não registram conteúdo do usuário;
- segredos permanecem fora do vault, SQLite e Git;
- SQLite continua usando `better-sqlite3` síncrono e singleton;
- sugestões permanentes continuam exigindo confirmação humana;
- testes padrão não fazem chamadas reais a provedores externos.

Mudanças de banco, persistência, arquitetura ou segurança usam perfil **FULL** segundo `.agent/EXECUTION_PROFILES.md`.

---

# 3. Escopo da V1

A V1 inclui:

1. criar/usar um Zetel com PDF como material de estudo;
2. visualizar o PDF/material e conversar ao lado;
3. contexto automático da página e seleção atuais;
4. recuperação contextual do restante do Zetel;
5. mudança de foco por linguagem natural;
6. voz como experiência principal;
7. texto como alternativa equivalente;
8. início da conversa pelo usuário ou pela parceira;
9. interrupção explícita da fala da parceira;
10. perfis predefinidos de tutor;
11. personalização de perfil;
12. sugestões visuais de conceitos;
13. salvamento confirmado de conceitos com origem;
14. prevenção básica de duplicação de conceitos;
15. histórico e continuidade de sessões;
16. abertura de nova sessão;
17. nomenclatura de sessões.

---

# 4. Fora de escopo da V1

Não implementar como requisito desta entrega:

- grafo visual completo;
- XP;
- streak;
- níveis;
- achievements;
- FSRS;
- repetição espaçada completa;
- modelo sofisticado de mastery;
- dashboard de domínio;
- simuladores interativos;
- geração avançada de multimídia;
- pesquisa web automática;
- importação automática de resultados da web;
- prova estruturada completa;
- planejamento automático de estudos;
- barge-in acústico automático;
- sistema completo de avaliação do aluno;
- Visão Integrada multi-documento completa;
- marketplace ou compartilhamento de perfis;
- suporte multiusuário.

Esses itens podem aparecer no roadmap, mas não podem expandir a implementação da V1.

---

# 5. Fonte de verdade de materiais

A V1 introduz PDF como fonte de estudo de primeira classe.

Para PDF:

- o arquivo original deve permanecer preservado;
- o PDF original é a fonte autoritativa;
- texto extraído, páginas, índices e chunks são representações derivadas;
- contexto enviado ao modelo deve ser reconstruído no servidor;
- texto proveniente do cliente nunca substitui a fonte server-side;
- referências precisam preservar, no mínimo, documento e página.

O modelo lógico existente de `zetel_pages.content_text` pode ser estendido ou reaproveitado.

A solução técnica exata deve ser definida após auditoria da implementação atual.

---

# 6. Experiência principal

## R1 — Abrir material

Ao abrir um PDF, a interface apresenta:

```text
┌─────────────────────────────┬──────────────────────────────┐
│                             │                              │
│            PDF              │          PARCEIRA            │
│                             │                              │
│ página atual                │ conversa                    │
│ seleção                     │ cards / referências         │
│                             │                              │
└─────────────────────────────┴──────────────────────────────┘
```

O material deve permanecer utilizável durante toda a conversa.

---

# 7. Contexto e foco

## R2 — Contexto local automático

O sistema conhece server-side:

- Zetel atual;
- documento atual;
- página atual;
- seleção atual, quando houver;
- sessão atual.

A página aberta é o foco inicial.

## R3 — Acesso ao Zetel

O usuário deve perceber que a parceira pode utilizar todo o conhecimento existente naquele Zetel.

Isso não exige inserir todos os documentos na janela de contexto.

A implementação pode selecionar contexto por recuperação.

Ordem conceitual:

```text
foco atual
↓
estrutura próxima
↓
trechos relevantes do Zetel
↓
conceitos/memória relevantes
```

## R4 — Mudança de foco por linguagem natural

Não criar como requisito um slider permanente de página/seção/capítulo/documento.

Mensagens como:

> “Vamos falar só dessa página.”

> “Olha o capítulo inteiro.”

> “Relaciona isso com a primeira parte.”

devem influenciar o foco subsequente.

O agente de implementação deve projetar uma representação interna simples e testável desse foco.

---

# 8. Seleções e referências

## R5 — Seleção

Quando o usuário selecionar conteúdo no material, deve existir ação equivalente a:

**Conversar sobre isto**

A seleção recebe prioridade contextual.

## R6 — Referências

Quando a parceira usar material específico, a interface deve conseguir indicar sua origem.

Exemplo:

```text
Smith · p. 43
```

Ao mencionar outra página, a UI poderá oferecer:

```text
[Ir até a página]
```

A opção “abrir ao lado” pode ser planejada, mas não é bloqueante para V1.

---

# 9. Início da conversa

## R7 — Usuário inicia

Abrir o microfone ou enviar texto inicia a interação.

## R8 — Parceira inicia

Deve existir uma ação clara de UI equivalente a:

**Ativar professora**

Ao ser ativada, a parceira inicia a conversa levando em conta o foco atual.

Pode:

- contextualizar;
- explicar;
- perguntar;
- sondar conhecimento prévio.

A UI pode oferecer starters:

```text
[Contextualize]
[Explique]
[Me faça uma pergunta]
[Vamos conversar]
```

---

# 10. Voz

## R9 — Voice-first

A conversa deve funcionar por voz sem exigir o ciclo manual:

```text
gravar
→ parar
→ confirmar
→ enviar
```

sempre que a tecnologia escolhida permitir fluxo hands-free confiável.

O texto permanece disponível.

## R10 — Registro textual

Toda fala do usuário utilizada na conversa deve produzir representação textual persistível.

A resposta da parceira também deve possuir representação textual.

Áudio não é o registro canônico.

## R11 — Interrupção

Durante TTS/reprodução da parceira deve existir:

```text
[■ Parar]
```

A ação deve:

1. interromper áudio imediatamente;
2. cancelar chunks futuros daquela reprodução;
3. preservar texto já recebido;
4. liberar imediatamente nova entrada.

Barge-in por detecção de fala fica fora da V1.

## R12 — Provedor de voz

O PRD não fixa previamente um provedor novo.

Antes de substituir a solução atual, realizar avaliação focada considerando:

- naturalidade PT-BR;
- latência percebida;
- facilidade de streaming;
- capacidade de cancelamento;
- STT;
- custo estimado;
- complexidade operacional;
- estabilidade da API;
- possibilidade de fallback.

A solução existente serve como baseline.

Chamadas live/billable para benchmark exigem autorização humana explícita.

A arquitetura não deve tornar o restante do produto dependente de um provedor específico sem necessidade.

---

# 11. Perfis do tutor

## R13 — Perfis predefinidos

A aplicação deve possuir um conjunto pequeno de perfis iniciais.

Baseline sugerida:

- Conversa Livre
- Professor Socrático
- Explicador
- Resolver Comigo
- Revisão Rápida
- Professor Profundo

Os nomes podem ser refinados durante UX, preservando as funções.

## R14 — Eixos pedagógicos

Cada perfil deve possuir:

```text
proactivity
questioning
directiveness
depth
pace
analogies
```

Normalizar os valores internamente em uma escala única.

A escala exata é decisão de implementação.

## R15 — Tom

Perfis podem também incluir configuração de tom, como:

- informalidade;
- humor;
- concisão.

Evitar criar um sistema excessivamente granular na V1.

## R16 — Visualização

O perfil deve ser visualmente compreensível.

Usar:

- valores/barras;
- gráfico radar como representação complementar.

O radar não precisa ser o editor primário.

## R17 — Personalização

O usuário deve poder:

1. utilizar um perfil;
2. alterar apenas a sessão atual;
3. criar um novo perfil baseado no atual;
4. editar um perfil personalizado.

Perfis built-in não devem ser destruídos ao serem personalizados.

---

# 12. Prompt pedagógico

## R18 — Perfil influencia comportamento

O perfil deve alterar comportamento real do tutor.

Exemplos:

**Questioning alto**

Preferir perguntas antes de respostas completas.

**Directiveness alto**

Conduzir mais a sequência.

**Depth alto**

Investigar fundamentos, implicações e conexões.

**Pace alto**

Reduzir checagens e avançar mais rapidamente.

Não basta mudar mensagens de UI.

Testes devem verificar que a configuração chega à montagem do contexto/prompt.

---

# 13. Conceitos

## R19 — Detecção

A conversa pode produzir uma sugestão estruturada de conceito.

Ela não deve ser exibida como texto bruto do modelo.

## R20 — Card

Exemplo:

```text
CONCEITO IDENTIFICADO

Entalpia

Sua formulação:
...

Formulação da parceira:
...

Fonte:
Smith · p. 43

[Salvar] [Explorar] [Ignorar]
```

## R21 — Confirmação humana

Nenhum conceito sugerido torna-se conhecimento permanente sem ação explícita do usuário.

Preservar o princípio atual das sugestões de notas/memória.

## R22 — Proveniência

Um conceito salvo deve preservar, quando disponíveis:

- Zetel;
- documento;
- página;
- seleção/bloco;
- sessão;
- mensagem ou evidência de origem.

## R23 — Duas formulações

Quando aplicável, preservar separadamente:

- compreensão/formulação do usuário;
- formulação sintetizada pela parceira.

## R24 — Deduplicação

Antes de criar um conceito novo, verificar se existe candidato equivalente no Zetel.

Não exigir resolução semântica perfeita nesta V1.

A UI pode permitir:

```text
Adicionar ao conceito existente
```

em vez de criar duplicata.

## R25 — Evolução

Um conceito existente pode receber novas:

- formulações;
- fontes;
- evidências;
- conexões.

Não modelar conceito como uma nota imutável criada uma única vez.

---

# 14. Relações

## R26 — Preparação para relações

O modelo de persistência de conceito não deve impedir relações futuras.

A sugestão e persistência completa de relações pode ser implementada se couber naturalmente na mesma arquitetura, mas **não deve atrasar a entrega da V1 de conceitos**.

Grafo visual é explicitamente posterior.

---

# 15. Sessões

## R27 — Study Session

Conversa de estudo deve possuir identidade própria de sessão.

No mínimo:

- id;
- Zetel;
- título;
- material atual, quando houver;
- posição atual, quando houver;
- perfil;
- created_at;
- updated_at;
- estado de continuidade.

## R28 — Retomar

O usuário deve conseguir:

**Continuar sessão**

e recuperar contexto suficiente para prosseguir.

## R29 — Nova sessão

Também deve existir:

**Nova sessão**

sem apagar memória ou conhecimento já construído no Zetel.

## R30 — Nome

Sessões podem receber nome manual ou sugestão de nome que exige confirmação/edição.

---

# 16. Restrições de conhecimento

## R31 — Grounding

Quando a conversa estiver em modo normal do Zetel, afirmações substantivas sobre o conteúdo estudado devem ser fundamentadas nas fontes disponíveis.

Se não houver suporte suficiente, a parceira deve sinalizar a limitação.

Não inventar referência.

## R32 — Web

Pesquisa web e importação web não fazem parte desta V1.

A arquitetura não deve impedir uma futura ferramenta explícita:

```text
Pesquisar na web
```

mas não implementar busca automática como parte deste PRD.

---

# 17. Interface

## R33 — Prioridade visual

A UI deve priorizar:

1. material;
2. conversa;
3. voz;
4. ações contextuais;
5. conceitos.

Configurações avançadas não devem ocupar a interface principal.

## R34 — Transcript

A conversa textual deve poder ficar visível ou recolhida.

A persistência não depende de estar visível.

## R35 — Feedback

Estados de voz precisam ser claros:

```text
ouvindo
pensando
falando
parado
erro/fallback
```

Evitar excesso de animações ou gamificação nesta fase.

---

# 18. Persistência e compatibilidade

## R36 — Vault

Preservar a filosofia local-first.

Arquivos originais e conhecimento durável devem continuar sob controle do usuário.

Notas/conceitos/memória podem continuar utilizando Markdown como representação durável.

A interface não deve exigir manipulação direta de Markdown.

## R37 — SQLite

SQLite continua armazenando estado operacional e índices.

Novas tabelas/migrations devem seguir o padrão existente.

Nenhuma migration possui down automática.

## R38 — Logs

Não registrar:

- transcrição;
- conteúdo da conversa;
- conteúdo de páginas;
- conceitos;
- memória;
- prompts contendo conteúdo;
- chaves.

Somente IDs, estados e contagens permitidos pelas regras atuais.

---

# 19. Arquitetura de contexto

A implementação deve buscar uma solução simples antes de introduzir infraestrutura pesada.

Baseline conceitual:

```text
CURRENT FOCUS
página / seleção
       ↓
LOCAL CONTEXT
       ↓
RETRIEVAL NO ZETEL
       ↓
CONCEITOS / MEMÓRIA RELEVANTES
       ↓
TUTOR PROFILE
       ↓
LLM
```

Não introduzir banco vetorial externo ou serviço adicional sem necessidade demonstrada.

A escolha entre busca lexical, embeddings, híbrida ou outra técnica deve ser feita no plano técnico após auditoria.

---

# 20. Segurança contra conteúdo adversarial

Documentos são dados, não instruções.

Texto dentro de PDFs ou fontes importadas não deve poder substituir:

- system prompt;
- regras de segurança;
- perfil do tutor;
- contratos estruturados;
- regras de persistência.

Saídas estruturadas para conceitos devem passar por validação server-side antes de persistência ou UI especial.

---

# 21. Critérios de aceitação da V1

A entrega é considerada funcional quando o seguinte cenário completo funciona.

### Cenário principal

1. Usuário cria ou abre um Zetel.
2. Adiciona um PDF.
3. O sistema processa o PDF preservando páginas.
4. Usuário abre o material.
5. PDF aparece no painel de leitura.
6. Conversa aparece ao lado.
7. Sistema conhece a página atual.
8. Usuário inicia conversa por texto.
9. Usuário inicia conversa por voz.
10. Parceira pode iniciar uma interação.
11. Respostas consideram página atual.
12. Parceira consegue recuperar contexto relevante de outra parte do Zetel quando necessário.
13. Usuário consegue alterar foco em linguagem natural.
14. Existe pelo menos um conjunto de perfis predefinidos.
15. Perfil escolhido modifica comportamento do tutor.
16. Perfil pode ser personalizado para a sessão.
17. Perfil personalizado pode ser salvo como novo perfil.
18. Durante áudio da parceira, botão Parar funciona imediatamente.
19. Conversa textual é preservada.
20. Um conceito pode ser sugerido.
21. O conceito não é persistido sem aprovação.
22. Conceito salvo possui proveniência.
23. Conceito existente pode ser enriquecido.
24. Sessão pode ser nomeada.
25. Usuário fecha o Zetel.
26. Retorna posteriormente.
27. Escolhe Continuar sessão.
28. A sessão recupera contexto suficiente para continuar.

---

# 22. Cenário de validação de produto

Além dos testes automatizados, o gate final da V1 exige teste manual com um artigo ou material real.

Objetivo:

> estudar por 20–40 minutos sem precisar contornar constantemente a interface.

Avaliar:

- naturalidade da voz;
- latência;
- qualidade do contexto;
- utilidade das perguntas;
- facilidade de interrupção;
- atrito da UI;
- utilidade das sugestões de conceitos;
- qualidade ao retomar a sessão.

Esse gate é avaliação humana de produto, não teste automatizado.

---

# 23. Qualidade

Mudanças com migration, persistência, contexto arquitetural ou contratos amplos são `FULL`.

FULL exige conforme `.agent/QUALITY.md`:

```text
testes focados
pnpm build
pnpm test:ci
pnpm test:coverage
pnpm typecheck
git diff --check
```

E2E live ou qualquer chamada real de OpenRouter/voz permanece opt-in e exige autorização humana explícita.

---

# 24. Estratégia de implementação

Não implementar o PRD como uma única tarefa.

Criar uma spec de produto separada:

```text
SPEC-001-conversational-learning-v1
```

Decompô-la em tarefas verticais capazes de terminar com o projeto funcional e verde.

Cada sessão executa exatamente uma tarefa.

A decomposição definitiva deve ser produzida após auditoria do código.

Uma decomposição provável é:

1. alinhamento documental e arquitetura;
2. PDF + leitura contextual funcional;
3. sessão conversacional e continuidade;
4. perfis do tutor;
5. experiência voice-first e interrupção;
6. conceitos persistentes e proveniência;
7. integração/UX e cenário E2E;
8. polimento e validação humana.

Essa lista é orientação, não autorização para ignorar dependências reais encontradas no repositório.

---

# 25. Decisões adiadas

Não bloqueiam a V1:

- nome final da parceira;
- provedor definitivo de voz;
- nome final da Visão Integrada;
- pesquisa web;
- grafo;
- mastery;
- revisão espaçada;
- gamificação;
- modo prova completo.

---

# 26. Resultado esperado

Ao final do PRD v5, o Zetel deve ter deixado de parecer:

> “um sistema de documentos com chat e voz”

e passado a parecer:

> **“uma parceira de estudos com quem eu consigo realmente estudar meus materiais.”**
