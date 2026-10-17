---
schema_version: 2
task_id: "001"
axis: engineering-quality
reviewer: claude-subagent-security-engineer
review_run_id: "eq-sec-e58d7add-5f14-4447-91e1-e1bf69f0699c"
package_id: "pkg_b9f2d2c56be06d36eb92e8fa"
fixed_point: "35192ef5c9622e8a676c866227f2875d44e4d5416bde24198d72f25006071623"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-17T17:09:15.000Z"
---

```json
{
  "summary": "Guarda CSRF correta e sem bypass explorável por navegador. Verificado: hashes de lib/request-guard.ts, middleware.ts, app/api/settings/route.ts e do teste de integração batem com changed-files.json; .next/server/functions-config-manifest.json registra /_middleware com runtime nodejs e matcher /api/:path*; sondagem viva no dev server do Zetel (porta 3001) com POST /api/theme e corpo inválido retornou 403 cross-site para /api/theme, /%61pi/theme, /api/%74heme, /api/./theme, /api/x/../theme, ;x, query e /_next/data/x/api/theme.json; /api/theme/ e barras duplas dão 308; /API/theme dá 404 (não roteia); Host evil.example, 0.0.0.0, localhost. e [::ffff:127.0.0.1] dão 403; método em minúsculas é rejeitado pelo parser HTTP (400 sem corpo); PATCH/PUT/DELETE com Origin externo dão 403. As três rotas de segredo chamam requireSameOriginJson antes de request.json(); 415 exige application/json, o que força preflight cross-site. PUT /api/settings valida CR/LF/NUL de default_model e openai_tts_key antes de qualquer setSetting/writeConfig. Log do middleware só tem reason e method (regra 6). Rotas GET verificadas sem efeito colateral de estado. Testes focados: 3 arquivos, 46 testes PASS (rodados localmente). Nenhum blocker; achados restantes são de atomicidade pré-existente, cobertura de matcher e robustez de parsing.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "PUT /api/settings continua com gravação parcial para outras validações tardias",
      "evidence": "A validação antecipada (linhas 120-125) cobre só CR/LF/NUL. Com body {default_model: 'novo/modelo', openai_tts_key: '   '} ambos passam o early check (trim vazio é seguro), default_model é gravado em SQLite e em ~/.zetel/config (writeConfig OPENROUTER_MODEL, linha 135) e só depois a checagem de chave vazia/não string (bloco antes da linha 362) devolve 400, deixando estado parcial. O mesmo ocorre com chat_model não string, chat_history_window fora da faixa etc. após default_model; e uma exceção de writeConfig por lock/IO vira 500 após gravação em SQLite. O comentário novo afirma que o objetivo é evitar gravação parcial, mas só fecha uma das causas.",
      "recommendation": "Mover toda a validação de tipo/faixa (inclusive openai_tts_key vazio/não string e campos de modelo) para uma fase de validação única antes da primeira gravação, e envolver as gravações SQLite em transação com writeConfig por último (ou compensação). Adicionar teste de integração com default_model válido + openai_tts_key '   ' provando SQLite e config intactos. Pode ser follow-up fora desta tarefa.",
      "location": {
        "file": "app/api/settings/route.ts",
        "line": 120,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Cobertura do matcher do middleware é tautológica; rotas não secretas não têm teste de proteção",
      "evidence": "tests/unit/security/middleware.test.ts linha 21 só compara config.matcher com a string '/api/:path*'. Os testes de integração chamam os handlers diretamente, então nenhum teste prova que uma rota mutante não secreta (ex.: DELETE /api/zetels/[id], POST /api/memory) passa pelo middleware. Hoje a cobertura foi confirmada apenas por sondagem viva e pelo functions-config-manifest do build; uma futura mudança de matcher, basePath ou rota mutante fora de /api não seria detectada pela suíte.",
      "recommendation": "Adicionar teste que enumere app/api/**/route.ts com export POST/PUT/PATCH/DELETE e verifique, via unstable_doesMiddlewareMatch de next/experimental/testing/server, que cada caminho (com segmentos dinâmicos preenchidos) é coberto pelo config do middleware; e que nenhuma rota mutante existe fora de app/api.",
      "location": {
        "file": "tests/unit/security/middleware.test.ts",
        "line": 21,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Leitura via GET segue exposta a DNS rebinding e à LAN; doc subestima o dado exposto",
      "evidence": "checkMutationOrigin retorna null para GET/HEAD/OPTIONS antes da allowlist de Host (lib/request-guard.ts linha 51). O dev server observado escuta em *:3001 (next dev sem -H, package.json script dev), então clientes da LAN e páginas com DNS rebinding podem ler por GET páginas, notas, memória e artefatos. .agent/ARCHITECTURE.md (linha 121) descreve o risco residual como dados não secretos, mas esse conteúdo é exatamente o que a regra 6 trata como sensível. GET está fora do escopo aprovado, por isso não é bloqueante.",
      "recommendation": "Follow-up barato: aplicar a allowlist de Host a todos os métodos no middleware (só a checagem de Sec-Fetch-Site/Origin fica restrita a mutações), o que elimina leitura por DNS rebinding e por Host de LAN não autorizado; e/ou usar next dev -H 127.0.0.1. Ajustar o texto do risco residual para citar conteúdo do usuário.",
      "location": {
        "file": "lib/request-guard.ts",
        "line": 51,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F004",
      "severity": "NIT",
      "status": "OPEN",
      "title": "hostnameOf aceita Host com userinfo/caminho e normaliza diferente da comparação com Origin",
      "evidence": "hostnameOf (linha 32) faz new URL('http://' + host).hostname: Host 'evil.example:3001@localhost' vira hostname localhost e passa a allowlist (confirmado ao vivo: 400 do handler de /api/theme, não 403). Já a comparação com Origin usa a string Host crua, então '127.1:3001' e '[0:0:0:0:0:0:0:1]:3001' passam a allowlist mas falham contra o Origin canônico. Não explorável por navegador (o Host vem da autoridade da URL, sem userinfo, e DNS rebinding não forja Host local) e falha fechado quando há Origin, mas é parsing frouxo em código de segurança e sem testes para esses casos.",
      "recommendation": "Rejeitar Host que contenha '@', '/', '\\\\', '?' ou '#', e comparar Origin contra o host normalizado pela mesma função (hostname + porta). Adicionar casos unitários: userinfo, ponto final, IPv4 abreviado, IPv6 não canônico, múltiplos Origin.",
      "location": {
        "file": "lib/request-guard.ts",
        "line": 32,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "ZETEL_ALLOWED_HOSTS não normaliza entradas IPv6 nem com porta",
      "evidence": "allowedHostsFromEnv (linha 27) só faz trim/lowercase. Como o hostname comparado vem de URL.hostname (IPv6 com colchetes), uma entrada 'fe80::1' nunca casa e 'host:3000' também nunca casa, sem aviso. Falha fechado (só usabilidade).",
      "recommendation": "Normalizar cada entrada pela mesma rotina de hostname (aceitando IPv6 sem colchetes e descartando porta) ou registrar no log de inicialização a contagem de entradas inválidas ignoradas.",
      "location": {
        "file": "lib/request-guard.ts",
        "line": 27,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Arquivo de ferramenta local .claude/launch.json entrou no conjunto alterado",
      "evidence": "changed-files.json lista .claude/launch.json (status U), configuração de dev server na porta 3001 sem relação com a guarda same-origin; ele entra no fixed point desta tarefa.",
      "recommendation": "Não incluir .claude/launch.json no commit da tarefa (ou adicioná-lo ao .gitignore) para manter um escopo por commit.",
      "location": {
        "file": ".claude/launch.json",
        "line": 1,
        "not_applicable_reason": null
      }
    }
  ]
}
```
