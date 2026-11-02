import type { ReactElement, ReactNode } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { FieldChrome } from "@speel/react";

/**
 * Shared label/description/error chrome wrapped around every field primitive —
 * the shadcn counterpart of the fluent-v8 skin's Field.tsx.
 *
 * The chrome owns all of this markup, so it can name the control directly: the
 * label points `htmlFor` at the field's id, and the help text carries ids derived
 * from the same one. Pair it with `fieldAria` on the control.
 *
 * `descriptionAs="icon"` (displays) moves the description behind an info button beside
 * the label; a screen-reader-only copy keeps the `-description` id, so the control's
 * `aria-describedby` still resolves. With no label there is no button, only that copy.
 */
export function Chrome(
  p: FieldChrome & {
    htmlFor?: string;
    descriptionAs?: "text" | "icon";
    children: ReactNode;
  },
): ReactElement {
  const descriptionId = p.htmlFor ? `${p.htmlFor}-description` : undefined;
  const asIcon = p.descriptionAs === "icon" && !!p.description;
  const label = p.label ? (
    <Label
      id={p.htmlFor ? `${p.htmlFor}-label` : undefined}
      htmlFor={p.htmlFor}
      className={p.error ? "text-destructive" : undefined}
    >
      {p.label}
      {p.required ? <span className="text-destructive"> *</span> : null}
    </Label>
  ) : null;
  return (
    <div className="grid w-full gap-1.5">
      {asIcon && label ? (
        <div className="flex items-center gap-1">
          {label}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`More information about ${p.label}`}
                  aria-describedby={descriptionId}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-4 items-center justify-center rounded-sm outline-none focus-visible:ring-[3px]"
                >
                  <Info aria-hidden="true" className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="speel-shadcn">
                {p.description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        label
      )}
      {p.children}
      {asIcon ? (
        <span id={descriptionId} className="sr-only">
          {p.description}
        </span>
      ) : p.description ? (
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
  "aria-label"?: string;
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
    // Named inline (a table cell) when no label is shown.
    ...(!p.label && p.ariaLabel !== undefined
      ? { "aria-label": p.ariaLabel }
      : {}),
    ...(described.length > 0
      ? { "aria-describedby": described.join(" ") }
      : {}),
  };
}
