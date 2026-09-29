import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  applyOverrides,
  cloneProfile,
  fallbackPartnerColor,
  getBuiltinProfile,
  isPartnerColor,
  isBuiltinProfileId,
  parseAxes,
  parsePartnerColor,
  parseTone,
  TutorProfileError,
  validateProfileName,
  type ProfileOverrides,
  type TutorProfile,
  BUILTIN_PROFILES,
} from './tutor-profiles';

interface ProfileRow {
  id: string;
  name: string;
  base_profile_id: string | null;
  axes: string;
  tone: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ProfileRow): TutorProfile {
  return {
    id: row.id,
    name: row.name,
    builtin: false,
    baseProfileId: row.base_profile_id,
    color: isPartnerColor(row.color) ? row.color : fallbackPartnerColor(row.id),
    axes: parseAxes(JSON.parse(row.axes)),
    tone: parseTone(JSON.parse(row.tone)),
  };
}

export function listTutorProfiles(db: Database.Database): TutorProfile[] {
  const custom = (db.prepare(
    'SELECT * FROM tutor_profiles ORDER BY name COLLATE NOCASE, id',
  ).all() as ProfileRow[]).map(fromRow);
  return [...BUILTIN_PROFILES.map(cloneProfile), ...custom];
}

export function getTutorProfile(db: Database.Database, id: string): TutorProfile | null {
  const builtin = getBuiltinProfile(id);
  if (builtin) return builtin;
  const row = db.prepare('SELECT * FROM tutor_profiles WHERE id = ?').get(id) as ProfileRow | undefined;
  if (!row) return null;
  try {
    return fromRow(row);
  } catch {
    return null;
  }
}

/** Perfil efetivo do turno. Id desconhecido cai em Conversa Livre; overrides inválidos são ignorados. */
export function resolveSessionTutorProfile(
  db: Database.Database,
  profileId: string,
  overrides: ProfileOverrides | null,
): TutorProfile {
  const base = getTutorProfile(db, profileId) ?? getBuiltinProfile('conversa-livre')!;
  return applyOverrides(base, overrides);
}

export function isKnownTutorProfile(db: Database.Database, id: string): boolean {
  return isBuiltinProfileId(id) || Boolean(
    db.prepare('SELECT 1 FROM tutor_profiles WHERE id = ?').get(id),
  );
}

export interface CreateTutorProfileInput {
  name?: unknown;
  baseProfileId?: unknown;
  axes?: unknown;
  tone?: unknown;
  color?: unknown;
}

export function createTutorProfile(db: Database.Database, input: CreateTutorProfileInput): TutorProfile {
  const name = validateProfileName(input.name);
  const baseId = input.baseProfileId === undefined || input.baseProfileId === null
    ? null
    : requireProfileId(input.baseProfileId);
  if (baseId && !isKnownTutorProfile(db, baseId)) {
    throw new TutorProfileError('Perfil de origem não encontrado.');
  }
  const base = baseId ? getTutorProfile(db, baseId) : null;
  const axes = input.axes === undefined ? base?.axes : parseAxes(input.axes);
  const tone = input.tone === undefined ? base?.tone : parseTone(input.tone);
  if (!axes || !tone) throw new TutorProfileError('Eixos e tom são obrigatórios.');
  const id = `c${randomUUID().replace(/-/g, '')}`;
  const color = input.color === undefined ? base?.color ?? fallbackPartnerColor(id) : parsePartnerColor(input.color);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tutor_profiles (id, name, base_profile_id, axes, tone, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, baseId, JSON.stringify(axes), JSON.stringify(tone), color, now, now);
  return getTutorProfile(db, id)!;
}

export interface UpdateTutorProfileInput {
  name?: unknown;
  axes?: unknown;
  tone?: unknown;
  color?: unknown;
}

export function updateTutorProfile(
  db: Database.Database,
  id: string,
  input: UpdateTutorProfileInput,
): TutorProfile | null {
  if (isBuiltinProfileId(id)) {
    throw new TutorProfileError('Perfil integrado não pode ser alterado.');
  }
  const current = getTutorProfile(db, id);
  if (!current || current.builtin) return null;
  const name = input.name === undefined ? current.name : validateProfileName(input.name);
  const axes = input.axes === undefined ? current.axes : parseAxes(input.axes);
  const tone = input.tone === undefined ? current.tone : parseTone(input.tone);
  const color = input.color === undefined ? current.color : parsePartnerColor(input.color);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE tutor_profiles SET name = ?, axes = ?, tone = ?, color = ?, updated_at = ? WHERE id = ?`,
  ).run(name, JSON.stringify(axes), JSON.stringify(tone), color, now, id);
  return getTutorProfile(db, id);
}

function requireProfileId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) {
    throw new TutorProfileError('Perfil inválido.');
  }
  return value;
}
