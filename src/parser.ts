import { DelayNoticeSchema, type DelayNotice } from "./schemas.js";

export type ParseFailure = {
  success: false;
  error: string;
  field?: "train" | "station" | "expectedTime" | "schema";
};

export type ParseSuccess = {
  success: true;
  data: DelayNotice;
};

export type ParseResult = ParseSuccess | ParseFailure;

// TRAIN <number>, with an optional colon: "TRAIN: 12137", "Train 12137", "TRAIN12137".
const TRAIN_RE = /\bTRAIN\b\s*:?\s*([0-9]{3,6})\b/iu;

// STATION <code> or AT <code>: "STATION: PUNE", "at PUNE".
const STATION_RE = /\b(?:STATION|AT)\b\s*:?\s*([A-Za-z]{2,10})\b/iu;

// EXPECTED <HH:MM>, optionally "EXPECTED TIME": "EXPECTED: 18:45", "expected 9:05".
const EXPECTED_RE = /\bEXPECTED(?:\s+TIME)?\b\s*:?\s*([0-9]{1,2}:[0-9]{2})\b/iu;

// REASON <free text, unicode-safe>: everything after the keyword to end of notice.
const REASON_RE = /\bREASON\b\s*:?\s*(.+)$/iu;

/**
 * Collapses newlines/tabs/repeated whitespace into single spaces so both the
 * multi-line "TRAIN:\nSTATION:\n..." style and single-line sentence style
 * notices can be matched with the same set of regexes.
 */
function normalize(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Pads a captured "H:MM" or "HH:MM" time to a strict two-digit "HH:MM". */
function normalizeTime(raw: string): string {
  const [hourStr, minuteStr] = raw.split(":");
  const hour = hourStr.padStart(2, "0");
  return `${hour}:${minuteStr}`;
}

/**
 * Parses a raw, possibly messy railway delay notice into structured data.
 *
 * Nobody pays for a notice Meera couldn't read: this function never throws
 * and never returns partial/best-effort output. It either returns a fully
 * schema-valid DelayNotice, or a ParseFailure describing what could not be
 * extracted. Callers (see src/handlers.ts) must reject the HTTP request with
 * a 4xx *before* payment settlement whenever this returns success: false.
 */
export function parseDelayNotice(rawInput: string): ParseResult {
  const text = normalize(rawInput);

  if (text.length === 0) {
    return { success: false, error: "Notice is empty.", field: "train" };
  }

  const trainMatch = text.match(TRAIN_RE);
  if (!trainMatch) {
    return {
      success: false,
      error: "Could not extract a train number from the notice.",
      field: "train",
    };
  }

  const stationMatch = text.match(STATION_RE);
  if (!stationMatch) {
    return {
      success: false,
      error: "Could not extract a station code from the notice.",
      field: "station",
    };
  }

  const expectedMatch = text.match(EXPECTED_RE);
  if (!expectedMatch) {
    return {
      success: false,
      error: "Could not extract an expected time from the notice.",
      field: "expectedTime",
    };
  }

  const reasonMatch = text.match(REASON_RE);
  const reason = reasonMatch?.[1]?.trim();

  const candidate = {
    train: trainMatch[1],
    station: stationMatch[1].toUpperCase(),
    expectedTime: normalizeTime(expectedMatch[1]),
    ...(reason ? { reason } : {}),
  };

  const validated = DelayNoticeSchema.safeParse(candidate);
  if (!validated.success) {
    return {
      success: false,
      error: `Parsed fields failed schema validation: ${validated.error.issues
        .map((i) => i.message)
        .join("; ")}`,
      field: "schema",
    };
  }

  return { success: true, data: validated.data };
}
