import type { Request, Response } from "express";
import { parseDelayNotice } from "./parser.js";
import { BulkParseRequestSchema, ParseRequestSchema } from "./schemas.js";
import { MAX_BULK_NOTICES } from "./config.js";

/**
 * GET /health - the one free route.
 */
export function handleHealth(_req: Request, res: Response): void {
  res.status(200).json({ status: "ok", service: "operators-booth" });
}

/**
 * POST /api/parse - paid single-notice route.
 *
 * Validation and parsing happen synchronously here, before this handler
 * sends any response. Because x402-express only settles payment when the
 * response status is < 400, returning 400/422 from this function is what
 * stops the caller from being charged for a notice Meera couldn't read.
 */
export function handleParseSingle(req: Request, res: Response): void {
  const body = ParseRequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: "Invalid request body.",
      details: body.error.issues.map((i) => i.message),
    });
    return;
  }

  const result = parseDelayNotice(body.data.notice);
  if (!result.success) {
    res.status(422).json({
      error: "Could not parse railway delay notice.",
      reason: result.error,
      field: result.field,
    });
    return;
  }

  res.status(200).json(result.data);
}

/**
 * POST /api/parse/bulk - paid bulk route.
 *
 * Per-notice failures are reported inline (a caller can still see which
 * lines failed), but the whole request is rejected with 4xx - and therefore
 * never settled - unless at least one notice parses successfully. This
 * keeps the "you only pay for what could be read" guarantee meaningful for
 * bulk requests: an all-garbage batch is never charged.
 */
export function handleParseBulk(req: Request, res: Response): void {
  const body = BulkParseRequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: "Invalid request body.",
      details: body.error.issues.map((i) => i.message),
    });
    return;
  }

  if (body.data.notices.length > MAX_BULK_NOTICES) {
    res.status(413).json({ error: `Too many notices; max is ${MAX_BULK_NOTICES}.` });
    return;
  }

  const results = body.data.notices.map((notice) => {
    const result = parseDelayNotice(notice);
    return result.success
      ? { ok: true as const, data: result.data }
      : { ok: false as const, error: result.error, field: result.field };
  });

  const anySucceeded = results.some((r) => r.ok);
  if (!anySucceeded) {
    res.status(422).json({
      error: "Could not parse any notice in this batch.",
      results,
    });
    return;
  }

  res.status(200).json({ results });
}
