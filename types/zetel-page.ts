/**
 * Página derivada da ingestão (Módulo 3). Unidade lógica segmentada a partir do
 * Markdown; é o que o cliente referencia por `page_id`/`anchor` no chat (D8).
 * Mapeamento snake→camel em `lib/ingestao-service.ts` (`rowToPage`).
 */
export interface ZetelPage {
  id: number;
  zetelId: string;
  pageIndex: number;
  heading: string;
  anchor: string;
  contentText: string;
  contentHash: string;
  createdAt: string;
}
