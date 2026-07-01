"use client";

import * as React from "react";
import { DEFAULT_UI_PALETTE, isUiPalette, type UiPalette } from "@/lib/ui-palettes";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  palette: UiPalette;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: UiPalette) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemTheme() {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  return resolvedTheme;
}

function applyPalette(palette: UiPalette) {
  document.documentElement.dataset.palette = palette;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("dark");
  const [palette, setPaletteState] = React.useState<UiPalette>(DEFAULT_UI_PALETTE);

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem("theme") as Theme | null;
    const storedPalette = window.localStorage.getItem("ui-palette");
    const initialTheme = storedTheme || defaultTheme;
    const initialPalette = isUiPalette(storedPalette) ? storedPalette : DEFAULT_UI_PALETTE;

    setThemeState(initialTheme);
    setPaletteState(initialPalette);
    setResolvedTheme(applyTheme(initialTheme));
    applyPalette(initialPalette);
  }, [defaultTheme]);

  React.useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolvedTheme(applyTheme("system"));
    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    window.localStorage.setItem("theme", nextTheme);
    setThemeState(nextTheme);
    setResolvedTheme(applyTheme(nextTheme));
  }, []);

  const setPalette = React.useCallback((nextPalette: UiPalette) => {
    window.localStorage.setItem("ui-palette", nextPalette);
    setPaletteState(nextPalette);
    applyPalette(nextPalette);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, palette, setTheme, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
