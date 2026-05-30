import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { logger } from './logger';
import { SUGESTAO_NOTA_PROMPT } from './notes-service';
import { SUGESTAO_MEMORIA_PROMPT } from './memory-service';
import { PARCEIRO_PROMPT } from './chat-prompt';

/**
 * Inicialização e validação do vault (§13.2).
 *
 * O vault é a fonte de verdade canônica (Markdown). Validamos antes de salvar
 * para não apontar o app para um diretório inválido ou perigoso (a raiz `/`,
 * ou dentro do próprio código-fonte).
 */

export type VaultValidation = { ok: true; path: string } | { ok: false; error: string };

const PROMPT_PLACEHOLDERS: Record<string, string> = {
  'parceiro.md': PARCEIRO_PROMPT, // prompt real desde o Módulo 8 (antes: placeholder)
  'sugestao-nota.md': SUGESTAO_NOTA_PROMPT,
  'sugestao-memoria.md': SUGESTAO_MEMORIA_PROMPT,
};

/** Sobe na árvore até o primeiro ancestral existente. */
function nearestExistingAncestor(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = resolve(current, '..');
    if (parent === current) return current; // chegou na raiz
    current = parent;
  }
  return current;
}

export function validateVaultPath(input: string): VaultValidation {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: 'Informe o caminho do vault.' };
  }
  if (!isAbsolute(raw)) {
    return { ok: false, error: 'O caminho do vault deve ser absoluto (ex.: /home/voce/MeuVault).' };
  }

  const path = resolve(raw);

  if (path === resolve('/')) {
    return { ok: false, error: 'O vault não pode ser a raiz do sistema de arquivos (/).' };
  }

  const projectDir = resolve(process.cwd());
  if (path === projectDir || path.startsWith(projectDir + sep)) {
    return {
      ok: false,
      error: 'O vault não pode ficar dentro do diretório do projeto (mantenha o conteúdo separado do código-fonte).',
    };
  }

  if (existsSync(path)) {
    if (!statSync(path).isDirectory()) {
      return { ok: false, error: 'O caminho informado existe, mas não é um diretório.' };
    }
    try {
      accessSync(path, constants.W_OK);
    } catch {
      return { ok: false, error: 'O diretório do vault existe, mas não é gravável pelo aplicativo.' };
    }
    return { ok: true, path };
  }

  // Não existe: precisa ser criável — o ancestral mais próximo deve ser gravável.
  const ancestor = nearestExistingAncestor(path);
  try {
    accessSync(ancestor, constants.W_OK);
  } catch {
    return {
      ok: false,
      error: `Não é possível criar o vault: o diretório "${ancestor}" não é gravável.`,
    };
  }
  return { ok: true, path };
}

/** Cria a estrutura de pastas do vault (§13.2) se ainda não existir. Idempotente. */
export function initVaultStructure(path: string): void {
  const dirs = [
    join(path, 'zetels', '.lixeira'),
    join(path, 'parceiro', 'memoria'),
    join(path, 'config', 'prompts'),
    join(path, 'sistema'),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  const promptsDir = join(path, 'config', 'prompts');
  for (const [name, content] of Object.entries(PROMPT_PLACEHOLDERS)) {
    const file = join(promptsDir, name);
    if (!existsSync(file)) writeFileSync(file, content);
  }

  logger.info('vault structure initialized');
}
