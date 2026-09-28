import { useContext, useLayoutEffect, useState } from "react";
import type {
  MenuSection,
  SpeelUIAdapter,
} from "../../adapter/SpeelUIAdapter.js";
import { ColumnChooserContext } from "../chooserContext.js";
import { ColumnChooserPanel } from "../ColumnChooser.js";
import type { TableViews } from "./useTableViews.js";

export interface ViewPickerProps {
  ui: SpeelUIAdapter;
  views: TableViews;
}

/** The name a new view gets without asking. Numbered only when it would collide. */
function generateName(taken: readonly string[]): string {
  const base = "My view";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/**
 * One trigger, one menu.
 *
 * An earlier version put ten controls inline, which took most of the toolbar and gave
 * switching, saving, renaming, and undoing the same visual weight. A later one moved them
 * into a popover, which was no better: a column of centred buttons is not a menu, and read
 * as one. The adapter's `Menu` supplies the thing itself — left-aligned rows with icons,
 * checkmarks on the active view, section headings, and arrow-key navigation.
 *
 * Renaming happens in the toolbar rather than in the menu, because a text field inside a
 * menu fights its typeahead and arrow keys.
 */
export function ViewPicker({ ui, views: v }: ViewPickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState<string | undefined>(undefined);
  const [chooserOpen, setChooserOpen] = useState(false);

  // When the table offers its column chooser, host it as "This view → Choose columns" and
  // adopt it so the table drops its standalone toolbar button.
  const chooserCtx = useContext(ColumnChooserContext);
  useLayoutEffect(
    () => (chooserCtx ? chooserCtx.adopt() : undefined),
    [chooserCtx],
  );

  const onDefault = v.activeView === undefined;
  const editable = v.canEditActive;
  const activeName = v.activeView?.name ?? v.activeDefaultView.name;
  const unsaved = v.dirty || v.pendingDefaultEdits;

  const commitRename = (): void => {
    const name = draftName?.trim();
    if (name !== undefined && name !== "" && name !== activeName)
      void v.rename(name);
    setDraftName(undefined);
  };

  // No dialog: the view is created under a generated name and switched to, and renaming is an
  // optional second step. Nothing can be lost by dismissing a prompt, because there is none.
  const createView = (): void => {
    const name = generateName(v.views.map((view) => view.name));
    void v.saveAs(name).then(() => setDraftName(name));
  };

  const sections: MenuSection[] = [
    {
      // The app's own views lead, untitled and in the order the app authored them: they
      // are the table's vocabulary, and the user's are variations on it.
      key: "app",
      items: v.defaultViews.map((view) => ({
        key: `__app:${view.name}`,
        text: view.name,
        checked: onDefault && view.name === v.activeDefaultView.name,
        onClick: () => v.switchToDefault(view.name),
      })),
    },
    ...(v.views.length > 0
      ? [
          {
            key: "mine",
            title: "My views",
            items: v.views.map((view) => ({
              key: view.id,
              text: view.name,
              checked: v.activeView?.id === view.id,
              onClick: () => v.switchTo(view.id),
            })),
          },
        ]
      : []),
    ...(v.sharedViews.length > 0
      ? [
          {
            key: "shared",
            title: "Shared views",
            items: v.sharedViews.map((view) => ({
              key: view.id,
              text: view.name,
              checked: v.activeView?.id === view.id,
              onClick: () => v.switchTo(view.id),
            })),
          },
        ]
      : []),
    {
      key: "this-view",
      title: "This view",
      items: [
        ...(chooserCtx
          ? [
              {
                key: "choose-columns",
                text: "Choose columns",
                iconName: "ColumnOptions",
                onClick: () => setChooserOpen(true),
              },
            ]
          : []),
        {
          key: "save-as",
          text: "Save as new view",
          iconName: "Add",
          onClick: createView,
        },
        ...(v.canPublish && v.activeView !== undefined
          ? [
              v.activeIsShared
                ? {
                    key: "unpublish",
                    text: "Unpublish",
                    iconName: "Cancel",
                    onClick: () => void v.unpublish(),
                  }
                : {
                    key: "publish",
                    text: "Publish to everyone",
                    iconName: "Share",
                    onClick: () => void v.publish(),
                  },
            ]
          : []),
        ...(!editable
          ? []
          : [
              {
                key: "rename",
                text: "Rename",
                iconName: "Rename",
                onClick: () => setDraftName(activeName),
              },
              {
                key: "delete",
                text: "Delete",
                iconName: "Delete",
                onClick: () => void v.remove(),
              },
              {
                key: "starting",
                text: v.activeIsStartingView
                  ? "Starts here by default"
                  : "Start on this view",
                iconName: "Pinned",
                onClick: () => void v.setStartingView(),
              },
            ]),
      ],
    },
    {
      key: "columns",
      title: "Columns",
      items: [
        {
          key: "undo",
          text: "Undo column change",
          iconName: "Undo",
          disabled: !v.canUndo,
          onClick: () => v.undo(),
        },
        {
          key: "undo-all",
          text: "Undo all column changes",
          iconName: "History",
          disabled: !v.canUndo,
          onClick: () => v.undoAll(),
        },
      ],
    },
  ];

  if (draftName !== undefined) {
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitRename();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraftName(undefined);
          }
        }}
      >
        <ui.TextInput
          label="View name"
          value={draftName}
          onChange={setDraftName}
          onBlur={commitRename}
        />
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <ui.Menu
        open={open}
        onOpenChange={setOpen}
        sections={sections}
        trigger={
          <ui.Button
            text={`${activeName}${unsaved ? " •" : ""}`}
            // The dot is a glyph; screen readers get the words.
            ariaLabel={unsaved ? `${activeName} (unsaved changes)` : activeName}
            appearance="secondary"
            onClick={() => setOpen((o) => !o)}
          />
        }
      />

      {unsaved && editable ? (
        <ui.Button
          text={v.activeIsShared ? "Save for everyone" : "Save"}
          appearance="primary"
          onClick={() => void v.save()}
        />
      ) : null}
      {unsaved ? (
        <ui.Button
          text="Discard changes"
          appearance="subtle"
          onClick={() => v.reset()}
        />
      ) : null}

      {v.error !== undefined ? (
        <ui.MessageBar intent="error">{v.error}</ui.MessageBar>
      ) : null}

      {chooserCtx ? (
        <ui.Dialog
          open={chooserOpen}
          onOpenChange={setChooserOpen}
          title="Choose columns"
          size="small"
        >
          <ColumnChooserPanel
            ui={ui}
            arranged={chooserCtx.arranged}
            onChange={chooserCtx.onChange}
          />
        </ui.Dialog>
      ) : null}
    </span>
  );
}
