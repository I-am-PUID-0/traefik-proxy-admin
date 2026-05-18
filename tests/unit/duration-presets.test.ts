import { describe, expect, it } from "vitest";
import { DURATION_PRESETS } from "@/lib/duration-presets";

describe("DURATION_PRESETS", () => {
  it("includes a Forever option with a null value", () => {
    const forever = DURATION_PRESETS.find((preset) => preset.label === "Forever");
    expect(forever).toBeDefined();
    expect(forever?.value).toBeNull();
  });

  it("keeps values in ascending order after Forever", () => {
    const values = DURATION_PRESETS.filter((preset) => preset.value !== null)
      .map((preset) => preset.value as number);
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
  });
});
