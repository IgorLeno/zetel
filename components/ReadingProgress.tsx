'use client';

import { useEffect, useState } from 'react';

const SIZE = 22;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

type ProgressPosition = {
  current: number;
  total: number;
} | null;

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

export function ReadingProgress() {
  const [percent, setPercent] = useState(0);
  const [sectionTitle, setSectionTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressPosition>(null);

  useEffect(() => {
    function handler(e: MessageEvent) {
      const d = e.data;
      if (!d || d.type !== 'zetel:page-change') return;
      if (typeof d.percent === 'number') {
        setPercent(Math.max(0, Math.min(100, d.percent)));
      }
      if (typeof d.guideBlockTitle === 'string') {
        setSectionTitle(d.guideBlockTitle);
      } else if (d.readingMode === 'tecnico') {
        setSectionTitle(null);
      }

      if (
        d.readingMode === 'guia-estudo' &&
        typeof d.guideBlockIndex === 'number' &&
        typeof d.guideBlockTotal === 'number' &&
        d.guideBlockTotal > 0
      ) {
        setProgress({
          current: Math.max(1, Math.min(d.guideBlockIndex + 1, d.guideBlockTotal)),
          total: d.guideBlockTotal,
        });
      } else if (
        d.readingMode === 'tecnico' &&
        typeof d.pageIndex === 'number' &&
        typeof d.pagesCount === 'number' &&
        d.pagesCount > 0
      ) {
        setProgress({
          current: Math.max(1, Math.min(d.pageIndex + 1, d.pagesCount)),
          total: d.pagesCount,
        });
      } else {
        setProgress(null);
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const progressLabel = progress ? `${progress.current} / ${progress.total}` : null;
  // Sem leitura aberta ainda: não mostra um "0%" solto no topo.
  if (percent === 0 && !progress) return null;

  return (
    <div className="topbar-reading-progress">
      {sectionTitle && (
        <span className="topbar-section-title" title={sectionTitle}>
          {sectionTitle}
        </span>
      )}
      <span
        className="topbar-percent-badge"
        title={progressLabel ? `${percent}% lido · ${progressLabel}` : `${percent}% lido`}
      >
        <ProgressRing percent={percent} />
        <span>{percent}%</span>
        {progressLabel && <span className="topbar-progress-count">{progressLabel}</span>}
      </span>
    </div>
  );
}
