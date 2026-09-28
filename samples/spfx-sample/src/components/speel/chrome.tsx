import type { ReactElement, ReactNode } from "react";
import { Label } from "@/components/ui/label";

import type { FieldChrome } from "@speel/react";

/**
 * Shared label/description/error chrome wrapped around every field primitive —
 * the shadcn counterpart of the fluent-v8 skin's Field.tsx.
 *
 * The chrome owns all of this markup, so it can name the control directly: the
 * label points `htmlFor` at the field's id, and the help text carries ids derived
 * from the same one. Pair it with `fieldAria` on the control.
 */
export function Chrome(
  p: FieldChrome & { htmlFor?: string; children: ReactNode },
): ReactElement {
  return (
    <div className="grid w-full gap-1.5">
      {p.label ? (
        <Label
          id={p.htmlFor ? `${p.htmlFor}-label` : undefined}
          htmlFor={p.htmlFor}
          className={p.error ? "text-destructive" : undefined}
        >
          {p.label}
          {p.required ? <span className="text-destructive"> *</span> : null}
        </Label>
      ) : null}
      {p.children}
      {p.description ? (
        <p
          id={p.htmlFor ? `${p.htmlFor}-description` : undefined}
          className="text-muted-foreground text-sm"
        >
          {p.description}
        </p>
      ) : null}
      {p.error ? (
        <p
          id={p.htmlFor ? `${p.htmlFor}-error` : undefined}
          role="alert"
          className="text-destructive text-sm"
        >
          {p.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The aria a chrome-labelled control needs, given the id the chrome was told about.
 *
 * `labelledBy` for controls that are not labelable elements — a radix Select trigger,
 * a radiogroup, a popover button, a contenteditable — where `htmlFor` alone binds
 * nothing and only `aria-labelledby` carries the name.
 */
export function fieldAria(
  id: string,
  p: FieldChrome,
  opts?: { labelledBy?: boolean },
): {
  id: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
} {
  const described: string[] = [];
  // Error first: the problem is read before the hint that would have avoided it.
  if (p.error) described.push(`${id}-error`);
  if (p.description) described.push(`${id}-description`);
  return {
    id,
    ...(opts?.labelledBy && p.label
      ? { "aria-labelledby": `${id}-label` }
      : {}),
    ...(described.length > 0
      ? { "aria-describedby": described.join(" ") }
      : {}),
  };
}
