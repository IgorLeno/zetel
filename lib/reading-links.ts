/**
 * Query dos dois modos de consumo do material:
 * - "Original": o primeiro PDF do Zetel; sem PDF, o Documento Técnico (Markdown
 *   renderizado de forma determinística, sem LLM);
 * - "Guia de estudo": conteúdo digerido pela LLM e renderizado por template.
 * Preserva os demais parâmetros (ex.: `painel`).
 */
export function originalReadingQuery(current: string, originalPdfId: string | null): string {
  const params = new URLSearchParams(current);
  params.delete('page');
  if (originalPdfId) {
    params.set('view', 'pdf');
    params.set('file', originalPdfId);
  } else {
    params.set('view', 'tecnico');
    params.delete('file');
  }
  return params.toString();
}

export function guideReadingQuery(current: string): string {
  const params = new URLSearchParams(current);
  params.set('view', 'guia-estudo');
  params.delete('file');
  params.delete('page');
  return params.toString();
}
