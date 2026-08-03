import { readFileSync, writeFileSync } from 'node:fs';
import { StateMachineError } from './state-machine.mjs';

/**
 * Atualiza apenas campos operacionais do frontmatter, preservando em posicao
 * comentarios, linhas vazias, listas em bloco, mapas aninhados e chaves
 * desconhecidas. Nao depende de parser YAML externo.
 * @param {string} taskFile
 * @param {Record<string, string | number | null | undefined>} fields
 */
export function updateOperationalFrontmatter(taskFile, fields) {
  let raw;
  try {
    raw = readFileSync(taskFile, 'utf8');
  } catch {
    throw new StateMachineError(`Arquivo de tarefa ausente: ${taskFile}.`, {
      guard: 'task-file',
      nextAction: 'Crie o arquivo individual da tarefa antes de atualizar o frontmatter.',
    });
  }

  const normalized = raw.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== '---') {
    throw new StateMachineError('Frontmatter ausente no arquivo da tarefa.', {
      guard: 'task-file',
      nextAction: 'Adicione frontmatter YAML valido na tarefa.',
    });
  }
  const end = lines.indexOf('---', 1);
  if (end < 0) {
    throw new StateMachineError('Frontmatter nao fechado no arquivo da tarefa.', {
      guard: 'task-file',
      nextAction: 'Feche o bloco --- do frontmatter.',
    });
  }

  /** @type {string[]} */
  const frontLines = lines.slice(1, end);
  /** @type {Map<string, { start: number, end: number }>} */
  const rootKeys = locateRootKeys(frontLines);

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const rendered = renderFrontmatterValue(value);
    const existing = rootKeys.get(key);
    if (existing) {
      const replacement = [`${key}: ${rendered}`];
      frontLines.splice(existing.start, existing.end - existing.start, ...replacement);
      // Recalcula offsets apos mutacao.
      const refreshed = locateRootKeys(frontLines);
      rootKeys.clear();
      for (const [k, span] of refreshed) rootKeys.set(k, span);
    } else {
      frontLines.push(`${key}: ${rendered}`);
      rootKeys.set(key, { start: frontLines.length - 1, end: frontLines.length });
    }
  }

  const updated = ['---', ...frontLines, '---', ...lines.slice(end + 1)].join('\n').replace(/\n*$/, '\n');
  writeFileSync(taskFile, updated, 'utf8');
  return updated;
}

/**
 * Localiza spans de chaves de nivel raiz (inclui linhas de continuacao do valor).
 * @param {string[]} frontLines
 * @returns {Map<string, { start: number, end: number }>}
 */
function locateRootKeys(frontLines) {
  /** @type {Map<string, { start: number, end: number }>} */
  const keys = new Map();
  for (let index = 0; index < frontLines.length; index += 1) {
    const line = frontLines[index];
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let end = index + 1;
    while (end < frontLines.length) {
      const next = frontLines[end];
      // Continuacao: indentada, ou lista/bloco pertencente ao valor atual.
      if (/^[ \t]/.test(next) || next === '') {
        // Linha vazia so conta se a seguinte continuar indentada ou for fim.
        if (next === '') {
          const peek = frontLines[end + 1];
          if (peek == null || /^[ \t]/.test(peek) || peek === '') {
            end += 1;
            continue;
          }
          break;
        }
        end += 1;
        continue;
      }
      break;
    }
    keys.set(key, { start: index, end });
  }
  return keys;
}

/**
 * @param {string | number | null} value
 */
function renderFrontmatterValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  if (/^[A-Za-z0-9._/-]+$/.test(value) && !value.includes(' ')) return value;
  return JSON.stringify(value);
}
