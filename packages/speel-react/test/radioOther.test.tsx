import { useState } from "react";
import { describe, it, expect } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { DbContext, DbContextOptionsBuilder, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useField } from "../src/form/useField.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import type {
  OptionItem,
  SpeelUIAdapter,
} from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { V8RadioGroup } from "../src/fluent-v8/primitives.js";
import { fluentV8Adapter } from "../src/fluent-v8/index.js";

class Person {
  Id?: number;
  Status?: string;
  Tags?: string[];
}

/** Everything a fill-in radio Choice test can declare. */
interface RadioOpts {
  value?: unknown;
  required?: boolean;
  fillIn?: boolean;
  multi?: boolean;
  options?: readonly string[];
  /** A thunk source instead of a literal list — resolved once, async. */
  optionsThunk?: () => Promise<string[]>;
}

/** A live view onto the captured FieldHandle — rebuilt on every render, like `useField`. */
interface Mounted {
  field: {
    readonly value: unknown;
    readonly errors: readonly string[];
    readonly touched: boolean;
    markTouched(): void;
  };
}

/**
 * Renders the real `SpeelField` for a `Status` (or `Tags`) radio Choice, so the
 * dispatch under test is the actual RadioChoiceBody, not a hand-picked body. `skin`
 * defaults to the headless fake; passing `fluentV8Adapter` drives the real Fluent
 * `V8RadioGroup` through the same real `RadioChoiceBody`, for tests that need the real
 * skin's DOM (focus, in particular) rather than the fake's.
 */
function renderRadio(
  opts: RadioOpts = {},
  skin: SpeelUIAdapter = fakeAdapter,
): Mounted {
  const fillIn = opts.fillIn ?? true;
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        if (opts.multi) {
          const cb = b
            .property((e) => e.Tags)
            .isMultiChoice()
            .hasOptions((opts.options ?? ["Open", "Closed"]) as never)
            .hasDisplayName("Status")
            .asRadioButtons();
          if (fillIn) cb.allowFillIn();
        } else {
          const cb = b
            .property((e) => e.Status)
            .isChoice()
            .hasOptions(opts.optionsThunk ?? opts.options ?? ["Open", "Closed"])
            .hasDisplayName("Status")
            .asRadioButtons();
          if (fillIn) cb.allowFillIn();
          if (opts.required) cb.isRequired();
        }
      });
    }
  }
  const ob = new DbContextOptionsBuilder();
  ob.useProvider({} as never);
  const db = new Ctx(ob.options);
  const person = Object.assign(new Person(), { Id: 1 });
  if (opts.multi) person.Tags = opts.value as string[];
  else person.Status = opts.value as string;

  let captured: FieldHandle | undefined;
  function Probe(): null {
    captured = useField(opts.multi ? "Tags" : "Status");
    return null;
  }
  function Inner() {
    const form = useEntityForm(person, "edit");
    return (
      <EntityFormProvider value={form as never}>
        <Probe />
        <SpeelField name={opts.multi ? "Tags" : "Status"} />
      </EntityFormProvider>
    );
  }
  render(
    <SpeelProvider db={db as never} ui={skin}>
      <Inner />
    </SpeelProvider>,
  );
  return {
    field: {
      get value() {
        return captured?.value;
      },
      get errors() {
        return captured?.errors ?? [];
      },
      get touched() {
        return Boolean(captured?.touched);
      },
      markTouched: () => captured?.markTouched(),
    },
  };
}

describe("a fill-in radio Choice offers Other", () => {
  it("a saved out-of-list value pre-selects Other, with its text in the box", async () => {
    const { field } = renderRadio({ value: "Something Else" });
    // Before the options load, the out-of-list value is Other's only entry, so a plain
    // `findAllByRole` would settle for that lone radio; wait for the full, settled set
    // (the two declared radios plus Other) instead.
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    // The fake adapter's outer chrome `<label>` swallows the first nested radio's own
    // accessible name (a pre-existing quirk of that markup, unrelated to Other), so the
    // declared radios are told apart by DOM order — Open, then Closed — rather than by
    // name; Other's own `<label>` is not nested that way and keeps a clean name.
    const [openRadio, closedRadio] = screen.getAllByRole("radio");

    const other = screen.getByRole("radio", { name: "Other" });
    expect(other).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Other" })).toHaveValue(
      "Something Else",
    );
    // The declared radios stay unchecked — the value is Other's, not a duplicate
    // "Something Else" radio of its own.
    expect(openRadio).not.toBeChecked();
    expect(closedRadio).not.toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(field.value).toBe("Something Else");
  });

  it("typing selects Other and writes the trimmed value", async () => {
    const { field } = renderRadio({ value: "Open" });
    const [openRadio] = await screen.findAllByRole("radio");
    expect(openRadio).toBeChecked();

    const box = screen.getByRole("textbox", { name: "Other" });
    fireEvent.change(box, { target: { value: "  Custom Thing  " } });

    expect(field.value).toBe("Custom Thing");
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();
    expect(openRadio).not.toBeChecked();
  });

  it("typing a declared value into Other's box leaves that declared radio showing", async () => {
    const { field } = renderRadio({ value: "Open" });
    await screen.findAllByRole("radio");

    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), {
      target: { value: "Closed" },
    });

    expect(field.value).toBe("Closed");
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();
    // Other holds a value the list declares; the declared radio is not Other's
    // duplicate and must not vanish.
    expect(screen.getByRole("radio", { name: "Closed" })).toBeInTheDocument();
    // Open, Closed, Other — nothing hidden, nothing doubled.
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("picking a declared radio sets it; picking Other again restores the text", async () => {
    const { field } = renderRadio({ value: "Custom Value" });
    // Same premature-settle hazard as the "saved values" test above.
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    const openRadio = screen.getAllByRole("radio")[0]!;
    const otherRadio = screen.getByRole("radio", { name: "Other" });
    expect(otherRadio).toBeChecked();

    fireEvent.click(openRadio);
    expect(field.value).toBe("Open");
    expect(otherRadio).not.toBeChecked();
    // The text is still in the box, just not the field's value while Open is picked.
    expect(screen.getByRole("textbox", { name: "Other" })).toHaveValue(
      "Custom Value",
    );

    fireEvent.click(otherRadio);
    expect(field.value).toBe("Custom Value");
    expect(otherRadio).toBeChecked();
    expect(openRadio).not.toBeChecked();
  });

  it("picking Other with an empty box yields the required error once touched", async () => {
    const { field } = renderRadio({ required: true });
    await screen.findAllByRole("radio");

    // The critical bug: picking Other with nothing typed used to set the value to ""
    // and then immediately un-check Other again, because "selected" was re-derived
    // from a non-empty value. It must stay checked.
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    expect(field.value).toBe("");
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();

    expect(screen.queryByText("Status is required.")).toBeNull();
    act(() => field.markTouched());
    expect(await screen.findByText("Status is required.")).toBeInTheDocument();
    // Still checked after the touch/error render, not un-checked by it.
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();
  });

  it("clearing the box after typing keeps Other checked", async () => {
    const { field } = renderRadio({ value: "Open" });
    await screen.findAllByRole("radio");

    const box = screen.getByRole("textbox", { name: "Other" });
    fireEvent.change(box, { target: { value: "Something" } });
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();

    fireEvent.change(box, { target: { value: "" } });
    expect(field.value).toBe("");
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();
  });

  it("a thunk-sourced fill-in radio Choice pre-selects Other for a saved out-of-list value, without also rendering it as its own radio", async () => {
    const { field } = renderRadio({
      value: "Something Else",
      optionsThunk: async () => ["Open", "Closed"],
    });
    // The membership check for "is this declared" must compare against the loaded
    // rows, not the merged `options` list — which always contains the current value,
    // thunk or not — or a thunk-sourced Other never activates.
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    const [openRadio, closedRadio] = screen.getAllByRole("radio");
    const other = screen.getByRole("radio", { name: "Other" });
    expect(other).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Other" })).toHaveValue(
      "Something Else",
    );
    expect(openRadio).not.toBeChecked();
    expect(closedRadio).not.toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(field.value).toBe("Something Else");
  });

  it("a thunk-sourced fill-in radio Choice with a saved DECLARED value ends up on that radio, not Other, once the load settles", async () => {
    const { field } = renderRadio({
      value: "Open",
      optionsThunk: async () => ["Open", "Closed"],
    });
    // Deciding Other before the thunk's first load lands would be a guess against an
    // empty `loaded` — this value IS declared, and must never be mistaken for Other's,
    // nor duplicated once the real list is in.
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    const [openRadio, closedRadio] = screen.getAllByRole("radio");
    const other = screen.getByRole("radio", { name: "Other" });
    expect(openRadio).toBeChecked();
    expect(closedRadio).not.toBeChecked();
    expect(other).not.toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(field.value).toBe("Open");
  });

  it("a non-fill-in radio Choice has no Other", async () => {
    renderRadio({ fillIn: false, value: "Open" });
    await screen.findAllByRole("radio");
    expect(screen.queryByRole("radio", { name: "Other" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Other" })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("a multi fill-in radio Choice has no Other either", async () => {
    renderRadio({ multi: true, fillIn: true, value: ["Open"] });
    await screen.findAllByRole("radio");
    expect(screen.queryByRole("radio", { name: "Other" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Other" })).toBeNull();
  });
});

describe("V8RadioGroup renders Other", () => {
  const options: OptionItem[] = [
    { key: "Open", text: "Open", data: "Open" },
    { key: "Closed", text: "Closed", data: "Closed" },
  ];

  it("shows the Other radio and its text box, and typing calls onTextChange", async () => {
    let typed: string | undefined;
    render(
      <V8RadioGroup
        label="Status"
        options={options}
        value="Open"
        onChange={() => {}}
        other={{
          text: "",
          selected: false,
          onTextChange: (t) => {
            typed = t;
          },
          onSelect: () => {},
        }}
      />,
    );

    expect(await screen.findByRole("radio", { name: "Other" })).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Other" });
    fireEvent.change(box, { target: { value: "Something new" } });
    expect(typed).toBe("Something new");
  });

  /**
   * A small harness that plays `RadioChoiceBody`'s own role — `selected`/`text` are
   * real React state, driven only by `onSelect`/`onTextChange`, never re-derived from
   * `value` — so a click really transitions `other.selected` the way the body would,
   * which is what the skin's `[selected]`-keyed focus effect needs to fire for real.
   */
  function ControlledV8Radio({
    initialSelected = false,
    initialValue = "Open",
    initialText = "",
  }: {
    initialSelected?: boolean;
    initialValue?: string;
    initialText?: string;
  }): JSX.Element {
    const [selected, setSelected] = useState(initialSelected);
    const [text, setText] = useState(initialText);
    const [value, setValue] = useState<string | undefined>(initialValue);
    return (
      <V8RadioGroup
        label="Status"
        options={options}
        value={value}
        onChange={(v) => {
          setSelected(false);
          setValue(v as string);
        }}
        other={{
          text,
          selected,
          onTextChange: (t) => {
            setText(t);
            setSelected(true);
          },
          onSelect: () => setSelected(true),
        }}
      />
    );
  }

  it("picking Other moves focus into the box, and it stays checked through typing and clearing", async () => {
    render(<ControlledV8Radio />);
    const other = await screen.findByRole("radio", { name: "Other" });
    expect(other).not.toBeChecked();

    fireEvent.click(other);
    expect(other).toBeChecked();
    const box = screen.getByRole("textbox", { name: "Other" });
    expect(box).toHaveFocus();

    fireEvent.change(box, { target: { value: "Something" } });
    expect(other).toBeChecked();

    fireEvent.change(box, { target: { value: "" } });
    expect(other).toBeChecked();
  });

  it("mounting with a saved out-of-list value does not move focus; picking Other afterwards does", async () => {
    render(
      <ControlledV8Radio
        initialSelected
        initialValue="Something Else"
        initialText="Something Else"
      />,
    );
    const other = await screen.findByRole("radio", { name: "Other" });
    // Pre-selected by the saved value, straight from mount — but not focused: several
    // such fields on one form would otherwise fight over focus on load.
    expect(other).toBeChecked();
    const box = screen.getByRole("textbox", { name: "Other" });
    expect(box).not.toHaveFocus();

    // A genuine post-mount transition away from, then back to, Other — this pick must
    // focus the box, unlike the one mount already resolved above.
    fireEvent.click(screen.getByRole("radio", { name: "Open" }));
    expect(other).not.toBeChecked();
    expect(box).not.toHaveFocus();

    fireEvent.click(other);
    expect(other).toBeChecked();
    expect(box).toHaveFocus();
  });
});

/**
 * Focus, through the real stack: `RadioChoiceBody` + the real Fluent `V8RadioGroup`.
 * `ControlledV8Radio` above cannot reproduce the bug this guards against — its
 * `selected` only ever changes in direct response to a click, so it can't show an
 * *async* correction (a thunk-sourced Other settling after mount, nobody at the
 * keyboard) flipping `selected` false→true with no pick behind it.
 */
describe("Radio Other focus, through RadioChoiceBody + the real Fluent skin", () => {
  it("a thunk-sourced Other settling after mount does not steal focus", async () => {
    renderRadio(
      { value: "Something Else", optionsThunk: async () => ["Open", "Closed"] },
      fluentV8Adapter,
    );
    // Before the thunk resolves, "Something Else" renders as its own (unsettled) radio,
    // not yet as Other — wait for the real, settled state the bug is about.
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Other" })).toBeChecked(),
    );
    const box = screen.getByRole("textbox", { name: "Other" });
    expect(box).toHaveValue("Something Else");
    expect(box).not.toHaveFocus();
  });

  it("a literal-list saved out-of-list value does not move focus on mount", async () => {
    renderRadio({ value: "Something Else" }, fluentV8Adapter);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Other" })).toBeChecked(),
    );
    expect(screen.getByRole("textbox", { name: "Other" })).not.toHaveFocus();
  });

  it("clicking Other moves focus into the box", async () => {
    renderRadio({ value: "Open" }, fluentV8Adapter);
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Other" })).toHaveFocus();
  });
});
