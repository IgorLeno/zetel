/** Metadados operacionais por mensagem (PRD §13.1; gravado em `chat_messages.meta`). */
export interface ChatMessageMeta {
  /** Anchor da página validada no turno (de `zetel_pages`). */
  pageAnchor?: string | null;
  /** Modo de leitura ativo no turno. */
  readingMode?: 'tecnico' | 'guia-estudo';
  /** Bloco visual ativo do Guia de Estudo, quando aplicável. */
  guideBlockId?: string;
  /** Seção visual ativa do Guia de Estudo, quando aplicável. */
  guideSectionId?: string;
  /** Arquivo PDF em foco no turno (SPEC-001 tarefa 003); resolvido no servidor. */
  focusFileId?: string;
  /** Página PDF em foco (1-based). */
  focusPageNumber?: number;
  /** `pdf_pages.content_hash` da página usada no turno (proveniência, sem conteúdo). */
  focusContentHash?: string;
  /** Cliente enviou seleção: `true` se verificada contra `pdf_pages` (tarefa 004, D5). */
  selectionVerified?: boolean;
  /** Offsets do recorte verificado em `pdf_pages.content_text` (UTF-16, fim exclusivo). */
  selectionStart?: number;
  selectionEnd?: number;
  /** SHA-256 do recorte verificado — proveniência sem conteúdo (regra #6). */
  selectionHash?: string;
  /** `false` se o cliente enviou conteúdo divergente do `content_hash` (D8). */
  pageHashMatch?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  /** Turno do assistente trouxe uma sugestão de nota válida (Módulo 6). */
  suggestedNote?: boolean;
  /** Tipo da nota sugerida — só a flag/tipo, nunca o conteúdo (regra #6). */
  noteTipo?: 'rapida' | 'literatura' | 'elaborada' | 'minha-nota';
  /** Usuário rejeitou a sugestão deste turno (Módulo 6). */
  noteRejected?: boolean;
  /** Uma memória foi guardada a partir desta mensagem (Módulo 7). */
  suggestedMemory?: boolean;
  /** Usuário rejeitou a sugestão de memória deste turno (Módulo 7). */
  memoryRejected?: boolean;
  /** Há memória longa no contexto deste turno — UI sugere consolidar (Módulo 7). */
  memoryLong?: boolean;
  /**
   * Mapa `[fonte:Sn]` do turno (tarefa 006). Sem texto da fonte: só o destino
   * para abrir o PDF. IDs ausentes daqui não viram link.
   */
  sources?: Record<string, CitedSource>;
}

/** Destino seguro de uma citação. O texto da fonte não entra aqui. */
export interface CitedSource {
  fileId: string | null;
  filename: string;
  pageNumber: number;
  type: 'foco' | 'selecao' | 'recuperado';
}

/** Mensagem persistida do chat por Zetel (Módulo 5). */
export interface ChatMessage {
  id: string;
  zetelId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  model: string;
  createdAt: string;
  meta?: ChatMessageMeta;
}

export interface NewChatMessage {
  zetelId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  model: string;
  meta?: ChatMessageMeta;
}
