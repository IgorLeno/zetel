import type Database from 'better-sqlite3';

// Singleton do better-sqlite3 sobrevive ao hot-reload do Next.js via globalThis
// (o módulo é re-avaliado, mas o processo Node não reinicia). Validado no spike C.
declare global {
  // eslint-disable-next-line no-var
  var __zetelDb: Database.Database | undefined;
}

export {};
