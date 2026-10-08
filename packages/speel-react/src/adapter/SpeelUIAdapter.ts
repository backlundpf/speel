import type { ComponentType, ReactNode } from "react";
import type { SpeelActions } from "../actions.js";

/** The label/validation/disabled chrome shared by every field primitive. */
export interface FieldChrome {
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  description?: string;
}

export interface TextInputProps extends FieldChrome {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  multiline?: boolean;
  maxLength?: number;
}

export interface RichTextInputProps extends FieldChrome {
  /** HTML string, as stored in the SP rich text Note field. Empty field = "". */
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
}

export interface NumberInputProps extends FieldChrome {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  onBlur?: () => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}

export interface OptionItem {
  key: string;
  text: ReactNode;
  data: unknown;
}

export interface DropdownProps extends FieldChrome {
  value: unknown;
  onChange: (v: unknown) => void;
  options: OptionItem[];
  multiselect?: boolean;
  /**
   * Names the control for screen readers WITHOUT the stacked label chrome — for a picker
   * whose caption already reads inline beside it, like the footer's `Page [1] of 3`.
   */
  ariaLabel?: string;
  /** Shown while nothing is picked — what an empty pick means ("None = all"). */
  placeholder?: string;
}

export interface RadioGroupProps extends FieldChrome {
  value: unknown;
  onChange: (v: unknown) => void;
  options: OptionItem[];
  /**
   * Present only for a single-select fill-in Choice: a final "Other" radio with a text
   * box beside it. Typing calls `onTextChange` with the raw text (the caller trims it).
   * Absent, the skin behaves exactly as without it.
   */
  other?: RadioGroupOther;
}

/** The "Other" lifecycle a {@link RadioGroupProps} hands its skin. */
export interface RadioGroupOther {
  /** The fill-in text; "" when none. */
  text: string;
  onTextChange(text: string): void;
  /**
   * Whether Other is the chosen radio. Owned by the field body, not derived by the
   * skin from `value`: an Other picked with an empty box is still Other.
   */
  selected: boolean;
  /** The user picked the Other radio itself (not its text box). */
  onSelect(): void;
  /** The radio's label. Defaults to "Other". */
  label?: string;
}

export interface CheckboxProps extends FieldChrome {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Names the box for screen readers when it has no visible label — a table row's select box. */
  ariaLabel?: string;
  /**
   * Shows the mixed state ("some selected") over `checked`. A click on a mixed box
   * reports `true`; the caller then clears `indeterminate`.
   */
  indeterminate?: boolean;
}

export interface DatePickerProps extends FieldChrome {
  value: Date | undefined;
  onChange: (v: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  showTime?: boolean;
}

export interface PersonaItem {
  key: string;
  text: string;
  secondaryText?: string;
  data: unknown;
}

export interface PeoplePickerProps extends FieldChrome {
  value: PersonaItem[];
  onChange: (v: PersonaItem[]) => void;
  onResolveSuggestions: (query: string) => Promise<PersonaItem[]>;
  multi?: boolean;
}

/**
 * A searchable picker over typed options — the general-typed sibling of `PeoplePicker`,
 * for lookups and any other field whose choices are fetched rather than listed up front.
 */
export interface ComboboxProps extends FieldChrome {
  /** Always an array; a single-value field passes 0..1 and reads v[0] back. */
  value: OptionItem[];
  onChange: (v: OptionItem[]) => void;
  onResolveSuggestions: (query: string) => Promise<OptionItem[]>;
  multi?: boolean;
  /**
   * Shown when a query came back with nothing and the list has no rows. A skin lists the
   * held `value` alongside the suggestions, so a page that omits it still shows it; on a
   * typed search, list a held value the search did not return only when its own text
   * contains what was typed. Otherwise it is no result, and listing it beside this line
   * contradicts it.
   */
  noResultsText?: string;
  /**
   * Present only when the field can create what the user typed. The skin then owns an
   * Add row: shown when the trimmed text is non-empty and no suggestion's string `text`
   * equals it ignoring case, after the suggestions (replacing the no-results line when
   * there are none). Absent, the skin behaves exactly as without it.
   */
  create?: ComboboxCreate;
  /** Shown in the empty box while nothing is picked. The skin's own hint otherwise. */
  placeholder?: string;
}

/** The create lifecycle a {@link ComboboxProps} hands its skin. */
export interface ComboboxCreate {
  /**
   * Called with the trimmed text when the user picks the Add row. The caller does the
   * work, sets the field's value on success, and reports progress through `state`.
   */
  onCreate(text: string): void;
  /**
   * `adding` — the row reads `Adding "<text>"…` and ignores picks. `failed` — it reads
   * `Could not add "<text>"`, with `message` as its accessible description; picking it
   * again retries.
   */
  state:
    | { kind: "idle" }
    | { kind: "adding"; text: string }
    | { kind: "failed"; text: string; message: string };
}

export interface FileInputProps extends FieldChrome {
  /** The chosen file; undefined = none chosen yet. */
  value: File | undefined;
  onChange: (v: File | undefined) => void;
  /** Native accept filter, e.g. '.pdf,.docx'. */
  accept?: string;
}

export interface ButtonProps {
  text: string;
  onClick?: () => void;
  /** `danger` marks a destructive action (the skin renders it in its error color). */
  appearance?: "primary" | "secondary" | "subtle" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  /** Accessible name, when the visible text is not one — a status glyph, a bare view name. */
  ariaLabel?: string;
  /** Skin icon name (Fluent icon name in the v8 skin), rendered before the text. */
  iconName?: string;
  /**
   * Hover/focus hint, also the button's accessible description. Shows while the button
   * is disabled too — the place to say why ("Tick rows first").
   */
  tooltip?: string;
}

export interface IconButtonProps {
  iconName: string; // skin icon name (Fluent icon name in the v8 skin)
  title: string; // tooltip + accessible name (icon-only button)
  onClick?: () => void;
  disabled?: boolean;
  toggled?: boolean;
}

export interface SpinnerProps {
  label?: string;
}

export interface ProgressBarProps {
  label?: string;
  value?: number; // 0..1; undefined → indeterminate
}

export interface MessageBarProps {
  intent: "info" | "success" | "warning" | "error";
  children: ReactNode;
  /** When set, the bar shows a native dismiss control (styled to match the bar). */
  onDismiss?: () => void;
  /** The bar's action slot — an action array or any node; render it with `SpeelActionBar`. */
  actions?: SpeelActions;
  /** Long messages wrap with the actions below (true) or stay on one line with the
   *  actions beside the text (false). Unset = the skin's default. */
  multiline?: boolean;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  blocking?: boolean;
  size?: "small" | "medium" | "large";
  children: ReactNode;
  footer?: ReactNode;
  /** User can resize the surface (skin applies the default when undefined). */
  resizable?: boolean;
  /** Modal only: drag by the title bar. */
  draggable?: boolean;
  /** Modal only: show a fullscreen toggle in the title bar. */
  fullscreenToggle?: boolean;
  /** Modal only: open maximized. Seeds the initial state — the toggle still works. */
  defaultFullscreen?: boolean;
}

export interface DrawerProps extends DialogProps {
  position?: "start" | "end";
}

export interface MenuItem {
  key: string;
  text: string;
  /** Skin icon name (a Fluent icon name in the v8 skin). */
  iconName?: string;
  disabled?: boolean;
  /** Marks a choice as the current one — a checkmark, not a pressed button. */
  checked?: boolean;
  onClick?: () => void;
}

/** A titled run of items. The title states the scope its verbs would otherwise have to. */
export interface MenuSection {
  key: string;
  title?: string;
  items: MenuItem[];
}

/**
 * A menu, as distinct from a popover containing buttons: items are left-aligned rows with
 * icons and checkmarks, navigable by arrow key, and announced as a menu. Skins map this to
 * their own menu component rather than styling buttons to resemble one.
 */
export interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  sections: MenuSection[];
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
}

/** Semantic row emphasis a skin renders consistently. `undefined` is the normal row. */
export type RowIntent = "success" | "warning" | "error" | "muted";

/** A table width: pixels, or a percentage of the container the table sits in. */
export type TableLength = number | `${number}%`;

export interface TableColumn {
  key: string;
  header: string;
  render: (row: unknown) => ReactNode;
  width?: number;
  /** The width to hold the column at when `width` is absent — a hint for skins that need a
   *  number. A skin that sizes columns to their content ignores it. */
  defaultWidth?: number;
  sortable?: boolean;
  headerFilter?: { active: boolean; content: ReactNode };
  /** Break long values onto more lines, at spaces, instead of cutting them off. */
  wrap?: boolean;
  /** A cell's full text, for a hover title when the skin has cut the cell off. */
  cellTitle?: (row: unknown) => string;
  /** Rendered in the header cell in place of `header`'s text — never as a sort button.
   *  `header` still names the column everywhere else. */
  headerContent?: ReactNode;
}

export interface TableSort {
  key: string;
  direction: "asc" | "desc";
}

/** A search field: a plain controlled input with the skin's magnifier and clear affordances. */
export interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Accessible name; defaults to the placeholder, then "Search". */
  ariaLabel?: string;
}

export interface TableProps {
  columns: TableColumn[];
  items: readonly unknown[];
  getRowKey?: (row: unknown, index: number) => string;
  emptyMessage?: string;
  sort?: TableSort;
  onSortChange?: (key: string) => void;
  getRowIntent?: (row: unknown, index: number) => RowIntent | undefined;
  getRowClassName?: (row: unknown, index: number) => string | undefined;
  onColumnResize?: (key: string, width: number) => void;
}

/** Chrome (label/required/error/description) wrapped around an arbitrary node —
 * used for view-mode displays and render-override bodies. */
export interface FieldDisplayProps extends FieldChrome {
  children: ReactNode;
}

/**
 * The bounded set of UI primitives the Speel components render. A skin (the Fluent v8 skin
 * in `@speel/react/fluent-v8`, or any other library) implements this; the high-level
 * components never import a concrete UI library. Further surface primitives
 * (Toaster/ProgressBar) join the contract in later sub-projects.
 */
export interface SpeelUIAdapter {
  TextInput: ComponentType<TextInputProps>;
  RichTextInput: ComponentType<RichTextInputProps>;
  NumberInput: ComponentType<NumberInputProps>;
  Dropdown: ComponentType<DropdownProps>;
  RadioGroup: ComponentType<RadioGroupProps>;
  Checkbox: ComponentType<CheckboxProps>;
  DatePicker: ComponentType<DatePickerProps>;
  PeoplePicker: ComponentType<PeoplePickerProps>;
  Combobox: ComponentType<ComboboxProps>;
  FileInput: ComponentType<FileInputProps>;
  Spinner: ComponentType<SpinnerProps>;
  Button: ComponentType<ButtonProps>;
  IconButton: ComponentType<IconButtonProps>;
  MessageBar: ComponentType<MessageBarProps>;
  ProgressBar: ComponentType<ProgressBarProps>;
  Dialog: ComponentType<DialogProps>;
  Drawer: ComponentType<DrawerProps>;
  Popover: ComponentType<PopoverProps>;
  Table: ComponentType<TableProps>;
  SearchBox: ComponentType<SearchBoxProps>;
  Menu: ComponentType<MenuProps>;
  FieldDisplay: ComponentType<FieldDisplayProps>;
}
