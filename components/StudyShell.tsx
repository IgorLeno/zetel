'use client';

import type { ReactNode } from 'react';

export type StudyMode = 'reading' | 'chat';

/** Keeps both study surfaces mounted while only their visual priority changes. */
export function StudyShell({ mode, onModeChange, readingLabel, reader, chat }: {
  mode: StudyMode;
  onModeChange: (mode: StudyMode) => void;
  readingLabel: string;
  reader: ReactNode;
  chat: ReactNode;
}) {
  return (
    <div className={`study-shell study-shell--${mode}`}>
      <div className="study-shell-bar" role="group" aria-label="Modo de estudo">
        <button type="button" className={mode === 'reading' ? 'active' : ''}
          aria-pressed={mode === 'reading'} onClick={() => onModeChange('reading')}>
          {readingLabel}
        </button>
        <button type="button" className={mode === 'chat' ? 'active' : ''}
          aria-pressed={mode === 'chat'} onClick={() => onModeChange('chat')}>
          Chat
        </button>
      </div>
      <div className="study-shell-body">
        <div className="study-shell-reader" inert={mode === 'chat'} aria-hidden={mode === 'chat'}>
          {reader}
        </div>
        <div className="study-shell-chat">{chat}</div>
      </div>
    </div>
  );
}
