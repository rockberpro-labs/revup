/** Erro esperado (entrada/uso inválido) — a CLI imprime a mensagem sem stack. */
export class RevupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevupError";
  }
}
