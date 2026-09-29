import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const sidebar = source('components/Sidebar.tsx');
const list = source('components/ZetelList.tsx');
const workspace = source('components/ZetelWorkspace.tsx');
const files = source('components/ArquivosPanel.tsx');
const page = source('app/zetel/[slug]/page.tsx');
const css = source('app/globals.css');
const sheet = source('components/PartnerSheet.tsx');

describe('human validation UI flow', () => {
  it('opens study areas in a drawer that closes outside, on Escape and via its button', () => {
    for (const view of ['arquivos', 'notas-rapidas', 'notas-literatura', 'notas-elaboradas', 'notas-do-usuario', 'artefatos']) {
      expect(workspace).toContain(`'${view}'`);
    }
    // Links antigos (?view=arquivos) continuam abrindo a mesma área, agora como gaveta.
    expect(workspace).toContain('const legacyDrawer = isDrawerView(rawView) ? rawView : null;');
    expect(workspace).toContain("else params.delete('painel');");
    expect(sheet).toContain("if (event.key === 'Escape') onClose();");
    expect(sheet).toContain('onMouseDown={onClose}');
    expect(sheet).toContain('onMouseDown={(event) => event.stopPropagation()}');
    expect(sheet).toContain('aria-label="Fechar"');
  });

  it('keeps global navigation in a fixed icon rail with labelled items', () => {
    for (const href of ['/zetel', '/parceiros', '/memoria', '/configuracoes']) {
      expect(sidebar).toContain(`href: '${href}'`);
    }
    expect(sidebar).toContain("aria-current={active ? 'page' : undefined}");
    expect(sidebar).toContain('<ThemeToggle initialTheme={theme} />');
    expect(css).toMatch(/\.rail\s*\{[^}]*width:\s*76px;/);
  });

  it('passes the selected Zetel to rename and trash dialogs without losing the menu click', () => {
    expect(list).toContain('if (!menuRef.current?.contains(e.target as Node)) setMenuId(null)');
    expect(list).toContain('onClick={() => setMenuId((current) => current === z.id ? null : z.id)}');
    expect(list).not.toContain('onMouseDown=');
    expect(list).toContain("setDialog({ kind: 'rename', zetel: z })");
    expect(list).toContain("setDialog({ kind: 'trash', zetel: z })");
    expect(list).toContain('<RenameDialog zetel={dialog.zetel}');
    expect(list).toContain('<TrashDialog zetel={dialog.zetel}');
    expect(list).toMatch(/fetch\(`\/api\/zetels\/\$\{zetel\.id\}`,\s*\{\s*method: 'PATCH'/);
    expect(list).toMatch(/fetch\(`\/api\/zetels\/\$\{zetel\.id\}`,\s*\{ method: 'DELETE' \}/);
    expect(list).toContain('current.filter((z) => z.id !== dialog.zetel.id)');
    expect(list).toContain('router.refresh()');
  });

  it('opens a new Zetel from the returned slug and reuses upload for source onboarding', () => {
    expect(list).toContain('onCreated(data.zetel.slug)');
    expect(list).toContain('router.push(`/zetel/${slug}`)');
    expect(page).toContain("SELECT 1 FROM zetel_files WHERE zetel_id = ? LIMIT 1");
    expect(page).toContain('hasSources={hasSources}');
    expect(workspace).toContain('if (!hasSources) {');
    expect(workspace).toContain('<ArquivosPanel zetelId={zetelId} onboarding />');
    expect(files).toContain('Adicione fontes para começar');
    expect(files).toContain("fetch(`/api/zetels/${zetelId}/files`, { method: 'POST', body: form })");
    expect(files).toContain('router.refresh()');
  });
});
