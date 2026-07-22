import { describe, it, expect } from "vitest";
import { parseReportFilters } from "@/lib/reports/filters";

describe("parseReportFilters", () => {
  it("reads templateId when present", () => {
    const r = parseReportFilters({ templateId: "tpl1" });
    expect(r.templateId).toBe("tpl1");
    expect(r.hasFilters).toBe(true);
  });
  it("templateId undefined when absent or empty", () => {
    expect(parseReportFilters({}).templateId).toBeUndefined();
    expect(parseReportFilters({ templateId: "" }).templateId).toBeUndefined();
  });
});
