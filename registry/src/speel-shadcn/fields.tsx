import { Fragment, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  CircleAlert,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type {
  ButtonProps,
  CheckboxProps,
  ComboboxProps,
  DatePickerProps,
  DropdownProps,
  FieldDisplayProps,
  FileInputProps,
  IconButtonProps,
  MessageBarProps,
  NumberInputProps,
  OptionItem,
  ProgressBarProps,
  RadioGroupProps,
  SearchBoxProps,
  SpinnerProps,
  TextInputProps,
} from "@speel/react";

import { useStableId } from "./compat";
import { Chrome, fieldAria } from "./chrome";
import { iconFor } from "./icons";

export function ShadTextInput(p: TextInputProps): ReactElement {
  const id = useStableId();
  const shared = {
    ...fieldAria(id, p),
    value: p.value,
    disabled: p.disabled,
    "aria-invalid": !!p.error,
    onBlur: p.onBlur,
    ...(p.maxLength !== undefined ? { maxLength: p.maxLength } : {}),
  };
  return (
    <Chrome {...p} htmlFor={id}>
      {p.multiline ? (
        <Textarea
          {...shared}
          rows={4}
          onChange={(e) => p.onChange(e.target.value)}
        />
      ) : (
        <Input {...shared} onChange={(e) => p.onChange(e.target.value)} />
      )}
    </Chrome>
  );
}

export function ShadNumberInput(p: NumberInputProps): ReactElement {
  const id = useStableId();
  return (
    <Chrome {...p} htmlFor={id}>
      <div className="flex items-center gap-1.5">
        {p.prefix ? (
          <span className="text-muted-foreground text-sm">{p.prefix}</span>
        ) : null}
        <Input
          {...fieldAria(id, p)}
          type="number"
          value={p.value ?? ""}
          disabled={p.disabled}
          aria-invalid={!!p.error}
          min={p.min}
          max={p.max}
          step={p.step}
          onBlur={p.onBlur}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              p.onChange(undefined);
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) return; // partial input like "-" or "1e"
            p.onChange(n);
          }}
        />
        {p.suffix ? (
          <span className="text-muted-foreground text-sm">{p.suffix}</span>
        ) : null}
      </div>
    </Chrome>
  );
}

export function ShadCheckbox(p: CheckboxProps): ReactElement {
  const id = useStableId();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={p.checked}
          disabled={p.disabled}
          aria-invalid={!!p.error}
          onCheckedChange={(v) => p.onChange(v === true)}
        />
        {p.label ? (
          <Label htmlFor={id}>
            {p.label}
            {p.required ? <span className="text-destructive"> *</span> : null}
          </Label>
        ) : null}
      </div>
      {p.description ? (
        <p className="text-muted-foreground text-sm">{p.description}</p>
      ) : null}
      {p.error ? (
        <p role="alert" className="text-destructive text-sm">
          {p.error}
        </p>
      ) : null}
    </div>
  );
}

/** Key of the synthetic "Other" radio a fill-in `RadioGroupProps.other` adds. */
const OTHER_RADIO_KEY = "__speel-other";
/** How long after a create closes the list a returning focus is not a reason to reopen it. */
const FOCUS_RETURN_WINDOW_MS = 1000;

export function ShadRadioGroup(p: RadioGroupProps): ReactElement {
  const gid = useStableId();
  const other = p.other;
  const selected = p.options.find((o) => o.data === p.value);
  // `other.selected` is owned by the field body, not re-derived from `p.value` here —
  // an Other picked with an empty box is still Other.
  const selectedKey = other?.selected
    ? OTHER_RADIO_KEY
    : selected
      ? selected.key
      : undefined;
  return (
    <Chrome {...p} htmlFor={gid}>
      <RadioGroup
        {...fieldAria(gid, p, { labelledBy: true })}
        value={selectedKey ?? ""}
        disabled={p.disabled}
        aria-invalid={!!p.error}
        onValueChange={(k) => {
          if (k === OTHER_RADIO_KEY) {
            other?.onSelect();
            return;
          }
          p.onChange(p.options.find((o) => o.key === k)?.data);
        }}
      >
        {p.options.map((o) => (
          <div key={o.key} className="flex items-center gap-2">
            <RadioGroupItem value={o.key} id={`${gid}-${o.key}`} />
            <Label htmlFor={`${gid}-${o.key}`} className="font-normal">
              {o.text as ReactNode}
            </Label>
          </div>
        ))}
        {other ? (
          <div className="flex items-center gap-2">
            <RadioGroupItem value={OTHER_RADIO_KEY} id={`${gid}-other`} />
            <Label htmlFor={`${gid}-other`} className="font-normal">
              {other.label ?? "Other"}
            </Label>
            <Input
              aria-label={other.label ?? "Other"}
              value={other.text}
              disabled={p.disabled}
              onChange={(e) => other.onTextChange(e.target.value)}
            />
          </div>
        ) : null}
      </RadioGroup>
    </Chrome>
  );
}

export function ShadFileInput(p: FileInputProps): ReactElement {
  const id = useStableId();
  // Bump the key to clear the native input (it is uncontrolled).
  const [resetKey, setResetKey] = useState(0);
  return (
    <Chrome {...p} htmlFor={id}>
      <div className="flex items-center gap-1.5">
        <Input
          key={resetKey}
          {...fieldAria(id, p)}
          type="file"
          accept={p.accept}
          disabled={p.disabled}
          aria-invalid={!!p.error}
          onChange={(e) => p.onChange(e.target.files?.[0])}
        />
        {p.value ? (
          <ShadIconButton
            iconName="Cancel"
            title="Clear file"
            disabled={p.disabled}
            onClick={() => {
              setResetKey((k) => k + 1);
              p.onChange(undefined);
            }}
          />
        ) : null}
      </div>
    </Chrome>
  );
}

const BUTTON_VARIANT = {
  primary: "default",
  secondary: "outline",
  subtle: "ghost",
} as const;

export function ShadButton(p: ButtonProps): ReactElement {
  return (
    <Button
      type={p.type ?? "button"}
      variant={BUTTON_VARIANT[p.appearance ?? "secondary"]}
      disabled={!!p.disabled}
      aria-label={p.ariaLabel}
      onClick={p.onClick}
    >
      {p.text}
    </Button>
  );
}

/** A search field: magnifier on the left, a clear button once there is text to clear. */
export function ShadSearchBox(p: SearchBoxProps): ReactElement {
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={p.value}
        placeholder={p.placeholder ?? "Search"}
        aria-label={p.ariaLabel ?? p.placeholder ?? "Search"}
        className="pl-8 pr-8"
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && p.value !== "") p.onChange("");
        }}
      />
      {p.value !== "" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear text"
          className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
          onClick={() => p.onChange("")}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function ShadIconButton(p: IconButtonProps): ReactElement {
  const Icon = iconFor(p.iconName);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={p.title}
            aria-pressed={p.toggled}
            disabled={!!p.disabled}
            className={cn(
              "size-8",
              p.toggled && "bg-accent text-accent-foreground",
            )}
            onClick={p.onClick}
          >
            {Icon ? (
              <Icon className="size-4" />
            ) : (
              <span className="text-xs">{p.iconName}</span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="speel-shadcn">{p.title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ShadSpinner(p: SpinnerProps): ReactElement {
  return (
    <div
      className="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {p.label ?? null}
    </div>
  );
}

export function ShadProgressBar(p: ProgressBarProps): ReactElement {
  return (
    <div className="grid gap-1.5">
      {p.label ? <span className="text-sm">{p.label}</span> : null}
      {p.value !== undefined ? (
        <Progress value={p.value * 100} />
      ) : (
        // Requires the speel-indeterminate keyframes from the registry item's CSS (see src/index.css).
        <div
          className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={p.label ?? "Loading"}
        >
          <div className="bg-primary h-full w-1/3 rounded-full [animation:speel-indeterminate_1.5s_ease-in-out_infinite]" />
        </div>
      )}
    </div>
  );
}

const MESSAGE_CLASS = {
  info: "",
  success:
    "border-green-600/50 [&_[data-slot=alert-description]]:text-green-700 dark:[&_[data-slot=alert-description]]:text-green-400",
  warning:
    "border-amber-600/50 [&_[data-slot=alert-description]]:text-amber-700 dark:[&_[data-slot=alert-description]]:text-amber-400",
  error: "",
} as const;

export function ShadMessageBar(p: MessageBarProps): ReactElement {
  return (
    <Alert
      variant={p.intent === "error" ? "destructive" : "default"}
      className={cn("relative", MESSAGE_CLASS[p.intent])}
    >
      <AlertDescription className={p.onDismiss ? "pr-8" : undefined}>
        {p.children as ReactNode}
      </AlertDescription>
      {p.onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          className="hover:bg-accent absolute top-2 right-2 rounded-sm p-1"
          onClick={p.onDismiss}
        >
          <span aria-hidden>✕</span>
        </button>
      ) : null}
    </Alert>
  );
}

export function ShadFieldDisplay(p: FieldDisplayProps): ReactElement {
  const id = useStableId();
  return (
    <Chrome {...p} htmlFor={id}>
      <div
        {...fieldAria(id, p, { labelledBy: true })}
        role="group"
        className="text-sm"
      >
        {p.children as ReactNode}
      </div>
    </Chrome>
  );
}

export function ShadDropdown(p: DropdownProps): ReactElement {
  const id = useStableId();
  if (!p.multiselect) {
    const selected = p.options.find((o) => o.data === p.value);
    return (
      <Chrome {...p} htmlFor={id}>
        <Select
          value={selected?.key ?? ""}
          disabled={p.disabled}
          onValueChange={(k) =>
            p.onChange(p.options.find((o) => o.key === k)?.data)
          }
        >
          <SelectTrigger
            {...fieldAria(id, p, { labelledBy: true })}
            aria-invalid={!!p.error}
            // Named inline instead of by label chrome — the table footer's pager
            // reads `‹ Page [1] of 3 ›` and passes its caption this way.
            {...(p.ariaLabel !== undefined
              ? { "aria-label": p.ariaLabel }
              : {})}
            className="w-full"
          >
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          {/* speel-shadcn tag: portaled content escapes the host wrapper, so each portal
              re-applies the class that scopes the skin's base-layer CSS rules. */}
          <SelectContent className="speel-shadcn">
            {p.options.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.text as ReactNode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Chrome>
    );
  }
  return <ShadMultiDropdown {...p} />;
}

function ShadMultiDropdown(p: DropdownProps): ReactElement {
  const id = useStableId();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const cur = Array.isArray(p.value) ? (p.value as unknown[]) : [];
  const selected = p.options.filter((o) => cur.includes(o.data));

  // Roving focus between option buttons; Enter/Space toggle natively (buttons),
  // Escape closes via radix.
  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-slot=speel-option]",
      ) ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown"
        ? Math.min(i + 1, items.length - 1)
        : Math.max(i - 1, 0);
    items[next]?.focus();
  };

  return (
    <Chrome {...p} htmlFor={id}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            {...fieldAria(id, p, { labelledBy: true })}
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!p.error}
            {...(p.ariaLabel !== undefined
              ? { "aria-label": p.ariaLabel }
              : {})}
            disabled={p.disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {selected.length ? (
                selected.map((o, i) => (
                  <Fragment key={o.key}>
                    {i > 0 ? ", " : ""}
                    {o.text as ReactNode}
                  </Fragment>
                ))
              ) : (
                <span className="text-muted-foreground">Select…</span>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="speel-shadcn w-(--radix-popover-trigger-width) p-1"
          align="start"
        >
          <div
            ref={listRef}
            role="listbox"
            aria-multiselectable
            onKeyDown={onListKeyDown}
          >
            {p.options.length === 0 ? (
              <div className="text-muted-foreground px-2 py-1.5 text-sm">
                No options.
              </div>
            ) : null}
            {p.options.map((o) => {
              const isSel = cur.includes(o.data);
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  data-slot="speel-option"
                  className="hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none"
                  onClick={() =>
                    p.onChange(
                      isSel
                        ? cur.filter((v) => v !== o.data)
                        : [...cur, o.data],
                    )
                  }
                >
                  <Check
                    className={cn(
                      "size-4",
                      isSel ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.text as ReactNode}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </Chrome>
  );
}

/** `Remove Contoso` when the option's text is a string, a bare `Remove` when it is markup. */
function removeLabel(text: ReactNode): string {
  return typeof text === "string" ? `Remove ${text}` : "Remove";
}

/**
 * The selection control — every Choice, lookup and collection field — and the
 * general-typed sibling of `ShadPeoplePicker`.
 *
 * Typing is the whole interaction. Every keystroke hands the box's whole text to
 * `onResolveSuggestions` and the list shows itself as the answers land, so nothing has
 * to be opened first; focus alone asks too, for the "just show me what's there" case.
 * Only consecutive identical queries are deduped — the wait between keystrokes belongs
 * to the loader, which owns the read, not to the skin.
 *
 * Typed text is a query and never a value: only a pick calls `onChange`, and what it
 * hands back is the caller's own `OptionItem`, `data` and all. The held selection is
 * rendered from `value` and merged into every page of results, so it stays visible even
 * when the latest search did not return it.
 */
export function ShadCombobox(p: ComboboxProps): ReactElement {
  const id = useStableId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<OptionItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [createCalloutOpen, setCreateCalloutOpen] = useState(false);
  const asked = useRef<string | undefined>(undefined);
  const ticket = useRef(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const search = (q: string): void => {
    // Focus opens the list and the first keystroke searches; both ask about "" otherwise.
    if (asked.current === q) return;
    asked.current = q;
    const mine = ++ticket.current;
    const settle = (found: OptionItem[]): void => {
      // Reads come back out of order; only the newest query may paint.
      if (!mounted.current || mine !== ticket.current) return;
      setSuggestions(found);
      setSearched(true);
      setActive(-1);
    };
    // A failed load reads as "nothing matched" here; the consumer owns the loader and
    // says which of the two it was through `noResultsText`.
    void p.onResolveSuggestions(q).then(settle, () => settle([]));
  };

  // The text of a single-select create this control started and has not yet seen
  // land. The list stays open through the create; once the value changes while this
  // is set, the create succeeded and the list closes as a pick would (a failure
  // leaves the value alone, so the list stays open for a retry).
  const pendingCreate = useRef<string | undefined>(undefined);

  const close = (): void => {
    // The query lives as long as the open list: a reopen searches afresh rather than
    // showing what an abandoned one returned. Retiring the ticket is what makes that
    // true — the abandoned query's read is still out, and without this it would land
    // after the reopen (a blur, or a pick, then focus or a click) and paint the old
    // query's rows over the new list.
    ticket.current++;
    setOpen(false);
    setActive(-1);
    setQuery("");
    setSuggestions([]);
    setSearched(false);
    asked.current = undefined;
    // A create still out when the list closes some other way no longer owns it —
    // unless it is still running: a surface it opened (`createsByForm`) took focus, and
    // the blur closed the list. It lands later, and its landing must still close the
    // list and hold off the returning focus.
    if (p.create?.state.kind !== "adding") pendingCreate.current = undefined;
  };

  // Until when a focus landing on the input must not reopen the list. A create that
  // went through a surface (`createsByForm`'s modal) hands focus back here when that
  // surface closes, around the same moment the create lands; opening on that focus
  // would pop the list back up over the value just chosen. Focus inside the window does
  // not open the list; a click still does, and the window expires on its own.
  const suppressFocusOpenUntil = useRef(0);
  const valueKeys = p.value.map((v) => v.key).join("\u0000");
  const prevValueKeys = useRef(valueKeys);
  useEffect(() => {
    if (prevValueKeys.current === valueKeys) return;
    prevValueKeys.current = valueKeys;
    if (pendingCreate.current === undefined) return;
    suppressFocusOpenUntil.current = Date.now() + FOCUS_RETURN_WINDOW_MS;
    close();
    pendingCreate.current = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on a value change only
  }, [valueKeys]);

  /**
   * Put the list up and ask about whatever is in the box. Idempotent on purpose: a
   * click lands on an input that is often already focused and often already open, and
   * neither case may toggle the list shut out from under the pick being made.
   */
  const show = (): void => {
    setOpen(true);
    search(query);
  };
  const showOnFocus = (): void => {
    // Not while a create is out (a surface it opened hands focus back before it lands),
    // nor inside the window after one lands.
    if (p.create?.state.kind === "adding") return;
    if (Date.now() < suppressFocusOpenUntil.current) return;
    show();
  };

  const typed = (q: string): void => {
    setQuery(q);
    setOpen(true);
    search(q);
  };

  // The selection rides along, so a page of results that omits it still shows its text.
  const list: OptionItem[] = [
    ...suggestions,
    ...p.value.filter((v) => !suggestions.some((s) => s.key === v.key)),
  ];

  // The Add row: a creator, non-blank trimmed text, and no suggestion (or held value)
  // whose string text is it, ignoring case. Non-string text never hides it.
  const trimmed = query.trim();
  const showCreate =
    p.create !== undefined &&
    trimmed !== "" &&
    !list.some(
      (o) =>
        typeof o.text === "string" &&
        o.text.toLowerCase() === trimmed.toLowerCase(),
    );
  const createState = p.create?.state;
  // A `create.state` that is not idle is only "ours" when it is still about the text
  // in the box — typing something else, or a plain pick, leaves it behind rather than
  // clearing it, so a stale `failed` (or `adding`) must not paint over new text.
  const creating =
    createState !== undefined &&
    createState.kind !== "idle" &&
    createState.text === trimmed
      ? createState
      : undefined;
  const createMessageId = `${id}-create-message`;
  const createRowIndex = list.length;

  // Only after a search came back with nothing — never while the first one is in flight.
  // The Add row takes the no-matches line's place when there is nothing else to offer.
  const noResults =
    searched &&
    suggestions.length === 0 &&
    p.noResultsText !== undefined &&
    !showCreate;

  // `open` is intent; this is whether a listbox is actually on screen — what
  // `aria-expanded` has to answer, and a search with nothing to say is neither.
  const showList = open && (list.length > 0 || noResults || showCreate);

  const pick = (o: OptionItem): void => {
    if (!p.multi) {
      p.onChange([o]);
      close();
      return;
    }
    // Multi toggles, and the list stays up: the next pick is one click away.
    const held = p.value.some((v) => v.key === o.key);
    p.onChange(held ? p.value.filter((v) => v.key !== o.key) : [...p.value, o]);
  };

  const pickCreate = (): void => {
    // Belt and suspenders: the row is `disabled` while adding, but a stale `creating`
    // read must not fire a second create either.
    if (!p.create || creating?.kind === "adding") return;
    if (!p.multi) pendingCreate.current = trimmed;
    p.create.onCreate(trimmed);
  };

  // Roving moves `aria-activedescendant`, which a screen reader follows on its own; the
  // sighted user needs the highlight brought back inside `max-h-64`. `nearest` scrolls
  // the least that works — anything else re-centres the list on every keystroke.
  useEffect(() => {
    if (active < 0) return;
    document
      .getElementById(`${id}-opt-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  // Rows to rove over: the suggestions, plus the Add row when it is showing.
  const rowCount = list.length + (showCreate ? 1 : 0);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        search(query);
        return;
      }
      setActive((a) =>
        e.key === "ArrowDown"
          ? Math.min(a + 1, rowCount - 1)
          : Math.max(a - 1, 0),
      );
    } else if (e.key === "Enter") {
      // Enter with nothing highlighted is left to the form; it is not a commit of text.
      if (!open || active < 0) return;
      e.preventDefault();
      if (active === createRowIndex && showCreate) {
        pickCreate();
        return;
      }
      const chosen = list[active];
      if (chosen) pick(chosen);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
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
              {v.text as ReactNode}
              {p.disabled ? null : (
                <button
                  type="button"
                  aria-label={removeLabel(v.text)}
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
          {/* The one control the chrome's label names — `fieldAria` without `labelledBy`,
              because an input is labelable and `htmlFor` already binds to it. */}
          <Input
            {...fieldAria(id, p)}
            value={query}
            disabled={p.disabled}
            placeholder={
              p.value.length === 0
                ? "Search…"
                : p.multi
                  ? "Add more…"
                  : "Search to change…"
            }
            className="h-7 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${id}-listbox`}
            aria-activedescendant={
              active >= 0 ? `${id}-opt-${active}` : undefined
            }
            aria-autocomplete="list"
            aria-invalid={!!p.error}
            onFocus={showOnFocus}
            // Focus fires once. Coming back to an input that never lost focus — after a
            // pick closed the list, or Escape — is a click and nothing else.
            onClick={show}
            onChange={(e) => typed(e.target.value)}
            onBlur={close}
            onKeyDown={onKeyDown}
          />
        </div>
        {showList ? (
          <div
            role="listbox"
            id={`${id}-listbox`}
            {...(p.multi ? { "aria-multiselectable": true } : {})}
            className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border p-1 shadow-md"
          >
            {list.map((o, i) => {
              const held = p.value.some((v) => v.key === o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  id={`${id}-opt-${i}`}
                  aria-selected={held}
                  data-active={i === active}
                  className="hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                  onMouseEnter={() => setActive(i)}
                  // Down, not click: the input must not blur and close the list first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                >
                  <Check
                    className={cn("size-4", held ? "opacity-100" : "opacity-0")}
                  />
                  {o.text as ReactNode}
                </button>
              );
            })}
            {noResults ? (
              <div className="text-muted-foreground px-2 py-1.5 text-sm">
                {p.noResultsText}
              </div>
            ) : null}
            {showCreate ? (
              <button
                type="button"
                role="option"
                id={`${id}-opt-${createRowIndex}`}
                aria-selected={false}
                disabled={creating?.kind === "adding"}
                data-active={active === createRowIndex}
                // On the option element itself — the one `aria-activedescendant`
                // points at while roving — not an inner span it never reaches.
                aria-describedby={
                  creating?.kind === "failed" ? createMessageId : undefined
                }
                className="hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:pointer-events-none disabled:opacity-50"
                onMouseEnter={() => setActive(createRowIndex)}
                // Down, not click: the input must not blur and close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickCreate();
                }}
              >
                {creating?.kind === "failed" ? (
                  <Popover
                    open={createCalloutOpen}
                    onOpenChange={setCreateCalloutOpen}
                  >
                    <PopoverTrigger asChild>
                      <span
                        tabIndex={0}
                        className="text-destructive inline-flex"
                        onMouseEnter={() => setCreateCalloutOpen(true)}
                        onMouseLeave={() => setCreateCalloutOpen(false)}
                        onFocus={() => setCreateCalloutOpen(true)}
                        onBlur={() => setCreateCalloutOpen(false)}
                      >
                        <CircleAlert className="size-4" aria-hidden="true" />
                      </span>
                    </PopoverTrigger>
                    <PopoverContent className="speel-shadcn w-auto p-2 text-sm">
                      {creating.message}
                    </PopoverContent>
                  </Popover>
                ) : null}
                <span>
                  {creating?.kind === "adding"
                    ? `Adding "${trimmed}"…`
                    : creating?.kind === "failed"
                      ? `Could not add "${trimmed}"`
                      : `Add "${trimmed}"`}
                </span>
                {creating?.kind === "failed" ? (
                  // Always in the DOM (unlike the popover above) so the row's
                  // `aria-describedby` announces it without opening the callout.
                  <span id={createMessageId} className="sr-only">
                    {creating.message}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Chrome>
  );
}

function mergeTime(date: Date, hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const next = new Date(date);
  next.setHours(h, m, 0, 0);
  return next;
}

export function ShadDatePicker(p: DatePickerProps): ReactElement {
  const id = useStableId();
  const [open, setOpen] = useState(false);
  // before/after matchers compare calendar days (time-stripped) — a plain
  // `date < minDate` comparison wrongly disables the boundary day whenever
  // minDate/maxDate carry a time component.
  const dayMatchers = [
    ...(p.minDate !== undefined ? [{ before: p.minDate }] : []),
    ...(p.maxDate !== undefined ? [{ after: p.maxDate }] : []),
  ];
  const text = p.value
    ? p.showTime
      ? `${p.value.toLocaleDateString()} ${p.value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : p.value.toLocaleDateString()
    : undefined;
  const timeValue = p.value
    ? `${String(p.value.getHours()).padStart(2, "0")}:${String(p.value.getMinutes()).padStart(2, "0")}`
    : "";
  return (
    <Chrome {...p} htmlFor={id}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            {...fieldAria(id, p, { labelledBy: true })}
            disabled={p.disabled}
            aria-invalid={!!p.error}
            className={cn(
              "w-full justify-start font-normal",
              !p.value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4" />
            {text ?? "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="speel-shadcn w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={p.value}
            disabled={dayMatchers}
            onSelect={(d) => {
              if (!d) {
                p.onChange(undefined);
                return;
              }
              // First pick with showTime emits midnight; the time input below
              // unlocks once a date exists.
              p.onChange(p.showTime && p.value ? mergeTime(d, timeValue) : d);
              if (!p.showTime) setOpen(false);
            }}
          />
          {p.showTime ? (
            <div className="border-t p-3">
              <Input
                type="time"
                value={timeValue}
                disabled={!p.value}
                onChange={(e) => {
                  if (p.value && e.target.value)
                    p.onChange(mergeTime(p.value, e.target.value));
                }}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </Chrome>
  );
}
