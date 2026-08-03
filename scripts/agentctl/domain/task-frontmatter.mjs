import { readFileSync, writeFileSync } from 'node:fs';
import { StateMachineError } from './state-machine.mjs';

/**
 * Atualiza apenas campos operacionais do frontmatter da tarefa.
 * @param {string} taskFile
 * @param {Record<string, string | number | null | undefined>} fields
 */
export function updateOperationalFrontmatter(taskFile, fields) {
  let raw;
  try {
    raw = readFileSync(taskFile, 'utf8');
  } catch (error) {
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

  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {string[]} */
  const order = [];
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    if (!values.has(match[1])) order.push(match[1]);
    values.set(match[1], match[2]);
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const rendered = renderFrontmatterValue(value);
    values.set(key, rendered);
    if (!order.includes(key)) order.push(key);
  }

  const front = order.map((key) => `${key}: ${values.get(key)}`);
  const updated = ['---', ...front, '---', ...lines.slice(end + 1)].join('\n').replace(/\n*$/, '\n');
  writeFileSync(taskFile, updated, 'utf8');
  return updated;
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
