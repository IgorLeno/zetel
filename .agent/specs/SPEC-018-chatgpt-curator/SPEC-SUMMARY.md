# SPEC-018-chatgpt-curator Summary

Titulo: Zetel curador: importar relatorios do ChatGPT e devolver contexto
Kind: full
Status: PENDING_APPROVAL

Conversa sai do Zetel e vai para o ChatGPT Plus. O ChatGPT gera "Relatório
Zetel" (Markdown + imagens) salvo em `inbox/<slug>/` de um canal; o Zetel
importa sem duplicar, cura por IA em candidatos (nota, passo a passo,
conceito, questão) com confirmação humana e publica `contexto/<slug>/CONTEXTO.md`
determinístico para a próxima conversa. Canal recomendado: repositório GitHub
privado separado do vault, via `git` do sistema (sem credencial no Zetel).
Chat/voz/Live intocados aqui; SPEC-019 os esconde atrás de flag (D11).
D1, D3 e D11 decididos pelo Igor em 2026-10-20.

D13 decidida (2026-10-21): emenda no topo de `docs/PRODUCT_VISION.md`.
