import { useState, type ReactElement, type ReactNode } from "react";
import type {
  ComboboxCreate,
  OptionItem,
  SpeelUIAdapter,
  TableColumn,
  TableSort,
} from "../src/adapter/SpeelUIAdapter.js";
import { useStableId } from "../src/fluent-v8/useStableId.js";
import { SpeelActionBar } from "../src/actions.js";

// A headless plain-HTML adapter for tests. Layout/styling is irrelevant — it exists
// only to drive the logic in field components and the form controller without Fluent.

const chrome = (
  label: string | undefined,
  required: boolean | undefined,
  error: string | undefined,
  control: ReactNode,
): ReactElement => (
  <label>
    {label}
    {required ? " *" : ""}
    {control}
    {error ? <span role="alert">{error}</span> : null}
  </label>
);

/** The Combobox's Add row, minimal: the three states as plain buttons. */
const AddRow = ({
  text,
  create,
}: {
  text: string;
  create: ComboboxCreate;
}): JSX.Element => {
  const messageId = useStableId();
  const { state } = create;
  const mine = state.kind !== "idle" && state.text === text ? state : undefined;
  if (mine?.kind === "adding")
    return (
      <button type="button" disabled>
        {`Adding "${text}"…`}
      </button>
    );
  if (mine?.kind === "failed")
    return (
      <span>
        <button
          type="button"
          aria-describedby={messageId}
          onClick={() => create.onCreate(text)}
        >
          {`Could not add "${text}"`}
        </button>
        <span id={messageId}>{mine.message}</span>
      </span>
    );
  return (
    <button type="button" onClick={() => create.onCreate(text)}>
      {`Add "${text}"`}
    </button>
  );
};

const FakePopover = ({
  open,
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
}): JSX.Element => (
  <span>
    {trigger}
    {open ? <div role="dialog">{children}</div> : null}
  </span>
);

const FakeTableHeaderCell = ({
  column,
  sort,
  onSortChange,
}: {
  column: TableColumn;
  sort?: TableSort;
  onSortChange?: (key: string) => void;
}): JSX.Element => {
  const [open, setOpen] = useState(false);
  const sorted = sort && sort.key === column.key;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {column.headerContent !== undefined ? (
        <span>{column.headerContent}</span>
      ) : column.sortable && onSortChange ? (
        <button type="button" onClick={() => onSortChange(column.key)}>
          {column.header}
          <span aria-hidden="true">
            {sorted ? (sort!.direction === "asc" ? " ▲" : " ▼") : ""}
          </span>
        </button>
      ) : (
        <span>{column.header}</span>
      )}
      {column.headerFilter ? (
        <FakePopover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <button
              type="button"
              aria-label={`Filter ${column.header}`}
              aria-pressed={column.headerFilter.active}
              onClick={() => setOpen((o) => !o)}
            >
              {"▽"}
            </button>
          }
        >
          {column.headerFilter.content}
        </FakePopover>
      ) : null}
    </span>
  );
};

export const fakeAdapter: SpeelUIAdapter = {
  TextInput: ({
    label,
    required,
    disabled,
    error,
    value,
    onChange,
    onBlur,
    multiline,
  }) =>
    chrome(
      label,
      required,
      error,
      multiline ? (
        <textarea
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      ),
    ),

  RichTextInput: ({
    label,
    required,
    disabled,
    error,
    value,
    onChange,
    onBlur,
  }) =>
    chrome(
      label,
      required,
      error,
      <textarea
        aria-label={label}
        data-testid="rich-text-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />,
    ),

  NumberInput: ({
    label,
    required,
    disabled,
    error,
    value,
    onChange,
    onBlur,
  }) =>
    chrome(
      label,
      required,
      error,
      <input
        aria-label={label}
        type="number"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        onBlur={onBlur}
      />,
    ),

  Dropdown: ({
    label,
    required,
    disabled,
    error,
    value,
    onChange,
    options,
    multiselect,
    ariaLabel,
    placeholder,
  }) => {
    // An inline caption names the control through ariaLabel instead of the stacked
    // label chrome — the footer's pager is the case.
    const name = ariaLabel ?? label;
    if (multiselect) {
      const cur = Array.isArray(value) ? (value as unknown[]) : [];
      return chrome(
        label,
        required,
        error,
        <div role="group" aria-label={name} data-placeholder={placeholder}>
          {options.map((o) => (
            <label key={o.key}>
              <input
                type="checkbox"
                aria-label={String(o.text)}
                checked={cur.includes(o.data)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...cur, o.data]
                      : cur.filter((d) => d !== o.data),
                  )
                }
              />
              {String(o.text)}
            </label>
          ))}
        </div>,
      );
    }
    const selected = options.find((o) => o.data === value)?.key ?? "";
    return chrome(
      label,
      required,
      error,
      <select
        aria-label={name}
        value={selected}
        disabled={disabled}
        onChange={(e) => {
          const o = options.find((opt) => opt.key === e.target.value);
          onChange(o ? o.data : undefined);
        }}
      >
        <option value="">{placeholder ?? ""}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {String(o.text)}
          </option>
        ))}
      </select>,
    );
  },

  RadioGroup: ({ label, required, error, value, onChange, options, other }) => {
    return chrome(
      label,
      required,
      error,
      <div role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label key={o.key}>
            <input
              type="radio"
              name={label}
              checked={value === o.data}
              onChange={() => onChange(o.data)}
            />
            {String(o.text)}
          </label>
        ))}
        {other ? (
          <>
            <label>
              <input
                type="radio"
                name={label}
                // `other.selected` is owned by the field body, not re-derived from
                // `value` here — an Other picked with an empty box is still Other.
                checked={other.selected}
                onChange={() => other.onSelect()}
              />
              {other.label ?? "Other"}
            </label>
            <input
              aria-label={other.label ?? "Other"}
              value={other.text}
              onChange={(e) => other.onTextChange(e.target.value)}
            />
          </>
        ) : null}
      </div>,
    );
  },

  Checkbox: ({
    label,
    disabled,
    error,
    checked,
    onChange,
    ariaLabel,
    indeterminate,
  }) =>
    chrome(
      label,
      false,
      error,
      <input
        aria-label={ariaLabel ?? label}
        type="checkbox"
        checked={checked}
        {...(indeterminate ? { "aria-checked": "mixed" as const } : {})}
        disabled={disabled}
        onChange={(e) => onChange(indeterminate ? true : e.target.checked)}
      />,
    ),

  DatePicker: ({ label, required, disabled, error, value, onChange }) =>
    chrome(
      label,
      required,
      error,
      <input
        aria-label={label}
        type="date"
        disabled={disabled}
        value={value ? value.toISOString().slice(0, 10) : ""}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value) : undefined)
        }
      />,
    ),

  PeoplePicker: ({
    label,
    required,
    error,
    value,
    onChange,
    onResolveSuggestions,
  }) => {
    const [suggestions, setSuggestions] = useState<
      { key: string; text: string; secondaryText?: string; data: unknown }[]
    >([]);
    return chrome(
      label,
      required,
      error,
      <div>
        <input
          aria-label={label}
          value={value.map((p) => p.text).join(", ")}
          readOnly
        />
        <input
          aria-label={`${label}-search`}
          onChange={async (e) =>
            setSuggestions(await onResolveSuggestions(e.target.value))
          }
        />
        <ul>
          {suggestions.map((s) => (
            <li key={s.key}>
              <button type="button" onClick={() => onChange([...value, s])}>
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      </div>,
    );
  },

  Combobox: ({
    label,
    required,
    disabled,
    error,
    value,
    onChange,
    onResolveSuggestions,
    multi,
    noResultsText,
    create,
    placeholder,
  }) => {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<OptionItem[]>([]);
    // The Add row: a creator, non-blank text, and no suggestion that is exactly it.
    const trimmed = query.trim();
    const addText =
      create !== undefined &&
      trimmed !== "" &&
      !suggestions.some(
        (s) =>
          typeof s.text === "string" &&
          s.text.toLowerCase() === trimmed.toLowerCase(),
      )
        ? trimmed
        : undefined;
    return chrome(
      label,
      required,
      error,
      <div>
        <input
          aria-label={label}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={async () => {
            const found = await onResolveSuggestions("");
            setSuggestions(found);
          }}
          onChange={async (e) => {
            const q = e.target.value;
            const found = await onResolveSuggestions(q);
            setQuery(q);
            setSuggestions(found);
          }}
        />
        {value.map((v) => (
          <span key={v.key}>{v.text}</span>
        ))}
        <ul>
          {suggestions.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(multi ? [...value, s] : [s]);
                  setQuery("");
                  setSuggestions([]);
                }}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
        {addText !== undefined ? (
          <AddRow text={addText} create={create!} />
        ) : query !== "" && suggestions.length === 0 && noResultsText ? (
          <span>{noResultsText}</span>
        ) : null}
      </div>,
    );
  },

  FileInput: ({ label, required, disabled, error, value, onChange, accept }) =>
    chrome(
      label,
      required,
      error,
      <span>
        <input
          aria-label={label}
          type="file"
          disabled={disabled}
          {...(accept ? { accept } : {})}
          onChange={(e) => onChange(e.target.files?.[0])}
        />
        {value ? <span>{value.name}</span> : null}
      </span>,
    ),

  Spinner: ({ label }) => <div role="status">{label ?? "Loading"}</div>,

  ProgressBar: ({ label, value }) => (
    <div
      role="progressbar"
      aria-label={label}
      data-state={value === undefined ? "indeterminate" : "determinate"}
      {...(value !== undefined
        ? { "aria-valuenow": Math.round(value * 100) }
        : {})}
    >
      {label}
    </div>
  ),

  Button: ({
    text,
    onClick,
    type,
    disabled,
    ariaLabel,
    iconName,
    tooltip,
    appearance,
  }) => (
    <button
      type={type ?? "button"}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-description={tooltip}
      title={tooltip}
      data-icon={iconName}
      data-appearance={appearance}
      onClick={onClick}
    >
      {text}
    </button>
  ),

  IconButton: ({ iconName, title, onClick, disabled, toggled }) => (
    <button
      type="button"
      aria-label={title}
      title={title}
      data-icon={iconName}
      aria-pressed={toggled}
      disabled={disabled}
      onClick={onClick}
    />
  ),

  MessageBar: ({ intent, children, onDismiss, actions, multiline }) => (
    <div role="alert" data-intent={intent} data-multiline={multiline}>
      {children}
      {actions !== undefined ? (
        <div data-testid="message-actions">
          <SpeelActionBar actions={actions} />
        </div>
      ) : null}
      {onDismiss ? (
        <button aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      ) : null}
    </div>
  ),

  Dialog: ({
    open,
    onOpenChange,
    title,
    blocking,
    children,
    footer,
    resizable,
    fullscreenToggle,
    draggable,
    defaultFullscreen,
  }) => {
    const [fs, setFs] = useState(defaultFullscreen ?? false);
    if (!open) return null;
    const showFs = fullscreenToggle ?? true;
    const showResize = (resizable ?? true) && !fs;
    return (
      <div
        role="dialog"
        aria-label={title ?? "dialog"}
        data-fullscreen={String(fs)}
        data-draggable={String(draggable ?? true)}
      >
        <div data-testid="modal-bar">
          {title ? <h2>{title}</h2> : null}
          {showFs ? (
            <button
              aria-label="Toggle fullscreen"
              onClick={() => setFs((v) => !v)}
            >
              ⛶
            </button>
          ) : null}
          {blocking ? null : (
            <button aria-label="Close" onClick={() => onOpenChange(false)}>
              ×
            </button>
          )}
        </div>
        {children}
        <div>{footer}</div>
        {showResize ? <div data-testid="resize-handle" /> : null}
      </div>
    );
  },

  Drawer: ({
    open,
    onOpenChange,
    title,
    blocking,
    children,
    footer,
    resizable,
  }) =>
    open ? (
      <div role="dialog" aria-label={title ?? "panel"}>
        {title ? <h2>{title}</h2> : null}
        {children}
        <div data-testid="surface-footer">{footer}</div>
        {blocking ? null : (
          <button aria-label="dismiss" onClick={() => onOpenChange(false)}>
            ×
          </button>
        )}
        {(resizable ?? true) ? <div data-testid="resize-handle" /> : null}
      </div>
    ) : null,

  Popover: ({ open, onOpenChange, trigger, children }) => (
    <FakePopover open={open} onOpenChange={onOpenChange} trigger={trigger}>
      {children}
    </FakePopover>
  ),

  Table: ({
    columns,
    items,
    getRowKey,
    emptyMessage,
    sort,
    onSortChange,
    getRowIntent,
    getRowClassName,
    onColumnResize,
    minWidth,
    width,
    maxWidth,
  }) =>
    items.length === 0 ? (
      <div>{emptyMessage ?? "No items."}</div>
    ) : (
      <table
        data-min-width={minWidth}
        data-width={width}
        data-max-width={maxWidth}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                data-width={c.width}
                data-default-width={c.defaultWidth}
                data-grow={c.grow}
                data-shrink={c.shrink}
                data-min-width={c.minWidth}
                data-max-width={c.maxWidth}
                data-wrap={c.wrap ? "" : undefined}
                data-align={c.align}
                {...(sort && sort.key === c.key
                  ? {
                      "aria-sort":
                        sort.direction === "asc" ? "ascending" : "descending",
                    }
                  : {})}
              >
                <FakeTableHeaderCell
                  column={c}
                  {...(sort ? { sort } : {})}
                  {...(onSortChange ? { onSortChange } : {})}
                />
                {onColumnResize ? (
                  <button
                    type="button"
                    aria-label={`Resize ${c.header}`}
                    onClick={() => onColumnResize(c.key, 250)}
                  />
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => {
            // Computed into locals because TypeScript will not narrow `getRowIntent` from an
            // optional-call test back to "defined" at the second call site.
            const intent = getRowIntent?.(row, i);
            const cls = getRowClassName?.(row, i);
            return (
              <tr
                key={getRowKey ? getRowKey(row, i) : i}
                {...(intent ? { "data-intent": intent } : {})}
                {...(cls ? { className: cls } : {})}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-cell-title={c.cellTitle?.(row)}
                    data-align={c.align}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    ),

  SearchBox: ({ value, onChange, placeholder, ariaLabel }) => (
    <input
      type="search"
      aria-label={ariaLabel ?? placeholder ?? "Search"}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),

  Menu: ({ open, onOpenChange, trigger, sections }) => (
    <span>
      {trigger}
      {open ? (
        <div role="menu">
          {sections.map((section) => (
            <div key={section.key} role="group" aria-label={section.title}>
              {section.title !== undefined ? (
                <span>{section.title}</span>
              ) : null}
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role={
                    item.checked !== undefined ? "menuitemcheckbox" : "menuitem"
                  }
                  {...(item.checked !== undefined
                    ? { "aria-checked": item.checked }
                    : {})}
                  disabled={item.disabled}
                  data-icon={item.iconName}
                  onClick={() => {
                    item.onClick?.();
                    onOpenChange(false);
                  }}
                >
                  {item.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </span>
  ),

  FieldDisplay: ({ label, required, error, children }) =>
    chrome(
      label,
      required,
      error,
      <span data-testid="display">{children}</span>,
    ),
};
