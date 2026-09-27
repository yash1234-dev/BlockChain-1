import { z } from "zod";
import { MAX_BULK_NOTICES, MAX_NOTICE_LENGTH } from "./config.js";

/**
 * Explicit output schema. Every value the parser produces MUST pass this
 * schema before it is ever sent back to a caller. This is checked in
 * src/parser.ts (parseDelayNotice) and enforced again in src/handlers.ts.
 */
export const DelayNoticeSchema = z.object({
  train: z
    .string()
    .min(1, "train must not be empty")
    .max(20, "train number looks too long to be real"),
  station: z
    .string()
    .min(1, "station must not be empty")
    .max(20, "station code looks too long to be real"),
  expectedTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expectedTime must be HH:MM in 24h format"),
  reason: z.string().min(1).max(300).optional(),
});

export type DelayNotice = z.infer<typeof DelayNoticeSchema>;

// ---- Request body schemas ----

export const ParseRequestSchema = z.object({
  notice: z
    .string()
    .min(1, "notice must not be empty")
    .max(MAX_NOTICE_LENGTH, `notice must be at most ${MAX_NOTICE_LENGTH} characters`),
});

export const BulkParseRequestSchema = z.object({
  notices: z
    .array(
      z
        .string()
        .min(1, "each notice must not be empty")
        .max(MAX_NOTICE_LENGTH, `each notice must be at most ${MAX_NOTICE_LENGTH} characters`),
    )
    .min(1, "notices must contain at least one entry")
    .max(MAX_BULK_NOTICES, `notices must contain at most ${MAX_BULK_NOTICES} entries`),
});
