"use client";

import { Palette } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UI_PALETTES, type UiPalette } from "@/lib/ui-palettes";

export function PalettePicker() {
  const { palette, setPalette } = useTheme();

  return (
    <Select value={palette} onValueChange={(value) => setPalette(value as UiPalette)}>
      <SelectTrigger
        aria-label="Palette"
        title="Palette"
        className="h-9 w-[8.75rem] gap-2"
      >
        <Palette className="h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {UI_PALETTES.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <span className="flex -space-x-1">
                {option.swatches.map((swatch) => (
                  <span
                    key={swatch}
                    className="h-3.5 w-3.5 rounded-full border border-background shadow-sm"
                    style={{ background: swatch }}
                  />
                ))}
              </span>
              <span>{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
