import { describe, expect, it } from 'vitest';
import { buildStepUrl, planBuildSteps } from '@/lib/reading-build-plan';

describe('planBuildSteps — processar e gerar num clique', () => {
  it('processa e monta o documento antes do guia quando as fontes mudaram', () => {
    expect(planBuildSteps({ mode: 'guia-estudo', readingStale: true, tecnicoBuilt: true }))
      .toEqual(['process', 'tecnico', 'guia-estudo']);
  });

  it('processa antes do primeiro guia mesmo sem aviso de fontes mudadas', () => {
    expect(planBuildSteps({ mode: 'guia-estudo', readingStale: false, tecnicoBuilt: false }))
      .toEqual(['process', 'tecnico', 'guia-estudo']);
  });

  it('gera só o guia quando a leitura está em dia', () => {
    expect(planBuildSteps({ mode: 'guia-estudo', readingStale: false, tecnicoBuilt: true }))
      .toEqual(['guia-estudo']);
  });

  it('no documento, processa quando preciso e nunca monta duas vezes', () => {
    expect(planBuildSteps({ mode: 'tecnico', readingStale: true, tecnicoBuilt: true })).toEqual(['process', 'tecnico']);
    expect(planBuildSteps({ mode: 'tecnico', readingStale: false, tecnicoBuilt: false })).toEqual(['process', 'tecnico']);
    expect(planBuildSteps({ mode: 'tecnico', readingStale: false, tecnicoBuilt: true })).toEqual(['tecnico']);
  });

  it('usa só as rotas que já existem', () => {
    expect(buildStepUrl('z1', 'process')).toBe('/api/zetels/z1/process');
    expect(buildStepUrl('z1', 'tecnico')).toBe('/api/zetels/z1/build');
    expect(buildStepUrl('z1', 'guia-estudo')).toBe('/api/zetels/z1/build?mode=guia-estudo');
  });
});
