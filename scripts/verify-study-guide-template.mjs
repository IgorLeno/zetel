import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../lib/study-guide-service.ts', import.meta.url), 'utf8');

assert.match(
  source,
  /navLink\('secoes', 'Seções'\)/,
  'sidebar deve ter link proprio para o grupo "Seções"',
);
assert.match(
  source,
  /<section id="secoes" class="secoes" data-nav-section="secoes">/,
  'container de secoes deve ter id e data-nav-section proprios',
);
assert.match(
  source,
  /item\.querySelectorAll\('\.quiz-option'\)/,
  'quiz deve consultar opcoes localmente por item',
);
assert.doesNotMatch(
  source,
  /bySel\.call\(null, '\.quiz-option'\)/,
  'quiz nao deve consultar .quiz-option globalmente via bySel.call',
);

console.log('study-guide template checks passed');
