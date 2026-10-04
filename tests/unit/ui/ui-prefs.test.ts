import { describe, expect, it } from 'vitest';
import {
  MATERIAL_OPEN,
  VOICE_PREFS,
  parseMaterialOpen,
  parseVoicePrefs,
  readCookie,
  readUiPref,
  serializeCookie,
  writeUiPref,
  type UiPrefDeps,
} from '@/lib/ui-prefs';

/** Jar mínimo com a semântica de `document.cookie` (get = "a=1; b=2"). */
function setup(options: { cookies?: Record<string, string>; local?: Record<string, string>;
  blockCookies?: boolean; noLocal?: boolean } = {}) {
  const jar = new Map(Object.entries(options.cookies ?? {}).map(([k, v]) => [k, encodeURIComponent(v)]));
  const local = new Map(Object.entries(options.local ?? {}));
  const written: string[] = [];
  const deps: UiPrefDeps = {
    getCookies: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    setCookie: (cookie) => {
      written.push(cookie);
      if (options.blockCookies) return;
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    },
    local: () => {
      if (options.noLocal) throw new Error('SecurityError');
      return {
        getItem: (k: string) => local.get(k) ?? null,
        removeItem: (k: string) => void local.delete(k),
      };
    },
  };
  return { deps, jar, local, written };
}

describe('cookie helpers', () => {
  it('lê pelo nome exato e decodifica', () => {
    const cookies = 'zetel-theme=dark; zetel-voice-prefs=%7B%22a%22%3A1%7D; x-zetel-material-open=no';
    expect(readCookie(cookies, 'zetel-voice-prefs')).toBe('{"a":1}');
    expect(readCookie(cookies, 'zetel-material-open')).toBeNull();
    expect(readCookie('', 'zetel-theme')).toBeNull();
    expect(readCookie('zetel-theme=%E0%A4%A', 'zetel-theme')).toBeNull();
  });

  it('serializa com Path=/, 1 ano e SameSite=Lax', () => {
    expect(serializeCookie('zetel-material-open', 'true')).toBe(
      'zetel-material-open=true; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(serializeCookie('k', '{"a":1}')).toContain('k=%7B%22a%22%3A1%7D;');
  });
});

describe('parsers', () => {
  it('voz: padrões em ausente/corrompido; barge-in só desliga com false', () => {
    const off = { micAtivo: false, autoPlay: false, bargeIn: true };
    expect(parseVoicePrefs(null)).toEqual(off);
    expect(parseVoicePrefs('não é json')).toEqual(off);
    expect(parseVoicePrefs('null')).toEqual(off);
    expect(parseVoicePrefs('{"micAtivo":"sim","autoPlay":1}')).toEqual(off);
    expect(parseVoicePrefs('{"micAtivo":true,"autoPlay":true,"bargeIn":false}')).toEqual({
      micAtivo: true, autoPlay: true, bargeIn: false,
    });
  });

  it('material: só true/false literais', () => {
    expect(parseMaterialOpen('true')).toBe(true);
    expect(parseMaterialOpen('false')).toBe(false);
    expect(parseMaterialOpen('1')).toBeNull();
    expect(parseMaterialOpen(null)).toBeNull();
  });
});

describe('readUiPref', () => {
  it('cookie vence e a chave antiga é removida', () => {
    const { deps, local, written } = setup({
      cookies: { 'zetel-material-open': 'false' },
      local: { zetel_material_open: 'true' },
    });
    expect(readUiPref(MATERIAL_OPEN, deps)).toBe(false);
    expect(local.has('zetel_material_open')).toBe(false);
    expect(written).toEqual([]);
  });

  it('sem cookie: migra o valor antigo (normalizado) e remove a chave', () => {
    const { deps, jar, local } = setup({
      local: { zetel_voice_prefs: '{"micAtivo":true,"autoPlay":false,"extra":1}' },
    });
    expect(readUiPref(VOICE_PREFS, deps)).toEqual({ micAtivo: true, autoPlay: false, bargeIn: true });
    expect(decodeURIComponent(jar.get('zetel-voice-prefs')!)).toBe(
      '{"micAtivo":true,"autoPlay":false,"bargeIn":true}',
    );
    expect(local.has('zetel_voice_prefs')).toBe(false);
  });

  it('migração é única: segunda leitura não grava de novo', () => {
    const { deps, written } = setup({ local: { zetel_material_open: 'false' } });
    expect(readUiPref(MATERIAL_OPEN, deps)).toBe(false);
    expect(readUiPref(MATERIAL_OPEN, deps)).toBe(false);
    expect(written).toHaveLength(1);
  });

  it('valor antigo inválido: nada a migrar, só limpa', () => {
    const { deps, local, written } = setup({ local: { zetel_material_open: 'talvez' } });
    expect(readUiPref(MATERIAL_OPEN, deps)).toBeNull();
    expect(written).toEqual([]);
    expect(local.has('zetel_material_open')).toBe(false);
  });

  it('cookies bloqueados: mantém a chave antiga e ainda usa o valor dela', () => {
    const { deps, local } = setup({ blockCookies: true, local: { zetel_material_open: 'false' } });
    expect(readUiPref(MATERIAL_OPEN, deps)).toBe(false);
    expect(local.get('zetel_material_open')).toBe('false');
  });

  it('localStorage indisponível não lança', () => {
    const { deps } = setup({ noLocal: true, cookies: { 'zetel-material-open': 'true' } });
    expect(readUiPref(MATERIAL_OPEN, deps)).toBe(true);
    expect(readUiPref(VOICE_PREFS, setup({ noLocal: true }).deps)).toEqual({
      micAtivo: false, autoPlay: false, bargeIn: true,
    });
  });

  it('getCookies que lança cai nos padrões', () => {
    const { deps } = setup();
    deps.getCookies = () => {
      throw new Error('sem document');
    };
    expect(readUiPref(MATERIAL_OPEN, deps)).toBeNull();
  });
});

describe('writeUiPref', () => {
  it('grava o cookie e não toca o localStorage', () => {
    const { deps, jar, local } = setup({ local: { outra: 'x' } });
    writeUiPref(MATERIAL_OPEN, true, deps);
    writeUiPref(VOICE_PREFS, { micAtivo: false, autoPlay: true, bargeIn: false }, deps);
    expect(jar.get('zetel-material-open')).toBe('true');
    expect(readUiPref(VOICE_PREFS, deps)).toEqual({ micAtivo: false, autoPlay: true, bargeIn: false });
    expect([...local.keys()]).toEqual(['outra']);
  });

  it('null não grava; setCookie que lança não propaga', () => {
    const { deps, written } = setup();
    writeUiPref(MATERIAL_OPEN, null, deps);
    expect(written).toEqual([]);
    deps.setCookie = () => {
      throw new Error('bloqueado');
    };
    expect(() => writeUiPref(MATERIAL_OPEN, false, deps)).not.toThrow();
  });
});
