import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { ViewPicker } from "../src/table/views/ViewPicker.js";
import type { TableViews } from "../src/table/views/useTableViews.js";
import type {
  AppDefaultView,
  StoredView,
} from "../src/table/views/viewStore.js";
import {
  ColumnChooserContext,
  type ColumnChooserAccess,
} from "../src/table/chooserContext.js";
import { fakeAdapter } from "./fakeAdapter.js";

const stored: StoredView = {
  id: "v1",
  tableId: "t1",
  name: "Q3 audit",
  descriptor: { columns: [] },
};

const appDefault: AppDefaultView = {
  name: "Needs action",
  descriptor: { columns: [] },
};

function views(over: Partial<TableViews> = {}): TableViews {
  return {
    table: { tableState: { columns: [] }, onTableStateChange: () => undefined },
    picker: null,
    views: [stored],
    sharedViews: [],
    defaultViews: [appDefault],
    activeDefaultView: appDefault,
    activeView: undefined,
    activeIsShared: false,
    canPublish: false,
    canEditActive: false,
    activeIsStartingView: false,
    loading: false,
    dirty: false,
    error: undefined,
    pendingDefaultEdits: false,
    canUndo: false,
    save: () => Promise.resolve(),
    saveAs: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setStartingView: () => Promise.resolve(),
    publish: () => Promise.resolve(),
    unpublish: () => Promise.resolve(),
    switchTo: () => undefined,
    switchToDefault: () => undefined,
    reset: () => undefined,
    undo: () => undefined,
    undoAll: () => undefined,
    ...over,
  };
}

const renderPicker = (over: Partial<TableViews> = {}) =>
  render(<ViewPicker ui={fakeAdapter} views={views(over)} />);

const openMenu = (): void => {
  fireEvent.click(
    screen.getByRole("button", { name: /^Needs action|^Q3 audit|^Overdue/ }),
  );
};

describe("ViewPicker, at rest", () => {
  it("shows only the active view — no toolbar full of controls", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: "Needs action" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Discard changes" }),
    ).toBeNull();
  });

  it("marks unsaved work on the trigger", () => {
    renderPicker({ activeView: stored, canEditActive: true, dirty: true });
    expect(
      screen.getByRole("button", { name: "Q3 audit (unsaved changes)" }),
    ).toBeInTheDocument();
  });

  it("marks held column edits on the default view as unsaved too", () => {
    renderPicker({ pendingDefaultEdits: true });
    expect(
      screen.getByRole("button", { name: "Needs action (unsaved changes)" }),
    ).toBeInTheDocument();
  });
});

describe("ViewPicker, inline actions", () => {
  it("offers Save and Discard only when there is something to save", () => {
    const save = vi.fn(() => Promise.resolve());
    const reset = vi.fn();
    renderPicker({
      activeView: stored,
      canEditActive: true,
      dirty: true,
      save,
      reset,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(save).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });

  it("leaves saving-as to the menu on the pristine default", () => {
    // No standalone toolbar button: the dot on the trigger says there is unsaved
    // work, and the menu is where every view action lives.
    renderPicker({ dirty: true });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save as new view" }),
    ).toBeNull();
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Save as new view" }),
    ).toBeInTheDocument();
  });
});

describe("ViewPicker menu", () => {
  it("renders a real menu, not a stack of buttons", () => {
    renderPicker({ activeView: stored, canEditActive: true });
    openMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
  });

  it("marks the active view as the checked choice", () => {
    renderPicker({ activeView: stored, canEditActive: true });
    openMenu();
    const choices = screen.getAllByRole("menuitemcheckbox");
    const active = choices.find((c) => c.textContent === "Q3 audit");
    const other = choices.find((c) => c.textContent === "Needs action");
    expect(active?.getAttribute("aria-checked")).toBe("true");
    expect(other?.getAttribute("aria-checked")).toBe("false");
  });

  it("switches views from the menu", () => {
    const switchToDefault = vi.fn();
    renderPicker({ activeView: stored, canEditActive: true, switchToDefault });
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Needs action" }),
    );
    expect(switchToDefault).toHaveBeenCalledWith("Needs action");
  });

  it("keeps app views in their own untitled section, personal ones under My views", () => {
    renderPicker();
    openMenu();
    const mine = screen.getByRole("group", { name: "My views" });
    expect(
      within(mine).getByRole("menuitemcheckbox", { name: "Q3 audit" }),
    ).toBeInTheDocument();
    expect(
      within(mine).queryByRole("menuitemcheckbox", { name: "Needs action" }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Needs action" }),
    ).toBeInTheDocument();
  });

  it("omits the My views section when the user has no personal views", () => {
    renderPicker({ views: [] });
    openMenu();
    expect(screen.queryByText("My views")).toBeNull();
  });

  it("lists every app-authored view in order, above the user's own", () => {
    const submitted: AppDefaultView = {
      name: "Submitted",
      descriptor: { columns: [] },
    };
    renderPicker({
      defaultViews: [appDefault, submitted],
      activeDefaultView: submitted,
    });
    fireEvent.click(screen.getByRole("button", { name: "Submitted" }));
    const choices = screen.getAllByRole("menuitemcheckbox");
    expect(choices.map((c) => c.textContent)).toEqual([
      "Needs action",
      "Submitted",
      "Q3 audit",
    ]);
    expect(choices[1]!.getAttribute("aria-checked")).toBe("true");
    expect(choices[0]!.getAttribute("aria-checked")).toBe("false");
  });

  it("gives every action an icon", () => {
    renderPicker({ activeView: stored, canEditActive: true });
    openMenu();
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.getAttribute("data-icon")).toBeTruthy();
    }
  });

  it("groups the column undos under their own heading, disabled when there is nothing to undo", () => {
    renderPicker({ activeView: stored, canEditActive: true });
    openMenu();
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Undo column change" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Undo all column changes" }),
    ).toBeDisabled();
  });

  it("hides Rename and Delete for the app-authored default", () => {
    renderPicker();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  it("offers Rename and Delete for a stored view", () => {
    renderPicker({ activeView: stored, canEditActive: true });
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Rename" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });
});

describe("ViewPicker naming", () => {
  it("creates a view with a generated name and no browser dialog", async () => {
    const prompt = vi.spyOn(window, "prompt");
    const saveAs = vi.fn(() => Promise.resolve());
    renderPicker({ dirty: true, saveAs });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as new view" }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledWith("My view"));
    expect(prompt).not.toHaveBeenCalled();
  });

  it("avoids colliding with a name already in use", async () => {
    const saveAs = vi.fn(() => Promise.resolve());
    const mine: StoredView = { ...stored, id: "v2", name: "My view" };
    renderPicker({ dirty: true, saveAs, views: [stored, mine] });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as new view" }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledWith("My view 2"));
  });

  it("renames in the toolbar, committing on Enter", () => {
    // The field replaces the trigger rather than living inside the menu: a text input in a
    // menu fights its arrow-key navigation and typeahead.
    const rename = vi.fn(() => Promise.resolve());
    renderPicker({ activeView: stored, canEditActive: true, rename });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByLabelText("View name");
    fireEvent.change(field, { target: { value: "Quarter three" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(rename).toHaveBeenCalledWith("Quarter three");
  });

  it("abandons an inline rename on Escape", () => {
    const rename = vi.fn(() => Promise.resolve());
    renderPicker({ activeView: stored, canEditActive: true, rename });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByLabelText("View name");
    fireEvent.change(field, { target: { value: "Nope" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(rename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("View name")).toBeNull();
  });
});

describe("ViewPicker errors", () => {
  it("surfaces a store failure", () => {
    renderPicker({ error: "offline" });
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });
});

const sharedView: StoredView = {
  id: "s1",
  tableId: "t1",
  name: "Overdue",
  descriptor: { columns: [] },
};

describe("ViewPicker with shared views", () => {
  it("separates My views from Shared views", () => {
    renderPicker({
      activeView: stored,
      canEditActive: true,
      sharedViews: [sharedView],
    });
    openMenu();
    expect(screen.getByText("My views")).toBeInTheDocument();
    expect(screen.getByText("Shared views")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Overdue" }),
    ).toBeInTheDocument();
  });

  it("offers Publish on a personal view only when the user may", () => {
    renderPicker({
      activeView: stored,
      canEditActive: true,
      canPublish: false,
    });
    openMenu();
    expect(
      screen.queryByRole("menuitem", { name: "Publish to everyone" }),
    ).toBeNull();
  });

  it("offers Publish when the user may", () => {
    const publish = vi.fn(() => Promise.resolve());
    renderPicker({
      activeView: stored,
      canEditActive: true,
      canPublish: true,
      publish,
    });
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Publish to everyone" }),
    );
    expect(publish).toHaveBeenCalled();
  });

  it("offers Unpublish on a shared view the user may edit", () => {
    const unpublish = vi.fn(() => Promise.resolve());
    renderPicker({
      activeView: sharedView,
      activeIsShared: true,
      canEditActive: true,
      canPublish: true,
      sharedViews: [sharedView],
      unpublish,
    });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    expect(unpublish).toHaveBeenCalled();
  });

  it('says whose day it will change: Save reads "Save for everyone" on a shared view', () => {
    renderPicker({
      activeView: sharedView,
      activeIsShared: true,
      canEditActive: true,
      canPublish: true,
      sharedViews: [sharedView],
      dirty: true,
    });
    expect(
      screen.getByRole("button", { name: "Save for everyone" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("treats a shared view the user cannot edit exactly like the app default", () => {
    renderPicker({
      activeView: sharedView,
      activeIsShared: true,
      canEditActive: false,
      sharedViews: [sharedView],
      dirty: true,
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save for everyone" }),
    ).toBeNull();
    openMenu();
    // Making it yours is offered; changing theirs is not.
    expect(
      screen.getByRole("menuitem", { name: "Save as new view" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });
});

describe("ViewPicker column chooser", () => {
  const arranged = [
    { column: { key: "Title", header: "Title" }, hidden: false },
    { column: { key: "Status", header: "Status" }, hidden: false },
  ] as never;

  const chooserCtx = (): ColumnChooserAccess & {
    onChange: ReturnType<typeof vi.fn>;
    adopt: ReturnType<typeof vi.fn>;
  } => ({
    arranged,
    onChange: vi.fn(),
    adopt: vi.fn(() => () => undefined),
  });

  const renderWithChooser = (
    ctx: ColumnChooserAccess,
    over: Partial<TableViews> = {},
  ) =>
    render(
      <ColumnChooserContext.Provider value={ctx}>
        <ViewPicker ui={fakeAdapter} views={views(over)} />
      </ColumnChooserContext.Provider>,
    );

  it("shows no Choose columns item when the table provides no chooser", () => {
    renderPicker();
    openMenu();
    expect(
      screen.queryByRole("menuitem", { name: "Choose columns" }),
    ).toBeNull();
  });

  it("offers Choose columns under This view and adopts the chooser", () => {
    const ctx = chooserCtx();
    renderWithChooser(ctx);
    expect(ctx.adopt).toHaveBeenCalled();
    openMenu();
    const section = screen.getByRole("group", { name: "This view" });
    expect(
      within(section).getByRole("menuitem", { name: "Choose columns" }),
    ).toBeInTheDocument();
  });

  it("opens the chooser dialog from the item, driving the table's columns", () => {
    const ctx = chooserCtx();
    renderWithChooser(ctx);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Choose columns" }));
    const dialog = screen.getByRole("dialog", { name: "Choose columns" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Status" }));
    expect(ctx.onChange).toHaveBeenCalledWith([
      { key: "Title" },
      { key: "Status", hidden: true },
    ]);
  });

  it("releases the adoption on unmount", () => {
    const release = vi.fn();
    const ctx = { ...chooserCtx(), adopt: vi.fn(() => release) };
    const { unmount } = renderWithChooser(ctx);
    unmount();
    expect(release).toHaveBeenCalled();
  });
});
