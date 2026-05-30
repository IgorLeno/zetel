# Backup e recuperação — Zetel

## O que precisa de backup

| O quê | Onde | Situação |
|-------|------|----------|
| **Vault** (Markdown) | pasta configurada em Configurações | **fonte de verdade** — deve ser backupeado |
| `~/.zetel/config` | arquivo com a chave OpenRouter | deve ser backupeado **fora do git** (permissão 600) |
| `~/.zetel/zetel.db` | SQLite | **regenerável** — histórico de chat **perdido permanentemente** (ver cenário 1); não precisa de backup |
| `<vault>/zetels/<slug>/artefatos/leitura.html` | HTML de leitura | **regenerável** via "Atualizar leitura" |

## O que está no vault

```
<vault>/
  zetels/
    <slug>/
      arquivos/        ← arquivos .md originais (fonte de verdade do conteúdo)
      notas-rapidas/   ← notas aceitas
      notas-literatura/
      artefatos/       ← leitura.html (regenerável)
      images/          ← imagens copiadas no Processar (regenerável)
    .lixeira/          ← Zetels na lixeira
  parceiro/
    memoria/           ← memórias globais em Markdown
  config/
    prompts/           ← prompts editáveis (parceiro.md, sugestao-nota.md, sugestao-memoria.md)
```

## Como fazer backup

O vault é compatível com git — versionar a pasta inteira é suficiente:

```bash
cd /caminho/do/vault
git init          # se ainda não for um repositório
git add .
git commit -m "backup $(date +%Y-%m-%d)"
```

Alternativa: copiar a pasta para um local seguro (nuvem, disco externo).

Backup da chave OpenRouter (separado, nunca no git):

```bash
cp ~/.zetel/config ~/backup-seguro/zetel-config-$(date +%Y-%m-%d)
```

## Recuperação — cenário 1: banco de dados perdido

Se `~/.zetel/zetel.db` for apagado ou corrompido:

1. Reabra o app — ele cria um novo banco automaticamente.
2. Configure o vault em Configurações (o mesmo caminho de antes).
3. Recrie cada Zetel **manualmente** na UI (mesmo nome/slug que antes) — o app **não** redescobre entradas só pelo vault. Depois, na aba **Arquivos** de cada Zetel, use **Adicionar arquivos** para reimportar os `.md` de `<vault>/zetels/<slug>/arquivos/` (ou copie-os de volta para essa pasta antes de importar).
4. O histórico de chat **se perde** — isso é esperado (o histórico fica só no SQLite, D6).
5. Notas e memórias **sobrevivem** — estão no vault em Markdown.

## Recuperação — cenário 2: arquivo de leitura perdido

Se `artefatos/leitura.html` for apagado:

1. Abra o Zetel no app.
2. Vá na aba **Leitura** e clique em **Atualizar leitura**.
3. O HTML é reconstruído a partir dos arquivos `.md` do vault.

## O que não versionar

Adicione ao `.gitignore` do vault (ou do repo do app):

```
# gerado automaticamente — não versionar
*/artefatos/
*/images/
# .lixeira/  ← comentado: Zetels na lixeira ainda são conteúdo do usuário até purge explícito; versione se quiser preservá-los no git
```

E nunca versionar a pasta `~/.zetel/` (db, config, logs). Se usar git no vault, considere **incluir** `.lixeira/` enquanto houver Zetels trashed-but-not-purged que você queira recuperar.
