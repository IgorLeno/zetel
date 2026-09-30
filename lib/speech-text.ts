import { stripFonteMarkers } from '@/lib/fonte-markers';
import { speakMath } from '@/lib/speech-math';

/**
 * Texto falável: tira marcadores `[fonte:ID]` e a sintaxe Markdown e verbaliza
 * matemática (LaTeX e símbolos Unicode) em PT-BR. O conteúdo legível permanece;
 * o que some é o que o TTS leria como ruído.
 */
export function toSpeakable(text: string): string {
  let out = text.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
    return ` ${inner} `;
  });
  out = stripFonteMarkers(out);
  // Antes do Markdown: `_` e `*` dentro de LaTeX não são ênfase.
  out = speakMath(out);
  out = out.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  out = out.replace(/\[([^\]]+)]\([^)]*\)/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
  out = out.replace(/(\*|_)(.*?)\1/g, '$2');
  out = out.replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/[ \t]+([.,;:!?])/g, '$1');
  return out;
}
