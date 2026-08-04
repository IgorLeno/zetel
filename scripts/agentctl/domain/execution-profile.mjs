import { StateMachineError } from './state-machine.mjs';

export const EXECUTION_PROFILES = Object.freeze(['FAST', 'STANDARD', 'FULL']);

const PROFILE_RANK = Object.freeze({
  FAST: 1,
  STANDARD: 2,
  FULL: 3,
});

const REVIEW_LIMITS = Object.freeze({
  FAST: Object.freeze([0]),
  STANDARD: Object.freeze([0, 1]),
  FULL: Object.freeze([0, 1, 2]),
});

/**
 * @param {unknown} value
 * @returns {value is 'FAST'|'STANDARD'|'FULL'}
 */
export function isExecutionProfile(value) {
  return typeof value === 'string' && EXECUTION_PROFILES.includes(/** @type {string} */ (value));
}

/**
 * @param {'FAST'|'STANDARD'|'FULL'} profile
 */
export function profileRank(profile) {
  return PROFILE_RANK[profile];
}

/**
 * @param {'FAST'|'STANDARD'|'FULL'} profile
 * @param {number} reviews
 * @param {string | null | undefined} reviewJustification
 */
export function assertReviewsAllowed(profile, reviews, reviewJustification) {
  if (!isExecutionProfile(profile)) {
    throw new StateMachineError(`Perfil invalido: ${String(profile)}.`, {
      guard: 'profile',
      nextAction: 'Use FAST, STANDARD ou FULL.',
    });
  }
  if (!Number.isFinite(reviews) || !Number.isInteger(reviews) || reviews < 0) {
    throw new StateMachineError('reviews deve ser inteiro nao negativo.', {
      guard: 'reviews',
      nextAction: 'Informe --reviews 0, 1 ou 2 conforme o perfil.',
    });
  }
  const allowed = REVIEW_LIMITS[profile];
  if (!allowed.includes(reviews)) {
    throw new StateMachineError(
      `Perfil ${profile} nao permite ${reviews} review(s).`,
      {
        guard: 'reviews',
        nextAction: `Use --reviews ${allowed.join('|')} para ${profile}.`,
      },
    );
  }
  if (profile === 'FULL' && reviews < 2) {
    if (typeof reviewJustification !== 'string' || reviewJustification.trim() === '') {
      throw new StateMachineError(
        'FULL com menos de 2 reviews exige --review-justification.',
        {
          guard: 'review-justification',
          nextAction: 'Justifique zero ou uma revisao, ou use --reviews 2.',
        },
      );
    }
  }
}

/**
 * @param {{
 *   current: string | null | undefined,
 *   next: 'FAST'|'STANDARD'|'FULL',
 *   agent: string,
 *   elevatedByAgent?: string | null,
 *   profileApprovedBy?: string | null,
 *   justification: string,
 * }} input
 */
export function resolveProfileChange(input) {
  const { current, next, agent, elevatedByAgent, profileApprovedBy, justification } = input;
  if (!isExecutionProfile(next)) {
    throw new StateMachineError(`Perfil invalido: ${String(next)}.`, {
      guard: 'profile',
      nextAction: 'Use --profile FAST, STANDARD ou FULL.',
    });
  }
  if (typeof justification !== 'string' || justification.trim() === '') {
    throw new StateMachineError('Justificativa de perfil obrigatoria.', {
      guard: 'profile-justification',
      nextAction: 'Informe --justification com o motivo do perfil.',
    });
  }

  if (current == null || current === '') {
    return {
      profile: next,
      kind: 'initial',
      elevatedByAgent: null,
      profileApprovedBy: profileApprovedBy ?? null,
    };
  }

  if (!isExecutionProfile(current)) {
    throw new StateMachineError(`Perfil registrado invalido: ${String(current)}.`, {
      guard: 'profile',
      nextAction: 'Corrija execution_profile no estado antes de reclassificar.',
    });
  }

  if (current === next) {
    return {
      profile: next,
      kind: 'unchanged',
      elevatedByAgent: elevatedByAgent ?? null,
      profileApprovedBy: profileApprovedBy ?? null,
    };
  }

  if (profileRank(next) > profileRank(current)) {
    return {
      profile: next,
      kind: 'elevate',
      elevatedByAgent: agent,
      profileApprovedBy: profileApprovedBy ?? null,
    };
  }

  // Downgrade
  if (elevatedByAgent && elevatedByAgent === agent && !profileApprovedBy) {
    throw new StateMachineError(
      'O mesmo agente nao pode desfazer autonomamente sua elevacao de perfil.',
      {
        guard: 'profile-downgrade',
        nextAction: 'Obtenha aprovacao humana e informe --profile-approved-by.',
      },
    );
  }
  if (typeof profileApprovedBy !== 'string' || profileApprovedBy.trim() === '') {
    throw new StateMachineError(
      'Downgrade de perfil exige aprovacao humana em --profile-approved-by.',
      {
        guard: 'profile-downgrade',
        nextAction: 'Informe identidade humana em --profile-approved-by e mantenha a justificativa.',
      },
    );
  }
  if (!isHumanIdentity(profileApprovedBy)) {
    throw new StateMachineError(
      'profile-approved-by deve identificar uma pessoa humana.',
      {
        guard: 'profile-downgrade',
        nextAction: 'Use uma identidade humana, nao bot/agent.',
      },
    );
  }

  return {
    profile: next,
    kind: 'downgrade',
    elevatedByAgent: null,
    profileApprovedBy: profileApprovedBy.trim(),
  };
}

/**
 * Identidade humana para downgrade/waiver.
 * Aceita nomes completos, handles e marcadores versionados `human-*`.
 * Rejeita apenas marcadores inequivocamente automatizados para evitar falso
 * positivo em nomes humanos legítimos.
 * @param {string} value
 */
export function isHumanIdentity(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (/^(bot|agent)$/i.test(trimmed)) return false;
  if (/\[bot\]$/i.test(trimmed)) return false;
  if (/^(ci-bot|dependabot|renovate|github-actions)(\b|[[_\-])/i.test(trimmed)) return false;
  return true;
}

/**
 * @typedef {{
 *   category: string,
 *   argv: string[],
 *   optional?: boolean,
 * }} GateCommand
 */

/**
 * @param {{
 *   profile: 'FAST'|'STANDARD'|'FULL',
 *   focused: GateCommand[],
 *   relatedIntegrations?: GateCommand[],
 *   requireTestCi?: boolean,
 *   typescriptAffected?: boolean,
 * }} input
 * @returns {GateCommand[]}
 */
export function buildGatePlan(input) {
  const focused = input.focused ?? [];
  const related = input.relatedIntegrations ?? [];
  /** @type {GateCommand[]} */
  const plan = [];

  if (input.profile === 'FAST') {
    if (focused.length === 0) {
      throw new StateMachineError(
        'FAST exige pelo menos uma verificacao focada ou estatica declarada.',
        {
          guard: 'gate-plan',
          nextAction: 'Declare --focused-json com um comando estruturado.',
        },
      );
    }
    plan.push(...focused.map((item) => ({ ...item, category: item.category || 'focused' })));
    plan.push({ category: 'diff-check', argv: ['git', 'diff', '--check'] });
    assertNoLiveE2E(plan);
    return plan;
  }

  if (focused.length === 0) {
    throw new StateMachineError(
      `${input.profile} exige testes focados declarados.`,
      {
        guard: 'gate-plan',
        nextAction: 'Declare --focused-json com os testes focados.',
      },
    );
  }
  plan.push(...focused.map((item) => ({ ...item, category: item.category || 'focused' })));
  for (const item of related) {
    plan.push({ ...item, category: item.category || 'integration' });
  }

  if (input.profile === 'STANDARD') {
    if (input.typescriptAffected) {
      plan.push({ category: 'typecheck', argv: ['pnpm', 'typecheck'] });
    }
    if (input.requireTestCi) {
      plan.push({ category: 'test-ci', argv: ['pnpm', 'test:ci'] });
    }
    plan.push({ category: 'diff-check', argv: ['git', 'diff', '--check'] });
    assertNoLiveE2E(plan);
    return plan;
  }

  // FULL
  plan.push({ category: 'build', argv: ['pnpm', 'build'] });
  plan.push({ category: 'test-ci', argv: ['pnpm', 'test:ci'] });
  plan.push({ category: 'coverage', argv: ['pnpm', 'test:coverage'] });
  plan.push({ category: 'typecheck', argv: ['pnpm', 'typecheck'] });
  plan.push({ category: 'diff-check', argv: ['git', 'diff', '--check'] });
  assertNoLiveE2E(plan);
  return plan;
}

/**
 * @param {GateCommand[]} plan
 */
function assertNoLiveE2E(plan) {
  for (const command of plan) {
    const joined = command.argv.join(' ').toLowerCase();
    if (
      command.argv.includes('test:e2e:live')
      || joined.includes('e2e:live')
      || joined.includes('openrouter')
    ) {
      throw new StateMachineError(
        'E2E live/OpenRouter nao pode entrar no plano de validacao do agentctl.',
        {
          guard: 'e2e-live',
          nextAction: 'Remova comandos live/OpenRouter do plano estruturado.',
        },
      );
    }
  }
}
