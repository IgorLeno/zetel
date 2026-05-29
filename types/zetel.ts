/**
 * Entidade Zetel (Módulo 2). Forma camelCase consumida por serviço, rotas e UI.
 * O mapeamento a partir do snake_case do SQLite vive em `lib/zetel-service.ts`
 * (função privada `rowToZetel`).
 */
export interface Zetel {
  id: string;
  slug: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  readingStale: boolean;
  lastBuiltAt: string | null;
}
