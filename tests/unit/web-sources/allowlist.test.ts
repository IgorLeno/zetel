import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUSTED_DOMAINS, isTrustedHost } from '@/lib/web-search-service';

describe('isTrustedHost (SPEC-012 RF7 / D2)', () => {
  it('lista padrão do RF7', () => {
    expect(DEFAULT_TRUSTED_DOMAINS).toEqual([
      'wikipedia.org',
      'wikibooks.org',
      'arxiv.org',
      'scielo.org',
      'scielo.br',
      '*.gov',
      '*.gov.br',
      '*.edu',
      '*.edu.br',
      'developer.mozilla.org',
      'docs.python.org',
      'nature.com',
      'ncbi.nlm.nih.gov',
      'khanacademy.org',
      'stanford.edu',
      'mit.edu',
    ]);
  });

  it.each([
    'wikipedia.org',
    'pt.wikipedia.org',
    'en.m.wikipedia.org',
    'www.scielo.br',
    'nasa.gov',
    'www.ibge.gov.br',
    'usp.edu.br',
    'ocw.mit.edu',
    'developer.mozilla.org',
  ])('confia em %s', (host) => {
    expect(isTrustedHost(host, DEFAULT_TRUSTED_DOMAINS)).toBe(true);
  });

  it.each([
    'notwikipedia.org',
    'wikipedia.org.evil.com',
    'mozilla.org',
    'gov.evil.com',
    'example.com',
    'evilgov',
    'gov',
  ])('não confia em %s', (host) => {
    expect(isTrustedHost(host, DEFAULT_TRUSTED_DOMAINS)).toBe(false);
  });

  it('compara sem caixa e ignora ponto final', () => {
    expect(isTrustedHost('PT.Wikipedia.ORG.', DEFAULT_TRUSTED_DOMAINS)).toBe(true);
  });

  it('curinga de subdomínio não casa o domínio nu', () => {
    expect(isTrustedHost('substack.com', ['*.substack.com'])).toBe(false);
    expect(isTrustedHost('a.substack.com', ['*.substack.com'])).toBe(true);
  });

  it('lista vazia não confia em nada', () => {
    expect(isTrustedHost('pt.wikipedia.org', [])).toBe(false);
  });
});
