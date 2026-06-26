import { describe, it, expect } from "vitest";
import {
  parseWeekParam,
  weekRangeFromMonday,
  daysUntil,
  mondayOfWeek,
  formatISODate,
  shiftWeek,
  monthRangeSaoPaulo,
  monthKeySaoPaulo,
} from "@/lib/dates";

describe("parseWeekParam", () => {
  it("returns current week's Monday when input is missing", () => {
    const result = parseWeekParam(undefined);
    expect(result.getUTCDay()).toBe(1);
  });

  it("returns current week's Monday when input is malformed", () => {
    const result = parseWeekParam("not-a-date");
    expect(result.getUTCDay()).toBe(1);
  });

  it("snaps a mid-week date to its Monday", () => {
    const result = parseWeekParam("2026-06-19");
    expect(formatISODate(result)).toBe("2026-06-15");
  });

  it("keeps a Monday as-is", () => {
    const result = parseWeekParam("2026-06-15");
    expect(formatISODate(result)).toBe("2026-06-15");
  });

  it("takes first element of array input", () => {
    const result = parseWeekParam(["2026-06-15", "2026-06-22"]);
    expect(formatISODate(result)).toBe("2026-06-15");
  });
});

describe("weekRangeFromMonday", () => {
  it("produces 7 days starting from the input Monday", () => {
    const monday = parseWeekParam("2026-06-15");
    const range = weekRangeFromMonday(monday);

    expect(range.days).toHaveLength(7);
    expect(formatISODate(range.days[0])).toBe("2026-06-15");
    expect(formatISODate(range.days[6])).toBe("2026-06-21");
  });

  it("end is just before next Monday", () => {
    const monday = parseWeekParam("2026-06-15");
    const range = weekRangeFromMonday(monday);

    expect(range.end.getTime()).toBe(range.start.getTime() + 7 * 86_400_000 - 1);
  });

  it("crosses year boundary correctly", () => {
    const monday = parseWeekParam("2026-12-28");
    const range = weekRangeFromMonday(monday);

    expect(formatISODate(range.days[3])).toBe("2026-12-31");
    expect(formatISODate(range.days[4])).toBe("2027-01-01");
  });
});

describe("daysUntil", () => {
  it("returns positive integer for future dates", () => {
    const today = new Date("2026-06-19T15:00:00Z");
    const target = new Date("2026-06-22T08:00:00Z");
    expect(daysUntil(target, today)).toBe(3);
  });

  it("returns negative integer for past dates", () => {
    const today = new Date("2026-06-19T15:00:00Z");
    const target = new Date("2026-06-17T20:00:00Z");
    expect(daysUntil(target, today)).toBe(-2);
  });

  it("returns 0 when on same SP day", () => {
    const ref = new Date("2026-06-19T15:00:00Z");
    const target = new Date("2026-06-19T20:00:00Z");
    expect(daysUntil(target, ref)).toBe(0);
  });
});

describe("mondayOfWeek", () => {
  it("returns same Monday when given a Monday", () => {
    const monday = new Date("2026-06-15T12:00:00Z");
    expect(formatISODate(mondayOfWeek(monday))).toBe("2026-06-15");
  });

  it("returns previous Monday when given a Sunday", () => {
    const sunday = new Date("2026-06-21T12:00:00Z");
    expect(formatISODate(mondayOfWeek(sunday))).toBe("2026-06-15");
  });
});

describe("shiftWeek", () => {
  it("shifts forward by 1 week", () => {
    const monday = parseWeekParam("2026-06-15");
    expect(formatISODate(shiftWeek(monday, 1))).toBe("2026-06-22");
  });

  it("shifts backward by 2 weeks", () => {
    const monday = parseWeekParam("2026-06-15");
    expect(formatISODate(shiftWeek(monday, -2))).toBe("2026-06-01");
  });
});

describe("monthRangeSaoPaulo", () => {
  it("covers the SP-local month as real UTC instants (UTC-3)", () => {
    const { start, end } = monthRangeSaoPaulo("2026-06");
    // SP midnight Jun 1 == 03:00Z; last ms before SP midnight Jul 1 == 02:59:59.999Z Jul 1
    expect(start.toISOString()).toBe("2026-06-01T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-01T02:59:59.999Z");
  });

  it("handles the December → January rollover", () => {
    const { start, end } = monthRangeSaoPaulo("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T02:59:59.999Z");
  });
});

describe("monthKeySaoPaulo", () => {
  it("buckets an instant into its SP-local month", () => {
    // 02:00Z on Jul 1 is still 23:00 of Jun 30 in SP → June
    expect(monthKeySaoPaulo(new Date("2026-07-01T02:00:00.000Z"))).toBe("2026-06");
    // 03:00Z on Jul 1 is 00:00 of Jul 1 in SP → July
    expect(monthKeySaoPaulo(new Date("2026-07-01T03:00:00.000Z"))).toBe("2026-07");
  });
});
