import { DEFAULT_RENDER_OPTIONS, type CopyFlavor, type RenderOptions } from "./format";

/**
 * View preferences for the standup.
 *
 * A cookie rather than localStorage, for the same reason the tree's expansion is: the
 * server renders this screen, so it has to know whether the previous-day panel is open
 * and which copy flavour is selected. Reading that from localStorage means the first
 * client render disagrees with the HTML, and React throws a hydration error.
 */
export const PREFS_COOKIE = "standup_prefs";

/** The old localStorage key, kept only so existing settings can be carried across once. */
export const LEGACY_PREFS_KEY = "standup.prefs.v1";

export interface StandupPrefs {
  options: RenderOptions;
  flavor: CopyFlavor;
  showPrevious: boolean;
}

export const DEFAULT_PREFS: StandupPrefs = {
  options: DEFAULT_RENDER_OPTIONS,
  flavor: "rich",
  showPrevious: true,
};

/** Tolerant of anything: a malformed or hand-edited cookie falls back to the defaults. */
export function parsePrefs(raw: string | undefined): StandupPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const saved = JSON.parse(decodeURIComponent(raw)) as Partial<StandupPrefs>;
    return {
      options: { ...DEFAULT_RENDER_OPTIONS, ...saved.options },
      flavor: saved.flavor ?? DEFAULT_PREFS.flavor,
      showPrevious: saved.showPrevious ?? DEFAULT_PREFS.showPrevious,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function serializePrefs(prefs: StandupPrefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}
