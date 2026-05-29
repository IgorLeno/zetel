import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ChatMessage, ChatMessageMeta, NewChatMessage } from '@/types/chat-message';
import { logger } from './logger';

interface ChatMessageRow {
  id: string;
  zetel_id: string;
  role: 'user' | 'assistant';
  content: string;
  page_index: number | null;
  model: string;
  created_at: string;
  meta: string | null;
}

function parseMeta(raw: string | null): ChatMessageMeta | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ChatMessageMeta;
  } catch {
    return undefined; // meta corrompido não deve quebrar a leitura do histórico
  }
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
    meta: parseMeta(row.meta),
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
  const meta = msg.meta ? JSON.stringify(msg.meta) : null;
  db.prepare(
    `INSERT INTO chat_messages (id, zetel_id, role, content, page_index, model, created_at, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, msg.zetelId, msg.role, msg.content, msg.pageIndex, msg.model, createdAt, meta);
  logger.info('chat message saved', { zetelId: msg.zetelId, role: msg.role, model: msg.model });
  return {
    id,
    zetelId: msg.zetelId,
    role: msg.role,
    content: msg.content,
    pageIndex: msg.pageIndex,
    model: msg.model,
    createdAt,
    meta: msg.meta,
  };
}

/** Mescla (raso) um patch no `meta` de uma mensagem. Usado pelo Rejeitar de nota. */
export function updateMessageMeta(
  db: Database.Database,
  messageId: string,
  patch: ChatMessageMeta,
): void {
  const row = db
    .prepare('SELECT meta FROM chat_messages WHERE id = ?')
    .get(messageId) as { meta: string | null } | undefined;
  if (!row) return;
  const merged: ChatMessageMeta = { ...parseMeta(row.meta), ...patch };
  db.prepare('UPDATE chat_messages SET meta = ? WHERE id = ?').run(JSON.stringify(merged), messageId);
  logger.info('chat message meta updated', { messageId });
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
): { contentText: string; heading: string; anchor: string } | null {
  const row = db
    .prepare(
      `SELECT content_text, heading, anchor FROM zetel_pages
       WHERE zetel_id = ? AND page_index = ?`,
    )
    .get(zetelId, pageIndex) as
    | { content_text: string; heading: string; anchor: string }
    | undefined;
  if (!row) return null;
  return { contentText: row.content_text, heading: row.heading, anchor: row.anchor };
}
