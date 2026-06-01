/**
 * Utilitários de isolamento para integration tests.
 *
 * Invariantes:
 * - Nenhuma função aqui importa ou usa o singleton de DB (getDb é exclusivo do app).
 * - HOME não é alterado; tests injetam db e vaultPath diretamente.
 * - O vault temporário é criado em tmpdir() e limpo no afterEach do chamador.
 */
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addFile } from '@/lib/ingestao-service';
import { runMigrations } from '@/lib/migrate';
import { createZetel } from '@/lib/zetel-service';

export interface TempEnv {
  db: Database.Database;
  vaultPath: string;
}

export function makeTempEnv(): TempEnv {
  const db = new Database(':memory:');
  runMigrations(db);
  const vaultPath = join(
    tmpdir(),
    `zetel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(vaultPath, { recursive: true });
  return { db, vaultPath };
}

export function cleanupTempEnv({ db, vaultPath }: TempEnv): void {
  db.close();
  try {
    rmSync(vaultPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export interface SeededZetel {
  zetelId: string;
  slug: string;
  fileId: string;
}

const DEFAULT_MD =
  '# Transformada de Fourier\n\n' +
  'A Transformada de Fourier decompõe uma função em componentes de frequência.\n\n' +
  '## Definição\n\n' +
  'Dado $f(t)$, sua transformada é $F(\\omega)=\\int_{-\\infty}^{\\infty}f(t)e^{-i\\omega t}\\,dt$.\n\n' +
  '## Propriedades\n\n' +
  'A transformada é linear e invertível.\n';

/**
 * Cria um zetel com um arquivo Markdown usando as funções de serviço reais.
 * Escreve o conteúdo em um arquivo temporário e usa addFile para copiá-lo ao vault,
 * garantindo que a estrutura de pastas do vault esteja correta.
 *
 * Nota: processZetel chama getSetting/setSetting — o arquivo de teste que chamar
 * processZetel deve mockar @/lib/settings.
 */
export function seedZetelWithFile(
  db: Database.Database,
  vaultPath: string,
  opts: {
    displayName?: string;
    content?: string;
    filename?: string;
  } = {},
): SeededZetel {
  const { displayName = 'Teste', content = DEFAULT_MD, filename = 'doc.md' } = opts;

  const zetel = createZetel(db, vaultPath, displayName);

  const srcDir = join(tmpdir(), `zetel-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(srcDir, { recursive: true });
  const srcPath = join(srcDir, filename);
  writeFileSync(srcPath, content, 'utf8');

  let fileId: string;
  try {
    const file = addFile(db, vaultPath, zetel.id, srcPath);
    fileId = file.id;
  } finally {
    try {
      rmSync(srcDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  return { zetelId: zetel.id, slug: zetel.slug, fileId };
}
