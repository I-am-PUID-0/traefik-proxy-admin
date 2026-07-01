import { describe, expect, it } from "vitest";
import { DEFAULT_UI_PALETTE, UI_PALETTES, isUiPalette } from "@/lib/ui-palettes";

describe("UI_PALETTES", () => {
  it("includes the default palette", () => {
    expect(isUiPalette(DEFAULT_UI_PALETTE)).toBe(true);
  });

  it("keeps palette values unique", () => {
    const values = UI_PALETTES.map((palette) => palette.value);

    expect(new Set(values).size).toBe(values.length);
  });

  it("rejects unknown palette values", () => {
    expect(isUiPalette("midnight")).toBe(false);
  });
});
