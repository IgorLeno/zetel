import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Evita que o webpack tente empacotar o binário nativo do better-sqlite3.
  // Requisito permanente validado no spike C — sem isso o build falha.
  // pdfjs-dist (SPEC-001 D1) carrega o worker por import relativo em Node;
  // empacotado, o caminho do worker quebra.
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist'],
  // O indicador de dev do Next fica no canto inferior esquerdo, em cima do
  // toggle de tema no fim do trilho (SPEC-010). O overlay de erros continua.
  devIndicators: false,
  // E2E do curador (SPEC-018 tarefa 008) sobe um `next dev` isolado: com
  // `.next` próprio ele não apaga o build do dev server do Igor.
  distDir: process.env.ZETEL_NEXT_DIST_DIR || '.next',
};

export default nextConfig;
