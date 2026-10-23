---
schema_version: 2
task_id: "008"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-008-r1"
package_id: "pkg_75002c7737e4823704f7b642"
fixed_point: "70f3c3768e8bc6b24477ab1cf6dc3991a8c58b8c447adfdc0437269295696d24"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-23T04:28:10.000Z"
---

```json
{
  "summary": "O E2E do curador é bem isolado e provavelmente offline. A chave OPENROUTER_API_KEY é forçada para um valor falso depois do spread de process.env, então o dotenv de .env.e2e.live não vaza. O modo live é desligado quando ZETEL_E2E_CURATOR=1. O servidor usa ZETEL_HOME em diretório temporário, distDir .next-e2e e porta 3005 com reuseExistingServer:false, então não reaproveita nem sobrescreve o dev server do Igor. O preload substitui o fetch global antes do Next carregar: openrouter.ai recebe o JSON fixo e qualquer host não-loopback lança erro. As mudanças de config são seguras para os projetos legado e live e para produção. O projeto legado só ganha o testIgnore de curator. distDir cai em '.next' quando ZETEL_NEXT_DIST_DIR não está definida. tsconfig e .gitignore só acrescentam .next-e2e. O teste é significativo: percorre importação, curadoria, edição, confirmação, gravação no vault, prévia sem sujar o clone, publicação e verificação do commit no bare remoto. As asserções são específicas e não dependem de rede. Os pontos abaixo são menores e não bloqueiam. Limitação de escopo: só li o pacote, então não confirmei que o app guarda a chave apenas em env e ZETEL_HOME. Também não vi o código que decide onde o app escreve o vault e o banco.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "afterAll faz rmSync recursivo em ZETEL_E2E_CURATOR_ROOT, que pode vir do ambiente",
      "evidence": "playwright.config.ts só gera o diretório temporário quando ZETEL_E2E_CURATOR_ROOT não está definida. Se o desenvolvedor exportar a variável apontando para um diretório existente ou importante, curator.spec.ts executa rmSync(ROOT, { recursive: true, force: true }) no afterAll e apaga esse diretório inteiro. ZETEL_HOME vira join(ROOT,'home') e o vault e os repositórios também ficam sob ROOT.",
      "recommendation": "Não aceitar ROOT vindo do ambiente. Gerar sempre com mkdtemp em tmpdir() e um prefixo próprio. Se o override for mantido, só fazer rmSync quando o basename começar com 'zetel-e2e-curator-'.",
      "location": {
        "file": "e2e/curator/curator.spec.ts",
        "line": 236,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Bloqueio de rede cobre só o fetch global; o git do servidor herda a configuração global do usuário",
      "evidence": "O mock substitui apenas globalThis.fetch. O servidor herda HOME e ~/.gitconfig, porque só GIT_CONFIG_NOSYSTEM é setado e apenas no processo do teste (GIT_ENV), não no webServer.env. Pelo ambiente do servidor, um commit.gpgsign=true, hooks globais ou um url.insteadOf do desenvolvedor podem fazer o commit/push do 'Publicar contexto' falhar ou tentar rede. O repositório é local, então o risco de rede é baixo. O risco real é o teste ficar frágil por máquina.",
      "recommendation": "No webServer.env, definir GIT_CONFIG_GLOBAL=/dev/null e GIT_CONFIG_NOSYSTEM=1, e opcionalmente GIT_TERMINAL_PROMPT=0. Isso deixa o E2E hermético quanto ao git.",
      "location": {
        "file": "playwright.config.ts",
        "line": 127,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F003",
      "severity": "NIT",
      "status": "OPEN",
      "title": "O novo script e o pré-requisito do Chrome do sistema não estão documentados",
      "evidence": "docs/COMMANDS.md e docs/QUALITY.md não mencionam test:e2e:curator, a porta 3005 nem ZETEL_E2E_CURATOR. O projeto usa channel:'chrome', que exige o Chrome instalado; sem ele o teste falha com erro pouco óbvio. A porta 3005 fica fixa e reuseExistingServer:false, então um processo ocupando a porta derruba a run, o que é intencional mas não está documentado.",
      "recommendation": "Acrescentar uma linha em COMMANDS.md e QUALITY.md com o comando, a porta, o diretório .next-e2e, o requisito de Chrome do sistema e a nota de que a suíte roda offline e fora dos gates padrão.",
      "location": {
        "file": "package.json",
        "line": 22,
        "not_applicable_reason": null
      }
    }
  ]
}
```
