import { readFileSync } from 'node:fs';
import { StateMachineError } from './state-machine.mjs';
import { assertSafeArgv } from '../infra/process-runner.mjs';

/**
 * @param {string[]} args
 */
export function parseValidateArgs(args) {
  const [specId, taskId, ...flags] = args;
  if (!specId || !taskId || specId.startsWith('--') || taskId.startsWith('--')) {
    throw new StateMachineError(
      'Uso: ./agentctl task validate <spec-id> <task-id> [--focused-json <argv-json>]... [--plan-file <path>] [--profile <FAST|STANDARD|FULL>] [--justification <texto>] [--profile-approved-by <id>] [--require-test-ci] [--integration-json <argv-json>]...',
      {
        guard: 'usage',
        nextAction: 'Informe spec-id, task-id e os comandos focados estruturados.',
      },
    );
  }

  /** @type {Array<{ category: string, argv: string[] }>} */
  const focused = [];
  /** @type {Array<{ category: string, argv: string[] }>} */
  const relatedIntegrations = [];
  /** @type {string | null} */
  let planFile = null;
  /** @type {string | null} */
  let profile = null;
  /** @type {string | null} */
  let justification = null;
  /** @type {string | null} */
  let profileApprovedBy = null;
  let requireTestCi = false;

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--focused-json') {
      focused.push({ category: 'focused', argv: parseArgvJson(flags[index + 1], '--focused-json') });
      index += 1;
    } else if (flag === '--integration-json') {
      relatedIntegrations.push({
        category: 'integration',
        argv: parseArgvJson(flags[index + 1], '--integration-json'),
      });
      index += 1;
    } else if (flag === '--plan-file') {
      const value = flags[index + 1];
      if (planFile !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --plan-file exige exatamente um caminho.', {
          guard: 'usage',
          nextAction: 'Informe --plan-file <path-json> uma unica vez.',
        });
      }
      planFile = value;
      index += 1;
    } else if (flag === '--profile') {
      const value = flags[index + 1];
      if (profile !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --profile exige FAST, STANDARD ou FULL.', {
          guard: 'usage',
          nextAction: 'Informe --profile uma unica vez.',
        });
      }
      profile = value;
      index += 1;
    } else if (flag === '--justification') {
      const value = flags[index + 1];
      if (justification !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --justification exige texto nao-flag.', {
          guard: 'usage',
          nextAction: 'Informe --justification "<texto>" uma unica vez.',
        });
      }
      justification = value;
      index += 1;
    } else if (flag === '--profile-approved-by') {
      const value = flags[index + 1];
      if (profileApprovedBy !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --profile-approved-by exige identidade humana.', {
          guard: 'usage',
          nextAction: 'Informe --profile-approved-by "<identidade>" uma unica vez.',
        });
      }
      profileApprovedBy = value;
      index += 1;
    } else if (flag === '--require-test-ci') {
      if (requireTestCi) {
        throw new StateMachineError('Uso: --require-test-ci nao pode ser repetido.', {
          guard: 'usage',
          nextAction: 'Informe --require-test-ci uma unica vez.',
        });
      }
      requireTestCi = true;
    } else {
      throw new StateMachineError(`Uso: flag ou argumento desconhecido: ${flag}.`, {
        guard: 'usage',
        nextAction: 'Use apenas flags documentadas de task validate.',
      });
    }
  }

  if (planFile) {
    const fromFile = loadPlanFile(planFile);
    focused.push(...fromFile.focused);
    relatedIntegrations.push(...fromFile.relatedIntegrations);
    if (fromFile.requireTestCi) requireTestCi = true;
  }

  return {
    specId,
    taskId,
    focused,
    relatedIntegrations,
    profile,
    justification,
    profileApprovedBy,
    requireTestCi,
  };
}

/**
 * @param {string | undefined} raw
 * @param {string} flag
 */
function parseArgvJson(raw, flag) {
  if (typeof raw !== 'string' || raw.startsWith('--')) {
    throw new StateMachineError(`Uso: ${flag} exige um array JSON de argv.`, {
      guard: 'usage',
      nextAction: `Informe ${flag} '["cmd","arg"]'.`,
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StateMachineError(`Uso: ${flag} deve ser JSON valido.`, {
      guard: 'usage',
      nextAction: `Informe ${flag} com um array JSON de strings.`,
    });
  }
  return assertSafeArgv(parsed);
}

/**
 * @param {string} path
 */
function loadPlanFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new StateMachineError(`Plano de validacao ausente: ${path}.`, {
      guard: 'plan-file',
      nextAction: 'Crie um JSON operacional com comandos estruturados.',
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StateMachineError('Plano de validacao JSON invalido.', {
      guard: 'plan-file',
      nextAction: 'Corrija o JSON do --plan-file.',
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StateMachineError('Plano de validacao deve ser objeto JSON.', {
      guard: 'plan-file',
      nextAction: 'Use { "focused": [["cmd"]], "integrations": [], "require_test_ci": false }.',
    });
  }

  /** @type {Array<{ category: string, argv: string[] }>} */
  const focused = [];
  /** @type {Array<{ category: string, argv: string[] }>} */
  const relatedIntegrations = [];

  for (const item of asCommandList(parsed.focused, 'focused')) {
    focused.push({ category: 'focused', argv: item });
  }
  for (const item of asCommandList(parsed.integrations, 'integrations')) {
    relatedIntegrations.push({ category: 'integration', argv: item });
  }

  return {
    focused,
    relatedIntegrations,
    requireTestCi: parsed.require_test_ci === true,
  };
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[][]}
 */
function asCommandList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new StateMachineError(`Plano.${label} deve ser array de argv.`, {
      guard: 'plan-file',
      nextAction: `Use "${label}": [["pnpm","exec","vitest","run","..."]]`,
    });
  }
  return value.map((item) => assertSafeArgv(item));
}
