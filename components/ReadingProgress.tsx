'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

const SIZE = 22;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function ProgressRing({ percent }: { percent: number }) {
  const dash = CIRC * (percent / 100);
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        opacity={0.18}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeDasharray={`${dash} ${CIRC}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        style={{ transition: 'stroke-dasharray 0.3s ease' }}
      />
    </svg>
  );
}

export function ReadingProgress({ theme }: { theme: 'light' | 'dark' }) {
  const [percent, setPercent] = useState(0);
  const [sectionTitle, setSectionTitle] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: MessageEvent) {
      const d = e.data;
      if (!d || d.type !== 'zetel:page-change') return;
      if (typeof d.percent === 'number') setPercent(d.percent);
      if (typeof d.guideBlockTitle === 'string') {
        setSectionTitle(d.guideBlockTitle);
      } else if (d.readingMode === 'tecnico') {
        setSectionTitle(null);
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="topbar-reading-progress">
      {sectionTitle && (
        <span className="topbar-section-title" title={sectionTitle}>
          {sectionTitle}
        </span>
      )}
      <span className="topbar-percent-badge" title={`${percent}% lido`}>
        <ProgressRing percent={percent} />
        <span>{percent}%</span>
      </span>
      <Link href="/memoria" className="topbar-icon-link" title="Memória" aria-label="Memória">
        <svg viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3.5l2.5 1.5" />
        </svg>
      </Link>
      <Link href="/configuracoes" className="topbar-icon-link" title="Configurações" aria-label="Configurações">
        <svg viewBox="0 0 16 16">
          <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
          <path d="M8 2v1M8 13v1M2 8H1m14 0h-1m-2.05-4.95-.7.7M4.75 11.25l-.7.7M11.25 11.25l.7.7M4.05 3.05l.7.7" />
        </svg>
      </Link>
      <ThemeToggle initialTheme={theme} />
    </div>
  );
}
