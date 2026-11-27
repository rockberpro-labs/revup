import type { Handlers } from "./next.ts";
import type { Step } from "../state/machine.ts";

const notImplemented = (step: Step) => () => ({ ok: false, errors: [`etapa ${step} ainda não implementada`] });

/** Registro padrão; as fases 2 e 3 substituem as entradas. */
export const defaultHandlers: Handlers = {
  "01-scan": notImplemented("01-scan"),
  "02-extract": notImplemented("02-extract"),
  "03-spec": notImplemented("03-spec"),
  "04-audit": notImplemented("04-audit"),
};
