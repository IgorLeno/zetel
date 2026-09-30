'use client';

import { useMemo } from 'react';
import 'katex/dist/katex.min.css';
import { renderChatMath, splitMath } from '@/lib/chat-math';

/**
 * Texto do chat com trechos `$…$`, `$$…$$`, `\(…\)` e `\[…\]` renderizados por
 * KaTeX (`trust: false`, ver `lib/chat-math.ts`). O resto segue texto puro;
 * trecho que não compila aparece cru, como antes.
 */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(() => splitMath(text), [text]);
  return (
    <span>
      {parts.map((part, index) => {
        if (part.kind === 'text') return <span key={index}>{part.text}</span>;
        const html = renderChatMath(part.tex, part.display);
        if (html === null) return <span key={index}>{part.raw}</span>;
        return (
          <span
            key={index}
            className={part.display ? 'chat-math chat-math--display' : 'chat-math'}
            // HTML gerado pelo KaTeX com trust:false; nunca o texto da LLM direto.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}
