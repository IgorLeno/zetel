// Entrada do Web Worker do pdf.js (tarefa 003). Um arquivo local evita que o
// Next trate o worker como pacote externo (`pdfjs-dist` está em
// serverExternalPackages por causa da extração server-side).
import 'pdfjs-dist/build/pdf.worker.min.mjs';
