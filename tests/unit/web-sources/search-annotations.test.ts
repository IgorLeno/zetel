import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRUSTED_DOMAINS,
  MAX_CANDIDATES,
  SNIPPET_MAX_CHARS,
  normalizeUrlKey,
  parseSearchAnnotations,
} from '@/lib/web-search-service';

function citation(url: string, title = 'Título', content = 'Trecho da página.') {
  return { type: 'url_citation', url_citation: { url, title, content, start_index: 0, end_index: 10 } };
}

function response(annotations: unknown) {
  return { choices: [{ message: { role: 'assistant', content: 'ok', annotations } }] };
}

describe('normalizeUrlKey (SPEC-012 RF5)', () => {
  it('ignora www, hash, barra final, porta padrão e esquema para dedup', () => {
    const a = normalizeUrlKey('https://www.Example.org/wiki/Fourier/#Hist');
    expect(a).toBe(normalizeUrlKey('http://example.org/wiki/Fourier'));
    expect(a).toBe(normalizeUrlKey('https://example.org:443/wiki/Fourier'));
  });

  it('preserva a query e diferencia caminhos', () => {
    expect(normalizeUrlKey('https://a.org/x?id=1')).not.toBe(normalizeUrlKey('https://a.org/x?id=2'));
    expect(normalizeUrlKey('https://a.org/x')).not.toBe(normalizeUrlKey('https://a.org/y'));
  });

  it('recusa esquemas não http(s) e URLs inválidas', () => {
    expect(normalizeUrlKey('javascript:alert(1)')).toBeNull();
    expect(normalizeUrlKey('ftp://a.org/x')).toBeNull();
    expect(normalizeUrlKey('file:///etc/passwd')).toBeNull();
    expect(normalizeUrlKey('não é url')).toBeNull();
  });
});

describe('parseSearchAnnotations (SPEC-012 RF5)', () => {
  it('extrai título, site, snippet, url e trusted', () => {
    const out = parseSearchAnnotations(
      response([citation('https://pt.wikipedia.org/wiki/S%C3%A9rie_de_Fourier', 'Série de Fourier', 'Uma série…')]),
      DEFAULT_TRUSTED_DOMAINS,
    );
    expect(out).toEqual([
      {
        title: 'Série de Fourier',
        site: 'pt.wikipedia.org',
        snippet: 'Uma série…',
        url: 'https://pt.wikipedia.org/wiki/S%C3%A9rie_de_Fourier',
        trusted: true,
      },
    ]);
  });

  it('deduplica por URL normalizada mantendo a primeira ocorrência', () => {
    const out = parseSearchAnnotations(
      response([
        citation('https://www.nature.com/articles/x#abs', 'Primeira'),
        citation('https://nature.com/articles/x/', 'Segunda'),
        citation('https://nature.com/articles/y', 'Terceira'),
      ]),
      DEFAULT_TRUSTED_DOMAINS,
    );
    expect(out.map((c) => c.title)).toEqual(['Primeira', 'Terceira']);
  });

  it('aceita só http(s)', () => {
    const out = parseSearchAnnotations(
      response([citation('javascript:alert(1)'), citation('data:text/html,x'), citation('https://arxiv.org/abs/1')]),
      DEFAULT_TRUSTED_DOMAINS,
    );
    expect(out.map((c) => c.url)).toEqual(['https://arxiv.org/abs/1']);
  });

  it('corta o snippet em 300 caracteres e colapsa espaços', () => {
    const long = 'palavra   '.repeat(100);
    const [c] = parseSearchAnnotations(response([citation('https://arxiv.org/abs/2', 'T', long)]), []);
    expect(c!.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
    expect(c!.snippet).not.toMatch(/\s{2,}/);
  });

  it('remove controles do título e usa o site quando falta título', () => {
    const [a, b] = parseSearchAnnotations(
      response([citation('https://arxiv.org/abs/3', 'A\u0000B\u2028C'), citation('https://arxiv.org/abs/4', '')]),
      [],
    );
    expect(a!.title).toBe('A B C');
    expect(b!.title).toBe('arxiv.org');
  });

  it('descarta URL acima de 2048 caracteres (mesmo teto do import por link)', () => {
    const long = `https://arxiv.org/abs/${'a'.repeat(2100)}`;
    const out = parseSearchAnnotations(response([citation(long), citation('https://arxiv.org/abs/ok')]), []);
    expect(out.map((c) => c.url)).toEqual(['https://arxiv.org/abs/ok']);
  });

  it('limita a 8 candidatas', () => {
    const many = Array.from({ length: 12 }, (_, i) => citation(`https://arxiv.org/abs/${i}`));
    expect(parseSearchAnnotations(response(many), [])).toHaveLength(MAX_CANDIDATES);
  });

  it('aceita o formato plano { url, title, content }', () => {
    const out = parseSearchAnnotations(
      response([{ type: 'url_citation', url: 'https://arxiv.org/abs/5', title: 'Plano', content: 'x' }]),
      [],
    );
    expect(out[0]).toMatchObject({ url: 'https://arxiv.org/abs/5', title: 'Plano', trusted: false });
  });

  it('é tolerante a resposta sem annotations ou malformada', () => {
    expect(parseSearchAnnotations(response(undefined), [])).toEqual([]);
    expect(parseSearchAnnotations({}, [])).toEqual([]);
    expect(parseSearchAnnotations(null, [])).toEqual([]);
    expect(parseSearchAnnotations(response('x'), [])).toEqual([]);
    expect(parseSearchAnnotations(response([null, 1, { type: 'file' }, { url_citation: { url: 42 } }]), [])).toEqual(
      [],
    );
  });
});
