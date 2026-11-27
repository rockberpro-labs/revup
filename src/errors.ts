/** Expected error (invalid input/usage) — the CLI prints the message without a stack trace. */
export class RevupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevupError";
  }
}
