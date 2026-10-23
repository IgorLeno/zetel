/**
 * Preload do servidor do E2E do curador (SPEC-018 tarefa 008), via
 * `NODE_OPTIONS=--import`: troca o `fetch` global antes do Next carregar.
 *
 * - `https://openrouter.ai/...` responde com um JSON de curadoria fixo,
 *   citando os dois primeiros anchors que o prompt trouxer em `<fonte>`.
 * - Qualquer outro host fora do loopback é recusado: este E2E nunca usa rede.
 */
const realFetch = globalThis.fetch;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function curationReply(body) {
  const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';
  const anchors = [...user.matchAll(/<fonte anchor="([^"]+)"/g)].map((m) => m[1]);
  const [first, second = first] = anchors;
  const candidatos = first
    ? [
        { tipo: 'nota', anchor: first, titulo: 'Entalpia no processo isobárico', corpo: 'Em pressão constante, o calor trocado é ΔH.' },
        { tipo: 'conceito', anchor: second, nome: 'Entalpia', definicao: 'Grandeza H = U + PV.' },
      ]
    : [];
  return { choices: [{ message: { content: JSON.stringify({ candidatos }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.hostname === 'openrouter.ai') {
    const body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify(curationReply(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (!LOOPBACK.has(url.hostname)) throw new Error('E2E do curador: rede externa bloqueada.');
  return realFetch(input, init);
};
