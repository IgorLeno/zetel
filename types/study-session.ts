import type { ProfileOverrides } from '@/lib/tutor-profiles';

export type FocusScope = 'selection' | 'page' | 'section' | 'document' | 'zetel';

/** Só identidade/posição; texto de seleção nunca é estado da sessão. */
export interface FocusState {
  scope: FocusScope;
  fileId: string | null;
  pageNumber: number | null;
  /** "começo" / "final": restringe o retrieval, sem parser livre. */
  hint?: 'beginning' | 'end' | null;
}

export type StudySessionStatus = 'active' | 'paused' | 'archived';

export interface StudySession {
  id: string;
  zetelId: string;
  title: string;
  status: StudySessionStatus;
  focus: FocusState | null;
  profileId: string;
  profileOverrides: ProfileOverrides | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}
