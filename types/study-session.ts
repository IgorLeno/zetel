export type FocusScope = 'selection' | 'page' | 'section' | 'document' | 'zetel';

/** Só identidade/posição; texto de seleção nunca é estado da sessão. */
export interface FocusState {
  scope: FocusScope;
  fileId: string | null;
  pageNumber: number | null;
}

export type StudySessionStatus = 'active' | 'paused' | 'archived';

export interface StudySession {
  id: string;
  zetelId: string;
  title: string;
  status: StudySessionStatus;
  focus: FocusState | null;
  profileId: string;
  profileOverrides: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}
