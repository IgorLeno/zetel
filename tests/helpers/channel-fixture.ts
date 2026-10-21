/** Fixtures do canal do curador (SPEC-018): imagens mínimas por magic bytes e relatório D3. */
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>');

/** Relatório válido para `slug`; cada imagem é declarada e referenciada no Resumo. */
export function reportFixture(slug: string, images: string[] = [], body = ''): string {
  const fm = images.length > 0 ? `images: [${images.join(', ')}]\n` : '';
  const refs = images.map((name) => `![${name}](${name})`).join('\n\n');
  return (
    `---\nzetel_report: 1\nzetel: ${slug}\ntitle: "Relatório"\ndate: 2026-10-21\n${fm}---\n\n` +
    `## Resumo\n\nTexto.\n\n${refs}\n${body}`
  );
}
