import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Ciclo do curador sem rede (SPEC-018 tarefa 008): relatório chega ao canal
 * (repositório bare local) → "Buscar do canal" → "Importar relatórios" →
 * curadoria (OpenRouter mockado no servidor) → confirmar → "Publicar
 * contexto" → CONTEXTO.md no remoto.
 */
const ROOT = process.env.ZETEL_E2E_CURATOR_ROOT!;
const VAULT = join(ROOT, 'vault');
const REMOTE = join(ROOT, 'canal.git');
const WRITER = join(ROOT, 'chatgpt'); // quem envia o relatório ao canal
const CHANNEL = join(ROOT, 'canal'); // clone local do Igor (channel_dir)

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Teste',
  GIT_AUTHOR_EMAIL: 'teste@example.invalid',
  GIT_COMMITTER_NAME: 'Teste',
  GIT_COMMITTER_EMAIL: 'teste@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function report(slug: string): string {
  return [
    '---',
    'zetel_report: 1',
    `zetel: ${slug}`,
    'title: "Entalpia e calor"',
    'date: 2026-10-21',
    '---',
    '',
    '## Resumo',
    '',
    'Conversamos sobre entalpia e calor em processo isobárico.',
    '',
    '## Conceitos',
    '',
    '### Entalpia',
    '',
    'Grandeza H = U + PV.',
    '',
    '## Questões',
    '',
    '1. Em um processo isobárico, qual grandeza é igual ao calor trocado?',
    '   Resposta: a variação de entalpia.',
    '',
  ].join('\n');
}

test.beforeAll(() => {
  mkdirSync(VAULT, { recursive: true });
  git(ROOT, 'init', '-q', '--bare', '-b', 'main', REMOTE);
  git(ROOT, 'clone', '-q', REMOTE, WRITER);
  git(WRITER, 'checkout', '-q', '-b', 'main');
  writeFileSync(join(WRITER, 'README.md'), 'canal\n');
  git(WRITER, 'add', 'README.md');
  git(WRITER, 'commit', '-q', '-m', 'canal');
  git(WRITER, 'push', '-q', 'origin', 'main');
  git(ROOT, 'clone', '-q', REMOTE, CHANNEL);
});

// Vault, banco e repositórios do teste ficam só no diretório temporário da run.
test.afterAll(() => {
  // Defesa extra: só apaga a raiz que o playwright.config criou em tmpdir.
  if (ROOT.startsWith(join(tmpdir(), 'zetel-e2e-curator-'))) rmSync(ROOT, { recursive: true, force: true });
});

test('relatório do canal → curadoria → vault → CONTEXTO.md no canal', async ({ page, request }) => {
  test.setTimeout(240_000);

  expect((await request.post('/api/vault', { data: { path: VAULT } })).ok()).toBe(true);
  const created = await request.post('/api/zetels', { data: { displayName: 'Termodinâmica' } });
  expect(created.status()).toBe(201);
  const { zetel } = (await created.json()) as { zetel: { id: string; slug: string } };
  expect((await request.put('/api/settings', { data: { channel_dir: CHANNEL } })).ok()).toBe(true);

  // O relatório chega ao canal (no uso real: upload do Igor no GitHub).
  const inbox = join(WRITER, 'inbox', zetel.slug);
  mkdirSync(inbox, { recursive: true });
  writeFileSync(join(inbox, '2026-10-21-entalpia.md'), report(zetel.slug));
  git(WRITER, 'add', '.');
  git(WRITER, 'commit', '-q', '-m', 'relatório');
  git(WRITER, 'push', '-q', 'origin', 'main');

  await page.goto(`/zetel/${zetel.slug}`);
  await page.getByRole('button', { name: 'Buscar do canal' }).click();
  await expect(page.getByText('Canal atualizado (1 commit novo)')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Importar relatórios' }).click();
  await expect(page.getByText('1 relatório importado')).toBeVisible({ timeout: 30_000 });

  await page.goto(`/zetel/${zetel.slug}?painel=curadoria`);
  const panel = page.getByTestId('curadoria-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await panel.getByTestId('curation-run').click();
  await expect(panel.getByText('2 candidatos propostos.')).toBeVisible({ timeout: 30_000 });

  const cards = panel.getByTestId('curation-card');
  await expect(cards).toHaveCount(2);
  // Edita a nota antes de confirmar.
  await cards.first().getByTestId('curation-field-titulo').fill('Calor isobárico');
  await cards.first().getByTestId('curation-confirm').click();
  await expect(panel.getByText(`Gravado no vault: zetels/${zetel.slug}/notas-rapidas/calor-isobarico.md`)).toBeVisible();
  await expect(cards).toHaveCount(1);
  await cards.first().getByTestId('curation-confirm').click();
  await expect(panel.getByText(`Gravado no vault: zetels/${zetel.slug}/conceitos/entalpia.md`)).toBeVisible();
  await expect(cards).toHaveCount(0);

  const note = readFileSync(join(VAULT, 'zetels', zetel.slug, 'notas-rapidas', 'calor-isobarico.md'), 'utf8');
  expect(note).toContain('origem: relatorio');
  expect(note).toContain(`pagina_origem: relatorios/2026-10-21-entalpia.md#`);

  await panel.getByTestId('context-preview').click();
  const preview = panel.getByTestId('context-preview-card');
  await expect(preview).toContainText('### Calor isobárico');
  await expect(preview).toContainText('### Entalpia');
  // Prévia não publica nem suja o clone.
  expect(git(REMOTE, 'log', '--oneline', 'main').trim().split('\n')).toHaveLength(2);
  expect(git(CHANNEL, 'status', '--porcelain').trim()).toBe('');

  await preview.getByTestId('context-publish-confirm').click();
  await expect(panel.getByText('Contexto publicado no canal.')).toBeVisible({ timeout: 60_000 });

  const published = git(REMOTE, 'show', `main:contexto/${zetel.slug}/CONTEXTO.md`);
  expect(published).toContain('# Contexto do estudo: Termodinâmica');
  expect(published).toContain('Em pressão constante, o calor trocado é ΔH.');
  expect(published).toContain(`inbox/${zetel.slug}/2026-10-21-entalpia.md`);
  expect(git(REMOTE, 'show', '--name-only', '--format=', 'main').trim()).toBe(`contexto/${zetel.slug}/CONTEXTO.md`);
  expect(existsSync(join(CHANNEL, 'contexto', zetel.slug, 'CONTEXTO.md'))).toBe(true);
});
