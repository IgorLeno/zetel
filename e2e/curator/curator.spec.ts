import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Ciclo do curador sem rede (SPEC-018 tarefa 008): cartão "Estudar com o
 * ChatGPT" → "Abrir ChatGPT" liga a escuta → relatório chega ao canal
 * (repositório bare local) → "Relatório recebido" → curadoria (OpenRouter mockado no servidor) → confirmar → "Publicar
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

test('relatório do canal → curadoria → vault → CONTEXTO.md no canal', async ({ page, context, request }) => {
  test.setTimeout(240_000);

  expect((await request.post('/api/vault', { data: { path: VAULT } })).ok()).toBe(true);
  const created = await request.post('/api/zetels', { data: { displayName: 'Termodinâmica' } });
  expect(created.status()).toBe(201);
  const { zetel } = (await created.json()) as { zetel: { id: string; slug: string } };
  expect((await request.put('/api/settings', { data: { channel_dir: CHANNEL } })).ok()).toBe(true);

  // "Abrir ChatGPT" não sai para a rede: registra a chamada a window.open.
  await page.addInitScript(() => {
    const opened: unknown[][] = [];
    (window as unknown as { __opened: unknown[][] }).__opened = opened;
    window.open = ((...args: unknown[]) => {
      opened.push(args);
      return null;
    }) as typeof window.open;
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Relógio controlado: a escuta verifica o canal a cada 60 s.
  await page.clock.install();

  await page.goto(`/zetel/${zetel.slug}`);
  const card = page.getByTestId('chatgpt-study-card');
  await expect(card.getByRole('heading', { name: 'Estudar com o ChatGPT' })).toBeVisible({ timeout: 60_000 });
  await card.getByRole('button', { name: 'Copiar instrução' }).click();
  await expect(card.getByText('Instrução copiada.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`\`zetel: ${zetel.slug}\``);
  await card.getByRole('button', { name: 'Copiar abertura' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`contexto/${zetel.slug}/CONTEXTO.md`);

  await card.getByRole('button', { name: 'Abrir ChatGPT' }).click();
  expect(await page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened))
    .toEqual([['https://chatgpt.com/', '_blank', 'noopener,noreferrer']]);
  const listening = card.getByTestId('chatgpt-listening');
  await expect(listening).toContainText('Ouvindo o canal…');
  // Primeira verificação: canal sem relatório.
  await expect(listening).toContainText('Última verificação', { timeout: 60_000 });
  await expect(card.getByTestId('chatgpt-report-received')).toHaveCount(0);

  // O relatório chega ao canal (no uso real: upload do Igor no GitHub).
  const inbox = join(WRITER, 'inbox', zetel.slug);
  mkdirSync(inbox, { recursive: true });
  writeFileSync(join(inbox, '2026-10-21-entalpia.md'), report(zetel.slug));
  git(WRITER, 'add', '.');
  git(WRITER, 'commit', '-q', '-m', 'relatório');
  git(WRITER, 'push', '-q', 'origin', 'main');

  await page.clock.fastForward('01:00');
  const received = card.getByTestId('chatgpt-report-received');
  await expect(received).toContainText('Relatório recebido', { timeout: 60_000 });
  await expect(received).toContainText('Um relatório novo chegou');
  await received.getByRole('link', { name: 'Revisar na Curadoria' }).click();
  await expect(page).toHaveURL(/painel=curadoria/);
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
