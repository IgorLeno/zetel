import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ChatMessage, NewChatMessage } from '@/types/chat-message';
import { logger } from './logger';

interface ChatMessageRow {
  id: string;
  zetel_id: string;
  role: 'user' | 'assistant';
  content: string;
  page_index: number | null;
  model: string;
  created_at: string;
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    zetelId: row.zetel_id,
    role: row.role,
    content: row.content,
    pageIndex: row.page_index,
    model: row.model,
    createdAt: row.created_at,
  };
}

/** Histórico do Zetel, ordenado por `created_at` ASC. */
export function listMessages(db: Database.Database, zetelId: string): ChatMessage[] {
  const rows = db
    .prepare(
      'SELECT * FROM chat_messages WHERE zetel_id = ? ORDER BY created_at ASC',
    )
    .all(zetelId) as ChatMessageRow[];
  return rows.map(rowToMessage);
}

/** Últimas N mensagens (para janela de contexto no OpenRouter). */
export function listRecentMessages(
  db: Database.Database,
  zetelId: string,
  limit: number,
): ChatMessage[] {
  const rows = db
    .prepare(
      `SELECT * FROM chat_messages WHERE zetel_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(zetelId, limit) as ChatMessageRow[];
  return rows.map(rowToMessage).reverse();
}

export function saveMessage(db: Database.Database, msg: NewChatMessage): ChatMessage {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_messages (id, zetel_id, role, content, page_index, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, msg.zetelId, msg.role, msg.content, msg.pageIndex, msg.model, createdAt);
  logger.info('chat message saved', { zetelId: msg.zetelId, role: msg.role, model: msg.model });
  return {
    id,
    zetelId: msg.zetelId,
    role: msg.role,
    content: msg.content,
    pageIndex: msg.pageIndex,
    model: msg.model,
    createdAt,
  };
}

export function clearHistory(db: Database.Database, zetelId: string): void {
  db.prepare('DELETE FROM chat_messages WHERE zetel_id = ?').run(zetelId);
  logger.info('chat history cleared', { zetelId });
}

/** Busca página por índice global; null se não existir. */
export function getPageByIndex(
  db: Database.Database,
  zetelId: string,
  pageIndex: number,
): { contentText: string; heading: string } | null {
  const row = db
    .prepare(
      `SELECT content_text, heading FROM zetel_pages
       WHERE zetel_id = ? AND page_index = ?`,
    )
    .get(zetelId, pageIndex) as { content_text: string; heading: string } | undefined;
  if (!row) return null;
  return { contentText: row.content_text, heading: row.heading };
}
