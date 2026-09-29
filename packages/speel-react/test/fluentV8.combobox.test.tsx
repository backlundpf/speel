import { describe, it, expect, vi } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { V8Combobox } from "../src/fluent-v8/primitives.js";
import type {
  ComboboxCreate,
  OptionItem,
} from "../src/adapter/SpeelUIAdapter.js";

const offices = [
  { key: "1", text: "London", data: { Id: 1 } },
  { key: "2", text: "Lisbon", data: { Id: 2 } },
];

/**
 * Freeform is on, so clicking the text box puts the caret in it to type; the caret
 * button is what browses the list without typing. That is Fluent's own gesture.
 */
const browse = (container: HTMLElement): void => {
  fireEvent.click(container.querySelector(".ms-ComboBox-CaretDown-button")!);
};

describe("V8Combobox", () => {
  it("is named by its label, like every other v8 field", () => {
    render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={async () => []}
      />,
    );
    // The field-label rule: the control carries the name, not a floating label.
    expect(screen.getByLabelText("Office")).toBeInTheDocument();
  });

  it("mounts with a selection without throwing", () => {
    render(
      <V8Combobox
        label="Office"
        value={[{ key: "1", text: "London", data: { Id: 1 } }]}
        onChange={vi.fn()}
        onResolveSuggestions={async () => []}
      />,
    );
    expect(screen.getByLabelText("Office")).toBeInTheDocument();
  });

  it("shows the selection even though no search has returned it", () => {
    render(
      <V8Combobox
        label="Office"
        value={[offices[0]!]}
        onChange={vi.fn()}
        onResolveSuggestions={async () => []}
      />,
    );
    expect(screen.getByLabelText("Office")).toHaveValue("London");
  });

  it("searches when the list opens and hands back the caller's own option", async () => {
    const onChange = vi.fn();
    const resolve = vi.fn(async (q: string) =>
      offices.filter((o) => o.text.toLowerCase().startsWith(q.toLowerCase())),
    );
    const { container } = render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={onChange}
        onResolveSuggestions={resolve}
      />,
    );
    browse(container);
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(""));
    fireEvent.click(await screen.findByText("Lisbon"));
    // The caller's item, `data` and all — not the Fluent option it was rendered as.
    expect(onChange).toHaveBeenCalledWith([offices[1]]);
  });

  it("searches what was typed, and shows the list, without opening it first", async () => {
    const resolve = vi.fn(async (q: string) =>
      offices.filter((o) => o.text.toLowerCase().startsWith(q.toLowerCase())),
    );
    render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={resolve}
      />,
    );
    const input = screen.getByLabelText("Office");
    // No click, no Alt+Down: typing is the whole interaction.
    fireEvent.input(input, { target: { value: "lis" } });
    await waitFor(() => expect(resolve).toHaveBeenCalledWith("lis"));
    expect(await screen.findByText("Lisbon")).toBeInTheDocument();
  });

  it("is given the query whole, even when it reads like a key name", async () => {
    const resolve = vi.fn(async () => []);
    render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={resolve}
      />,
    );
    const input = screen.getByLabelText("Office");
    // Text is text: "Home" is an office here, not the Home key.
    fireEvent.input(input, { target: { value: "Home" } });
    await waitFor(() => expect(resolve).toHaveBeenCalledWith("Home"));
    // And a query typed a letter at a time arrives cumulative, never as its last letter.
    for (const text of ["l", "li", "lis"])
      fireEvent.input(input, { target: { value: text } });
    await waitFor(() => expect(resolve).toHaveBeenLastCalledWith("lis"));
  });

  it("leaves the value alone when text that matches nothing is typed and left", async () => {
    const onChange = vi.fn();
    render(
      <V8Combobox
        label="Office"
        value={[offices[0]!]}
        onChange={onChange}
        onResolveSuggestions={async () => []}
      />,
    );
    const input = screen.getByLabelText("Office") as HTMLInputElement;
    input.focus();
    fireEvent.input(input, { target: { value: "zzz" } });
    input.blur();
    // Freeform text is a query, never a value: only a pick commits.
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toHaveValue("London"));
  });

  it("does not let an abandoned query's late read repaint a reopened list", async () => {
    // Held open, so the test decides when the read lands: the whole race is that the
    // abandoned query is still out when the list is dismissed and opened again.
    const pending: ((found: OptionItem[]) => void)[] = [];
    const resolve = vi.fn(
      () =>
        new Promise<OptionItem[]>((r) => {
          pending.push(r);
        }),
    );
    const { container } = render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={resolve}
      />,
    );
    browse(container);
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    // Dismissed before it answered — and then it answers.
    browse(container);
    await act(async () => {
      pending[0]!([{ key: "9", text: "Stale row", data: { Id: 9 } }]);
    });
    // Reopened: the dismissal retired that read's ticket, so it painted nothing and
    // the list waits on the search this open started.
    browse(container);
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Stale row")).toBeNull();
  });

  it("says so when a query matches nothing", async () => {
    render(
      <V8Combobox
        label="Office"
        value={[]}
        onChange={vi.fn()}
        onResolveSuggestions={async () => []}
        noResultsText="No offices match"
      />,
    );
    fireEvent.input(screen.getByLabelText("Office"), {
      target: { value: "zz" },
    });
    expect(await screen.findByText("No offices match")).toBeInTheDocument();
  });

  describe("opening on focus", () => {
    it("opens its list when focused by keyboard, and asks about nothing typed", async () => {
      const ask = vi.fn(async () => [{ key: "a", text: "Alpha", data: "a" }]);
      render(
        <V8Combobox
          label="Status"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={ask}
        />,
      );
      // fireEvent, not userEvent: the file has no userEvent dependency, and a plain
      // DOM focus event is what Tabbing into the field produces.
      fireEvent.focus(screen.getByLabelText("Status"));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(""));
      expect(
        await screen.findByRole("option", { name: "Alpha" }),
      ).toBeInTheDocument();
    });

    it("opens its list when the input is clicked", async () => {
      const ask = vi.fn(async () => [{ key: "a", text: "Alpha", data: "a" }]);
      render(
        <V8Combobox
          label="Status"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={ask}
        />,
      );
      fireEvent.click(screen.getByLabelText("Status"));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(""));
      expect(
        await screen.findByRole("option", { name: "Alpha" }),
      ).toBeInTheDocument();
    });

    it("does not reopen after a single pick returns focus to the input", async () => {
      const onChange = vi.fn();
      const { container } = render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={onChange}
          onResolveSuggestions={async () => offices}
        />,
      );
      browse(container);
      fireEvent.click(await screen.findByRole("option", { name: "London" }));
      expect(onChange).toHaveBeenCalledWith([offices[0]]);
      // The pick returns focus to the input; that must not reopen the list.
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  describe("multi", () => {
    /** Multi-select renders each option as a tickable row, named by its text. */
    const offer = async (
      value: OptionItem[],
      onChange: (v: OptionItem[]) => void,
    ): Promise<void> => {
      const { container } = render(
        <V8Combobox
          multi
          label="Office"
          value={value}
          onChange={onChange}
          onResolveSuggestions={async () => offices}
        />,
      );
      browse(container);
      await screen.findByRole("option", { name: "London" });
    };

    it("adds the one picked to the ones already held", async () => {
      const onChange = vi.fn();
      await offer([offices[0]!], onChange);
      fireEvent.click(screen.getByRole("option", { name: "Lisbon" }));
      expect(onChange).toHaveBeenCalledWith([offices[0], offices[1]]);
    });

    it("takes back the one picked again, leaving the rest", async () => {
      const onChange = vi.fn();
      await offer([offices[0]!, offices[1]!], onChange);
      fireEvent.click(screen.getByRole("option", { name: "London" }));
      expect(onChange).toHaveBeenCalledWith([offices[1]]);
    });
  });

  describe("create", () => {
    const idle: ComboboxCreate = { onCreate: vi.fn(), state: { kind: "idle" } };

    it("offers to add what was typed when nothing matches it exactly", async () => {
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async (q) =>
            offices.filter((o) =>
              o.text.toLowerCase().startsWith(q.toLowerCase()),
            )
          }
          create={idle}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      expect(await screen.findByText('Add "Berlin"')).toBeInTheDocument();
    });

    it("hides the Add row once the typed text exactly matches a suggestion", async () => {
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => offices}
          create={idle}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "london" },
      });
      // Case-insensitive, and matched against a suggestion's `text` — not its key.
      await screen.findByRole("option", { name: "London" });
      expect(screen.queryByText('Add "london"')).toBeNull();
    });

    it("replaces the no-matches line with the Add row when nothing is loaded", async () => {
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => []}
          noResultsText="No offices match"
          create={idle}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "zz" },
      });
      expect(await screen.findByText('Add "zz"')).toBeInTheDocument();
      expect(screen.queryByText("No offices match")).toBeNull();
    });

    it("calls onCreate with the trimmed text when the Add row is picked, never onChange", async () => {
      const onCreate = vi.fn();
      const onChange = vi.fn();
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={onChange}
          onResolveSuggestions={async () => []}
          create={{ onCreate, state: { kind: "idle" } }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "  Berlin  " },
      });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      expect(onCreate).toHaveBeenCalledWith("Berlin");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores a pick while the create is in flight", async () => {
      const onCreate = vi.fn();
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => []}
          create={{ onCreate, state: { kind: "adding", text: "Berlin" } }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      const row = await screen.findByText('Adding "Berlin"…');
      fireEvent.click(row);
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("shows the failure and still lets a pick retry", async () => {
      const onCreate = vi.fn();
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => []}
          create={{
            onCreate,
            state: {
              kind: "failed",
              text: "Berlin",
              message: "Could not reach the server.",
            },
          }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      fireEvent.click(await screen.findByText('Could not add "Berlin"'));
      expect(onCreate).toHaveBeenCalledWith("Berlin");
    });

    it("shows a plain Add row, not the stale failure, once the text no longer matches it", async () => {
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => []}
          create={{
            onCreate: vi.fn(),
            state: {
              kind: "failed",
              text: "Berlin",
              message: "Could not reach the server.",
            },
          }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Munich" },
      });
      expect(await screen.findByText('Add "Munich"')).toBeInTheDocument();
      expect(screen.queryByText(/Could not add/)).toBeNull();
    });

    it("puts the failure message on the option element itself, not an inner span", async () => {
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => []}
          create={{
            onCreate: vi.fn(),
            state: {
              kind: "failed",
              text: "Berlin",
              message: "Could not reach the server.",
            },
          }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      // The real `role="option"` element — the one `aria-activedescendant` points at
      // while arrow-key browsing the list — not a span nested inside it that a
      // screen reader landing on the option never reads from. Its computed name
      // also folds in the icon's own "Error" label, so match loosely on the row text.
      const option = await screen.findByRole("option", {
        name: /Could not add "Berlin"/,
      });
      expect(option).toHaveAttribute("title", "Could not reach the server.");
    });

    it("shows the failure message in a callout only once the icon is focused", async () => {
      render(
        <V8Combobox
          label="Office"
          value={[]}
          onChange={vi.fn()}
          onResolveSuggestions={async () => []}
          create={{
            onCreate: vi.fn(),
            state: {
              kind: "failed",
              text: "Berlin",
              message: "Could not reach the server.",
            },
          }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      await screen.findByText('Could not add "Berlin"');
      // The message is already in the document (for `aria-describedby`) before any
      // hover or focus — only the callout's own copy is conditional on it.
      expect(screen.queryAllByText("Could not reach the server.")).toHaveLength(
        1,
      );
      fireEvent.focus(screen.getByRole("img", { name: "Error" }));
      await waitFor(() =>
        expect(
          screen.queryAllByText("Could not reach the server."),
        ).toHaveLength(2),
      );
    });

    it("keeps the list open, and the typed text live, through an in-flight create and a failure — and lets a retry succeed", async () => {
      // Fluent's own ComboBox closes a single-select list on ANY option click,
      // before `onChange` even runs, and wipes the typed/pending value with it. A
      // component that only special-cased the click itself (and started from a
      // pre-set `create.state`) could look right without ever exercising that —
      // this drives the same transitions a real field body would, one render at a
      // time, so the close-then-reopen actually has to happen.
      const onCreate = vi.fn();
      const props = (
        state: ComboboxCreate["state"],
      ): Parameters<typeof V8Combobox>[0] => ({
        label: "Office",
        value: [],
        onChange: vi.fn(),
        onResolveSuggestions: async () => [],
        create: { onCreate, state },
      });
      const { rerender } = render(<V8Combobox {...props({ kind: "idle" })} />);
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      expect(onCreate).toHaveBeenCalledTimes(1);
      expect(onCreate).toHaveBeenCalledWith("Berlin");

      // The state a real onCreate would have moved the field body to by now —
      // synchronously, before the promise it started even settles.
      rerender(<V8Combobox {...props({ kind: "adding", text: "Berlin" })} />);
      expect(await screen.findByText('Adding "Berlin"…')).toBeInTheDocument();
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      rerender(
        <V8Combobox
          {...props({
            kind: "failed",
            text: "Berlin",
            message: "Could not reach the server.",
          })}
        />,
      );
      const failedRow = await screen.findByText('Could not add "Berlin"');
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      fireEvent.click(failedRow);
      expect(onCreate).toHaveBeenCalledTimes(2);
      expect(onCreate).toHaveBeenLastCalledWith("Berlin");
    });

    it("closes the list, as a pick does, once a single-select create succeeds", async () => {
      const onCreate = vi.fn();
      const berlin = { key: "9", text: "Berlin", data: { Id: 9 } };
      const props = (
        value: OptionItem[],
        state: ComboboxCreate["state"],
      ): Parameters<typeof V8Combobox>[0] => ({
        label: "Office",
        value,
        onChange: vi.fn(),
        onResolveSuggestions: async () => [],
        create: { onCreate, state },
      });
      const { rerender } = render(
        <V8Combobox {...props([], { kind: "idle" })} />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      rerender(
        <V8Combobox {...props([], { kind: "adding", text: "Berlin" })} />,
      );
      expect(await screen.findByText('Adding "Berlin"…')).toBeInTheDocument();
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Success: the field body sets the value and returns to idle.
      rerender(<V8Combobox {...props([berlin], { kind: "idle" })} />);
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
      // The box shows the new value rather than a leftover query.
      expect(screen.getByLabelText("Office")).toHaveValue("Berlin");
      // Reopening asks afresh: nothing typed, so no Add row.
      browse(document.body);
      await screen.findByRole("listbox");
      expect(screen.queryByText(/Add "/)).toBeNull();
    });

    // createsByForm opens a modal; when it closes, focus comes back to this input around
    // the moment the create lands. That returning focus must not pop the list back up.
    it("does not reopen the list when focus returns right after a create closed it", async () => {
      const onCreate = vi.fn();
      const berlin = { key: "9", text: "Berlin", data: { Id: 9 } };
      const props = (
        value: OptionItem[],
        state: ComboboxCreate["state"],
      ): Parameters<typeof V8Combobox>[0] => ({
        label: "Office",
        value,
        onChange: vi.fn(),
        onResolveSuggestions: async () => [],
        create: { onCreate, state },
      });
      const { rerender } = render(
        <V8Combobox {...props([], { kind: "idle" })} />,
      );
      const box = screen.getByLabelText("Office");
      fireEvent.input(box, { target: { value: "Berlin" } });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      // A surface took focus while the create ran.
      box.blur();
      rerender(<V8Combobox {...props([berlin], { kind: "idle" })} />);
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

      // The surface closes and hands focus back.
      fireEvent.focus(box);
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("listbox")).toBeNull();

      // Only focus is ignored in that window: a click still opens the list.
      browse(document.body);
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
    });

    // The sequence live on SharePoint: the create opens a modal, which takes focus, and
    // Fluent closes the list on that blur. The modal hands focus back BEFORE the create
    // lands; the list must stay shut through that and through the landing.
    it("keeps the list shut when a surface-driven create hands focus back before it lands", async () => {
      const onCreate = vi.fn();
      const berlin = { key: "9", text: "Berlin", data: { Id: 9 } };
      const props = (
        value: OptionItem[],
        state: ComboboxCreate["state"],
      ): Parameters<typeof V8Combobox>[0] => ({
        label: "Office",
        value,
        onChange: vi.fn(),
        onResolveSuggestions: async () => [],
        create: { onCreate, state },
      });
      const { rerender } = render(
        <V8Combobox {...props([], { kind: "idle" })} />,
      );
      const box = screen.getByLabelText("Office");
      fireEvent.input(box, { target: { value: "Berlin" } });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      rerender(
        <V8Combobox {...props([], { kind: "adding", text: "Berlin" })} />,
      );
      // The modal takes focus; Fluent closes the list on the blur.
      fireEvent.blur(box);
      fireEvent.keyDown(box, { key: "Escape", keyCode: 27, which: 27 });
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
      // The modal closes and hands focus back while the create is still out.
      fireEvent.focus(box);
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("listbox")).toBeNull();
      // The create lands.
      rerender(<V8Combobox {...props([berlin], { kind: "idle" })} />);
      fireEvent.focus(box);
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("keeps the list open when a single-select create fails", async () => {
      const onCreate = vi.fn();
      const props = (
        state: ComboboxCreate["state"],
      ): Parameters<typeof V8Combobox>[0] => ({
        label: "Office",
        value: [],
        onChange: vi.fn(),
        onResolveSuggestions: async () => [],
        create: { onCreate, state },
      });
      const { rerender } = render(<V8Combobox {...props({ kind: "idle" })} />);
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      rerender(<V8Combobox {...props({ kind: "adding", text: "Berlin" })} />);
      rerender(
        <V8Combobox
          {...props({ kind: "failed", text: "Berlin", message: "Nope." })}
        />,
      );
      expect(
        await screen.findByText('Could not add "Berlin"'),
      ).toBeInTheDocument();
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("routes a multi-select pick of the Add row to onCreate, never onChange", async () => {
      const onCreate = vi.fn();
      const onChange = vi.fn();
      render(
        <V8Combobox
          multi
          label="Office"
          value={[]}
          onChange={onChange}
          onResolveSuggestions={async () => []}
          create={{ onCreate, state: { kind: "idle" } }}
        />,
      );
      fireEvent.input(screen.getByLabelText("Office"), {
        target: { value: "Berlin" },
      });
      fireEvent.click(await screen.findByText('Add "Berlin"'));
      expect(onCreate).toHaveBeenCalledWith("Berlin");
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
