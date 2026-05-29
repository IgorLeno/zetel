/**
 * Formatação de data legível em PT-BR para a UI. Função pura, sem deps de Node —
 * segura para componentes client. Recente → relativo ("há 2 horas"); antigo →
 * data curta ("3 mai 2026").
 */

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';

  const diff = then - Date.now(); // negativo no passado
  const abs = Math.abs(diff);

  if (abs < MINUTE) return 'agora há pouco';
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');

  return dtf.format(then);
}
