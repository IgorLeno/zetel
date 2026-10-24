/**
 * Sequência de "Gerar guia de estudo" / "Montar documento" num clique só:
 * se as fontes mudaram (ou nada foi montado ainda), processa as fontes e monta
 * o Documento Técnico antes do artefato pedido. Sem isso o Igor precisava
 * clicar em "Processar" na gaveta de fontes primeiro.
 *
 * `processZetel` marca `reading_stale = 1` e só `renderZetel` volta a 0; por
 * isso o processamento vem sempre acompanhado do Documento Técnico, senão o
 * aviso "Fontes mudaram" ficaria aceso depois de gerar só o guia.
 */

export type BuildStep = 'process' | 'tecnico' | 'guia-estudo';

export const BUILD_STEP_LABEL: Record<BuildStep, string> = {
  process: 'Processando as fontes…',
  tecnico: 'Montando o documento de leitura…',
  'guia-estudo': 'Preparando seu guia de estudo… isso pode levar até um minuto.',
};

export function planBuildSteps({
  mode,
  readingStale,
  tecnicoBuilt,
}: {
  mode: 'tecnico' | 'guia-estudo';
  readingStale: boolean;
  tecnicoBuilt: boolean;
}): BuildStep[] {
  const steps: BuildStep[] = readingStale || !tecnicoBuilt ? ['process', 'tecnico'] : [];
  if (mode === 'guia-estudo') steps.push('guia-estudo');
  else if (steps.length === 0) steps.push('tecnico');
  return steps;
}

/** Rota de cada passo (as três já existiam; nenhuma rota nova). */
export function buildStepUrl(zetelId: string, step: BuildStep): string {
  if (step === 'process') return `/api/zetels/${zetelId}/process`;
  if (step === 'guia-estudo') return `/api/zetels/${zetelId}/build?mode=guia-estudo`;
  return `/api/zetels/${zetelId}/build`;
}
