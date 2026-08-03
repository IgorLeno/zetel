/**
 * Preserva o contrato comum de erro dos comandos: mensagem, guarda,
 * nextAction e exit 2 apenas para uso incorreto.
 * @param {NodeJS.WritableStream} stderr
 * @param {unknown} error
 */
export function writeError(stderr, error) {
  const issue = error instanceof Error ? error.message : String(error);
  const meta = error && typeof error === 'object'
    ? /** @type {{ guard?: string, nextAction?: string }} */ (error)
    : {};
  stderr.write(`${issue}\nguard: ${meta.guard ?? 'runtime'}\nnextAction: ${meta.nextAction ?? 'Verifique os argumentos e tente novamente.'}\n`);
  return meta.guard === 'usage' ? 2 : 1;
}
