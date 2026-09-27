import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FocusState, StudySession, StudySessionStatus } from '@/types/study-session';
import { isPdfFilename } from './pdf-service';
import { isKnownTutorProfile } from './tutor-profile-service';
import {
  parseProfileOverrides,
  readStoredOverrides,
  TutorProfileError,
  type ProfileOverrides,
} from './tutor-profiles';

interface SessionRow {
  id: string;
  zetel_id: string;
  title: string;
  status: StudySessionStatus;
  focus: string | null;
  profile_id: string;
  profile_overrides: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

export class SessionValidationError extends Error {}

function fromRow(row: SessionRow): StudySession {
  return {
    id: row.id,
    zetelId: row.zetel_id,
    title: row.title,
    status: row.status,
    focus: row.focus ? JSON.parse(row.focus) as FocusState : null,
    profileId: row.profile_id,
    profileOverrides: parseOverridesColumn(row.profile_overrides),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActiveAt: row.last_active_at,
  };
}

export function suggestSessionTitle(
  filename: string | null,
  pageNumber: number | null,
  date: Date = new Date(),
): string {
  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(date);
  if (filename && pageNumber !== null) {
    return `${filename.replace(/\.pdf$/i, '')} · p. ${pageNumber} · ${day}`;
  }
  return `Sessão · ${day}`;
}

export function validateProfileId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) {
    throw new SessionValidationError('Perfil inválido.');
  }
  return value;
}

function parseOverridesColumn(raw: string | null): ProfileOverrides | null {
  if (!raw) return null;
  try {
    return readStoredOverrides(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function validateProfileOverrides(value: unknown): ProfileOverrides | null {
  try {
    return parseProfileOverrides(value);
  } catch (err) {
    if (err instanceof TutorProfileError) throw new SessionValidationError(err.message);
    throw err;
  }
}

function assertKnownProfile(db: Database.Database, value: unknown): string {
  const profileId = validateProfileId(value);
  if (!isKnownTutorProfile(db, profileId)) {
    throw new SessionValidationError('Perfil não encontrado.');
  }
  return profileId;
}

/** Valida apenas a posição estrutural; nunca aceita texto de página/seleção. */
export function validateSessionFocus(
  db: Database.Database,
  zetelId: string,
  raw: unknown,
): FocusState | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionValidationError('Foco inválido.');
  }
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['scope', 'fileId', 'pageNumber', 'hint'].includes(key))) {
    throw new SessionValidationError('Foco inválido.');
  }
  const scope = input.scope;
  const fileId = input.fileId;
  const pageNumber = input.pageNumber;
  const hint = input.hint;
  if (hint !== undefined && hint !== null && hint !== 'beginning' && hint !== 'end') {
    throw new SessionValidationError('Foco inválido.');
  }
  if (!['selection', 'page', 'section', 'document', 'zetel'].includes(String(scope)) ||
      (fileId !== null && (typeof fileId !== 'string' || !fileId || fileId.length > 120)) ||
      (pageNumber !== null && (!Number.isInteger(pageNumber) || (pageNumber as number) < 0))) {
    throw new SessionValidationError('Foco inválido.');
  }
  if ((scope === 'zetel' && (fileId !== null || pageNumber !== null)) ||
      (scope === 'document' && pageNumber !== null) ||
      (['selection', 'page', 'section'].includes(String(scope)) && pageNumber === null) ||
      (scope === 'selection' && fileId === null)) {
    throw new SessionValidationError('Foco inválido.');
  }
  if (fileId !== null) {
    const file = db.prepare(
      `SELECT filename, page_count, extraction_status FROM zetel_files
       WHERE id = ? AND zetel_id = ?`,
    ).get(fileId, zetelId) as {
      filename: string; page_count: number | null; extraction_status: string | null;
    } | undefined;
    if (!file || !isPdfFilename(file.filename) ||
        !['ok', 'no_text'].includes(file.extraction_status ?? '') ||
        !Number.isInteger(file.page_count) || (file.page_count ?? 0) < 1 ||
        (pageNumber !== null && (!Number.isInteger(pageNumber) ||
          (pageNumber as number) < 1 || (pageNumber as number) > (file.page_count ?? 0)))) {
      throw new SessionValidationError('Página do PDF não encontrada neste Zetel.');
    }
  } else if (pageNumber !== null && !db.prepare(
    'SELECT 1 FROM zetel_pages WHERE zetel_id = ? AND page_index = ?',
  ).get(zetelId, pageNumber)) {
    throw new SessionValidationError('Página Markdown não encontrada neste Zetel.');
  }
  return {
    scope: scope as FocusState['scope'],
    fileId: fileId as string | null,
    pageNumber: pageNumber as number | null,
    ...(hint === 'beginning' || hint === 'end' ? { hint } : {}),
  };
}

function validateTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) {
    throw new SessionValidationError('Título inválido.');
  }
  return value.trim();
}

export function getStudySession(
  db: Database.Database, zetelId: string, sessionId: string,
): StudySession | null {
  const row = db.prepare('SELECT * FROM study_sessions WHERE id = ? AND zetel_id = ?')
    .get(sessionId, zetelId) as SessionRow | undefined;
  return row ? fromRow(row) : null;
}

export function listStudySessions(db: Database.Database, zetelId: string): StudySession[] {
  const rows = db.prepare(
    `SELECT * FROM study_sessions WHERE zetel_id = ?
     ORDER BY last_active_at DESC, created_at DESC, id DESC`,
  ).all(zetelId) as SessionRow[];
  return rows.map(fromRow);
}

/** GET/fallback do chat não reativa nem cria uma sessão. */
export function resolveCurrentStudySession(
  db: Database.Database, zetelId: string,
): StudySession | null {
  const row = db.prepare(
    `SELECT * FROM study_sessions WHERE zetel_id = ? AND status != 'archived'
     ORDER BY last_active_at DESC, (status = 'active') DESC, created_at DESC, id DESC LIMIT 1`,
  ).get(zetelId) as SessionRow | undefined;
  return row ? fromRow(row) : null;
}

export interface CreateStudySessionInput {
  title?: unknown;
  focus?: unknown;
  profileId?: unknown;
  profileOverrides?: unknown;
}

export function createStudySession(
  db: Database.Database, zetelId: string, input: CreateStudySessionInput = {},
): StudySession {
  const focus = input.focus === undefined ? null : validateSessionFocus(db, zetelId, input.focus);
  const profileId = input.profileId === undefined
    ? 'conversa-livre'
    : assertKnownProfile(db, input.profileId);
  const overrides = input.profileOverrides === undefined
    ? null : validateProfileOverrides(input.profileOverrides);
  const file = focus?.fileId
    ? db.prepare('SELECT filename FROM zetel_files WHERE id = ? AND zetel_id = ?')
      .get(focus.fileId, zetelId) as { filename: string } | undefined
    : undefined;
  const title = input.title === undefined
    ? suggestSessionTitle(file?.filename ?? null, focus?.pageNumber ?? null)
    : validateTitle(input.title);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE study_sessions SET status = 'paused', updated_at = ?
       WHERE zetel_id = ? AND status = 'active'`,
    ).run(now, zetelId);
    db.prepare(
      `INSERT INTO study_sessions
       (id, zetel_id, title, status, focus, profile_id, profile_overrides,
        created_at, updated_at, last_active_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    ).run(id, zetelId, title, focus ? JSON.stringify(focus) : null,
      profileId, overrides ? JSON.stringify(overrides) : null, now, now, now);
  })();
  return getStudySession(db, zetelId, id)!;
}

export interface UpdateStudySessionInput {
  title?: unknown;
  focus?: unknown;
  profileId?: unknown;
  profileOverrides?: unknown;
  status?: unknown;
}

export function updateStudySession(
  db: Database.Database, zetelId: string, sessionId: string,
  input: UpdateStudySessionInput,
): StudySession | null {
  const current = getStudySession(db, zetelId, sessionId);
  if (!current) return null;
  if (current.status === 'archived') throw new SessionValidationError('Sessão arquivada.');
  const title = input.title === undefined ? current.title : validateTitle(input.title);
  const focus = input.focus === undefined ? current.focus : validateSessionFocus(db, zetelId, input.focus);
  const profileId = input.profileId === undefined
    ? current.profileId
    : assertKnownProfile(db, input.profileId);
  const overrides = input.profileOverrides === undefined
    ? current.profileOverrides : validateProfileOverrides(input.profileOverrides);
  const status = input.status === undefined ? current.status : input.status;
  if (!['active', 'paused', 'archived'].includes(String(status))) {
    throw new SessionValidationError('Status inválido.');
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    if (status === 'active') {
      db.prepare(
        `UPDATE study_sessions SET status = 'paused', updated_at = ?
         WHERE zetel_id = ? AND id != ? AND status = 'active'`,
      ).run(now, zetelId, sessionId);
    }
    db.prepare(
      `UPDATE study_sessions SET title = ?, status = ?, focus = ?, profile_id = ?,
       profile_overrides = ?, updated_at = ?, last_active_at = ?
       WHERE id = ? AND zetel_id = ?`,
    ).run(title, status, focus ? JSON.stringify(focus) : null, profileId,
      overrides ? JSON.stringify(overrides) : null, now,
      status === 'active' ? now : current.lastActiveAt, sessionId, zetelId);
  })();
  return getStudySession(db, zetelId, sessionId);
}

export function touchStudySession(db: Database.Database, zetelId: string, sessionId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE study_sessions SET last_active_at = ?, updated_at = ?
     WHERE id = ? AND zetel_id = ? AND status != 'archived'`,
  ).run(now, now, sessionId, zetelId);
}
