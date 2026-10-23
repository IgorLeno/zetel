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
  return exclusive(() => syncOnce(channelDir));
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Uma operação no clone por vez no processo (sync, commit e push do
 * contexto): duas chamadas concorrentes não disputam o index.lock, que o git
 * reportaria como falha de merge ou commit.
 */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

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

// ------------------------------------------------------------ contexto (RF8)

type ContextCommitStatus = 'committed' | 'unchanged' | 'error';

/**
 * Commit local de `relPath` (sempre `contexto/<slug>/CONTEXTO.md`). O commit
 * leva só esse caminho, mesmo que o Igor tenha outras alterações no índice.
 * Assinatura GPG desligada: sem TTY ela travaria ou falharia.
 */
async function commitContext(channelDir: string, relPath: string): Promise<ContextCommitStatus> {
  const add = await git(channelDir, ['add', '--', relPath]);
  if (!add.ok) return 'error';
  const diff = await git(channelDir, ['diff', '--cached', '--quiet', '--', relPath]);
  if (diff.ok) return 'unchanged';
  if (diff.exitCode !== 1) return 'error';
  const commit = await git(channelDir, [
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '--no-verify', '-m', 'zetel: atualiza contexto', '--', relPath,
  ]);
  return commit.ok ? 'committed' : 'error';
}

export type ContextPublishStatus =
  | 'ok'
  | 'not_a_repo'
  | 'nothing_to_push'
  | 'behind'
  | 'unsafe'
  | 'rejected'
  | 'error';

const CONTEXT_PATH_RE = /^contexto\/[a-z0-9]+(?:-[a-z0-9]+)*\/CONTEXTO\.md$/;

/**
 * "Publicar contexto" (D10): `fetch` do upstream; se o canal estiver à frente
 * → `behind` (buscar do canal antes), sem escrever nem commitar. Senão,
 * `writeFile()` grava o arquivo, commit local de `relPath` e push dos commits
 * locais — e só se TODOS tocarem apenas `contexto/<slug>/CONTEXTO.md`. Outro commit local do Igor (ex.: algo em `inbox/`) bloqueia
 * como `unsafe`: o Zetel nunca publica o que não gerou.
 *
 * O commit acontece aqui, e não na prévia, para que um commit local não
 * publicado não deixe o clone divergente do canal (o sync é só fast-forward).
 * Resta a janela entre commit e push: se o remoto avançar nela, o push é
 * `rejected` e o commit fica local, para o Igor resolver com o git.
 */
export async function publishContext(
  channelDir: string,
  relPath: string,
  writeFile: () => void,
): Promise<ContextPublishStatus> {
  if (!hasOwnGitDir(channelDir)) return 'not_a_repo';
  if (!CONTEXT_PATH_RE.test(relPath)) return 'error';

  const branch = await git(channelDir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch.ok) return 'error';
  const name = branch.stdout.trim();
  const remote = await git(channelDir, ['config', '--get', `branch.${name}.remote`]);
  const merge = await git(channelDir, ['config', '--get', `branch.${name}.merge`]);
  if (!remote.ok || !merge.ok) return 'error';
  const remoteName = remote.stdout.trim();
  const mergeRef = merge.stdout.trim();
  // Viram argumentos do git: nada que pareça opção, caminho ou refspec composta.
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(remoteName)) return 'error';
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(mergeRef)) return 'error';

  const fetch = await git(channelDir, ['fetch', '--quiet', '--no-recurse-submodules', remoteName]);
  if (!fetch.ok) return 'error';
  const behind = await git(channelDir, ['rev-list', '--count', 'HEAD..@{upstream}']);
  if (!behind.ok) return 'error';
  if (Number.parseInt(behind.stdout.trim(), 10) > 0) return 'behind';

  // Só agora o arquivo vai ao clone: recusa anterior não deixa a árvore suja.
  writeFile();
  const commit = await commitContext(channelDir, relPath);
  if (commit === 'error') return 'error';

  const ahead = await git(channelDir, ['rev-list', '--count', '@{upstream}..HEAD']);
  if (!ahead.ok) return 'error';
  if (Number.parseInt(ahead.stdout.trim(), 10) === 0) return 'nothing_to_push';

  const files = await git(channelDir, ['log', '--format=', '--name-only', '--no-renames', '@{upstream}..HEAD']);
  if (!files.ok) return 'error';
  const touched = files.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  // Só arquivos que o Zetel gera (`contexto/<slug>/CONTEXTO.md`); qualquer outro bloqueia.
  if (touched.length === 0 || touched.some((path) => !CONTEXT_PATH_RE.test(path))) return 'unsafe';

  const push = await git(channelDir, ['push', '--quiet', '--no-recurse-submodules', remoteName, `HEAD:${mergeRef}`]);
  // Exit 1 = recusado pelo remoto (avançou, branch protegida); 128/sem exit = rede, acesso, timeout.
  if (!push.ok) return push.exitCode === 1 ? 'rejected' : 'error';
  return 'ok';
}
