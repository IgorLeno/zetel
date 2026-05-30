/** Metadados operacionais por mensagem (PRD §13.1; gravado em `chat_messages.meta`). */
export interface ChatMessageMeta {
  /** Anchor da página validada no turno (de `zetel_pages`). */
  pageAnchor?: string | null;
  /** `false` se o cliente enviou conteúdo divergente do `content_hash` (D8). */
  pageHashMatch?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  /** Turno do assistente trouxe uma sugestão de nota válida (Módulo 6). */
  suggestedNote?: boolean;
  /** Tipo da nota sugerida — só a flag/tipo, nunca o conteúdo (regra #6). */
  noteTipo?: 'rapida' | 'literatura';
  /** Usuário rejeitou a sugestão deste turno (Módulo 6). */
  noteRejected?: boolean;
  /** Uma memória foi guardada a partir desta mensagem (Módulo 7). */
  suggestedMemory?: boolean;
  /** Usuário rejeitou a sugestão de memória deste turno (Módulo 7). */
  memoryRejected?: boolean;
  /** Há memória longa no contexto deste turno — UI sugere consolidar (Módulo 7). */
  memoryLong?: boolean;
}

/** Mensagem persistida do chat por Zetel (Módulo 5). */
export interface ChatMessage {
  id: string;
  zetelId: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  model: string;
  createdAt: string;
  meta?: ChatMessageMeta;
}

export interface NewChatMessage {
  zetelId: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  model: string;
  meta?: ChatMessageMeta;
}
