import type { CSSProperties } from 'react';
import { partnerColorVar, type PartnerColor } from '@/lib/partner-identity';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Avatar vivo do parceiro. Puramente decorativo: o estado legível fica no
 * `voice-status` do composer, então o orb é aria-hidden.
 */
export function PartnerOrb({
  color,
  state = 'idle',
  size = 56,
  face = true,
  className,
}: {
  color?: PartnerColor | null;
  state?: OrbState;
  size?: number;
  face?: boolean;
  className?: string;
}) {
  const style = {
    '--orb-size': `${size}px`,
    ...(color ? { '--orb-c': partnerColorVar(color) } : {}),
  } as CSSProperties;
  return (
    <span
      className={`partner-orb partner-orb--${state}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden
    >
      {face && (
        <span className="partner-orb-face">
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
