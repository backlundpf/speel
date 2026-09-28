import {
  Eye,
  Filter,
  Maximize2,
  Minimize2,
  Pencil,
  Trash2,
  X,
  icons,
  type LucideIcon,
} from "lucide-react";

/**
 * IconButton name resolution. The high-level Speel components emit a small
 * fixed vocabulary of Fluent icon names (Cancel/View/Edit/Delete/Filter…);
 * map those, then fall back to lucide's own PascalCase names so consumers can
 * pass any lucide icon for custom row actions. Extend freely — you own this file.
 *
 * The `icons` catalog fallback defeats tree-shaking (every lucide icon lands in
 * the bundle). If that matters in your app, drop the fallback and extend the
 * static map instead.
 */
const FLUENT_TO_LUCIDE: Record<string, LucideIcon> = {
  Cancel: X,
  View: Eye,
  Edit: Pencil,
  Delete: Trash2,
  Filter: Filter,
  FullScreen: Maximize2,
  BackToWindow: Minimize2,
};

export function iconFor(name: string): LucideIcon | undefined {
  return FLUENT_TO_LUCIDE[name] ?? icons[name as keyof typeof icons];
}
