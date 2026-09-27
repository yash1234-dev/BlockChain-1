import { describe, expect, it } from "vitest";
import { parseDelayNotice } from "../src/parser.js";

describe("parseDelayNotice - valid notices", () => {
  it("parses a colon-labeled, multi-line notice", () => {
    const result = parseDelayNotice(
      "TRAIN: 12137\nSTATION: PUNE\nEXPECTED: 18:45\nREASON: Heavy rainfall",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        train: "12137",
        station: "PUNE",
        expectedTime: "18:45",
        reason: "Heavy rainfall",
      });
    }
  });

  it("parses a sentence-style notice without colons", () => {
    const result = parseDelayNotice("Train 11010 at NGP expected 21:30 reason track maintenance");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.train).toBe("11010");
      expect(result.data.station).toBe("NGP");
      expect(result.data.expectedTime).toBe("21:30");
      expect(result.data.reason).toBe("track maintenance");
    }
  });

  it("parses a notice with no reason (reason is optional)", () => {
    const result = parseDelayNotice("TRAIN 12137 AT PUNE EXPECTED 18:45");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBeUndefined();
    }
  });

  it("preserves Hindi/Marathi Unicode reason text", () => {
    const result = parseDelayNotice("TRAIN 12137 STATION PUNE EXPECTED 18:45 REASON भारी बारिश");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("भारी बारिश");
    }
  });

  it("preserves Marathi Unicode reason text with a different notice", () => {
    const result = parseDelayNotice("TRAIN 11010 STATION NGP EXPECTED 21:30 REASON मुसळधार पाऊस");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("मुसळधार पाऊस");
    }
  });

  it("pads single-digit hours to strict HH:MM", () => {
    const result = parseDelayNotice("TRAIN 12137 AT PUNE EXPECTED 9:05 REASON fog");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expectedTime).toBe("09:05");
    }
  });
});

describe("parseDelayNotice - malformed notices", () => {
  it("rejects free text with no structure", () => {
    const result = parseDelayNotice("hello this train is late");
    expect(result.success).toBe(false);
  });

  it("rejects a notice missing the train number", () => {
    const result = parseDelayNotice("STATION PUNE REASON Heavy rain");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe("train");
  });

  it("rejects a notice with a non-numeric train value", () => {
    const result = parseDelayNotice("TRAIN ABC EXPECTED sometime");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe("train");
  });

  it("rejects a notice missing the station", () => {
    const result = parseDelayNotice("TRAIN 12137 EXPECTED 18:45");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe("station");
  });

  it("rejects a notice missing the expected time", () => {
    const result = parseDelayNotice("TRAIN 12137 AT PUNE REASON signal failure");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe("expectedTime");
  });

  it("rejects an empty notice", () => {
    const result = parseDelayNotice("   ");
    expect(result.success).toBe(false);
  });

  it("never returns partial output for an invalid notice", () => {
    const result = parseDelayNotice("The train is late.");
    expect(result).not.toHaveProperty("data");
  });
});
