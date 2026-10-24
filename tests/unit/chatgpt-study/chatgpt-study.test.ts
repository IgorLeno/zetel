import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOpeningMessage,
  buildProjectInstruction,
  CHATGPT_URL,
  PROJECT_INSTRUCTION_TEMPLATE,
  SLUG_PLACEHOLDER,
} from '@/lib/chatgpt-study';

/** Bloco entre as duas linhas `=====` do documento que o Igor também lê. */
function instructionBlockFromDoc(): string {
  const lines = readFileSync(join(process.cwd(), 'docs/CHATGPT_REPORT_TEMPLATE.md'), 'utf8').split('\n');
  const start = lines.indexOf('=====');
  const end = lines.indexOf('=====', start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return lines.slice(start + 1, end).join('\n');
}

describe('Estudar com o ChatGPT — textos copiados', () => {
  it('mantém a instrução idêntica ao bloco de docs/CHATGPT_REPORT_TEMPLATE.md', () => {
    expect(PROJECT_INSTRUCTION_TEMPLATE).toBe(instructionBlockFromDoc());
    expect(PROJECT_INSTRUCTION_TEMPLATE).toContain(SLUG_PLACEHOLDER);
  });

  it('troca o marcador pelo slug deste Zetel na instrução do Project', () => {
    const text = buildProjectInstruction('termodinamica-ii');
    expect(text).not.toContain(SLUG_PLACEHOLDER);
    expect(text).toContain('`zetel: termodinamica-ii`');
    expect(text).toBe(instructionBlockFromDoc().replaceAll(SLUG_PLACEHOLDER, 'termodinamica-ii'));
    expect(text.startsWith('Você é minha parceira de estudos.')).toBe(true);
    expect(text).not.toContain('=====');
  });

  it('pede na abertura a leitura de contexto/<slug>/CONTEXTO.md do canal', () => {
    const text = buildOpeningMessage('calculo-1');
    expect(text).toContain('contexto/calculo-1/CONTEXTO.md');
    expect(text).toContain('repositório do canal');
    expect(text).not.toContain(SLUG_PLACEHOLDER);
  });

  it('abre o ChatGPT pela URL oficial', () => {
    expect(CHATGPT_URL).toBe('https://chatgpt.com/');
  });
});
