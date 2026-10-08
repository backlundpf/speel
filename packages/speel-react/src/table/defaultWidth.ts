import type { FieldConfig } from "@speel/core";

/** The default for a column with no model field behind it. */
export const CUSTOM_COLUMN_WIDTH = 100;

/**
 * The width a column starts at when nobody has given it one, by what its field holds: a
 * Yes/No needs little, a person or a note needs room. A hint for skins that need a number —
 * the v8 skin holds a column at it; a skin that sizes columns to content ignores it.
 */
export function defaultWidthFor(config: FieldConfig | undefined): number {
  if (!config) return CUSTOM_COLUMN_WIDTH;
  switch (config.kind) {
    case "Boolean":
      return 70;
    case "Number":
    case "Currency":
      return 90;
    case "DateTime":
      return config.displayFormat === "DateTime" ? 150 : 100;
    case "Choice":
      return config.multi ? 180 : 120;
    case "Text":
      return config.multiline ? 260 : 180;
    case "Lookup":
      return config.multi ? 220 : 180;
    case "Json":
      return 180;
  }
}

const FIXED = { grow: 0, shrink: 0 } as const;
const FLEX = { grow: 1, shrink: 1 } as const;
/** Content-heavy kinds take twice the spare width. */
const ROOMY = { grow: 2, shrink: 1 } as const;

/**
 * How a column of this kind flexes when its table has spare width or too little: text-like
 * columns grow and shrink, Yes/No, numbers and dates hold their width, and a column with no
 * field behind it holds too — nothing says what it contains.
 */
export function defaultFlexFor(config: FieldConfig | undefined): {
  grow: number;
  shrink: number;
} {
  if (!config) return { ...FIXED };
  switch (config.kind) {
    case "Text":
      return { ...(config.multiline ? ROOMY : FLEX) };
    case "Json":
      return { ...ROOMY };
    case "Lookup":
    case "Choice":
      return { ...FLEX };
    case "Boolean":
    case "Number":
    case "Currency":
    case "DateTime":
      return { ...FIXED };
  }
}
