import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger';
import type { Zetel } from '@/types/zetel';

/**
 * Camada de serviço do Zetel (Módulo 2): toda lógica de negócio + filesystem.
 * As rotas de API apenas chamam estas funções — nenhuma regra inline nas rotas.
 *
 * Invariantes (CLAUDE.md):
 *  - slug imutável após criação; pasta física nunca renomeada (DT1 / regras #4/#16);
 *  - lixeira em `zetels/.lixeira/` + flag `trashed_at` (D9);
 *  - IDs via `randomUUID()` — nunca autoincrement para entidade;
 *  - consistência DB-primeiro→filesystem em trash/restore; filesystem→DB em purge/create;
 *  - logs só com id/slug/contagens/timing — NUNCA `display_name` ou conteúdo (regra #6/DT4).
 */

const SUBDIRS = [
  'arquivos',
  'notas-rapidas',
  'notas-literatura',
  'artefatos',
  'attachments',
  'images',
] as const;

interface ZetelRow {
  id: string;
  slug: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  reading_stale: number;
  last_built_at: string | null;
}

function rowToZetel(row: ZetelRow): Zetel {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at,
    readingStale: row.reading_stale !== 0,
    lastBuiltAt: row.last_built_at,
  };
}

/** Caminho da pasta ativa do Zetel no vault. */
function activeDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug);
}

/** Pasta raiz da lixeira no vault. */
function trashRoot(vaultPath: string): string {
  return join(vaultPath, 'zetels', '.lixeira');
}

/**
 * Slug determinístico (§13.7). Imutável após a criação — usado como nome de pasta.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // remove diacríticos
    .replace(/[\s_]+/g, '-') // espaços e underscores → hífen
    .replace(/[^a-z0-9-]/g, '') // descarta o que não é [a-z0-9-]
    .replace(/-+/g, '-') // colapsa hífens
    .replace(/^-+|-+$/g, '') // trim de hífens
    .slice(0, 60);
  return slug || 'zetel';
}

/**
 * Slug único globalmente (inclui lixeira — slugs são únicos entre todos os Zetels,
 * não só entre ativos, para que restaurar nunca colida com um Zetel ativo).
 */
export function generateUniqueSlug(db: Database.Database, baseName: string): string {
  const base = slugify(baseName);
  const exists = db.prepare('SELECT 1 FROM zetels WHERE slug = ?');
  if (!exists.get(base)) return base;

  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`;
    if (!exists.get(candidate)) return candidate;
  }
  throw new Error(
    `Não foi possível gerar um slug único para "${base}" — esgotadas as variações de sufixo até -99.`,
  );
}

export function getZetelById(db: Database.Database, id: string): Zetel | null {
  const row = db.prepare('SELECT * FROM zetels WHERE id = ?').get(id) as ZetelRow | undefined;
  return row ? rowToZetel(row) : null;
}

export function getZetelBySlug(db: Database.Database, slug: string): Zetel | null {
  const row = db.prepare('SELECT * FROM zetels WHERE slug = ?').get(slug) as ZetelRow | undefined;
  return row ? rowToZetel(row) : null;
}

/**
 * Cria a pasta do Zetel + subpastas ANTES de inserir no DB. Se o mkdir falhar,
 * nenhum registro é criado. Se o INSERT falhar, a pasta fica órfã (inofensiva
 * no MVP — o app ignora pastas sem registro).
 */
export function createZetel(db: Database.Database, vaultPath: string, displayName: string): Zetel {
  const name = displayName.trim();
  if (!name) {
    throw new Error('Informe um nome para o Zetel.');
  }

  const slug = generateUniqueSlug(db, name);
  const dir = activeDir(vaultPath, slug);

  for (const sub of SUBDIRS) {
    mkdirSync(join(dir, sub), { recursive: true });
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO zetels (id, slug, display_name, created_at, updated_at, trashed_at, reading_stale, last_built_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, NULL)`,
  ).run(id, slug, name, now, now);

  logger.info('zetel created', { id, slug });
  return getZetelById(db, id)!;
}

/**
 * Lista Zetels por `updated_at DESC`. Por padrão, só ativos (`trashed_at IS NULL`).
 * Com `includeTrash`, retorna SOMENTE os trasheados (para a aba Lixeira).
 */
export function listZetels(
  db: Database.Database,
  { includeTrash = false }: { includeTrash?: boolean } = {},
): Zetel[] {
  const where = includeTrash ? 'trashed_at IS NOT NULL' : 'trashed_at IS NULL';
  const rows = db
    .prepare(`SELECT * FROM zetels WHERE ${where} ORDER BY updated_at DESC`)
    .all() as ZetelRow[];
  return rows.map(rowToZetel);
}

/**
 * Renomeia: altera SOMENTE `display_name` e `updated_at`. Nunca toca slug ou pasta
 * (regra #4/#16 / DT1).
 */
export function renameZetel(db: Database.Database, id: string, newDisplayName: string): Zetel {
  const name = newDisplayName.trim();
  if (!name) {
    throw new Error('Informe um nome para o Zetel.');
  }

  const zetel = getZetelById(db, id);
  if (!zetel) {
    throw new Error('Zetel não encontrado.');
  }

  db.prepare('UPDATE zetels SET display_name = ?, updated_at = ? WHERE id = ?').run(
    name,
    new Date().toISOString(),
    id,
  );

  logger.info('zetel renamed', { id, slug: zetel.slug });
  return getZetelById(db, id)!;
}

/**
 * Move para a lixeira: DB-primeiro (transação seta `trashed_at`), depois
 * `fs.renameSync` da pasta para `zetels/.lixeira/<slug>-<timestamp>/`.
 */
export function trashZetel(db: Database.Database, vaultPath: string, id: string): void {
  const zetel = getZetelById(db, id);
  if (!zetel) {
    throw new Error('Zetel não encontrado.');
  }
  if (zetel.trashedAt) {
    throw new Error('Este Zetel já está na lixeira.');
  }

  const from = activeDir(vaultPath, zetel.slug);
  const to = join(trashRoot(vaultPath), `${zetel.slug}-${Date.now()}`);

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE zetels SET trashed_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  })();

  try {
    mkdirSync(trashRoot(vaultPath), { recursive: true });
    renameSync(from, to);
  } catch (err) {
    logger.error('zetel trash rename failed', { id, error: (err as Error).message });
    throw new Error(
      'O Zetel foi marcado como na lixeira, mas a pasta não pôde ser movida. ' +
        'Tente restaurá-lo para corrigir o estado.',
    );
  }

  logger.info('zetel trashed', { id, slug: zetel.slug });
}

/**
 * Encontra a entrada mais recente de `<slug>-<timestamp>` na lixeira.
 * Retorna o caminho absoluto ou null. Desempate pelo maior timestamp no nome.
 */
function findTrashEntry(vaultPath: string, slug: string): string | null {
  const root = trashRoot(vaultPath);
  if (!existsSync(root)) return null;

  const prefix = `${slug}-`;
  let best: { name: string; ts: number } | null = null;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const ts = Number(entry.name.slice(prefix.length));
    if (!Number.isFinite(ts)) continue;
    if (!best || ts > best.ts) best = { name: entry.name, ts };
  }

  return best ? join(root, best.name) : null;
}

/**
 * Restaura da lixeira: valida que a pasta de destino está livre, acha a entrada
 * na lixeira, move a pasta de volta e SÓ ENTÃO limpa `trashed_at`. Filesystem
 * primeiro garante que, se o rename falhar, o registro permaneça trashed e o
 * estado siga consistente (recuperável). Ordem oposta à de `trashZetel`, de
 * propósito: em ambas, o DB só reflete o estado depois que a pasta o confirma.
 */
export function restoreZetel(db: Database.Database, vaultPath: string, id: string): void {
  const zetel = getZetelById(db, id);
  if (!zetel) {
    throw new Error('Zetel não encontrado.');
  }
  if (!zetel.trashedAt) {
    throw new Error('Este Zetel não está na lixeira.');
  }

  const to = activeDir(vaultPath, zetel.slug);
  if (existsSync(to)) {
    throw new Error(
      `Já existe uma pasta "${zetel.slug}" em zetels/. Renomeie ou remova-a manualmente antes de restaurar.`,
    );
  }

  const from = findTrashEntry(vaultPath, zetel.slug);
  if (!from) {
    throw new Error('A pasta deste Zetel não foi encontrada na lixeira.');
  }

  // Filesystem primeiro: o Zetel só vira "ativo" no DB depois que a pasta volta
  // fisicamente para zetels/<slug>/. Se o rename falhar, o registro continua
  // trashed — nada a desfazer, estado consistente.
  try {
    renameSync(from, to);
  } catch (err) {
    logger.error('zetel restore rename failed', { id, error: (err as Error).message });
    throw new Error(
      'A pasta do Zetel não pôde ser movida de volta da lixeira. ' +
        'Verifique a pasta zetels/.lixeira/ manualmente.',
    );
  }

  db.prepare('UPDATE zetels SET trashed_at = NULL, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  );

  logger.info('zetel restored', { id, slug: zetel.slug });
}

/**
 * Exclui definitivamente: apaga a pasta da lixeira PRIMEIRO, depois deleta o
 * registro. Só pode purgar o que está na lixeira. Pasta ausente não é fatal
 * (pode ter sido removida manualmente).
 */
export function purgeZetel(db: Database.Database, vaultPath: string, id: string): void {
  const zetel = getZetelById(db, id);
  if (!zetel) {
    throw new Error('Zetel não encontrado.');
  }
  if (!zetel.trashedAt) {
    throw new Error('Só é possível excluir definitivamente um Zetel que está na lixeira.');
  }

  const dir = findTrashEntry(vaultPath, zetel.slug);
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
  }

  db.prepare('DELETE FROM zetels WHERE id = ?').run(id);

  logger.info('zetel purged', { id, slug: zetel.slug });
}
