import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

import { SpeelUIProvider, type OptionItem } from "@speel/react";

import { shadcnAdapter } from "@/speel-shadcn/adapter";

const noop = (): void => {};

describe("shadcnAdapter smoke", () => {
  it("exposes all 22 members", () => {
    expect(Object.keys(shadcnAdapter).sort()).toEqual([
      "Button",
      "Checkbox",
      "Combobox",
      "DatePicker",
      "Dialog",
      "Drawer",
      "Dropdown",
      "FieldDisplay",
      "FileInput",
      "IconButton",
      "Menu",
      "MessageBar",
      "NumberInput",
      "PeoplePicker",
      "Popover",
      "ProgressBar",
      "RadioGroup",
      "RichTextInput",
      "SearchBox",
      "Spinner",
      "Table",
      "TextInput",
    ]);
  });

  it("mounts every primitive", () => {
    const a = shadcnAdapter;
    const opts = [
      { key: "a", text: "A", data: "a" },
      { key: "b", text: "B", data: "b" },
    ];
    render(
      <div>
        <a.TextInput label="t" value="x" onChange={noop} />
        <a.TextInput label="t2" value="x" onChange={noop} multiline />
        <a.NumberInput
          label="n"
          value={1}
          onChange={noop}
          prefix="$"
          suffix="USD"
        />
        <a.Dropdown label="d" value="a" onChange={noop} options={opts} />
        <a.Dropdown
          label="dm"
          value={["a"]}
          onChange={noop}
          options={opts}
          multiselect
        />
        <a.RadioGroup label="r" value="a" onChange={noop} options={opts} />
        <a.Checkbox label="c" checked onChange={noop} />
        <a.DatePicker
          label="dt"
          value={new Date(2026, 5, 11)}
          onChange={noop}
          showTime
        />
        <a.PeoplePicker
          label="p"
          value={[{ key: "1", text: "Ada", data: null }]}
          onChange={noop}
          onResolveSuggestions={() => Promise.resolve([])}
          multi
        />
        <a.Combobox
          label="cb"
          value={[{ key: "1", text: "London", data: 1 }]}
          onChange={noop}
          onResolveSuggestions={() => Promise.resolve([])}
        />
        <a.SearchBox value="" onChange={noop} />
        <a.FileInput label="f" value={undefined} onChange={noop} />
        <a.Spinner label="loading" />
        <a.ProgressBar label="prog" value={0.5} />
        <a.ProgressBar label="indet" />
        <a.Button text="go" appearance="primary" />
        <a.IconButton iconName="Edit" title="edit" />
        <a.IconButton iconName="PencilRuler" title="lucide fallback" />
        <a.MessageBar intent="warning" onDismiss={noop}>
          warn
        </a.MessageBar>
        <a.FieldDisplay label="fd" error="bad">
          shown
        </a.FieldDisplay>
        <a.Table
          columns={[
            { key: "k", header: "H", render: () => "cell", sortable: true },
          ]}
          items={[{}]}
          sort={{ key: "k", direction: "asc" }}
          onSortChange={noop}
        />
        <a.Popover
          open={false}
          onOpenChange={noop}
          trigger={<button>t</button>}
        >
          pop
        </a.Popover>
      </div>,
    );
    render(
      <a.Dialog
        open
        onOpenChange={noop}
        title="dlg"
        footer={<button>ok</button>}
      >
        body
      </a.Dialog>,
    );
    render(
      <a.Drawer open onOpenChange={noop} title="drw" position="start">
        body
      </a.Drawer>,
    );
  });

  it("multiselect Dropdown opens, toggles by click, and roves focus with arrows", async () => {
    const onChange = vi.fn();
    const opts = [
      { key: "a", text: "A", data: "a" },
      { key: "b", text: "B", data: "b" },
    ];
    const { getByRole, findAllByRole } = render(
      <shadcnAdapter.Dropdown
        label="dm"
        value={["a"]}
        onChange={onChange}
        options={opts}
        multiselect
      />,
    );
    fireEvent.click(getByRole("combobox"));
    const options = await findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(options[1]!);
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
    options[0]!.focus();
    fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
  });

  it("Combobox searches the whole typed text, shows results unopened, and hands back the caller's option", async () => {
    const london = { key: "1", text: "London", data: { id: 1 } };
    const onChange = vi.fn();
    const onResolveSuggestions = vi
      .fn<(query: string) => Promise<OptionItem[]>>()
      .mockResolvedValue([london]);
    const { getByRole, findByRole } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[]}
        onChange={onChange}
        onResolveSuggestions={onResolveSuggestions}
        noResultsText="No matches."
      />,
    );
    // The label names the input, and only it.
    const input = getByRole("combobox", { name: "Office" });
    fireEvent.change(input, { target: { value: "Lon" } });
    // The whole box text, not a keystroke.
    expect(onResolveSuggestions).toHaveBeenLastCalledWith("Lon");
    // Nothing was opened first: the list arrives with the results.
    const option = await findByRole("option", { name: "London" });
    fireEvent.mouseDown(option);
    // The caller's own object, `data` and all.
    expect(onChange).toHaveBeenCalledWith([london]);
    expect(onChange.mock.calls[0]![0]![0]).toBe(london);
  });

  it("Combobox says nothing matched only once a search came back empty", async () => {
    // Held open: an empty list is not yet an answer while the read is still out.
    let answer: (found: OptionItem[]) => void = () => {};
    const onResolveSuggestions = vi.fn(
      () =>
        new Promise<OptionItem[]>((resolve) => {
          answer = resolve;
        }),
    );
    const { getByRole, getByText, queryByText } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[]}
        onChange={noop}
        onResolveSuggestions={onResolveSuggestions}
        noResultsText="No matches."
      />,
    );
    fireEvent.change(getByRole("combobox"), { target: { value: "zz" } });
    expect(queryByText("No matches.")).toBeNull();
    await act(async () => {
      answer([]);
    });
    expect(getByText("No matches.")).toBeTruthy();
  });

  it("Combobox reopens on a click, when a pick left it closed under the cursor", async () => {
    const london = { key: "1", text: "London", data: { id: 1 } };
    const onResolveSuggestions = vi
      .fn<(query: string) => Promise<OptionItem[]>>()
      .mockResolvedValue([london]);
    const { getByRole, findByRole, queryByRole } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[]}
        onChange={noop}
        onResolveSuggestions={onResolveSuggestions}
      />,
    );
    const input = getByRole("combobox", { name: "Office" });
    fireEvent.change(input, { target: { value: "Lon" } });
    fireEvent.mouseDown(await findByRole("option", { name: "London" }));
    // The pick closed the list, and its preventDefault left focus on the input — so a
    // second look at the list is a click with no focus event behind it.
    expect(queryByRole("option")).toBeNull();
    fireEvent.click(input);
    expect(await findByRole("option", { name: "London" })).toBeTruthy();
  });

  it("Combobox does not let an abandoned query's late read repaint a reopened list", async () => {
    const stale = { key: "1", text: "Stale row", data: { id: 1 } };
    const fresh = { key: "2", text: "Fresh row", data: { id: 2 } };
    // Each call is held open, so the test decides when — and in which order — the
    // reads land. That is the whole race: the abandoned one is still out when the
    // list reopens.
    const pending: ((found: OptionItem[]) => void)[] = [];
    const onResolveSuggestions = vi.fn(
      () =>
        new Promise<OptionItem[]>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { getByRole, findByRole, queryByRole } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[]}
        onChange={noop}
        onResolveSuggestions={onResolveSuggestions}
      />,
    );
    const input = getByRole("combobox", { name: "Office" });
    // A query goes out and is abandoned: the field is left before it answers.
    fireEvent.change(input, { target: { value: "Sta" } });
    fireEvent.blur(input);
    // It lands while the list is shut. Closing retired its ticket, so it may not
    // be stored either — a close that only clears the rows leaves this one able to
    // put them back.
    await act(async () => {
      pending[0]!([stale]);
    });
    // Back to the field. The reopen asks afresh and that read is still out, so the
    // list has nothing to show yet — and certainly not the abandoned query's rows.
    fireEvent.click(input);
    expect(queryByRole("option", { name: "Stale row" })).toBeNull();
    // Only the reopen's own read may paint.
    await act(async () => {
      pending[1]!([fresh]);
    });
    expect(await findByRole("option", { name: "Fresh row" })).toBeTruthy();
    expect(queryByRole("option", { name: "Stale row" })).toBeNull();
  });

  it("Combobox scrolls the roved option back into the scroll box", async () => {
    const opts = [
      { key: "1", text: "London", data: { id: 1 } },
      { key: "2", text: "Lisbon", data: { id: 2 } },
    ];
    const onResolveSuggestions = vi
      .fn<(query: string) => Promise<OptionItem[]>>()
      .mockResolvedValue(opts);
    // jsdom does not lay anything out, so this pins the wiring — that the element the
    // roving just made active is the one told to scroll — not the visual result.
    const scrolledTo: Element[] = [];
    const scrolled = vi
      .spyOn(window.HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(function (this: HTMLElement) {
        scrolledTo.push(this);
      });
    try {
      const { getByRole, findByRole } = render(
        <shadcnAdapter.Combobox
          label="Office"
          value={[]}
          onChange={noop}
          onResolveSuggestions={onResolveSuggestions}
        />,
      );
      const input = getByRole("combobox", { name: "Office" });
      fireEvent.change(input, { target: { value: "L" } });
      await findByRole("option", { name: "London" });
      scrolledTo.length = 0;
      scrolled.mockClear();
      fireEvent.keyDown(input, { key: "ArrowDown" });
      const activeId = input.getAttribute("aria-activedescendant");
      expect(activeId).toBeTruthy();
      const active = document.getElementById(activeId!);
      expect(active).toHaveTextContent("London");
      expect(scrolledTo).toContain(active);
      // `nearest` or the list re-centres itself under every keystroke.
      expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      scrolled.mockRestore();
    }
  });

  it("Combobox keeps the held selection on offer when a later page omits it", async () => {
    const london = { key: "1", text: "London", data: { id: 1 } };
    const lisbon = { key: "2", text: "Lisbon", data: { id: 2 } };
    const onResolveSuggestions = vi
      .fn<(query: string) => Promise<OptionItem[]>>()
      .mockResolvedValue([lisbon]);
    const { getByRole, findByRole } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[london]}
        onChange={noop}
        onResolveSuggestions={onResolveSuggestions}
      />,
    );
    fireEvent.change(getByRole("combobox", { name: "Office" }), {
      target: { value: "L" },
    });
    await findByRole("option", { name: "Lisbon" });
    // London matches what was typed, but the page that came back omits it; it is
    // still listed, still held.
    expect(getByRole("option", { name: "London" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Combobox says nothing matched without listing a held value the search did not match", async () => {
    const london = { key: "1", text: "London", data: { id: 1 } };
    const { getByRole, findByText, queryByRole } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[london]}
        onChange={noop}
        onResolveSuggestions={async () => []}
        noResultsText="No matches."
      />,
    );
    fireEvent.change(getByRole("combobox", { name: "Office" }), {
      target: { value: "zz" },
    });
    await findByText("No matches.");
    expect(queryByRole("option", { name: "London" })).toBeNull();
  });

  it("Combobox multi adds the one picked, and takes back the one picked again", async () => {
    const london = { key: "1", text: "London", data: { id: 1 } };
    const lisbon = { key: "2", text: "Lisbon", data: { id: 2 } };
    const onChange = vi.fn();
    const onResolveSuggestions = vi
      .fn<(query: string) => Promise<OptionItem[]>>()
      .mockResolvedValue([london, lisbon]);
    const { getByRole, findByRole } = render(
      <shadcnAdapter.Combobox
        label="Office"
        value={[london]}
        onChange={onChange}
        onResolveSuggestions={onResolveSuggestions}
        multi
      />,
    );
    fireEvent.change(getByRole("combobox", { name: "Office" }), {
      target: { value: "L" },
    });
    fireEvent.mouseDown(await findByRole("option", { name: "Lisbon" }));
    expect(onChange).toHaveBeenLastCalledWith([london, lisbon]);
    // The list stays up in multi, so the next pick needs no reopening.
    fireEvent.mouseDown(getByRole("option", { name: "London" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("Checkbox takes an ariaLabel and a mixed state; a click on mixed reports checked", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <shadcnAdapter.Checkbox
        ariaLabel="Select all"
        checked={false}
        indeterminate
        onChange={onChange}
      />,
    );
    const box = getByRole("checkbox", { name: "Select all" });
    expect(box).toBePartiallyChecked();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Button tooltip describes the button and stays reachable while disabled", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <shadcnAdapter.Button
        text="Bulk edit"
        disabled
        tooltip="Tick rows first"
        onClick={onClick}
      />,
    );
    const button = getByRole("button", { name: "Bulk edit" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Tick rows first");
    // A disabled button takes no pointer or focus events, so the tooltip trigger is a
    // focusable wrapper around it.
    expect(button.parentElement).toHaveAttribute("tabindex", "0");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("Dropdown and Combobox show their placeholder while empty", () => {
    const opts = [{ key: "a", text: "A", data: "a" }];
    const { getByText, getByRole } = render(
      <>
        <shadcnAdapter.Dropdown
          label="single"
          value={undefined}
          onChange={noop}
          options={opts}
          placeholder="Pick one"
        />
        <shadcnAdapter.Dropdown
          label="multi"
          value={[]}
          onChange={noop}
          options={opts}
          multiselect
          placeholder="None = all"
        />
        <shadcnAdapter.Combobox
          label="combo"
          value={[]}
          onChange={noop}
          onResolveSuggestions={async () => []}
          placeholder="Any office"
        />
      </>,
    );
    expect(getByText("Pick one")).toBeInTheDocument();
    expect(getByText("None = all")).toBeInTheDocument();
    expect(getByRole("combobox", { name: "combo" })).toHaveAttribute(
      "placeholder",
      "Any office",
    );
  });

  it("Dialog content suppresses implicit CSS transitions (smooth drag/resize)", () => {
    // Stock DialogContent ships `duration-200` with transition-property left at
    // its initial value `all` — without transition-none, every inline
    // width/height/transform write from useDragResize starts a 200ms implicit
    // transition and resize turns into rubber-banding.
    render(
      <shadcnAdapter.Dialog open onOpenChange={noop} title="dlg">
        body
      </shadcnAdapter.Dialog>,
    );
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
    expect(content!.className).toContain("transition-none");
  });

  it("portaled surfaces self-tag with speel-shadcn for scoped base styles", () => {
    render(
      <shadcnAdapter.Dialog open onOpenChange={noop} title="t">
        b
      </shadcnAdapter.Dialog>,
    );
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content!.className).toContain("speel-shadcn");
  });
});

describe("shadcn actions", () => {
  it("danger renders the destructive variant", () => {
    const { getByRole } = render(
      <shadcnAdapter.Button text="Overwrite" appearance="danger" />,
    );
    expect(getByRole("button", { name: "Overwrite" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
  });

  it("MessageBar renders an action array through the skin's Button", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <SpeelUIProvider ui={shadcnAdapter}>
        <shadcnAdapter.MessageBar
          intent="error"
          actions={[{ key: "r", text: "Re-check", onClick }]}
        >
          Load failed
        </shadcnAdapter.MessageBar>
      </SpeelUIProvider>,
    );
    const btn = getByRole("button", { name: "Re-check" });
    expect(getByRole("alert")).toContainElement(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it("MessageBar renders a node as-is, inline when multiline is false", () => {
    const { getByRole } = render(
      <SpeelUIProvider ui={shadcnAdapter}>
        <shadcnAdapter.MessageBar
          intent="info"
          multiline={false}
          actions={<a href="#d">Details</a>}
        >
          Heads up
        </shadcnAdapter.MessageBar>
      </SpeelUIProvider>,
    );
    const link = getByRole("link", { name: "Details" });
    expect(link.closest("[data-slot=message-actions]")).toHaveAttribute(
      "data-multiline",
      "false",
    );
  });
});
