import { z } from "zod";

export const MAX_BULLET = 240;
export const MAX_BULLETS_PER_SECTION = 40;
export const MAX_SPEC_LINES = 200;

const CiteList = z.array(z.string().regex(/^F-[0-9a-f]{8}$/));

/** Bullet que precisa de evidência, salvo "Nenhum...". */
export const CitedBullet = z
  .object({ text: z.string().max(MAX_BULLET, `bullet acima de ${MAX_BULLET} caracteres`), cites: CiteList, none: z.boolean() })
  .refine((b) => b.none || b.cites.length > 0, { message: "bullet sem citação [F-xxxxxxxx]" });

const CitedSection = z.array(CitedBullet).min(1, "seção vazia (use \"- Nenhum.\")").max(MAX_BULLETS_PER_SECTION);

export const ObservationsSchema = z.object({
  "Regras observadas": CitedSection,
  Fluxo: CitedSection,
});

export const QuestionSchema = z.object({
  id: z.string().regex(/^Q-\d{2,}$/),
  title: z.string().min(1),
  evidencia: CiteList.min(1, "pergunta sem evidência [F-xxxxxxxx]"),
  ambiguidade: z.string().min(1, "Ambiguidade vazia").max(MAX_BULLET),
});
export type Question = z.infer<typeof QuestionSchema>;

export const SpecSchema = z.object({
  Objetivo: z.array(z.string().min(1).max(MAX_BULLET)).min(1, "Objetivo vazio").max(3, "Objetivo acima de 3 linhas"),
  Entradas: CitedSection,
  "Efeitos no banco": CitedSection,
  "Efeitos em sessão": CitedSection,
  Regras: CitedSection,
  "Saídas/Redirecionamentos": CitedSection,
  Pendências: z
    .array(z.object({ text: z.string().max(MAX_BULLET), qrefs: z.array(z.string()), none: z.boolean() }))
    .min(1, "seção vazia (use \"- Nenhuma.\")"),
});

export const OBSERVATIONS_SECTIONS = Object.keys(ObservationsSchema.shape);
export const SPEC_SECTIONS = Object.keys(SpecSchema.shape);
