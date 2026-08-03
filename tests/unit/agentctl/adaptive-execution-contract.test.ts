import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const lineCount = (text: string) => text.replace(/\n$/, "").split("\n").length;
const contractText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

const expectLiveE2EGuard = (text: string) => {
  const contract = contractText(text);
  expect(contract).toContain("zetel_e2e_live=1");
  expect(contract).toContain("openrouter_api_key nao vazia");
  expect(contract).toContain("zetel_e2e_max_calls");
  expect(contract).toContain("orcamento finito e positivo");
  expect(contract).toContain("autorizacao humana explicita");
  expect(contract).toContain("fora dos gates padrao");
  expect(contract).toContain("nunca e executado automaticamente pela ci padrao");
};

describe("adaptive execution documentation", () => {
  it.each([
    ["AGENTS.md", 150],
    ["CLAUDE.md", 100],
  ])("keeps %s within its context budget", (path, maximum) => {
    expect(lineCount(read(path))).toBeLessThanOrEqual(maximum);
  });

  it.each(["AGENTS.md", "CLAUDE.md"])(
    "%s routes execution policy to the canonical profiles document",
    (path) => {
      expect(read(path)).toContain(".agent/EXECUTION_PROFILES.md");
    },
  );

  it.each(["AGENTS.md", "CLAUDE.md"])(
    "%s retains the product safety boundaries",
    (path) => {
      const adapter = contractText(read(path));
      expect(adapter).toContain("documento tecnico");
      expect(adapter).toMatch(/documento tecnico[^.]+(?:sem|nao usa) llm/);
      expect(adapter).toContain("os artefatos html sao autocontidos");
      expect(adapter).toContain("o app nao injeta css");
      expect(adapter).toContain(
        "o sandbox do iframe nao recebe allow-same-origin por padrao",
      );
      expect(adapter).toContain("o servidor busca zetel_pages.content_text");
      expect(adapter).toContain(
        "o content_text enviado pelo cliente nao e fonte autoritativa",
      );
      expect(adapter).toContain("logs permitem somente ids e contagens");
      expect(adapter).toMatch(
        /logs permitem somente ids e contagens[^.]+nunca paginas, chat, notas, memoria, conteudo do usuario, tokens, chaves ou segredos/,
      );
      expect(adapter).toMatch(/better-sqlite3[^.]+singleton/);
      expectLiveE2EGuard(adapter);
    },
  );

  it.each([
    "AGENTS.md",
    "CLAUDE.md",
    ".agent/QUALITY.md",
    ".agent/specs/SPEC-000-agent-workflow-pilot/SPEC.md",
    ".agent/PROJECT_CONTEXT.md",
  ])("keeps the complete live E2E guard in %s", (path) => {
    expectLiveE2EGuard(read(path));
  });

  it("defines FAST, STANDARD and FULL in the shared quality contract", () => {
    const quality = read(".agent/QUALITY.md");
    for (const profile of ["FAST", "STANDARD", "FULL"]) {
      expect(quality).toMatch(new RegExp(`^##+ ${profile}\\b`, "m"));
    }
  });

  it("distinguishes profile downgrade from initial classification and elevation", () => {
    const profiles = contractText(read(".agent/EXECUTION_PROFILES.md"));
    expect(profiles).toContain(
      "a classificacao inicial comeca pelo menor perfil compativel",
    );
    expect(profiles).toContain("o agente pode elevar o perfil autonomamente");
    expect(profiles).toContain(
      "depois que um perfil foi registrado ou elevado, qualquer reducao e um downgrade",
    );
    expect(profiles).toMatch(
      /downgrade exige[^.]+justificativa registrada[^.]+aprovacao humana explicita[^.]+profile_approved_by/,
    );
    expect(profiles).toContain(
      "o mesmo agente nao pode reverter autonomamente sua propria elevacao",
    );
  });

  it("keeps lifecycle bookkeeping separate from FULL state-machine changes", () => {
    const profiles = contractText(read(".agent/EXECUTION_PROFILES.md"));
    expect(profiles).toMatch(
      /alterar[^.]+implementacao[^.]+schema[^.]+guardas[^.]+contratos[^.]+state machine[^.]+sempre full/,
    );
    for (const marker of [
      "asserttransition",
      "validatestate",
      "writejsonatomic",
      "expectedrevision",
    ]) {
      expect(profiles).toContain(marker);
    }
    expect(profiles).toContain(
      "o uso normal do lifecycle de uma tarefa nao eleva automaticamente a tarefa para full",
    );
    expect(profiles).toContain(
      "uma alteracao documental que apenas registra transicoes autorizadas pode permanecer fast ou standard",
    );
  });

  it("rechains task 003 to 002C and makes gates profile-aware", () => {
    const task = read(
      ".agent/specs/SPEC-000-agent-workflow-pilot/tasks/003-task-lifecycle-gates.md",
    );
    expect(task).toMatch(/blocked_by:\s*\["002C"\]/);
    expect(task).toMatch(/task validate[\s\S]*execution_profile/i);
    expect(task).toMatch(/FAST[\s\S]*(?:sem|n[aã]o exige)[\s\S]*review externo/i);
    expect(task).toMatch(/STANDARD[\s\S]*(?:no m[aá]ximo|at[eé]) uma revis[aã]o/i);
    expect(task).toMatch(/FULL[\s\S]*(?:at[eé]|pode exigir) duas revis[oõ]es/i);
    expect(task).not.toMatch(/## Gates obrigat[oó]rios\s+\n*Testes focados; gates completos/i);
  });

  it.each([
    [".agent/PROJECT_CONTEXT.md", ["Fontes de verdade", "Stack aprovada"]],
    [
      ".agent/ARCHITECTURE.md",
      ["Persistência", "Segurança e observabilidade"],
    ],
    [
      "docs/agent-context/PROJECT_HISTORY.md",
      ["Histórico consolidado", "Módulo 14", "Módulo 12"],
    ],
    [
      "docs/agent-context/CLAUDE_PROJECT_HISTORY.md",
      [
        "Histórico do contexto específico do Claude",
        "Módulo",
        "Decisões fundadoras",
      ],
    ],
  ])("preserves extracted project knowledge in %s", (path, markers) => {
    const contents = read(path);
    expect(statSync(resolve(root, path)).size).toBeGreaterThan(200);
    for (const marker of markers) {
      expect(contents).toContain(marker);
    }
  });
});
