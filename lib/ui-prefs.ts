import { readBargeInPref } from '@/lib/barge-in';

/**
 * Preferências de UI em cookie (SPEC-008). `localStorage` é isolado por origem
 * — porta incluída —, então as preferências mudavam conforme a porta do dev;
 * cookies de `localhost` são compartilhados entre portas. Puro e client-safe:
 * cookie e `localStorage` são injetáveis para teste em node.
 */

export type UiPref<T> = {
  cookie: string;
  /** Chave antiga no `localStorage`, migrada uma vez e removida. */
  legacyKey: string;
  parse(raw: string | null): T;
  /** `null` = nada a gravar (sem preferência). */
  serialize(value: T): string | null;
};

export type UiPrefDeps = {
  getCookies(): string;
  setCookie(cookie: string): void;
  local(): Pick<Storage, 'getItem' | 'removeItem'> | null;
};

export type VoicePrefs = { micAtivo: boolean; autoPlay: boolean; bargeIn: boolean };

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export function readCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function serializeCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR_S}; SameSite=Lax`;
}

export function parseVoicePrefs(raw: string | null): VoicePrefs {
  let p: Record<string, unknown> = {};
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (typeof parsed === 'object' && parsed !== null) p = parsed as Record<string, unknown>;
  } catch {
    /* corrompido: padrões */
  }
  return { micAtivo: p.micAtivo === true, autoPlay: p.autoPlay === true, bargeIn: readBargeInPref(raw) };
}

export function parseMaterialOpen(raw: string | null): boolean | null {
  return raw === 'true' ? true : raw === 'false' ? false : null;
}

export const VOICE_PREFS: UiPref<VoicePrefs> = {
  cookie: 'zetel-voice-prefs',
  legacyKey: 'zetel_voice_prefs',
  parse: parseVoicePrefs,
  serialize: (v) => JSON.stringify({ micAtivo: v.micAtivo, autoPlay: v.autoPlay, bargeIn: v.bargeIn }),
};

export const MATERIAL_OPEN: UiPref<boolean | null> = {
  cookie: 'zetel-material-open',
  legacyKey: 'zetel_material_open',
  parse: parseMaterialOpen,
  serialize: (v) => (v === null ? null : String(v)),
};

function browserDeps(): UiPrefDeps {
  return {
    getCookies: () => document.cookie,
    setCookie: (cookie) => {
      document.cookie = cookie;
    },
    // O acesso a `localStorage` pode lançar (SecurityError) em contexto restrito.
    local: () => localStorage,
  };
}

function writeCookie(pref: UiPref<unknown>, value: string, deps: UiPrefDeps): boolean {
  try {
    deps.setCookie(serializeCookie(pref.cookie, value));
    // Cookies bloqueados falham em silêncio; só a releitura confirma a gravação.
    return readCookie(deps.getCookies(), pref.cookie) === value;
  } catch {
    return false;
  }
}

/**
 * Cookie vence. Sem cookie, o valor antigo do `localStorage` desta porta é
 * migrado. A chave antiga só é removida quando o cookie está garantido, para
 * nunca perder a preferência com cookies bloqueados.
 */
export function readUiPref<T>(pref: UiPref<T>, deps: UiPrefDeps = browserDeps()): T {
  let raw: string | null = null;
  try {
    raw = readCookie(deps.getCookies(), pref.cookie);
  } catch {
    /* cookie indisponível */
  }

  try {
    const local = deps.local();
    const legacy = local?.getItem(pref.legacyKey) ?? null;
    if (local && legacy !== null) {
      let safe = raw !== null;
      if (!safe) {
        const migrated = pref.serialize(pref.parse(legacy));
        // Valor antigo sem preferência válida: nada a migrar, só limpar.
        safe = migrated === null || writeCookie(pref, migrated, deps);
        if (migrated !== null && safe) raw = migrated;
        else if (!safe) raw = legacy;
      }
      if (safe) local.removeItem(pref.legacyKey);
    }
  } catch {
    /* localStorage indisponível: segue só com o cookie */
  }

  return pref.parse(raw);
}

export function writeUiPref<T>(pref: UiPref<T>, value: T, deps: UiPrefDeps = browserDeps()): void {
  const serialized = pref.serialize(value);
  if (serialized !== null) writeCookie(pref, serialized, deps);
}
