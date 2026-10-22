import { execFile } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sincronização do clone local do canal do curador (SPEC-018 RF5/RNF1/RNF6).
 *
 * O Zetel não guarda credencial: usa o `git` do sistema, com o SSH ou o
 * credential helper que o Igor já configurou. Só `fetch` + fast-forward —
 * nunca merge, rebase ou reset. Divergência deixa HEAD e working tree como
 * estavam.
 *
 * Nada da saída do git, da URL do remoto ou de caminhos sai deste módulo:
 * o resultado é só um status e uma contagem de commits.
 */

export type ChannelSyncStatus = 'ok' | 'not_a_repo' | 'diverged' | 'error';
export type ChannelSyncResult = { status: ChannelSyncStatus; fetched: number };

export const GIT_TIMEOUT_MS = 30_000;

/**
 * Prefixo de toda chamada. O clone é do Igor, mas hooks dele (post-merge,
 * reference-transaction…) e um `core.fsmonitor` configurado no repositório
 * executariam programas a partir do servidor do Zetel; desligamos todos.
 * Submódulos ficam de fora (RNF6).
 */
const SAFE_CONFIG = [
  '-c', 'core.hooksPath=',
  '-c', 'core.fsmonitor=false',
  '-c', 'submodule.recurse=false',
];

type GitRun = { ok: true; stdout: string } | { ok: false; exitCode: number | null };

/**
 * Variáveis que fariam o git operar em outro repositório ou com config
 * injetada, ignorando `cwd` (ex.: servidor iniciado de dentro de um hook).
 * SSH/askpass ficam: são a autenticação do sistema.
 */
const REPO_REDIRECT_ENV = /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/;

function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (REPO_REDIRECT_ENV.test(key)) delete env[key];
  }
  // Sem TTY no servidor: credencial ausente falha em vez de travar.
  env.GIT_TERMINAL_PROMPT = '0';
  env.LC_ALL = 'C';
  return env;
}

function git(cwd: string, args: string[]): Promise<GitRun> {
  return new Promise((resolve) => {
    execFile(
      'git',
      [...SAFE_CONFIG, ...args],
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        windowsHide: true,
        env: gitEnv(),
      },
      (error, stdout) => {
        if (!error) return resolve({ ok: true, stdout: String(stdout) });
        // `code` é o exit code (number) ou um errno string (ENOENT, timeout).
        const code = (error as NodeJS.ErrnoException & { code?: unknown }).code;
        resolve({ ok: false, exitCode: typeof code === 'number' ? code : null });
      },
    );
  });
}

/** `.git` diretamente em `channelDir` (diretório, ou arquivo de worktree); nunca um repositório pai. */
function hasOwnGitDir(channelDir: string): boolean {
  try {
    const st = lstatSync(join(channelDir, '.git'));
    return st.isDirectory() || st.isFile();
  } catch {
    return false;
  }
}

/**
 * "Buscar do canal": `git fetch` do upstream do branch atual e
 * `git merge --ff-only`. `fetched` = commits trazidos para o branch local.
 *
 * - sem `.git` próprio → `not_a_repo` (nenhum git executado);
 * - histórico divergente ou alterações locais que o fast-forward
 *   sobrescreveria → `diverged`, clone intocado;
 * - rede, autenticação, branch sem upstream, timeout → `error` genérico.
 */
export function syncChannel(channelDir: string): Promise<ChannelSyncResult> {
  // Um sync por vez no processo: dois cliques concorrentes não disputam o
  // index.lock (que o git reportaria como falha de merge).
  const run = queue.then(() => syncOnce(channelDir));
  queue = run.catch(() => undefined);
  return run;
}

let queue: Promise<unknown> = Promise.resolve();

async function syncOnce(channelDir: string): Promise<ChannelSyncResult> {
  if (!hasOwnGitDir(channelDir)) return { status: 'not_a_repo', fetched: 0 };

  const fetch = await git(channelDir, ['fetch', '--quiet', '--no-recurse-submodules']);
  if (!fetch.ok) return { status: 'error', fetched: 0 };

  const upstream = await git(channelDir, ['rev-parse', '--verify', '--quiet', '@{upstream}']);
  if (!upstream.ok) return { status: 'error', fetched: 0 };

  const count = await git(channelDir, ['rev-list', '--count', 'HEAD..@{upstream}']);
  if (!count.ok) return { status: 'error', fetched: 0 };
  const behind = Number.parseInt(count.stdout.trim(), 10);
  if (!Number.isInteger(behind) || behind < 0) return { status: 'error', fetched: 0 };
  if (behind === 0) return { status: 'ok', fetched: 0 };

  // Checado antes do merge: com histórico divergente nem tentamos.
  const ancestor = await git(channelDir, ['merge-base', '--is-ancestor', 'HEAD', '@{upstream}']);
  if (!ancestor.ok) return { status: ancestor.exitCode === 1 ? 'diverged' : 'error', fetched: 0 };

  // Exit code do git aqui = alteração local (ex.: arquivo copiado à mão para
  // inbox/) que o fast-forward sobrescreveria; o git aborta antes de tocar HEAD
  // ou arquivos. Sem exit code (timeout, git ausente) é falha genérica.
  const merge = await git(channelDir, ['merge', '--ff-only', '--quiet', '--no-stat', '@{upstream}']);
  if (!merge.ok) return { status: merge.exitCode === null ? 'error' : 'diverged', fetched: 0 };

  return { status: 'ok', fetched: behind };
}
