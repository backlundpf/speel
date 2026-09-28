import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { PeoplePickerProps, PersonaItem } from "@speel/react";

import { useStableId } from "./compat";
import { Chrome, fieldAria } from "./chrome";

export function ShadPeoplePicker(p: PeoplePickerProps): ReactElement {
  const id = useStableId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PersonaItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);

  const valueKeys = p.value.map((v) => v.key).join("|");
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setActive(-1);
      setOpen(false);
      return;
    }
    const mySeq = ++seq.current;
    const currentValue = p.value;
    const t = setTimeout(() => {
      void p.onResolveSuggestions(query).then((r) => {
        if (mySeq !== seq.current) return; // stale response
        const chosen = new Set(currentValue.map((v) => v.key));
        setSuggestions(r.filter((s) => !chosen.has(s.key)));
        setActive(-1);
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- p.value/p.onResolveSuggestions identities churn per render; keyed off serialized keys
  }, [query, valueKeys]);

  const pick = (s: PersonaItem): void => {
    p.onChange(p.multi ? [...p.value, s] : [s]);
    setQuery("");
    setActive(-1);
    setOpen(false);
  };

  return (
    <Chrome {...p} htmlFor={id}>
      <div className="relative">
        <div
          className={cn(
            "border-input flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border bg-transparent px-2 py-1 text-sm shadow-xs",
            p.error && "border-destructive",
            p.disabled && "opacity-50",
          )}
        >
          {p.value.map((v) => (
            <Badge key={v.key} variant="secondary" className="gap-1">
              {v.text}
              {p.disabled ? null : (
                <button
                  type="button"
                  aria-label={`Remove ${v.text}`}
                  className="focus-visible:ring-ring rounded focus-visible:outline-none focus-visible:ring-1 hover:text-destructive"
                  onClick={() =>
                    p.onChange(p.value.filter((x) => x.key !== v.key))
                  }
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
          {(p.multi || p.value.length === 0) && !p.disabled ? (
            <Input
              {...fieldAria(id, p)}
              value={query}
              placeholder={
                p.value.length === 0
                  ? "Search people…"
                  : p.multi
                    ? "Add more…"
                    : undefined
              }
              className="h-7 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-listbox`}
              aria-activedescendant={
                active >= 0 ? `${id}-opt-${active}` : undefined
              }
              aria-autocomplete="list"
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                setActive(-1);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (open)
                    setActive((a) => Math.min(a + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  if (open && active >= 0) {
                    e.preventDefault();
                    pick(suggestions[active]!);
                  }
                } else if (e.key === "Escape") {
                  if (open) {
                    e.preventDefault();
                    setActive(-1);
                    setOpen(false);
                  }
                }
              }}
            />
          ) : null}
        </div>
        {open && suggestions.length > 0 ? (
          <div
            role="listbox"
            id={`${id}-listbox`}
            className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full rounded-md border p-1 shadow-md"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="option"
                id={`${id}-opt-${i}`}
                aria-selected={i === active}
                data-active={i === active}
                className="hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                <span>{s.text}</span>
                {s.secondaryText ? (
                  <span className="text-muted-foreground text-xs">
                    {s.secondaryText}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Chrome>
  );
}
