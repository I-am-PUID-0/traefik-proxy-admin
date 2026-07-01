export const UI_PALETTES = [
  {
    value: "default",
    label: "Default",
    swatches: ["oklch(0.6406 0.1329 157.68)", "oklch(0.6049 0.0983 223.14)", "oklch(0.4463 0.0385 245.44)"],
  },
  {
    value: "harbor",
    label: "Harbor",
    swatches: ["oklch(0.5974 0.133 232.28)", "oklch(0.674 0.125 181.64)", "oklch(0.461 0.034 248.1)"],
  },
  {
    value: "orchard",
    label: "Orchard",
    swatches: ["oklch(0.628 0.143 145.6)", "oklch(0.694 0.125 78.2)", "oklch(0.468 0.033 132.7)"],
  },
  {
    value: "ember",
    label: "Ember",
    swatches: ["oklch(0.626 0.177 35.8)", "oklch(0.641 0.15 61.1)", "oklch(0.446 0.037 34.2)"],
  },
  {
    value: "circuit",
    label: "Circuit",
    swatches: ["oklch(0.71 0.153 175.8)", "oklch(0.751 0.16 126.5)", "oklch(0.45 0.031 205.2)"],
  },
  {
    value: "bloom",
    label: "Bloom",
    swatches: ["oklch(0.642 0.18 352.4)", "oklch(0.674 0.12 188.6)", "oklch(0.452 0.036 328.1)"],
  },
  {
    value: "cobalt",
    label: "Cobalt",
    swatches: ["oklch(0.586 0.16 262.2)", "oklch(0.728 0.14 83.2)", "oklch(0.44 0.035 257.2)"],
  },
  {
    value: "graphite",
    label: "Graphite",
    swatches: ["oklch(0.58 0.02 255)", "oklch(0.666 0.12 165)", "oklch(0.372 0.018 255)"],
  },
  {
    value: "tropic",
    label: "Tropic",
    swatches: ["oklch(0.785 0.145 183)", "oklch(0.815 0.17 136)", "oklch(0.706 0.153 157.37)"],
  },
  {
    value: "solar",
    label: "Solar",
    swatches: ["oklch(0.82 0.165 86)", "oklch(0.73 0.154 32)", "oklch(0.597 0.133 232)"],
  },
  {
    value: "punch",
    label: "Punch",
    swatches: ["oklch(0.72 0.18 8)", "oklch(0.78 0.15 338)", "oklch(0.674 0.12 189)"],
  },
  {
    value: "arcade",
    label: "Arcade",
    swatches: ["oklch(0.76 0.19 300)", "oklch(0.79 0.17 142)", "oklch(0.74 0.155 232)"],
  },
] as const;

export type UiPalette = (typeof UI_PALETTES)[number]["value"];

export const DEFAULT_UI_PALETTE: UiPalette = "default";

export function isUiPalette(value: string | null): value is UiPalette {
  return UI_PALETTES.some((palette) => palette.value === value);
}
