/** Mensagem persistida do chat por Zetel (Módulo 5). */
export interface ChatMessage {
  id: string;
  zetelId: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  model: string;
  createdAt: string;
}

export interface NewChatMessage {
  zetelId: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  model: string;
}
