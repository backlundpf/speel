import * as React from "react";
import {
  TextField,
  SpinButton,
  Dropdown,
  ComboBox,
  SelectableOptionMenuItemType,
  ChoiceGroup,
  Checkbox,
  DatePicker,
  Spinner,
  NormalPeoplePicker,
  PrimaryButton,
  DefaultButton,
  SearchBox,
  ActionButton,
  IconButton,
  MessageBar,
  MessageBarType,
  Modal,
  Panel,
  PanelType,
  DetailsList,
  DetailsListLayoutMode,
  ConstrainMode,
  DEFAULT_CELL_STYLE_PROPS,
  SelectionMode,
  type IColumn,
  type IDetailsList,
  ColumnActionsMode,
  FontWeights,
  ProgressIndicator,
  Callout,
  Icon,
  ContextualMenu,
  ContextualMenuItemType,
  useTheme,
  TooltipHost,
  TooltipDelay,
} from "@fluentui/react";
import type {
  IDropdownOption,
  IComboBox,
  IComboBoxOption,
  IChoiceGroupOption,
  ITextField,
  IPersonaProps,
  IDetailsRowProps,
  IDetailsHeaderProps,
  IContextualMenuItem,
  IButtonStyles,
  Theme,
} from "@fluentui/react";
import { V8Field, chromeFrom, useFieldAria } from "./Field.js";
import { useStableId } from "./useStableId.js";
import { columnBounds } from "./columnBounds.js";
import {
  headerFloor,
  textMeasurer,
  type HeaderRoom,
} from "../table/layout/headerFloor.js";
import { toFlexColumn } from "../table/layout/columnFlex.js";
import { resolveColumnWidths } from "../table/layout/resolveColumnWidths.js";
import { useContainerWidth } from "../table/layout/useContainerWidth.js";
import { setOverflowTitle } from "../table/overflowTitle.js";
import { useResizable } from "../surface/useResizable.js";
import { useDragResize } from "../surface/useDragResize.js";
import { SpeelActionBar } from "../actions.js";
import type {
  TextInputProps,
  NumberInputProps,
  CheckboxProps,
  SpinnerProps,
  FieldDisplayProps,
  DropdownProps,
  RadioGroupProps,
  DatePickerProps,
  PeoplePickerProps,
  PersonaItem,
  ComboboxProps,
  OptionItem,
  ButtonProps,
  MessageBarProps,
  DialogProps,
  DrawerProps,
  TableProps,
  IconButtonProps,
  ProgressBarProps,
  TableColumn,
  TableSort,
  PopoverProps,
  FileInputProps,
  RowIntent,
  MenuProps,
  SearchBoxProps,
} from "../adapter/SpeelUIAdapter.js";

export function V8FileInput(p: FileInputProps): JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DefaultButton
          text="Choose file"
          disabled={!!p.disabled}
          onClick={() => inputRef.current?.click()}
        />
        <span>{p.value ? p.value.name : "No file chosen"}</span>
        {p.value ? (
          <IconButton
            iconProps={{ iconName: "Cancel" }}
            title="Clear"
            ariaLabel="Clear file"
            disabled={!!p.disabled}
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              p.onChange(undefined);
            }}
          />
        ) : null}
        <input
          ref={inputRef}
          id={aria.controlId}
          type="file"
          style={{ display: "none" }}
          {...(aria.describedBy !== undefined
            ? { "aria-describedby": aria.describedBy }
            : {})}
          {...(p.accept ? { accept: p.accept } : {})}
          onChange={(e) => p.onChange(e.target.files?.[0])}
        />
      </div>
    </V8Field>
  );
}

export function V8TextInput(p: TextInputProps): JSX.Element {
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      <TextField
        {...(p.label !== undefined ? { label: p.label } : {})}
        required={!!p.required}
        {...(aria.describedBy !== undefined
          ? { "aria-describedby": aria.describedBy }
          : {})}
        value={p.value}
        onChange={(_e, v) => p.onChange(v ?? "")}
        multiline={p.multiline ?? false}
        disabled={!!p.disabled}
        {...(p.maxLength !== undefined ? { maxLength: p.maxLength } : {})}
        {...(p.onBlur ? { onBlur: p.onBlur } : {})}
      />
    </V8Field>
  );
}

export function V8NumberInput(p: NumberInputProps): JSX.Element {
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  const control = (
    <SpinButton
      {...(p.label !== undefined ? { label: p.label } : {})}
      {...(aria.describedBy !== undefined
        ? { ariaDescribedBy: aria.describedBy }
        : {})}
      // `== null` catches null as well as undefined: an empty number column
      // arrives as null, and String(null) is the word "null" in the user's box.
      value={p.value == null ? "" : String(p.value)}
      onChange={(_e, v) =>
        p.onChange(v !== undefined && v !== "" ? Number(v) : undefined)
      }
      disabled={!!p.disabled}
      {...(p.min !== undefined ? { min: p.min } : {})}
      {...(p.max !== undefined ? { max: p.max } : {})}
      {...(p.step !== undefined ? { step: p.step } : {})}
    />
  );
  const hasAdorn = p.prefix !== undefined || p.suffix !== undefined;
  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      {hasAdorn ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {p.prefix !== undefined && <span>{p.prefix}</span>}
          <div style={{ flex: 1 }}>{control}</div>
          {p.suffix !== undefined && <span>{p.suffix}</span>}
        </div>
      ) : (
        control
      )}
    </V8Field>
  );
}

export function V8Checkbox(p: CheckboxProps): JSX.Element {
  const chrome = chromeFrom({
    required: p.required,
    error: p.error,
    description: p.description,
  });
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      <Checkbox
        {...(p.label !== undefined ? { label: p.label } : {})}
        {...(p.ariaLabel !== undefined ? { ariaLabel: p.ariaLabel } : {})}
        checked={p.checked}
        indeterminate={!!p.indeterminate}
        disabled={!!p.disabled}
        // Fluent reports a click on a mixed box as the unchanged `checked`; the
        // contract (and every other skin) has it move to checked.
        onChange={(_e, checked) =>
          p.onChange(p.indeterminate ? true : checked === true)
        }
      />
    </V8Field>
  );
}

export function V8Spinner(p: SpinnerProps): JSX.Element {
  return <Spinner {...(p.label !== undefined ? { label: p.label } : {})} />;
}

export function V8ProgressBar(p: ProgressBarProps): JSX.Element {
  return (
    <ProgressIndicator
      {...(p.label !== undefined ? { label: p.label } : {})}
      {...(p.value !== undefined ? { percentComplete: p.value } : {})}
    />
  );
}

export function V8Button(p: ButtonProps): JSX.Element {
  const tooltipId = useStableId();
  const theme = useTheme();
  const Btn =
    p.appearance === "primary" || p.appearance === "danger"
      ? PrimaryButton
      : p.appearance === "subtle"
        ? ActionButton
        : DefaultButton;
  const button = (
    <Btn
      text={p.text}
      data-appearance={p.appearance ?? "secondary"}
      {...(p.appearance === "danger" ? { styles: dangerStyles(theme) } : {})}
      type={p.type ?? "button"}
      disabled={!!p.disabled}
      {...(p.iconName !== undefined
        ? { iconProps: { iconName: p.iconName } }
        : {})}
      {...(p.ariaLabel !== undefined ? { ariaLabel: p.ariaLabel } : {})}
      {...(p.onClick ? { onClick: p.onClick } : {})}
      {...(p.tooltip !== undefined
        ? {
            // A natively disabled button swallows pointer and focus events, so the
            // tooltip could never open on it. `allowDisabledFocus` keeps it disabled
            // (aria-disabled, styled, clicks ignored) without the native attribute.
            allowDisabledFocus: true,
            "aria-describedby": tooltipId,
          }
        : {})}
    />
  );
  if (p.tooltip === undefined) return button;
  return (
    <TooltipHost content={p.tooltip} id={tooltipId}>
      {button}
    </TooltipHost>
  );
}

/** A filled button in the theme's error red — Fluent v8 has no danger variant. */
function dangerStyles(theme: Theme): IButtonStyles {
  const { red, redDark, white } = theme.palette;
  const fill = (bg: string) => ({
    backgroundColor: bg,
    borderColor: bg,
    color: white,
  });
  return {
    root: fill(redDark),
    rootHovered: fill(red),
    rootPressed: fill(red),
    rootFocused: fill(redDark),
  };
}

export function V8IconButton(p: IconButtonProps): JSX.Element {
  return (
    <IconButton
      iconProps={{ iconName: p.iconName }}
      title={p.title}
      ariaLabel={p.title}
      disabled={!!p.disabled}
      checked={!!p.toggled}
      {...(p.onClick ? { onClick: p.onClick } : {})}
    />
  );
}

export function V8SearchBox(p: SearchBoxProps): JSX.Element {
  const name = p.ariaLabel ?? p.placeholder ?? "Search";
  return (
    <SearchBox
      value={p.value}
      // Fluent reports a clear (the X, or Escape) through `onClear`, not `onChange`.
      onChange={(_e, v) => p.onChange(v ?? "")}
      onClear={() => p.onChange("")}
      placeholder={p.placeholder ?? "Search"}
      ariaLabel={name}
      styles={{ root: { width: "100%" } }}
    />
  );
}

const MSG_BAR_TYPE = {
  info: MessageBarType.info,
  success: MessageBarType.success,
  warning: MessageBarType.warning,
  error: MessageBarType.error,
} as const;

export function V8MessageBar(p: MessageBarProps): JSX.Element {
  return (
    <MessageBar
      messageBarType={MSG_BAR_TYPE[p.intent]}
      {...(p.actions !== undefined
        ? {
            actions: (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <SpeelActionBar actions={p.actions} />
              </div>
            ),
          }
        : {})}
      {...(p.multiline !== undefined ? { isMultiline: p.multiline } : {})}
      styles={{ iconContainer: { alignSelf: "center" } }}
      {...(p.onDismiss
        ? { onDismiss: p.onDismiss, dismissButtonAriaLabel: "Dismiss" }
        : {})}
    >
      {p.children}
    </MessageBar>
  );
}

const DIALOG_WIDTH = { small: 480, medium: 640, large: 840 } as const;
const PANEL_WIDTH = {
  small: "420px",
  medium: "640px",
  large: "880px",
} as const;

const DIALOG_HEIGHT = { small: 440, medium: 560, large: 640 } as const;
/** What can take focus when a modal opens: enabled, reachable controls. */
const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const DIALOG_MIN = { w: 360, h: 260 };

/** The modal's size caps (its CSS 96vw x 92vh) and the viewport it must stay inside.
 *  Read at render, like the panel's max; empty outside a browser. */
function viewportBounds(): {
  max?: { w: number; h: number };
  bounds?: { w: number; h: number };
} {
  if (typeof window === "undefined") return {};
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    max: { w: Math.floor(w * 0.96), h: Math.floor(h * 0.92) },
    bounds: { w, h },
  };
}

/**
 * Centered modal on Fluent `Modal` (not `Dialog`, which imposes its own header +
 * a second scroll container). The content is a flex column that fills the modal:
 * a sticky header (title + fullscreen + close — also the drag handle), a single
 * scrolling body, and a sticky footer. The wrapper is `position:absolute; inset:0`
 * so it fills `main` directly, sidestepping the FocusTrapZone/scrollableContent
 * height chain. Resizable via a corner handle; draggable by the header.
 */
export function V8Dialog(p: DialogProps): JSX.Element {
  const resizable = p.resizable ?? true;
  const draggable = p.draggable ?? true;
  const showFs = p.fullscreenToggle ?? true;
  const [fullscreen, setFullscreen] = React.useState(
    p.defaultFullscreen ?? false,
  );
  const presetW = DIALOG_WIDTH[p.size ?? "medium"];
  const presetH = DIALOG_HEIGHT[p.size ?? "medium"];
  const { size, transform, dragHandleProps, resizeHandleProps } = useDragResize(
    {
      min: DIALOG_MIN,
      initial: { w: presetW, h: presetH },
      // The same caps the frame's CSS applies (96vw x 92vh), and the viewport as the box
      // a drag or resize cannot carry the modal out of.
      ...viewportBounds(),
      label: "Resize dialog",
    },
  );
  const [gripLit, setGripLit] = React.useState(false);
  const grip = gripLit ? "3px solid #0078d4" : "2px solid #c8c6c4";

  const width = fullscreen ? "96vw" : resizable ? size.w : presetW;
  const height = fullscreen ? "92vh" : resizable ? size.h : presetH;

  // Focus starts inside the modal. Fluent's focus trap only keeps focus in once it is
  // there, and whatever opened the modal (a combobox's Add row, a button) may still hold
  // it. The body's first focusable element takes it — a form's first field; a modal with
  // nothing to fill in focuses its own frame instead, never a footer button, so Enter
  // cannot confirm a dialog nobody has read yet.
  const frameRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!p.open) return;
    const t = setTimeout(() => {
      const frame = frameRef.current;
      if (!frame || frame.contains(document.activeElement)) return;
      const first = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? frame).focus();
    }, 0);
    return () => clearTimeout(t);
  }, [p.open]);

  return (
    <Modal
      isOpen={p.open}
      onDismiss={() => p.onOpenChange(false)}
      isBlocking={p.blocking ?? false}
      styles={{
        // Own drag/resize: a translate keeps the top-left fixed while resizing (and applies
        // the drag offset). Not applied in fullscreen (centered, full size).
        main: {
          width,
          maxWidth: "96vw",
          height,
          maxHeight: "92vh",
          overflow: "hidden",
          position: "relative",
          ...(fullscreen ? {} : { transform }),
        },
        scrollableContent: { overflow: "hidden", height: "100%" },
      }}
    >
      <div
        className="speel-modal"
        ref={frameRef}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Sticky header — doubles as the drag handle. */}
        <div
          className="speel-modal-bar"
          {...(draggable && !fullscreen ? dragHandleProps : {})}
          style={{
            // A touch-drag on the bar moves the modal rather than scrolling.
            ...(draggable && !fullscreen ? { touchAction: "none" } : {}),
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 20px",
            borderBottom: "1px solid rgba(0,0,0,0.1)",
            cursor: draggable && !fullscreen ? "move" : "default",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 18,
              flexGrow: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.title}
          </span>
          {showFs ? (
            <IconButton
              iconProps={{
                iconName: fullscreen ? "BackToWindow" : "FullScreen",
              }}
              title="Toggle fullscreen"
              ariaLabel="Toggle fullscreen"
              onClick={() => setFullscreen((f) => !f)}
            />
          ) : null}
          {p.blocking ? null : (
            <IconButton
              iconProps={{ iconName: "Cancel" }}
              title="Close"
              ariaLabel="Close"
              onClick={() => p.onOpenChange(false)}
            />
          )}
        </div>
        {/* Scrolling body — the only scroll container. */}
        <div
          ref={bodyRef}
          style={{
            flex: "1 1 auto",
            overflow: "auto",
            padding: "16px 20px",
            minHeight: 0,
          }}
        >
          {p.children}
        </div>
        {/* Sticky footer. */}
        {p.footer ? (
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              alignItems: "center",
              padding: "12px 20px",
              borderTop: "1px solid rgba(0,0,0,0.1)",
            }}
          >
            {p.footer}
          </div>
        ) : null}
        {resizable && !fullscreen ? (
          <div
            {...resizeHandleProps}
            data-testid="resize-handle"
            onPointerEnter={() => setGripLit(true)}
            onPointerLeave={() => setGripLit(false)}
            onFocus={() => setGripLit(true)}
            onBlur={() => setGripLit(false)}
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: "nwse-resize",
              zIndex: 1,
              outline: "none",
              // Claim the gesture, or a touch-drag scrolls instead of resizing.
              touchAction: "none",
            }}
          >
            {/* The corner it resizes, drawn quietly; it speaks up on hover or focus. */}
            <span
              style={{
                position: "absolute",
                right: 3,
                bottom: 3,
                width: gripLit ? 10 : 8,
                height: gripLit ? 10 : 8,
                borderRight: grip,
                borderBottom: grip,
                transition:
                  "width 120ms ease, height 120ms ease, border-color 120ms ease",
              }}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function V8Popover(p: PopoverProps): JSX.Element {
  const ref = React.useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} style={{ display: "inline-flex" }}>
      {p.trigger}
      {p.open ? (
        <Callout
          target={ref}
          onDismiss={() => p.onOpenChange(false)}
          isBeakVisible={false}
          setInitialFocus
        >
          <div style={{ padding: 12, minWidth: 240 }}>{p.children}</div>
        </Callout>
      ) : null}
    </span>
  );
}

/**
 * The header's text box. It takes whatever the filter button leaves, and breaks a label only
 * at spaces; a word wider than the box ends in "…" (`text-overflow` applies to every line).
 * The `title` on the label is the hover for whatever is cut off. The header row grows to fit
 * the lines (see `V8Table`).
 */
const HEADER_LABEL_BOX_STYLE: React.CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal",
  overflowWrap: "normal",
  wordBreak: "normal",
  lineHeight: "normal",
};

/** Label box and filter button side by side, the button level with the first line. */
const HEADER_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  width: "100%",
};

/** The filter button, smaller than the 32px default: every pixel here comes off the label. */
const HEADER_FILTER_BUTTON_STYLES = {
  root: { width: 24, height: 24 },
  icon: { fontSize: 12 },
};

function V8HeaderCell({
  column,
  sort,
  onSortChange,
}: {
  column: TableColumn;
  sort?: TableSort;
  onSortChange?: (key: string) => void;
}): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const sorted = sort?.key === column.key;
  // Consistent MS sort iconography: SortUp/SortDown when active. Only when active — the icon
  // is inline with a label that wraps, so a hover-only hint would reflow the header row
  // under the pointer; the hover background carries the affordance instead.
  const sortIcon = sorted
    ? sort!.direction === "asc"
      ? "SortUp"
      : "SortDown"
    : undefined;
  const label =
    column.headerContent !== undefined ? (
      // A control in the header owns its clicks: it is never wrapped in the sort button.
      column.headerContent
    ) : column.sortable && onSortChange ? (
      <span
        role="button"
        tabIndex={0}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: "pointer",
          display: "inline",
          padding: "2px 4px",
          borderRadius: 2,
          // Each line of a wrapped label gets its own rounded hover fragment.
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          background: hovered ? "rgba(0,0,0,0.06)" : "transparent",
        }}
        aria-label={
          sorted
            ? `${column.header}, sorted ${sort!.direction === "asc" ? "ascending" : "descending"}`
            : `${column.header}, sortable`
        }
        onClick={() => onSortChange(column.key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSortChange(column.key);
          }
        }}
      >
        <span title={column.header}>{column.header}</span>
        {sortIcon ? (
          // An ordinary space, so a last word that fits but not with its arrow keeps the
          // line and the arrow takes the next one — the word is never cut for the arrow.
          <>
            {" "}
            <Icon
              iconName={sortIcon}
              aria-hidden
              style={{
                fontSize: 12,
                display: "inline",
                verticalAlign: "middle",
              }}
            />
          </>
        ) : null}
      </span>
    ) : (
      <span title={column.header}>{column.header}</span>
    );
  return (
    <span style={HEADER_ROW_STYLE}>
      <span
        data-header-label=""
        style={{
          ...HEADER_LABEL_BOX_STYLE,
          ...(column.align ? { textAlign: column.align } : {}),
        }}
      >
        {label}
      </span>
      {column.headerFilter ? (
        <span style={{ flex: "none" }}>
          <V8Popover
            open={open}
            onOpenChange={setOpen}
            trigger={
              <IconButton
                iconProps={{ iconName: "Filter" }}
                styles={HEADER_FILTER_BUTTON_STYLES}
                title={`Filter ${column.header}`}
                ariaLabel={`Filter ${column.header}`}
                checked={column.headerFilter.active}
                onClick={() => setOpen((o) => !o)}
              />
            }
          >
            {column.headerFilter.content}
          </V8Popover>
        </span>
      ) : null}
    </span>
  );
}

/** Padding DetailsList adds around every cell, on top of the laid-out column width. */
const CELL_PADDING =
  DEFAULT_CELL_STYLE_PROPS.cellLeftPadding +
  DEFAULT_CELL_STYLE_PROPS.cellRightPadding;

/**
 * What the v8 header puts around its label: the sort label's `padding: 2px 4px`, a space and
 * the 12px sort arrow, and the 24px filter button plus its 4px gap.
 */
const V8_HEADER_ROOM: HeaderRoom = {
  label: 8,
  sortArrow: 16,
  filterButton: 28,
};

/** Fluent's header height, which it pins on the row AND on every cell; it is not exported. */
const HEADER_HEIGHT = 42;

/**
 * The header row, freed to grow with a wrapped label. Fluent fixes the row at 42px with the
 * cells as inline-blocks; as a flex row the cells stretch to the tallest one, so a one-line
 * label beside a two-line one stays vertically centred rather than pinned to the top. Cells
 * and sizers must not shrink — DetailsList lays each out at an explicit width, and letting
 * flex compress them would undo the horizontal scroll the `viewport` prop below arranges.
 */
const HEADER_ROW_STYLES: NonNullable<IDetailsHeaderProps["styles"]> = {
  root: {
    height: "auto",
    lineHeight: "normal",
    display: "inline-flex",
    alignItems: "stretch",
  },
  cellSizer: { flexShrink: 0 },
};

/**
 * Room for a focus ring around the cell box's content. `overflow: hidden` clips at the padding
 * edge, and a content-tight box would cut the outline of a link or checkbox in the cell — the
 * UA ring reaches 3px past the element (2px ring + 1px offset), a Fluent Checkbox's 3px.
 * Padding moves the clip edge out into Fluent's own cell padding (12px left, 8px right, 11px
 * — 6px compact — above and below); the equal negative margin keeps the content box, where
 * text breaks and the ellipsis sits, and the row's layout exactly where they were. Padding
 * counts in both `scrollWidth` and `clientWidth`, so `setOverflowTitle` still reads a value
 * that just fits as fitting.
 */
const CELL_FOCUS_SLACK: React.CSSProperties = { padding: 3, margin: -3 };

/** A single-line cell: cut off with an ellipsis, as DetailsList's own cell style does. */
const CELL_LINE_STYLE: React.CSSProperties = {
  ...CELL_FOCUS_SLACK,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * A wrapping cell: the header's rule — break only at spaces, and end a word wider than the
 * column in "…" — rather than Fluent's `isMultiline` `word-break: break-word`.
 */
const CELL_WRAP_STYLE: React.CSSProperties = {
  ...CELL_FOCUS_SLACK,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal",
  overflowWrap: "normal",
  wordBreak: "normal",
};

/**
 * A cell's content in a box the skin can measure: on hover, a cut-off cell gets its full text
 * as a title. Only for columns that wrap, have a title, or align — the rest (the actions column)
 * render bare. The box keeps `CELL_FOCUS_SLACK` around its content, so a control in it keeps
 * its whole focus ring.
 */
function V8Cell({
  column,
  row,
}: {
  column: TableColumn;
  row: unknown;
}): JSX.Element {
  const { cellTitle } = column;
  return (
    <div
      style={{
        ...(column.wrap ? CELL_WRAP_STYLE : CELL_LINE_STYLE),
        ...(column.align ? { textAlign: column.align } : {}),
      }}
      {...(cellTitle
        ? {
            onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) =>
              setOverflowTitle(e.currentTarget, () => cellTitle(row)),
          }
        : {})}
    >
      {column.render(row)}
    </div>
  );
}

export function V8Table(
  p: TableProps & {
    /** The width to lay out against, instead of measuring. A seam for tests, which have no
     *  layout to measure; nothing in the app supplies it. */
    containerWidth?: number;
  },
): JSX.Element {
  // Called before the empty early-return: hooks may not sit behind a conditional.
  const theme = useTheme();
  const wrapper = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<IDetailsList>(null);

  // How wide the table may lay out in: what a percentage bound is a percentage of. Fluent
  // measures a box itself, but lays out against it directly — squashing the columns into it
  // or stretching the last one across it — so the resolver gets this width instead and
  // Fluent is handed the result (see `viewport` below).
  const measured = useContainerWidth(wrapper);

  const rowBackground = (intent: RowIntent | undefined): string | undefined => {
    switch (intent) {
      case "success":
        return theme.semanticColors.successBackground;
      case "warning":
        return theme.semanticColors.warningBackground;
      case "error":
        return theme.semanticColors.errorBackground;
      case "muted":
        return theme.palette.neutralLighterAlt;
      default:
        return undefined;
    }
  };
  if (p.items.length === 0)
    return <div ref={wrapper}>{p.emptyMessage ?? "No items."}</div>;
  // The font DetailsColumn renders a header name in: semibold, at the medium size.
  const headerFont = theme.fonts.medium;
  const headerSize =
    typeof headerFont.fontSize === "number"
      ? headerFont.fontSize
      : parseFloat(headerFont.fontSize ?? "14");
  const measure = textMeasurer(
    `${FontWeights.semibold} ${headerSize}px ${headerFont.fontFamily ?? "sans-serif"}`,
    headerSize,
  );
  const layout = resolveColumnWidths(
    p.columns.map((c) =>
      toFlexColumn(
        c,
        headerFloor(
          c,
          c.sortable === true &&
            p.onSortChange !== undefined &&
            c.headerContent === undefined,
          measure,
          V8_HEADER_ROOM,
        ),
        CELL_PADDING,
      ),
    ),
    {
      ...(p.minWidth !== undefined ? { minWidth: p.minWidth } : {}),
      ...(p.width !== undefined ? { width: p.width } : {}),
      ...(p.maxWidth !== undefined ? { maxWidth: p.maxWidth } : {}),
    },
    p.containerWidth ?? measured,
  );
  const columns: IColumn[] = p.columns.map((c, i) => ({
    key: c.key,
    name: c.header,
    // Fluent names the columnheader from the content it renders; with a control there, that
    // is the control's name ("Select all"). `ariaLabel` names it by `header` instead.
    ...(c.headerContent !== undefined ? { ariaLabel: c.header } : {}),
    isResizable: true,
    // The resolved width rides in maxWidth, NOT minWidth: DetailsList clamps a drag to
    // minWidth, so a floor equal to the current width lets a column grow and never shrink.
    // The floor is the column's own minWidth, so a drag stops there.
    ...columnBounds(layout.widths[i]!, c.minWidth),
    // We render our own sort/filter affordances, so disable Fluent's clickable-cell hover (the whole
    // header highlighting) — the sort label gets its own hover instead.
    columnActionsMode: ColumnActionsMode.disabled,
    styles: {
      // The header cell: a flex item of the row that never shrinks below its laid-out width
      // (see `HEADER_ROW_STYLES`), tall enough for a wrapped label, one-line labels centred
      // where Fluent's fixed 42px would have put them.
      root: {
        height: "auto",
        minHeight: HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        whiteSpace: "normal",
      },
      // Fluent's tooltip wrapper is absolutely positioned to fill the cell — which takes the
      // label out of the cell's flow, so the cell would sit at its minimum and clip. In flow,
      // and grown to the cell's width, the label's height becomes the cell's height.
      cellTooltip: { position: "relative", flexGrow: 1, minWidth: 0 },
      // Fluent pads the title AND the cell; the absolute wrapper used to cover the cell's
      // padding, so only one of the two showed. In flow, both would.
      cellTitle: { flexGrow: 1, minWidth: 0, padding: 0 },
      // Fluent's .ms-DetailsHeader-cellName is `flex: 0 1 auto` (content-width) and nowrap;
      // make it grow so our header content fills the column and the filter button can sit at
      // the far right, and let the label wrap.
      cellName: { flexGrow: 1, width: "100%", whiteSpace: "normal" },
    },
    // A wrapping column lets DetailsList grow the row; V8Cell sets how the text breaks.
    ...(c.wrap ? { isMultiline: true } : {}),
    onRender: (item: unknown) =>
      c.cellTitle || c.wrap || c.align ? (
        <V8Cell column={c} row={item} />
      ) : (
        c.render(item)
      ),
    onRenderHeader: () => (
      <V8HeaderCell
        column={c}
        {...(p.sort ? { sort: p.sort } : {})}
        {...(p.onSortChange ? { onSortChange: p.onSortChange } : {})}
      />
    ),
  }));

  // The resolved columns, padding included.
  const content = layout.widths.reduce((sum, w) => sum + w + CELL_PADDING, 0);
  return (
    // The outer box is the one measured: as wide as the space the table may lay out in.
    <div ref={wrapper}>
      {/* The table's own box: the columns' total, so rows and borders end where the columns
          do — spare width that nothing can grow into stays outside it, as in the shadcn skin —
          capped at the container so a wider table scrolls inside DetailsList rather than past
          the page. */}
      <div style={{ width: content, maxWidth: "100%" }}>
        <DetailsList
          componentRef={list}
          items={[...p.items]}
          columns={columns}
          selectionMode={SelectionMode.none}
          layoutMode={DetailsListLayoutMode.justified}
          /**
           * The justified pass lays out against `viewport.width`: it shrinks columns toward
           * their `minWidth` floors when they do not fit, and gives any width beyond them to
           * the LAST column. So it is handed exactly the columns' total. The resolver has
           * already decided growing, shrinking and overflow — each column's width rides in
           * its `maxWidth` — and leaves the justified pass nothing to do. When that total is
           * wider than the box, the DetailsList root scrolls it horizontally.
           *
           * Passing `viewport` explicitly is supported: `withViewport` spreads our props over
           * the value it measured, so ours wins. Only `width` is read for layout.
           */
          viewport={{ width: content, height: 0 }}
          // Fluent's own root is the scroller: header and rows are inline blocks with
          // `min-width: 100%`, so they overflow it together. Passed explicitly (it is also the
          // default) because the width behaviour above depends on it.
          constrainMode={ConstrainMode.horizontalConstrained}
          onRenderDetailsHeader={(headerProps, defaultRender) =>
            headerProps && defaultRender
              ? defaultRender({ ...headerProps, styles: HEADER_ROW_STYLES })
              : null
          }
          {...(p.getRowKey
            ? {
                getKey: (item: unknown, i?: number) =>
                  p.getRowKey!(item, i ?? 0),
              }
            : {})}
          {...(p.onColumnResize
            ? {
                onColumnResize: (column?: IColumn, newWidth?: number) => {
                  if (!column || newWidth === undefined) return;
                  // Fluent stops a drag at the column's minWidth (see columnBounds) but has
                  // no ceiling: past the column's own maxWidth, report the width it stops at.
                  const max = p.columns.find(
                    (c) => c.key === column.key,
                  )?.maxWidth;
                  const held =
                    max !== undefined && newWidth > max
                      ? Math.max(max, column.minWidth ?? 0)
                      : newWidth;
                  p.onColumnResize!(column.key, held);
                  // Fluent pins the dragged width as an override that outranks the column's
                  // props, so the layout would hold the column at `held` while Fluent drew it
                  // at `newWidth`, taking the difference from the columns after it — and the
                  // next drag would start from `newWidth`. `updateColumn` re-pins it at `held`.
                  // Fluent calls this BEFORE recording `newWidth`, so it is deferred: a
                  // microtask runs once Fluent's own bookkeeping and render are done, yet
                  // before the browser paints, so the overshoot is never drawn. Re-keying the
                  // DetailsList instead would remount it mid-drag and end the drag (the drag
                  // lives in its header's state). Optional-chained: the `>=8` peer range
                  // reaches back to early 8.x releases that predate `updateColumn`.
                  if (held !== newWidth)
                    void Promise.resolve().then(() =>
                      list.current?.updateColumn?.(column, { width: held }),
                    );
                },
              }
            : {})}
          {...(p.getRowIntent || p.getRowClassName
            ? {
                onRenderRow: (
                  rowProps?: IDetailsRowProps,
                  defaultRender?: (rp?: IDetailsRowProps) => JSX.Element | null,
                ) => {
                  if (!rowProps || !defaultRender) return null;
                  const item = rowProps.item as unknown;
                  const intent = p.getRowIntent?.(item, rowProps.itemIndex);
                  const cls = p.getRowClassName?.(item, rowProps.itemIndex);
                  const background = rowBackground(intent);
                  return defaultRender({
                    ...rowProps,
                    ...(cls ? { className: cls } : {}),
                    ...(background
                      ? {
                          styles: {
                            root: {
                              background,
                              ...(intent === "muted"
                                ? { color: theme.palette.neutralSecondary }
                                : {}),
                              selectors: { ":hover": { background } },
                            },
                          },
                        }
                      : {}),
                  });
                },
              }
            : {})}
        />
      </div>
    </div>
  );
}

/**
 * A real menu, not a popover full of buttons: ContextualMenu supplies left-aligned rows,
 * icons, checkmarks, section headers with dividers, arrow-key navigation, and menu roles —
 * all of which a hand-rolled button stack has to fake, badly.
 */
export function V8Menu(p: MenuProps): JSX.Element {
  const anchor = React.useRef<HTMLSpanElement>(null);
  const items: IContextualMenuItem[] = p.sections.map((section, i) => ({
    key: section.key,
    itemType: ContextualMenuItemType.Section,
    sectionProps: {
      key: section.key,
      ...(section.title !== undefined ? { title: section.title } : {}),
      topDivider: i > 0,
      items: section.items.map((item) => ({
        key: item.key,
        text: item.text,
        ...(item.iconName !== undefined
          ? { iconProps: { iconName: item.iconName } }
          : {}),
        ...(item.disabled ? { disabled: true } : {}),
        // canCheck makes the row a choice: it reserves the checkmark gutter so the
        // unchecked siblings still align.
        ...(item.checked !== undefined
          ? { canCheck: true, checked: item.checked }
          : {}),
        ...(item.onClick
          ? {
              onClick: () => {
                item.onClick!();
              },
            }
          : {}),
      })),
    },
  }));

  return (
    <span ref={anchor} style={{ display: "inline-flex" }}>
      {p.trigger}
      {p.open ? (
        <ContextualMenu
          target={anchor}
          items={items}
          onDismiss={() => p.onOpenChange(false)}
        />
      ) : null}
    </span>
  );
}

export function V8Panel(p: DrawerProps): JSX.Element {
  const resizable = p.resizable ?? true;
  const preset = PANEL_WIDTH[p.size ?? "medium"];
  const presetNum = parseInt(preset, 10);
  const atEnd = p.position !== "start";
  // Leave a strip of page visible: a panel dragged past the viewport edge has no
  // handle left to drag back.
  const maxW =
    typeof window === "undefined"
      ? undefined
      : Math.max(320, window.innerWidth - 48);
  const { size, handleProps } = useResizable({
    axis: "x",
    min: { w: 320 },
    ...(maxW !== undefined ? { max: { w: maxW } } : {}),
    initial: { w: presetNum },
    invertX: atEnd,
    label: "Resize panel",
  });
  const [grabbed, setGrabbed] = React.useState(false);
  const width = resizable ? `${size.w ?? presetNum}px` : preset;
  return (
    <Panel
      isOpen={p.open}
      onDismiss={() => p.onOpenChange(false)}
      type={p.position === "start" ? PanelType.customNear : PanelType.custom}
      customWidth={width}
      isBlocking={p.blocking ?? false}
      isLightDismiss={!p.blocking}
      hasCloseButton={!p.blocking}
      isFooterAtBottom
      {...(p.title !== undefined ? { headerText: p.title } : {})}
      {...(p.footer ? { onRenderFooterContent: () => <>{p.footer}</> } : {})}
    >
      {resizable ? (
        <div
          {...handleProps}
          data-testid="resize-handle"
          onPointerEnter={() => setGrabbed(true)}
          onPointerLeave={() => setGrabbed(false)}
          onFocus={() => setGrabbed(true)}
          onBlur={() => setGrabbed(false)}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [atEnd ? "left" : "right"]: 0,
            // Wider than the rule it draws: the grab target is forgiving, the
            // line is not loud.
            width: 10,
            cursor: "ew-resize",
            zIndex: 1,
            display: "flex",
            justifyContent: "center",
            outline: "none",
            // Claim the gesture, or a touch-drag scrolls the panel instead.
            touchAction: "none",
          }}
        >
          <span
            style={{
              width: grabbed ? 3 : 1,
              background: grabbed ? "#0078d4" : "#edebe9",
              transition: "width 120ms ease, background 120ms ease",
            }}
          />
        </div>
      ) : null}
      {p.children}
    </Panel>
  );
}

export function V8FieldDisplay(p: FieldDisplayProps): JSX.Element {
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria}>
      {/* Read-only, so not a labelable element: `group` gives it a name an AT can
          reach, which a bare div cannot carry. */}
      <div
        id={aria.controlId}
        role="group"
        aria-labelledby={aria.labelId}
        {...(aria.describedBy !== undefined
          ? { "aria-describedby": aria.describedBy }
          : {})}
      >
        {p.children}
      </div>
    </V8Field>
  );
}

export function V8Dropdown(p: DropdownProps): JSX.Element {
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  const shared = {
    ...(p.label !== undefined ? { label: p.label } : {}),
    required: !!p.required,
    ...(aria.describedBy !== undefined
      ? { "aria-describedby": aria.describedBy }
      : {}),
    ...(p.placeholder !== undefined ? { placeholder: p.placeholder } : {}),
  };
  const options: IDropdownOption[] = p.options.map((o) => ({
    key: o.key,
    text: String(o.text),
  }));
  if (p.multiselect) {
    const cur = Array.isArray(p.value) ? (p.value as unknown[]) : [];
    const selectedKeys = p.options
      .filter((o) => cur.includes(o.data))
      .map((o) => o.key);
    return (
      <V8Field chrome={chrome} aria={aria} renderLabel={false}>
        <Dropdown
          {...shared}
          multiSelect
          options={options}
          selectedKeys={selectedKeys}
          disabled={!!p.disabled}
          {...(p.ariaLabel !== undefined ? { ariaLabel: p.ariaLabel } : {})}
          onChange={(_e, option) => {
            if (!option) return;
            const picked = p.options.find((o) => o.key === option.key);
            if (!picked) return;
            const next = option.selected
              ? [...cur, picked.data]
              : cur.filter((d) => d !== picked.data);
            p.onChange(next);
          }}
        />
      </V8Field>
    );
  }
  const selected = p.options.find((o) => o.data === p.value);
  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      <Dropdown
        {...shared}
        options={options}
        selectedKey={selected ? selected.key : null}
        disabled={!!p.disabled}
        {...(p.ariaLabel !== undefined ? { ariaLabel: p.ariaLabel } : {})}
        onChange={(_e, option) => {
          const opt = option
            ? p.options.find((o) => o.key === option.key)
            : undefined;
          p.onChange(opt ? opt.data : undefined);
        }}
      />
    </V8Field>
  );
}

/** Key of the synthetic "Other" radio a fill-in `RadioGroupProps.other` adds. */
const OTHER_KEY = "__speel-other";

export function V8RadioGroup(p: RadioGroupProps): JSX.Element {
  const otherFieldRef = React.useRef<ITextField>(null);
  // Set synchronously in `onChange` when the user picks Other, consumed by the effect
  // below right after the next commit. Focus is never inferred from a `selected`
  // transition: `otherPicked` can also flip true→false→true from an async correction
  // (a thunk-sourced Other settling after mount, nobody at the keyboard), which looks
  // identical to a pick from the value alone.
  const focusOtherRef = React.useRef(false);
  const selected = p.options.find((o) => o.data === p.value);
  const options: IChoiceGroupOption[] = p.options.map((o) => ({
    key: o.key,
    text: String(o.text),
    ...(p.disabled ? { disabled: true } : {}),
  }));
  if (p.other) {
    const other = p.other;
    options.push({
      key: OTHER_KEY,
      text: other.label ?? "Other",
      ...(p.disabled ? { disabled: true } : {}),
      onRenderField: (renderProps, defaultRender) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {defaultRender ? defaultRender(renderProps) : null}
          <TextField
            componentRef={otherFieldRef}
            ariaLabel={other.label ?? "Other"}
            value={other.text}
            disabled={!!p.disabled}
            onChange={(_e, v) => other.onTextChange(v ?? "")}
          />
        </div>
      ),
    });
  }
  // `other.selected` is owned by `RadioChoiceBody`, not re-derived here: an Other picked
  // with an empty box is still Other, even though no option's `data` (nor an empty
  // string) would otherwise look "selected".
  const selectedKey = p.other?.selected
    ? OTHER_KEY
    : selected
      ? selected.key
      : undefined;
  // Consumes the flag `onChange` sets, on the next render after it — deferred past the
  // click's own commit (and Fluent's own click-driven focus handling on the radio it
  // just rendered) rather than called straight from the handler, so it is not
  // immediately overwritten by that. Runs after every render, but only ever does
  // anything on the one render right after a genuine Other pick.
  React.useEffect(() => {
    if (focusOtherRef.current) {
      focusOtherRef.current = false;
      otherFieldRef.current?.focus();
    }
  });
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      <ChoiceGroup
        {...(p.label !== undefined ? { label: p.label } : {})}
        required={!!p.required}
        options={options}
        {...(selectedKey !== undefined ? { selectedKey } : {})}
        onChange={(_e, option) => {
          if (option?.key === OTHER_KEY) {
            // The only place focus moves into the box: directly in response to the
            // user picking Other, never inferred from `other.selected` changing.
            p.other?.onSelect();
            focusOtherRef.current = true;
            return;
          }
          const opt = option
            ? p.options.find((o) => o.key === option.key)
            : undefined;
          p.onChange(opt ? opt.data : undefined);
        }}
      />
    </V8Field>
  );
}

export function V8DatePicker(p: DatePickerProps): JSX.Element {
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      <DatePicker
        {...(p.label !== undefined ? { label: p.label } : {})}
        isRequired={!!p.required}
        // `isRequired` is what puts the asterisk on Fluent's own label, but it
        // also switches on Fluent's own validation, and `validateOnLoad`
        // defaults to true — so a required date marked itself invalid on mount,
        // before the user had touched anything. Error messaging belongs to the
        // chrome, which shows it only once the field is touched, like every
        // other field here.
        textField={{ validateOnLoad: false }}
        {...(p.value !== undefined ? { value: p.value } : {})}
        onSelectDate={(date) => p.onChange(date ?? undefined)}
        disabled={!!p.disabled}
        {...(p.minDate !== undefined ? { minDate: p.minDate } : {})}
        {...(p.maxDate !== undefined ? { maxDate: p.maxDate } : {})}
      />
    </V8Field>
  );
}

export function V8PeoplePicker(p: PeoplePickerProps): JSX.Element {
  const cacheRef = React.useRef(new Map<string, PersonaItem>());
  const toPersona = (i: PersonaItem): IPersonaProps => {
    cacheRef.current.set(i.key, i);
    return {
      key: i.key,
      text: i.text,
      ...(i.secondaryText !== undefined
        ? { secondaryText: i.secondaryText }
        : {}),
    };
  };
  const fromPersona = (pp: IPersonaProps): PersonaItem | undefined =>
    cacheRef.current.get(String(pp.key));
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  return (
    <V8Field chrome={chrome} aria={aria}>
      <NormalPeoplePicker
        inputProps={{
          id: aria.controlId,
          ...(aria.describedBy !== undefined
            ? { "aria-describedby": aria.describedBy }
            : {}),
        }}
        selectedItems={p.value.map(toPersona)}
        disabled={!!p.disabled}
        {...(p.multi ? {} : { itemLimit: 1 })}
        onResolveSuggestions={async (filter: string) =>
          (await p.onResolveSuggestions(filter)).map(toPersona)
        }
        onChange={(items?: IPersonaProps[]) => {
          const next = (items ?? [])
            .map(fromPersona)
            .filter((x): x is PersonaItem => x !== undefined);
          p.onChange(next);
        }}
      />
    </V8Field>
  );
}

/** The one option key that is a message rather than a choice. */
const NO_RESULTS_KEY = "__speel-no-results";
/** The one option key that routes a pick to `create.onCreate` instead of `onChange`. */
const CREATE_KEY = "__speel-create";
/** How long after a create closes the list a returning focus is not a reason to reopen it. */
const FOCUS_RETURN_WINDOW_MS = 1000;

/**
 * The selection control — every Choice, lookup and collection field routes through
 * `SelectionFieldBody`, which renders this. A user opening a four-option Status field
 * expects to see its four options without typing first, so the list opens on focus:
 * `onFocus`/`onClick` below cover both a Tab landing on the input and a mouse click on
 * it (Fluent does not open the list for either on its own). A list-mode field answers
 * from memory, instantly; a query-mode field debounces, so
 * the cold read this triggers is bounded the same way any other search is.
 *
 * `allowFreeform` is on because the field is type-to-search: with it off Fluent's
 * keydown handler swallows each printable key and reports it one at a time, so a
 * pasted office name produces no query at all. On, the input is an ordinary text box
 * and `onInputValueChange` hands over the whole string. Typed text is a query and
 * never a value — only a pick from the list reaches `onChange` — so freeform costs
 * nothing but an uncommitted string in the box.
 *
 * Fluent does not open its list while you type, so this opens it as the first search
 * goes out. And the control can only display a selection whose key is in `options`,
 * so the current value is merged into every page the search returns.
 */
export function V8Combobox(p: ComboboxProps): JSX.Element {
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  const [suggestions, setSuggestions] = React.useState<OptionItem[]>([]);
  const [searched, setSearched] = React.useState(false);
  const comboRef = React.useRef<IComboBox>(null);
  const openRef = React.useRef(false);
  const askedRef = React.useRef<string | undefined>(undefined);
  const ticketRef = React.useRef(0);
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Set (single-select only) the instant a create pick is routed, so `onMenuDismissed`
  // can tell "Fluent is closing the list because of the create I just started" apart
  // from any other reason it might dismiss — a blur, Escape, or a later, unrelated
  // pick. It has to survive past this same render's commit (Fluent's own
  // `componentDidUpdate`, which decides whether to call `onMenuDismissed`, runs before
  // this), so it is cleared here instead, once every render has had its chance to
  // consume it — never inside `pick()` itself, or a genuinely later dismiss would find
  // it still set and wrongly swallow its own resets.
  const pendingReopenRef = React.useRef(false);
  React.useEffect(() => {
    pendingReopenRef.current = false;
  });

  // The text of a single-select create this control started and has not yet seen
  // land. The list stays open through the create; once the field's value changes
  // while this is set, the create succeeded and the list closes as a pick would
  // (a failure leaves the value alone, so the list stays open for a retry).
  const pendingCreateRef = React.useRef<string | undefined>(undefined);
  // Until when a focus landing on the input must not reopen the list. A create that
  // went through a surface (`createsByForm`'s modal) hands focus back to this input when
  // that surface closes, around the same moment the create lands; opening on that focus
  // would pop the list straight back up over the value just chosen. Focus inside the
  // window does not open the list; a click still does, and the window expires on its
  // own so a later, genuine focus is never lost.
  const suppressFocusOpenUntilRef = React.useRef(0);
  const valueKeys = p.value.map((v) => v.key).join("\u0000");
  const prevValueKeysRef = React.useRef(valueKeys);
  React.useEffect(() => {
    if (prevValueKeysRef.current === valueKeys) return;
    prevValueKeysRef.current = valueKeys;
    if (pendingCreateRef.current === undefined) return;
    pendingCreateRef.current = undefined;
    suppressFocusOpenUntilRef.current = Date.now() + FOCUS_RETURN_WINDOW_MS;
    // `onMenuDismissed` clears the typed query along with the list's rows.
    comboRef.current?.dismissMenu();
  }, [valueKeys]);

  // Every item the control has been handed, so a pick gives the caller its own object
  // back — `data` and all — rather than the Fluent option it was rendered as.
  const seen = React.useRef(new Map<string, OptionItem>());
  for (const item of p.value) seen.current.set(item.key, item);
  for (const item of suggestions) seen.current.set(item.key, item);

  const search = (query: string): void => {
    // Typing opens the list, and the open then asks for the same query: ask once.
    if (askedRef.current === query) return;
    askedRef.current = query;
    const ticket = ++ticketRef.current;
    const settle = (found: OptionItem[]): void => {
      // Reads come back out of order; only the newest query may paint.
      if (!mounted.current || ticket !== ticketRef.current) return;
      setSuggestions(found);
      setSearched(true);
    };
    // A failed load reads as "nothing matched" here; the consumer owns the loader and
    // says which of the two it was through `noResultsText` (`SelectionFieldBody` swaps
    // in a "could not be loaded" line rather than touching the field's error chrome,
    // which belongs to validation).
    void p.onResolveSuggestions(query).then(settle, () => settle([]));
  };

  const onTyped = (query: string): void => {
    search(query);
    // Results are no use behind a closed list, and Fluent does not open it on typing.
    if (!openRef.current) comboRef.current?.focus(true);
  };

  // `IComboBox.focus(true)` both focuses the input and opens the list — the same
  // gesture the caret button already performs. Guarding on `openRef` keeps this from
  // fighting a pick: a single-select pick moves focus back to the input (Fluent's own
  // `_onItemClick` refocuses it) *before* the dismissal that flips `openRef` back to
  // false, so that refocus lands here while `openRef.current` is still true and is a
  // no-op, rather than reopening the list the pick just closed.
  //
  // A caret click bubbles here after Fluent's own `_onComboBoxClick` has toggled the
  // list open in the same batch; `.focus(true)` asks for the same `isOpen: true`, so the
  // two merge into one open. It also moves focus to the input, whose focus event bubbles
  // into `openOnFocus` and lands here once more as a no-op focus call.
  const openIfClosed = (): void => {
    if (!openRef.current) comboRef.current?.focus(true);
  };
  const openOnFocus = (e: { target: EventTarget | null }): void => {
    // Only focus landing on the input opens the list. The caret button (tabIndex -1,
    // but still mouse-focusable) takes focus on mousedown; opening there let the click
    // on release run Fluent's toggle against an already-open list and shut it again, so
    // a caret press held the list open only while held down (#34). The caret's click
    // opens it instead, through Fluent's toggle and `openIfClosed`.
    if (e.target instanceof Element && e.target.closest("button")) return;
    // Not while a create is out: a create that opened a surface (`createsByForm`'s
    // modal) took focus away, and the surface hands it back when it closes — before the
    // create has landed. Nor inside the window after one lands, and for every focus
    // there, not just the first: Fluent's own `dismissMenu` refocuses the input as the
    // list closes.
    if (p.create?.state.kind === "adding") return;
    if (Date.now() < suppressFocusOpenUntilRef.current) return;
    openIfClosed();
  };

  // The box's text as last typed — `askedRef` already tracks it (see `search` above),
  // so the Add row rides the same value rather than a second piece of state.
  const typedText = (askedRef.current ?? "").trim();

  // The selection always rides along, so a page that omits it still shows its text.
  const held = p.value.filter((v) => !suggestions.some((s) => s.key === v.key));
  const list: OptionItem[] = [...suggestions, ...held];
  // On a typed search a held value the search did not return is listed only when its
  // own text matches what was typed. Otherwise it is no result, and listing it beside
  // "no matches" contradicts the message. Dropping it is safe only while text is typed:
  // the closed box shows the held value from its option, and closing the list clears
  // the typed text, which puts the option back.
  const typedLower = typedText.toLowerCase();
  const listed = list.filter(
    (o) =>
      typedText === "" ||
      !held.includes(o) ||
      (typeof o.text === "string" && o.text.toLowerCase().includes(typedLower)),
  );
  const options: IComboBoxOption[] = listed.map((o) => ({
    key: o.key,
    text: String(o.text),
  }));
  const createState = p.create?.state;
  // A `create.state` that is not idle is only "ours" when it is still about the text
  // in the box: typing something else, or a plain pick, leaves it behind rather than
  // clearing it, so a stale `failed` (or `adding`) must not paint over new text.
  const creating =
    createState !== undefined &&
    createState.kind !== "idle" &&
    createState.text === typedText
      ? createState
      : undefined;
  const showCreate =
    p.create !== undefined &&
    typedText !== "" &&
    !list.some(
      (o) =>
        typeof o.text === "string" &&
        o.text.toLowerCase() === typedText.toLowerCase(),
    );

  if (
    searched &&
    listed.length === 0 &&
    p.noResultsText !== undefined &&
    !showCreate
  ) {
    // A header is text in the list rather than a row that can be picked.
    options.push({
      key: NO_RESULTS_KEY,
      text: p.noResultsText,
      itemType: SelectableOptionMenuItemType.Header,
    });
  }
  if (showCreate) {
    const rowText =
      creating?.kind === "adding"
        ? `Adding "${typedText}"…`
        : creating?.kind === "failed"
          ? `Could not add "${typedText}"`
          : `Add "${typedText}"`;
    options.push({
      key: CREATE_KEY,
      text: rowText,
      disabled: creating?.kind === "adding",
      // Fluent renders the actual `role="option"` element itself — `onRenderOption`
      // only supplies its content — and passes through none of an option's other
      // fields to it except `ariaLabel`/`disabled`/`title`. `title` is what carries
      // the failure to a screen reader landing on that real element (arrow-key
      // browsing, `aria-activedescendant`), rather than on an inner span it never
      // reads from.
      ...(creating?.kind === "failed" ? { title: creating.message } : {}),
    });
  }
  // An id `TooltipHost` renders its (always-present, whether or not the callout is
  // open) hidden content under, for the failed row's icon.
  const createMessageId = `${aria.controlId}-create-message`;

  const pick = (option: IComboBoxOption): void => {
    if (option.key === CREATE_KEY) {
      // Belt and suspenders: a disabled option's click never reaches here, but a
      // stale `creating` read must not fire a second create either.
      if (!p.create || creating?.kind === "adding") return;
      if (!p.multi) {
        // Fluent's own `_onItemClick` closes a single-select list, and clears the
        // typed/pending value, for ANY option click — before this handler even
        // runs. The spec wants the list open (with the typed text) through the
        // create; only once it succeeds and the value changes may it close like an
        // ordinary pick. `focus(true)` re-asks for `isOpen: true` in the same tick,
        // which — since both `setState` calls land in the same React batch — wins
        // over Fluent's `isOpen: false` and leaves it net unchanged, so
        // `componentDidUpdate` sees no close/reopen transition and never calls
        // `onMenuDismissed` at all. `pendingReopenRef` is the fallback for if it
        // does anyway (a future Fluent version, some path not covered above): its
        // handler skips the usual resets and reopens again from there.
        pendingReopenRef.current = true;
        pendingCreateRef.current = typedText;
        comboRef.current?.focus(true);
      }
      p.create.onCreate(typedText);
      return;
    }
    const picked = seen.current.get(String(option.key));
    if (!picked) return;
    if (!p.multi) {
      p.onChange([picked]);
      return;
    }
    // Multi-select toggles: Fluent marks the option with what it just became.
    const held = p.value.some((v) => v.key === picked.key);
    if (option.selected && !held) p.onChange([...p.value, picked]);
    else if (!option.selected && held)
      p.onChange(p.value.filter((v) => v.key !== picked.key));
  };

  return (
    <V8Field chrome={chrome} aria={aria} renderLabel={false}>
      <ComboBox
        {...(p.label !== undefined ? { label: p.label } : {})}
        required={!!p.required}
        disabled={!!p.disabled}
        {...(aria.describedBy !== undefined
          ? { ariaDescribedBy: aria.describedBy }
          : {})}
        componentRef={comboRef}
        {...(p.placeholder !== undefined ? { placeholder: p.placeholder } : {})}
        allowFreeform
        autoComplete="on"
        useComboBoxAsMenuWidth
        // This version's `IComboBoxProps` has no `inputProps`; the one pass-through to
        // the underlying input (`autofill`) replaces Fluent's own handlers wholesale
        // rather than composing with them, and losing them here would cost the
        // text-selection-on-focus and multiselect-placeholder behavior below. `onFocus`
        // and `onClick` given directly to `ComboBox` land, via `getNativeProps`, on its
        // own wrapping div instead — a real wrapping element, just one Fluent already
        // renders — where they see the input's and the caret button's bubbled events
        // without displacing anything internal.
        onFocus={openOnFocus}
        onClick={openIfClosed}
        // Fluent points the caret button's `aria-labelledby` at the same label as the
        // input, so the field would answer to its name twice. One control carries the
        // name — the one that is typed into.
        isButtonAriaHidden
        options={options}
        {...(p.multi
          ? { multiSelect: true, selectedKey: p.value.map((v) => v.key) }
          : { selectedKey: p.value.length > 0 ? p.value[0]!.key : null })}
        onMenuOpen={() => {
          openRef.current = true;
          search(askedRef.current ?? "");
        }}
        onMenuDismissed={() => {
          if (pendingReopenRef.current) {
            // Fluent closed the list for the create pick despite the synchronous
            // reopen in `pick()` — the fallback path. Reopen again, and skip the
            // resets below: wiping `askedRef`/`suggestions` here would blank
            // `typedText` and hide the Adding/Could-not-add row `onMenuOpen` is
            // about to ask for.
            pendingReopenRef.current = false;
            comboRef.current?.focus(true);
            return;
          }
          // A create still out when the list closes some other way no longer owns it —
          // unless it is still running: a surface it opened (`createsByForm`) took focus,
          // and Fluent closed the list on that blur. It lands later, and its landing must
          // still close the list and hold off the returning focus.
          if (p.create?.state.kind !== "adding")
            pendingCreateRef.current = undefined;
          // The query lives as long as the open list; a reopen searches afresh rather
          // than showing what an abandoned one returned. Retiring the ticket is what
          // makes that true: the abandoned query's read is still out, and without this
          // it would land after the reopen and paint the old query's rows.
          ticketRef.current++;
          openRef.current = false;
          askedRef.current = undefined;
          setSuggestions([]);
          setSearched(false);
        }}
        onInputValueChange={onTyped}
        onChange={(_e, option) => {
          // Freeform text arrives here with no option; it is a query, not a value.
          if (option) pick(option);
        }}
        onRenderOption={(option, defaultRender) => {
          // Every other row (including the "no matches" header) renders exactly as
          // Fluent would without this prop.
          if (!option || option.key !== CREATE_KEY)
            return defaultRender ? defaultRender(option) : null;
          if (creating?.kind === "failed") {
            const message = creating.message;
            return (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <TooltipHost
                  content={message}
                  id={createMessageId}
                  delay={TooltipDelay.zero}
                >
                  <Icon iconName="ErrorBadge" aria-label="Error" tabIndex={0} />
                </TooltipHost>
                <span>{option.text}</span>
              </span>
            );
          }
          return <span>{option.text}</span>;
        }}
      />
    </V8Field>
  );
}
