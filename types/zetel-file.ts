/**
 * Arquivo .md anexado a um Zetel (Módulo 3). Forma camelCase consumida por
 * serviço, rotas e UI. O mapeamento a partir do snake_case do SQLite vive em
 * `lib/ingestao-service.ts` (`rowToFile`).
 */
export interface ZetelFile {
  id: string;
  zetelId: string;
  filename: string;
  orderIndex: number;
  contentHash: string | null;
  sizeBytes: number | null;
  lastSeenMtime: number | null;
  createdAt: string;
  updatedAt: string;
  /** Campo virtual (não persiste): detectado em tempo de listagem via stat/hash. */
  driftDetected?: boolean;
}
