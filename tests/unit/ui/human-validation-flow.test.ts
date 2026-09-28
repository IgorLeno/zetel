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

describe('human validation UI flow', () => {
  it('closes Mais áreas outside, on Escape, on navigation and on a second trigger click', () => {
    expect(sidebar).toContain("if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)");
    expect(sidebar).toContain("if (event.key === 'Escape') setMoreOpen(false)");
    expect(sidebar).toMatch(/useEffect\(\(\) => setMoreOpen\(false\), \[activeView, pathname, query, slug, collapsed\]\)/);
    expect(sidebar).toContain('onClick={() => setMoreOpen((open) => !open)}');
    for (const view of ['tecnico', 'guia-estudo', 'arquivos', 'notas-rapidas', 'notas-literatura', 'notas-elaboradas', 'notas-do-usuario', 'artefatos']) {
      expect(sidebar).toContain(`view: '${view}'`);
    }
  });

  it('keeps the sidebar toggle separate from the logo and synchronizes both visual states', () => {
    expect(sidebar).toContain('onClick={toggleCollapsed}');
    expect(sidebar).toContain('aria-expanded={!collapsed}');
    expect(sidebar).toContain('setCollapsed(next)');
    expect(sidebar).toContain('syncRailAttribute(next)');
    expect(sidebar).toContain("document.documentElement.dataset.sidebarCollapsed = 'true'");
    expect(css).toMatch(/\.sidebar-toggle\s*\{[^}]*width:\s*28px;[^}]*height:\s*48px;/);
    expect(css).toMatch(/\.logo-mark\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/);
    expect(css).not.toMatch(/\.logo-mark\s*\{[^}]*box-shadow:/);
    expect(css).not.toMatch(/\.logo-mark\s*\{[^}]*background:/);
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
    expect(workspace).toContain('if (!hasSources && isReadingView(view))');
    expect(workspace).toContain('<ArquivosPanel zetelId={zetelId} onboarding />');
    expect(files).toContain('Adicione fontes para começar');
    expect(files).toContain("fetch(`/api/zetels/${zetelId}/files`, { method: 'POST', body: form })");
    expect(files).toContain('router.refresh()');
  });
});
