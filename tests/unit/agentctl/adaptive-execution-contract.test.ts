import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const lineCount = (text: string) => text.replace(/\n$/, "").split("\n").length;

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
      const adapter = read(path);
      expect(adapter).toMatch(/Documento T[eé]cnico[\s\S]*(?:sem|n[aã]o)[\s\S]*LLM/i);
      expect(adapter).toMatch(/n[aã]o injeta CSS[\s\S]*iframe|iframe[\s\S]*sem inje[cç][aã]o de CSS/i);
      expect(adapter).toMatch(/content_text[\s\S]*servidor|servidor[\s\S]*content_text/i);
      expect(adapter).toMatch(/n[aã]o logar[\s\S]*conte[uú]do|conte[uú]do[\s\S]*n[aã]o[\s\S]*log/i);
      expect(adapter).toMatch(/better-sqlite3[\s\S]*singleton|singleton[\s\S]*better-sqlite3/i);
      expect(adapter).toMatch(/E2E live[\s\S]*autoriza[cç][aã]o/i);
    },
  );

  it("defines FAST, STANDARD and FULL in the shared quality contract", () => {
    const quality = read(".agent/QUALITY.md");
    for (const profile of ["FAST", "STANDARD", "FULL"]) {
      expect(quality).toMatch(new RegExp(`^##+ ${profile}\\b`, "m"));
    }
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
    ".agent/PROJECT_CONTEXT.md",
    ".agent/ARCHITECTURE.md",
    "docs/agent-context/PROJECT_HISTORY.md",
    "docs/agent-context/CLAUDE_PROJECT_HISTORY.md",
  ])("preserves extracted project knowledge in %s", (path) => {
    expect(statSync(resolve(root, path)).size).toBeGreaterThan(200);
  });
});
