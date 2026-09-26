# Zetel — Visão Oficial do Produto

## 1. Definição

**Zetel é um ambiente pessoal de aprendizagem conversacional, orientado principalmente por voz, no qual materiais escolhidos pelo usuário se tornam o contexto de uma parceira de estudos que ensina, pergunta, conecta conceitos, acompanha a compreensão e constrói uma memória de conhecimento rastreável ao longo do tempo.**

O Zetel não é primordialmente:

- um aplicativo de notas;
- um leitor de PDF com chatbot;
- um resumidor de documentos;
- uma biblioteca de textos gerados por IA;
- um gerador de flashcards.

O núcleo do produto é a **sessão de aprendizagem por conversa**.

```text
MATERIAL
   ↓
CONVERSA
   ↓
COMPREENSÃO
   ↓
CONCEITOS E CONEXÕES
   ↓
MEMÓRIA
   ↓
PRÓXIMA CONVERSA MELHOR
```

Documentos, notas, conceitos, perfis e memória existem para tornar essa conversa progressivamente melhor.

---

# 2. Usuário principal

O Zetel é, neste estágio, um produto desenvolvido prioritariamente para seu próprio usuário criador.

As decisões de produto devem privilegiar:

1. baixa fricção para começar a estudar;
2. aprendizagem por conversa;
3. interação principalmente por voz;
4. materiais escolhidos pelo próprio usuário;
5. profundidade intelectual sem transformar o estudo em uma interface burocrática;
6. preservação e evolução do conhecimento construído ao longo do tempo.

Generalização para outros públicos é desejável, mas não deve prejudicar essa experiência principal.

---

# 3. Problema

Existe uma quantidade enorme de conteúdo disponível para aprender praticamente qualquer assunto.

O problema não é apenas acesso a conteúdo.

O problema é a fricção existente entre:

```text
ter o conteúdo
        ↓
consumi-lo
        ↓
compreendê-lo
        ↓
questioná-lo
        ↓
relacioná-lo
        ↓
apropriar-se do conhecimento
```

Livros, artigos, apostilas, aulas e provas podem ser densos, passivos e cansativos.

Chatbots reduzem parte dessa fricção, mas normalmente:

- estão separados do material;
- perdem a posição da leitura;
- não mantêm uma estrutura durável de conhecimento;
- não acompanham adequadamente o que já foi discutido;
- tendem a responder em vez de ensinar;
- exigem interação manual demais;
- não transformam naturalmente a conversa em memória de aprendizagem.

O Zetel existe para ocupar esse espaço.

---

# 4. North Star

A experiência que define o sucesso do Zetel é:

> O usuário abre um material, ativa sua parceira de estudos e passa de 20 a 40 minutos conversando naturalmente sobre o conteúdo, principalmente por voz. Ele pergunta, explica, erra, interrompe, recebe perguntas, pede aprofundamento, relaciona partes diferentes do material e salva conceitos relevantes. Ao voltar depois, o Zetel sabe onde a sessão parou e preserva o conhecimento que foi construído.

O critério fundamental é:

> **Estudar um material no Zetel deve ser mais agradável e produtivo do que simplesmente lê-lo ou abrir um chatbot separado ao lado.**

---

# 5. Unidade principal: o Zetel

Um **Zetel** representa um assunto, objetivo ou domínio de estudo.

Exemplos:

- Termodinâmica
- Direito Administrativo
- Concurso Petrobras
- Alemão B1
- História Econômica Brasileira

Um Zetel pode conter vários materiais.

```text
Zetel: Termodinâmica

├── Smith.pdf
├── Apostila.pdf
├── Artigos/
├── Provas/
├── Conceitos/
├── Relações/
├── Sessões/
└── Memória/
```

Um mesmo material pode, futuramente, participar de mais de um Zetel.

O Zetel é um universo de estudo curado pelo usuário.

---

# 6. Fontes

O conhecimento factual utilizado durante o estudo deve ser fundamentado prioritariamente nos materiais pertencentes ao Zetel.

O tutor pode:

- interpretar;
- comparar;
- explicar;
- formular perguntas;
- criar analogias;
- relacionar trechos;
- reorganizar ideias.

Mas deve preservar a distinção entre:

```text
conteúdo presente nas fontes
```

e

```text
conteúdo externo às fontes
```

Pesquisa na web é uma capacidade planejada, mas deve ser explícita.

O Zetel não deve transformar silenciosamente uma conversa baseada em fontes em uma conversa aberta sobre toda a internet.

---

# 7. Acesso ao conhecimento do Zetel

Do ponto de vista do usuário:

> **A parceira conhece o Zetel inteiro.**

Isso não implica inserir todos os documentos integralmente em cada chamada ao modelo.

A implementação pode usar:

- página atual;
- seleção atual;
- estrutura do documento;
- capítulos;
- blocos relevantes;
- indexação;
- recuperação contextual;
- conceitos já construídos;
- memória;
- resumos estruturais.

A experiência deve esconder essa complexidade.

---

# 8. Foco da conversa

Não haverá, como requisito principal, um controle manual permanente de:

```text
página → seção → capítulo → documento → Zetel
```

O foco deve emergir naturalmente da situação.

Se o usuário está na página 37, a página 37 é o foco inicial.

Se selecionar um parágrafo, a seleção recebe prioridade.

Se disser:

> “Vamos olhar o capítulo inteiro.”

o foco muda.

Se disser:

> “Relaciona isso com aquela discussão do começo do livro.”

o tutor procura a conexão.

Portanto:

> **o foco é estado da conversa, não uma burocracia de interface.**

O tutor pode usar informações externas ao foco dentro do próprio Zetel quando forem relevantes, mas deve manter a conversa ancorada no assunto atual.

---

# 9. Modos de entrada no estudo

Um Zetel deve evoluir para oferecer quatro entradas principais:

### Continuar estudando

Retoma uma sessão existente no ponto em que ela parou.

### Conversar sobre o Zetel

Abre uma conversa sem exigir um documento específico na tela.

### Abrir material

Abre um documento e utiliza leitura + conversa como experiência principal.

### Resolver questões

Abre uma experiência voltada a exercícios e provas.

A primeira versão nova prioriza **Abrir material + Conversa**.

---

# 10. Leitura conversacional

A experiência principal de leitura deve combinar:

```text
┌─────────────────────────────┬──────────────────────────────┐
│                             │                              │
│          MATERIAL           │          PARCEIRA            │
│                             │                              │
│ página / seleção            │ voz / conversa              │
│                             │ conceitos sugeridos         │
│                             │ referências                 │
│                             │                              │
└─────────────────────────────┴──────────────────────────────┘
```

O material permanece visível.

A conversa acontece ao lado.

O usuário pode iniciar a interação falando ou digitando.

---

# 11. Iniciativa da parceira

Existem dois caminhos igualmente válidos.

## Usuário inicia

O usuário abre o microfone ou escreve.

Exemplos:

> “Não entendi esse parágrafo.”

> “O que você acha dessa introdução?”

> “Vamos aprofundar essa ideia.”

## Parceira inicia

O usuário ativa a professora.

Ela pode:

- contextualizar a página;
- fazer uma pergunta;
- apresentar o tema;
- perguntar o que o usuário já sabe;
- sugerir um ponto de discussão.

A interface pode oferecer ações rápidas como:

```text
[Contextualize]
[Explique]
[Me faça uma pergunta]
[Vamos conversar]
```

A parceira não deve falar automaticamente a cada mudança de página.

---

# 12. Voice-first

Voz é uma interface de primeira classe.

Não deve parecer um chatbot textual ao qual STT e TTS foram adicionados.

O objetivo de longo prazo é uma conversa próxima à naturalidade de produtos de voz modernos:

- fala natural;
- baixa latência;
- resposta progressiva;
- possibilidade de interrupção;
- personalidade consistente;
- mudança de direção durante a conversa;
- retorno imediato à escuta.

Texto continua disponível.

A conversa deve poder alternar livremente entre:

```text
voz ↔ texto
```

A transcrição textual permanece como registro canônico.

---

# 13. Interrupção

Interromper a parceira é requisito essencial de experiência.

A primeira implementação pode utilizar:

```text
[■ Parar]
```

durante a fala.

Ao interromper:

1. o áudio para imediatamente;
2. a resposta textual já produzida permanece;
3. o usuário pode falar ou digitar imediatamente.

Barge-in automático por detecção de fala é uma evolução posterior.

---

# 14. Parceira e perfis do tutor

O Zetel possui uma parceira com:

- nome;
- voz;
- identidade consistente;
- estilo conversacional;
- algum grau de humor e informalidade.

Sobre essa identidade são aplicados **perfis de tutor**.

O produto deve trazer perfis predefinidos, por exemplo:

- Conversa Livre
- Professor Socrático
- Explicador
- Resolver Comigo
- Revisão Rápida
- Professor Profundo

Cada perfil é configurado inicialmente por seis eixos pedagógicos:

1. Proatividade
2. Questionamento
3. Diretividade
4. Profundidade
5. Ritmo
6. Uso de analogias e exemplos

Perfis também podem carregar atributos de tom, como grau de informalidade e humor.

A interface pode representar o perfil por barras e por um gráfico radar.

O usuário pode:

- usar um perfil;
- alterar o perfil somente para a sessão;
- editar um perfil;
- criar um novo perfil baseado em outro.

Comandos naturais também podem alterar temporariamente o comportamento:

> “Vai mais fundo.”

> “Me dá menos respostas prontas.”

> “Seja mais direta.”

---

# 15. Conceitos

Durante a conversa, o sistema identifica conceitos potencialmente relevantes.

Ele nunca os salva automaticamente.

Pode apresentar:

```text
CONCEITO IDENTIFICADO

Entalpia

Sua formulação:
“...”

Formulação da parceira:
“...”

Fonte:
Smith · capítulo 2 · página 43

[Salvar] [Explorar] [Ignorar]
```

O conceito deve preservar:

- nome canônico;
- formulações do usuário;
- formulações da parceira;
- fontes;
- momentos em que apareceu;
- relações com outros conceitos.

Um conceito existente deve crescer em vez de ser duplicado desnecessariamente.

---

# 16. Relações

O Zetel pode sugerir conexões entre conceitos.

Exemplo:

```text
Entalpia
   ↕
Energia interna
```

A relação também exige confirmação humana antes de se tornar parte permanente do conhecimento.

A longo prazo, essas relações formam o grafo do Zetel.

O grafo visual não é requisito da primeira versão.

---

# 17. Memória

O produto deve distinguir pelo menos quatro camadas.

## Fontes

Materiais trazidos pelo usuário.

## Conversa

Histórico das sessões de aprendizagem.

## Conhecimento construído

Conceitos, relações e formulações aprovadas.

## Memória do aluno

Informações úteis para personalizar futuras conversas, como:

- tópicos já discutidos;
- dificuldades recorrentes;
- conhecimento demonstrado;
- preferências de aprendizagem.

A memória deve ser inspecionável e corrigível pelo usuário.

Markdown pode continuar sendo o formato durável dessa memória e das notas, mesmo que o usuário normalmente interaja com representações HTML ou componentes visuais.

---

# 18. Sessões

Cada conversa significativa é uma sessão.

Uma sessão pode ter:

- nome;
- Zetel;
- material atual;
- página atual;
- perfil utilizado;
- histórico;
- conceitos discutidos;
- data de início;
- estado de continuação.

Ao voltar:

```text
[Continuar sessão]
[Nova sessão]
```

O usuário pode nomear sessões.

---

# 19. Visão integrada do Zetel

Em uma fase posterior, vários materiais poderão ser digeridos em duas representações derivadas.

## Mapa de aprendizagem

Estrutura navegável dos assuntos existentes no Zetel.

## Conteúdo integrado

Material derivado, organizado em capítulos e fundamentado nas fontes do Zetel.

Nenhum dos dois substitui os documentos originais.

Toda síntese deve preservar rastreabilidade até as fontes.

---

# 20. Provas e exercícios

O Zetel deverá evoluir para compreender provas e exercícios como objetos de aprendizagem.

A experiência desejada não é simplesmente:

> pergunta → resposta.

É:

```text
questão
   ↓
o que você entendeu?
   ↓
qual informação parece importante?
   ↓
pista
   ↓
raciocínio
   ↓
resposta
   ↓
conceito por trás
```

A intensidade das pistas e da orientação depende do perfil do tutor.

---

# 21. Estímulo visual e sonoro

“Gamificação” no estágio atual significa principalmente tornar a experiência agradável e viva.

Prioridades:

- boa hierarquia visual;
- transições suaves;
- resposta de interface clara;
- áudio de qualidade;
- feedback sonoro discreto;
- cards de conceitos;
- referências interativas;
- sensação de progresso.

XP, streaks, níveis e sistemas complexos de recompensa não são prioridade inicial.

---

# 22. Princípios de produto

1. **Conversa antes de artefatos.**
2. **Voz é primeira classe.**
3. **O usuário controla suas fontes.**
4. **O Zetel deve ensinar, não apenas responder.**
5. **Contexto local, conexões globais.**
6. **Conhecimento construído deve permanecer rastreável.**
7. **IA sugere; usuário decide o que se torna memória permanente.**
8. **A interface deve esconder complexidade técnica.**
9. **Markdown é infraestrutura, não obrigação de interface.**
10. **A experiência de estudo vale mais que quantidade de features.**

---

# 23. Critério de sucesso

A primeira grande validação do Zetel não será quantidade de notas, cobertura de código, quantidade de modos ou número de recursos.

Será esta:

> Um artigo real de aproximadamente sete páginas consegue gerar uma sessão contínua de estudo de 20–40 minutos por voz e texto, com material visível, perguntas contextuais, interrupções naturais, conceitos relevantes e possibilidade real de retomar o estudo depois.

Se essa experiência for boa, existe uma base sólida para construir:

- modelo do aluno;
- provas;
- revisão espaçada;
- grafo;
- conteúdo integrado;
- busca web;
- simuladores;
- gamificação;
- planejamento de estudos.

Esse é o núcleo do Zetel.
