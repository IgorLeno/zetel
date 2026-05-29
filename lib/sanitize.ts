import { defaultSchema } from 'hast-util-sanitize';
import type { Schema } from 'hast-util-sanitize';

/**
 * Schema de sanitização para o HTML de leitura (Spike A / Módulo 4).
 * Remove `id` do clobber para que `rehype-slug` preserve slugs nos headings.
 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobber: (defaultSchema.clobber ?? []).filter((a) => a !== 'id'),
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'id'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'className'],
  },
};
