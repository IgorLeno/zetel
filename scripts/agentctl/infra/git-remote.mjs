import { spawnSync } from 'node:child_process';
import { StateMachineError } from '../domain/state-machine.mjs';

const GIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const DEFAULT_GIT_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Executa git com argv estruturado, sem shell, a partir do root do repositorio.
 * Nao interpreta a saida; apenas normaliza o resultado.
 *
 * @param {string} root
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 */
export function runGit(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
  });
  if (result.error) {
    throw new StateMachineError(
      `Falha ao executar git ${args[0]}: ${result.error.message}.`,
      {
        guard: 'git-exec',
        nextAction: 'Verifique se o binario git esta no PATH e se o root e acessivel.',
      },
    );
  }
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

/**
 * @param {string} root
 * @param {string[]} args
 * @param {{ guard: string, nextAction: string }} meta
 */
export function gitOrThrow(root, args, meta) {
  const result = runGit(root, args);
  if (result.status !== 0) {
    throw new StateMachineError(
      `git ${args.join(' ')} falhou (exit ${result.status}): ${result.stderr.trim() || result.stdout.trim()}`,
      meta,
    );
  }
  return result.stdout;
}

/**
 * Entradas de `git status --porcelain=v1 -z -uall`, incluindo untracked e ambos
 * os lados de rename/copy. Caminhos vem relativos ao root, com separador `/`.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function listWorkingTreeChanges(root) {
  const raw = gitOrThrow(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    guard: 'git-status',
    nextAction: 'Garanta que o comando roda dentro de um clone Git valido.',
  });
  const parts = raw.split('\0');
  /** @type {string[]} */
  const paths = [];
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path) paths.push(path);
    // Rename/copy gravam o caminho de origem no registro NUL seguinte.
    if (code.startsWith('R') || code.startsWith('C')) {
      index += 1;
      const source = parts[index];
      if (source) paths.push(source);
    }
  }
  return paths;
}

/**
 * @param {string} root
 * @param {{ guard?: string }} [options]
 */
export function assertCleanWorkingTree(root, options = {}) {
  const changes = listWorkingTreeChanges(root);
  if (changes.length > 0) {
    throw new StateMachineError(
      `Working tree suja: ${changes.slice(0, 10).join(', ')}${changes.length > 10 ? ', ...' : ''}.`,
      {
        guard: options.guard ?? 'dirty-tree',
        nextAction: 'Commite ou guarde as alteracoes pendentes antes de fechar a sessao.',
      },
    );
  }
}

/**
 * @param {string} root
 * @param {string} rev
 */
export function revParse(root, rev) {
  const result = runGit(root, ['rev-parse', '--verify', `${rev}^{commit}`]);
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return GIT_SHA.test(sha) ? sha : null;
}

/**
 * @param {string} root
 */
export function currentBranch(root) {
  const result = runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (result.status !== 0) {
    throw new StateMachineError('HEAD destacado: nenhuma branch local ativa.', {
      guard: 'detached-head',
      nextAction: 'Faca checkout da branch de trabalho antes de fechar a sessao.',
    });
  }
  return result.stdout.trim();
}

/**
 * Resolve o upstream configurado. Nunca presume `origin/<branch>`.
 *
 * @param {string} root
 * @returns {{ branch: string, upstreamRef: string, remote: string, remoteBranch: string }}
 */
export function resolveUpstream(root) {
  const branch = currentBranch(root);
  const result = runGit(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (result.status !== 0) {
    throw new StateMachineError(`Branch ${branch} nao possui upstream configurado.`, {
      guard: 'no-upstream',
      nextAction: `Publique a branch com: git push -u <remote> ${branch}.`,
    });
  }
  const upstreamRef = result.stdout.trim();
  const remote = gitOrThrow(root, ['config', '--get', `branch.${branch}.remote`], {
    guard: 'no-upstream',
    nextAction: `Configure branch.${branch}.remote antes de fechar a sessao.`,
  }).trim();
  if (!remote) {
    throw new StateMachineError(`Remote do upstream de ${branch} nao configurado.`, {
      guard: 'no-upstream',
      nextAction: `Configure branch.${branch}.remote antes de fechar a sessao.`,
    });
  }
  const prefix = `${remote}/`;
  const remoteBranch = upstreamRef.startsWith(prefix)
    ? upstreamRef.slice(prefix.length)
    : branch;
  return { branch, upstreamRef, remote, remoteBranch };
}

/**
 * Atualiza a visao local do remote antes de qualquer afirmacao de sincronia.
 *
 * @param {string} root
 * @param {{ remote: string, remoteBranch: string }} upstream
 */
export function fetchUpstream(root, upstream) {
  const result = runGit(root, ['fetch', '--quiet', upstream.remote, upstream.remoteBranch]);
  if (result.status !== 0) {
    throw new StateMachineError(
      `Falha ao atualizar a visao do remote ${upstream.remote}/${upstream.remoteBranch}: ${
        result.stderr.trim() || result.stdout.trim()
      }`,
      {
        guard: 'remote-fetch',
        nextAction:
          'Restabeleca acesso ao remote e reexecute; sem fetch bem-sucedido a sincronizacao nao pode ser afirmada.',
      },
    );
  }
}

/**
 * @param {string} root
 * @param {string} sha
 * @param {string} ref
 */
export function isAncestor(root, sha, ref) {
  const result = runGit(root, ['merge-base', '--is-ancestor', sha, ref]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new StateMachineError(
    `Falha ao comparar ${sha} com ${ref}: ${result.stderr.trim() || result.stdout.trim()}`,
    {
      guard: 'remote-compare',
      nextAction: 'Verifique se o remote foi buscado e se as referencias existem localmente.',
    },
  );
}

/**
 * @param {string} root
 * @param {string} localRef
 * @param {string} upstreamRef
 * @returns {{ ahead: number, behind: number }}
 */
export function aheadBehind(root, localRef, upstreamRef) {
  const raw = gitOrThrow(
    root,
    ['rev-list', '--left-right', '--count', `${localRef}...${upstreamRef}`],
    {
      guard: 'remote-compare',
      nextAction: 'Atualize o remote e reavalie a divergencia da branch.',
    },
  );
  const [ahead, behind] = raw.trim().split(/\s+/).map((value) => Number.parseInt(value, 10));
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw new StateMachineError(`Saida inesperada de rev-list: ${raw.trim()}`, {
      guard: 'remote-compare',
      nextAction: 'Reexecute apos confirmar que ambas as referencias existem.',
    });
  }
  return { ahead, behind };
}

/**
 * Quantidade de commits em `from..to` (exclusivo/inclusivo).
 *
 * @param {string} root
 * @param {string} from
 * @param {string} to
 */
export function countCommitsBetween(root, from, to) {
  const raw = gitOrThrow(root, ['rev-list', '--count', `${from}..${to}`], {
    guard: 'remote-compare',
    nextAction: 'Confirme que ambas as referencias existem localmente.',
  });
  const count = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(count)) {
    throw new StateMachineError(`Saida inesperada de rev-list --count: ${raw.trim()}`, {
      guard: 'remote-compare',
      nextAction: 'Reexecute apos confirmar as referencias Git.',
    });
  }
  return count;
}

/**
 * Verifica se um caminho versionado existe em um commit (prova que o commit
 * publicou o artefato, sem depender de autorreferencia de SHA).
 *
 * @param {string} root
 * @param {string} rev
 * @param {string} relPath
 */
export function pathExistsAtRev(root, rev, relPath) {
  return runGit(root, ['cat-file', '-e', `${rev}:${relPath}`]).status === 0;
}

/**
 * Adiciona ao index somente a allowlist explicita. Nunca usa `git add .`/`-A`.
 *
 * @param {string} root
 * @param {string[]} relPaths
 */
export function stageAllowlist(root, relPaths) {
  if (!Array.isArray(relPaths) || relPaths.length === 0) {
    throw new StateMachineError('Allowlist de fechamento vazia.', {
      guard: 'closing-allowlist',
      nextAction: 'Informe ao menos um arquivo de fechamento para o commit.',
    });
  }
  gitOrThrow(root, ['add', '--', ...relPaths], {
    guard: 'closing-stage',
    nextAction: 'Verifique permissoes e existencia dos arquivos de fechamento.',
  });
}

/**
 * @param {string} root
 * @param {string[]} allowlist
 */
export function assertStagedWithinAllowlist(root, allowlist) {
  const raw = gitOrThrow(root, ['diff', '--cached', '--name-only', '-z'], {
    guard: 'closing-stage',
    nextAction: 'Inspecione o index antes de criar o commit de fechamento.',
  });
  const staged = raw.split('\0').filter(Boolean);
  const allowed = new Set(allowlist);
  const extra = staged.filter((path) => !allowed.has(path));
  if (extra.length > 0) {
    throw new StateMachineError(
      `Index contem arquivos fora da allowlist de fechamento: ${extra.join(', ')}.`,
      {
        guard: 'closing-allowlist',
        nextAction: 'Remova do index os arquivos nao relacionados ao fechamento e repita.',
      },
    );
  }
  return staged;
}

/**
 * @param {string} root
 * @param {string} message
 */
export function commitStaged(root, message) {
  const result = runGit(root, ['commit', '-m', message]);
  if (result.status !== 0) {
    throw new StateMachineError(
      `Falha ao criar o commit de fechamento: ${result.stderr.trim() || result.stdout.trim()}`,
      {
        guard: 'closing-commit',
        nextAction:
          'Corrija a causa (identidade git, hook ou permissao) e reexecute session handoff; o estado ja fechado sera reaproveitado sem duplicar commit.',
      },
    );
  }
  const sha = revParse(root, 'HEAD');
  if (!sha) {
    throw new StateMachineError('Commit de fechamento criado sem SHA resolvivel.', {
      guard: 'closing-commit',
      nextAction: 'Inspecione o repositorio manualmente antes de repetir o fechamento.',
    });
  }
  return sha;
}

/**
 * Push sempre sem force.
 *
 * @param {string} root
 * @param {{ remote: string, remoteBranch: string, branch: string }} upstream
 */
export function pushBranch(root, upstream) {
  const result = runGit(root, [
    'push',
    upstream.remote,
    `${upstream.branch}:${upstream.remoteBranch}`,
  ]);
  if (result.status !== 0) {
    throw new StateMachineError(
      `Push do commit de fechamento falhou: ${result.stderr.trim() || result.stdout.trim()}`,
      {
        guard: 'closing-push',
        nextAction:
          'Restabeleca acesso ao remote e reexecute session handoff; o retry reaproveita o commit local existente e nao cria outro.',
      },
    );
  }
}
