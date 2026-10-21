import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateChannelDir } from '@/lib/settings';

describe('validateChannelDir (SPEC-018 RF2)', () => {
  let base: string;
  let vault: string;
  let channel: string;

  beforeEach(() => {
    base = join(tmpdir(), `zetel-channel-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    vault = join(base, 'vault');
    channel = join(base, 'canal');
    mkdirSync(vault, { recursive: true });
    mkdirSync(channel, { recursive: true });
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('aceita diretório absoluto existente e devolve o caminho real', () => {
    expect(validateChannelDir(`  ${channel}  `, vault)).toEqual({ ok: true, path: realpathSync(channel) });
    symlinkSync(channel, join(base, 'atalho'));
    expect(validateChannelDir(join(base, 'atalho'), vault)).toEqual({ ok: true, path: realpathSync(channel) });
  });

  it('recusa vazio, relativo, inexistente, arquivo e a raiz', () => {
    writeFileSync(join(base, 'arquivo'), 'x');
    for (const input of ['', 'canal', join(base, 'nao-existe'), join(base, 'arquivo'), '/']) {
      expect(validateChannelDir(input, vault).ok).toBe(false);
    }
  });

  it('recusa o vault, pasta dentro do vault e pasta que contém o vault', () => {
    mkdirSync(join(vault, 'dentro'));
    expect(validateChannelDir(vault, vault).ok).toBe(false);
    expect(validateChannelDir(join(vault, 'dentro'), vault).ok).toBe(false);
    expect(validateChannelDir(base, vault).ok).toBe(false);
    symlinkSync(vault, join(base, 'vault-atalho'));
    expect(validateChannelDir(join(base, 'vault-atalho'), vault).ok).toBe(false);
  });

  it('mensagens de erro não ecoam o caminho informado', () => {
    const result = validateChannelDir(join(base, 'nao-existe'), vault);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain(base);
  });
});
