/**
 * Context-pack minimo para a proxima sessao (R12).
 *
 * O pack e montado sempre em memoria e so e materializado na area runtime
 * ignorada pelo Git. Ele contem exclusivamente os itens autorizados pela SPEC:
 * instrucoes reduzidas, contexto tecnico minimo, resumo da spec, arquivo da
 * proxima tarefa, gates, handoff imediatamente anterior, estado Git e ADRs
 * diretamente relacionados quando existirem. Nunca inclui transcript, conversa,
 * tarefas concluidas, todos os handoffs, todas as skills ou diff historico.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { StateMachineError } from './state-machine.mjs';
import { assertTokenBudget, estimateTokens, TOKEN_ESTIMATE_VERSION } from './token-budget.mjs';

export const CONTEXT_PACK_SCHEMA_VERSION = 1;

export const CONTEXT_BUDGETS = Object.freeze({
  summary: 800,
  task: 1500,
  handoff: 800,
  maxFullSkills: 3,
});

/**
 * Valida contencao de caminho antes de qualquer leitura.
 * Rejeita caminho absoluto, `..`, symlink (em qualquer componente), diretorio,
 * arquivo especial e qualquer alvo fora do root Git.
 *
 * @param {string} root
 * @param {string} relPath
 * @returns {string} caminho absoluto seguro
 */
export function assertContainedRegularFile(root, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new StateMachineError('Caminho de context-pack invalido.', {
      guard: 'context-pack-path',
      nextAction: 'Use caminhos relativos ao root Git.',
    });
  }
  if (relPath.includes('\0')) {
    throw new StateMachineError('Caminho de context-pack contem NUL.', {
      guard: 'context-pack-path',
      nextAction: 'Remova caracteres de controle do caminho.',
    });
  }
  if (isAbsolute(relPath)) {
    throw new StateMachineError(`Caminho absoluto rejeitado no context-pack: ${relPath}.`, {
      guard: 'context-pack-path',
      nextAction: 'Declare o arquivo como caminho relativo ao root Git.',
    });
  }
  const segments = relPath.split(/[\\/]/);
  if (segments.some((segment) => segment === '..')) {
    throw new StateMachineError(`Travessia de diretorio rejeitada: ${relPath}.`, {
      guard: 'context-pack-path',
      nextAction: 'Remova segmentos `..` do caminho declarado.',
    });
  }

  const absolute = join(root, relPath);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new StateMachineError(`Arquivo fora do root Git: ${relPath}.`, {
      guard: 'context-pack-path',
      nextAction: 'Inclua no context-pack somente arquivos dentro do repositorio.',
    });
  }

  // Cada componente intermediario tambem precisa ser real (nao symlink).
  let cursor = root;
  for (const segment of rel.split(sep)) {
    if (!segment) continue;
    cursor = join(cursor, segment);
    let stats;
    try {
      stats = lstatSync(cursor);
    } catch {
      throw new StateMachineError(`Arquivo do context-pack ausente: ${relPath}.`, {
        guard: 'context-pack-missing',
        nextAction: 'Restaure o arquivo ou remova-o da lista do context-pack.',
      });
    }
    if (stats.isSymbolicLink()) {
      throw new StateMachineError(`Symlink rejeitado no context-pack: ${relPath}.`, {
        guard: 'context-pack-path',
        nextAction: 'Inclua somente arquivos regulares reais do repositorio.',
      });
    }
  }

  const finalStats = lstatSync(absolute);
  if (!finalStats.isFile()) {
    throw new StateMachineError(`Arquivo nao regular rejeitado no context-pack: ${relPath}.`, {
      guard: 'context-pack-path',
      nextAction: 'Inclua somente arquivos regulares no context-pack.',
    });
  }
  return absolute;
}

/**
 * @param {string} root
 * @param {string} relPath
 */
export function readContainedFile(root, relPath) {
  return readFileSync(assertContainedRegularFile(root, relPath), 'utf8');
}

/** @param {string} value */
function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * @param {{ name: string, reason: string, content: string, source: string | null, budget?: number }} entry
 */
function toPackFile(entry) {
  const estimated = entry.budget
    ? assertTokenBudget(entry.content, entry.budget, {
      label: entry.name,
      guard: 'context-pack-budget',
      nextAction: `Reduza ${entry.source ?? entry.name} para no maximo ${entry.budget} tokens estimados.`,
    })
    : estimateTokens(entry.content);
  return {
    name: entry.name,
    source: entry.source,
    reason: entry.reason,
    bytes: Buffer.byteLength(entry.content, 'utf8'),
    estimated_tokens: estimated,
    sha256: sha256(entry.content),
    content: entry.content,
  };
}

/**
 * ADRs diretamente relacionados: incluidos apenas quando existirem no diretorio
 * canonico e forem referenciados pelo arquivo da proxima tarefa.
 *
 * @param {string} root
 * @param {string} taskContent
 */
export function selectRelatedAdrs(root, taskContent) {
  const adrDir = 'docs/adr';
  const absolute = join(root, adrDir);
  if (!existsSync(absolute)) return [];
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${adrDir}/${entry.name}`)
    .filter((relPath) => taskContent.includes(relPath) || taskContent.includes(relPath.split('/').pop() ?? ''))
    .sort();
}

/**
 * @typedef {{
 *   specId: string,
 *   nextTaskId: string,
 *   nextTaskTitle: string,
 *   expectedWriter: string,
 *   taskRelPath: string,
 *   summaryRelPath: string,
 *   handoffRelPath: string,
 *   instructionsRelPaths: string[],
 *   gatesRelPath: string,
 *   git: { branch: string, head: string, upstreamRef: string, deliveryCommit: string },
 *   skills?: string[],
 * }} ContextPackInput
 */

/**
 * Monta o context-pack em memoria. Nao escreve nada.
 *
 * @param {string} root
 * @param {ContextPackInput} input
 */
export function buildContextPack(root, input) {
  const skills = input.skills ?? [];
  if (skills.length > CONTEXT_BUDGETS.maxFullSkills) {
    throw new StateMachineError(
      `Context-pack aceita no maximo ${CONTEXT_BUDGETS.maxFullSkills} skills completas (${skills.length} declaradas).`,
      {
        guard: 'context-pack-budget',
        nextAction: 'Reduza a lista de skills completas do pack.',
      },
    );
  }

  /** @type {ReturnType<typeof toPackFile>[]} */
  const files = [];

  const taskContent = readContainedFile(root, input.taskRelPath);
  const summaryContent = readContainedFile(root, input.summaryRelPath);
  const handoffContent = readContainedFile(root, input.handoffRelPath);

  files.push(toPackFile({
    name: 'INSTRUCTIONS.md',
    source: null,
    reason: 'instrucoes reduzidas da sessao nova, sem transcript e sem retomada',
    content: renderInstructions(input),
  }));

  for (const relPath of input.instructionsRelPaths) {
    files.push(toPackFile({
      name: relPath.split('/').pop() ?? relPath,
      source: relPath,
      reason: 'contexto tecnico minimo do projeto',
      content: readContainedFile(root, relPath),
    }));
  }

  files.push(toPackFile({
    name: 'SPEC-SUMMARY.md',
    source: input.summaryRelPath,
    reason: 'resumo da spec aprovada',
    content: summaryContent,
    budget: CONTEXT_BUDGETS.summary,
  }));

  files.push(toPackFile({
    name: 'TASK.md',
    source: input.taskRelPath,
    reason: 'arquivo da proxima tarefa, com criterios de aceitacao',
    content: taskContent,
    budget: CONTEXT_BUDGETS.task,
  }));

  files.push(toPackFile({
    name: 'QUALITY.md',
    source: input.gatesRelPath,
    reason: 'gates aplicaveis a proxima tarefa',
    content: readContainedFile(root, input.gatesRelPath),
  }));

  files.push(toPackFile({
    name: 'HANDOFF.md',
    source: input.handoffRelPath,
    reason: 'handoff imediatamente anterior',
    content: handoffContent,
    budget: CONTEXT_BUDGETS.handoff,
  }));

  files.push(toPackFile({
    name: 'GIT.md',
    source: null,
    reason: 'estado Git, branch, SHA e comandos necessarios',
    content: renderGitState(input),
  }));

  for (const relPath of selectRelatedAdrs(root, taskContent)) {
    files.push(toPackFile({
      name: relPath.split('/').pop() ?? relPath,
      source: relPath,
      reason: 'ADR diretamente referenciado pela proxima tarefa',
      content: readContainedFile(root, relPath),
    }));
  }

  for (const relPath of skills) {
    files.push(toPackFile({
      name: relPath.split('/').pop() ?? relPath,
      source: relPath,
      reason: 'skill completa autorizada para a proxima tarefa',
      content: readContainedFile(root, relPath),
    }));
  }

  assertUniqueSafeNames(files);

  const manifest = {
    schema_version: CONTEXT_PACK_SCHEMA_VERSION,
    token_estimate_version: TOKEN_ESTIMATE_VERSION,
    spec_id: input.specId,
    selected_task: input.nextTaskId,
    selected_task_title: input.nextTaskTitle,
    expected_writer: input.expectedWriter,
    git: {
      branch: input.git.branch,
      head: input.git.head,
      upstream: input.git.upstreamRef,
      delivery_commit: input.git.deliveryCommit,
    },
    handoff_used: input.handoffRelPath,
    budgets: {
      summary: CONTEXT_BUDGETS.summary,
      task: CONTEXT_BUDGETS.task,
      handoff: CONTEXT_BUDGETS.handoff,
      max_full_skills: CONTEXT_BUDGETS.maxFullSkills,
    },
    files: files.map((file) => ({
      name: file.name,
      source: file.source,
      reason: file.reason,
      bytes: file.bytes,
      estimated_tokens: file.estimated_tokens,
      sha256: file.sha256,
    })),
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    total_estimated_tokens: files.reduce((sum, file) => sum + file.estimated_tokens, 0),
  };

  return { manifest, files };
}

/**
 * Nomes do pack sao basenames unicos: nada de subdiretorio, `..` ou colisao.
 * @param {{ name: string }[]} files
 */
function assertUniqueSafeNames(files) {
  const seen = new Set();
  for (const file of files) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file.name) || file.name.includes('..')) {
      throw new StateMachineError(`Nome invalido no context-pack: ${file.name}.`, {
        guard: 'context-pack-path',
        nextAction: 'Use basenames simples nos arquivos do context-pack.',
      });
    }
    if (seen.has(file.name)) {
      throw new StateMachineError(`Nome duplicado no context-pack: ${file.name}.`, {
        guard: 'context-pack-path',
        nextAction: 'Renomeie ou remova o arquivo duplicado do context-pack.',
      });
    }
    seen.add(file.name);
  }
}

/**
 * Materializa o pack na area runtime ignorada pelo Git.
 *
 * A escrita e feita em diretorio temporario irmao e publicada por `rename`, de
 * modo que o destino final contenha exatamente a allowlist do manifest: nenhum
 * arquivo antigo sobrevive ao lado do pack novo e uma falha no meio nao deixa
 * pack parcial. Todo componente do caminho de destino e verificado contra
 * symlink antes da publicacao, para que o pack nunca escreva fora do root.
 *
 * Deterministico e idempotente para o mesmo HEAD: o conteudo nao carrega
 * timestamps.
 *
 * @param {string} root
 * @param {string} packRelDir
 * @param {{ manifest: Record<string, unknown>, files: { name: string, content: string }[] }} pack
 * @param {string} prompt
 */
export function writeContextPack(root, packRelDir, pack, prompt) {
  const packDir = assertContainedDirectoryTarget(root, packRelDir);
  const staging = `${packDir}.staging.${process.pid}.${randomBytes(4).toString('hex')}`;
  try {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    for (const file of pack.files) {
      writeTextAtomic(join(staging, file.name), file.content);
    }
    writeTextAtomic(join(staging, 'PROMPT.txt'), `${prompt}\n`);
    writeTextAtomic(join(staging, 'MANIFEST.json'), `${JSON.stringify(pack.manifest, null, 2)}\n`);
    rmSync(packDir, { recursive: true, force: true });
    renameSync(staging, packDir);
  } catch (error) {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
    throw error;
  }
  return packDir;
}

/**
 * Valida o destino do pack: relativo ao root, sem `..`, sem componente symlink
 * e sem entrada final nao-diretorio. Componentes inexistentes sao criados.
 *
 * @param {string} root
 * @param {string} relDir
 */
export function assertContainedDirectoryTarget(root, relDir) {
  if (typeof relDir !== 'string' || relDir.length === 0 || isAbsolute(relDir)) {
    throw new StateMachineError(`Destino de context-pack invalido: ${String(relDir)}.`, {
      guard: 'context-pack-path',
      nextAction: 'Use um caminho relativo ao root Git para o context-pack.',
    });
  }
  const segments = relDir.split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment === '..')) {
    throw new StateMachineError(`Travessia de diretorio rejeitada no destino: ${relDir}.`, {
      guard: 'context-pack-path',
      nextAction: 'Remova segmentos `..` do destino do context-pack.',
    });
  }

  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    let stats = null;
    try {
      stats = lstatSync(cursor);
    } catch {
      stats = null;
    }
    if (stats?.isSymbolicLink()) {
      throw new StateMachineError(`Symlink rejeitado no destino do context-pack: ${relDir}.`, {
        guard: 'context-pack-path',
        nextAction: 'Remova o symlink da area runtime antes de gerar o context-pack.',
      });
    }
    if (stats && !stats.isDirectory()) {
      throw new StateMachineError(
        `Componente nao-diretorio no destino do context-pack: ${relDir}.`,
        {
          guard: 'context-pack-path',
          nextAction: 'Libere o caminho runtime antes de gerar o context-pack.',
        },
      );
    }
    if (!stats) mkdirSync(cursor, { recursive: false });
  }
  return cursor;
}

/**
 * @param {ContextPackInput} input
 */
function renderInstructions(input) {
  return [
    `# Sessao nova — ${input.specId} tarefa ${input.nextTaskId}`,
    '',
    `Writer esperado: ${input.expectedWriter}.`,
    '',
    '- Recupere o contexto somente por este context-pack, pelo Git e pelo',
    '  `state.json`; nao ha transcript nem sessao anterior a retomar.',
    '- Confirme Git e estado antes de escrever qualquer arquivo.',
    `- Execute exatamente a tarefa ${input.nextTaskId}, iniciando por`,
    `  \`./agentctl task start ${input.specId} ${input.nextTaskId}\`.`,
    '- Nao reabra a tarefa anterior e nao inicie uma segunda tarefa.',
    '- Pare apos o fechamento da sessao.',
    '',
  ].join('\n');
}

/**
 * @param {ContextPackInput} input
 */
function renderGitState(input) {
  return [
    '# Estado Git',
    '',
    `- Branch: ${input.git.branch}`,
    `- HEAD: ${input.git.head}`,
    `- Upstream: ${input.git.upstreamRef}`,
    `- Commit de entrega anterior: ${input.git.deliveryCommit}`,
    '',
    '## Comandos',
    '',
    '```bash',
    'git status --short --branch',
    `./agentctl spec status ${input.specId}`,
    `./agentctl task next ${input.specId}`,
    `./agentctl task start ${input.specId} ${input.nextTaskId} --agent ${input.expectedWriter} \\`,
    '  --profile <FAST|STANDARD|FULL> --justification "<texto>"',
    '```',
    '',
  ].join('\n');
}
