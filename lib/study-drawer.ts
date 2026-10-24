/** Gaveta "Fontes & notas" do Zetel: valores aceitos em `?painel=`. */
export type DrawerView =
  | 'arquivos'
  | 'notas-rapidas'
  | 'notas-literatura'
  | 'notas-elaboradas'
  | 'notas-do-usuario'
  | 'curadoria'
  | 'artefatos';

export const DRAWER_VIEWS: readonly DrawerView[] = [
  'arquivos', 'notas-rapidas', 'notas-literatura', 'notas-elaboradas', 'notas-do-usuario', 'curadoria', 'artefatos',
];

export function isDrawerView(value: string | null): value is DrawerView {
  return value !== null && (DRAWER_VIEWS as readonly string[]).includes(value);
}

/** Query da tela com a gaveta aberta em `view` (sem perder os outros parâmetros). */
export function drawerQuery(search: string, view: DrawerView): string {
  const params = new URLSearchParams(search);
  // `view` antigo com nome de gaveta vira leitura; a gaveta passa a viver em `painel`.
  if (isDrawerView(params.get('view'))) params.set('view', 'tecnico');
  params.set('painel', view);
  return params.toString();
}
