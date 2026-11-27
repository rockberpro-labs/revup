import { z } from "zod";

export const MAX_BULLET = 240;
export const MAX_BULLETS_PER_SECTION = 40;
export const MAX_SPEC_LINES = 200;

const CiteList = z.array(z.string().regex(/^F-[0-9a-f]{8}$/));

/** A bullet that needs evidence, unless it says "None...". */
export const CitedBullet = z
  .object({ text: z.string().max(MAX_BULLET, `bullet over ${MAX_BULLET} characters`), cites: CiteList, none: z.boolean() })
  .refine((b) => b.none || b.cites.length > 0, { message: "bullet without a citation [F-xxxxxxxx]" });

const CitedSection = z.array(CitedBullet).min(1, "empty section (use \"- None.\")").max(MAX_BULLETS_PER_SECTION);

export const ObservationsSchema = z.object({
  "Observed rules": CitedSection,
  Flow: CitedSection,
});

export const QuestionSchema = z.object({
  id: z.string().regex(/^Q-\d{2,}$/),
  title: z.string().min(1),
  evidence: CiteList.min(1, "question without evidence [F-xxxxxxxx]"),
  ambiguity: z.string().min(1, "empty Ambiguity").max(MAX_BULLET),
});
export type Question = z.infer<typeof QuestionSchema>;

export const SpecSchema = z.object({
  Goal: z.array(z.string().min(1).max(MAX_BULLET)).min(1, "empty Goal").max(3, "Goal over 3 lines"),
  Inputs: CitedSection,
  "Database effects": CitedSection,
  "Session effects": CitedSection,
  Rules: CitedSection,
  "Outputs/Redirects": CitedSection,
  "Open items": z
    .array(z.object({ text: z.string().max(MAX_BULLET), qrefs: z.array(z.string()), none: z.boolean() }))
    .min(1, "empty section (use \"- None.\")"),
});

export const OBSERVATIONS_SECTIONS = Object.keys(ObservationsSchema.shape);
export const SPEC_SECTIONS = Object.keys(SpecSchema.shape);
