import { isValidElement, type ReactNode } from "react";
import { useSpeelUI } from "./context.js";

/** How an action's button reads. `danger` marks a destructive confirm. */
export type SpeelActionAppearance =
  "primary" | "secondary" | "subtle" | "danger";

/**
 * One button in an action row — a form footer, a surface footer, a MessageBar. `Ctx`
 * is what `onClick` receives: the `EntityForm` in a form footer, nothing elsewhere.
 */
export interface SpeelAction<Ctx = void> {
  key: string;
  text: string;
  /** Accessible name, when the visible text is not one on its own — a bare "Apply"
   *  in a surface floating over another "Apply". */
  ariaLabel?: string;
  /** Default 'secondary'. Wins over `primary`. */
  appearance?: SpeelActionAppearance;
  /** Shorthand for `appearance: "primary"`. */
  primary?: boolean;
  /** Which end of the row the button sits at. Default 'end'. */
  align?: "start" | "end";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: (ctx: Ctx) => void;
}

/**
 * The one `actions` prop shape: an action array rendered as skin buttons, or any node
 * rendered as-is in the skin's action slot. `[]` is an (empty) action array.
 */
export type SpeelActions<Ctx = void> = readonly SpeelAction<Ctx>[] | ReactNode;

/** True when `actions` is the array form (every element a plain `{ key, text }` object). */
export function isActionArray<Ctx = void>(
  actions: unknown,
): actions is readonly SpeelAction<Ctx>[] {
  return (
    Array.isArray(actions) &&
    actions.every(
      (a: unknown) =>
        typeof a === "object" &&
        a !== null &&
        !isValidElement(a) &&
        "key" in a &&
        "text" in a,
    )
  );
}

export function resolveAppearance<Ctx>(
  a: SpeelAction<Ctx>,
): SpeelActionAppearance {
  return a.appearance ?? (a.primary ? "primary" : "secondary");
}

/**
 * Renders an `actions` prop through the current skin's `Button`: the array form as
 * buttons (start-aligned ones first, then a spacer, then the rest), a node as-is.
 * Skins call it inside their own action slots (a MessageBar) so they need not
 * re-implement the array form.
 */
export function SpeelActionBar<Ctx = void>(props: {
  actions: SpeelActions<Ctx>;
  /** Passed to each action's `onClick`. */
  ctx?: Ctx;
}): JSX.Element | null {
  const ui = useSpeelUI();
  const { actions } = props;
  if (!isActionArray<Ctx>(actions)) {
    return actions === undefined || actions === null ? null : (
      <>{actions as ReactNode}</>
    );
  }
  const button = (a: SpeelAction<Ctx>): JSX.Element => (
    <ui.Button
      key={a.key}
      text={a.text}
      appearance={resolveAppearance(a)}
      type={a.type ?? "button"}
      disabled={a.disabled ?? false}
      {...(a.ariaLabel !== undefined ? { ariaLabel: a.ariaLabel } : {})}
      {...(a.type === "submit"
        ? {}
        : { onClick: () => a.onClick?.(props.ctx as Ctx) })}
    />
  );
  const start = actions.filter((a) => a.align === "start");
  if (start.length === 0) return <>{actions.map(button)}</>;
  const end = actions.filter((a) => a.align !== "start");
  // Split row: fills the skin's footer (a flex row in every skin), start group,
  // spacer, end group.
  return (
    <div
      style={{
        display: "flex",
        flex: "1 1 auto",
        alignItems: "center",
        gap: 8,
      }}
    >
      {start.map(button)}
      <span aria-hidden style={{ marginLeft: "auto" }} />
      {end.map(button)}
    </div>
  );
}
