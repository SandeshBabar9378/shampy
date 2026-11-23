export const THEME_STORAGE_KEY = "shubhu_theme";

export const THEME_IDS = ["ocean", "aurora", "graphite"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "aurora";

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value != null && (THEME_IDS as readonly string[]).includes(value);
}
