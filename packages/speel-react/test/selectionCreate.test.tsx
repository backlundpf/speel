import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import {
  DbContext,
  DbContextOptionsBuilder,
  ModelBuilder,
  type FieldConfig,
  type OptionsCreator,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { UIAdapterContext } from "../src/context.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useField } from "../src/form/useField.js";
import { useStandaloneField } from "../src/form/useStandaloneField.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { SelectionFieldBody } from "../src/fields/SelectionFieldBody.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import type {
  ComboboxProps,
  SpeelUIAdapter,
} from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider, type QueryRecorder } from "./fakeProvider.js";

class Office {
  Id?: number;
  Title?: string;
}
class Person {
  Id?: number;
  Title?: string;
  OfficeId?: number;
  Office?: Office | null;
  OfficesId?: number[];
  Offices?: Office[];
  Status?: string;
  Tags?: string[];
}

const OFFICES = [
  { ID: 1, Title: "London" },
  { ID: 2, Title: "Lisbon" },
];

interface Mounted {
  field: { readonly value: unknown };
  /** The latest `create` prop the skin was handed. */
  create: () => ComboboxProps["create"];
  /** Every `create.state.kind` the skin was rendered with, in order. */
  kinds: string[];
  /** Sets this field's value, as a pick in the skin would. */
  setValue: (v: unknown) => void;
  /** Edits another field of the draft, through the form. */
  setDraft: (name: string, v: unknown) => void;
  unmount: () => void;
}

/** Renders the real `SpeelField` for `name`, tapping the Combobox's `create` prop. */
async function mount(
  db: DbContext,
  entity: object,
  name: string,
  label: string,
): Promise<Mounted> {
  let captured: FieldHandle | undefined;
  function Probe() {
    captured = useField(name);
    return null;
  }
  let setField: ((n: string, v: unknown) => void) | undefined;
  function Inner() {
    const form = useEntityForm(entity as never, "edit");
    setField = (n, v) =>
      (
        form as unknown as {
          form: { setFieldValue(n: string, v: unknown): void };
        }
      ).form.setFieldValue(n, v);
    return (
      <EntityFormProvider value={form as never}>
        <Probe />
        <SpeelField name={name} />
      </EntityFormProvider>
    );
  }
  let create: ComboboxProps["create"];
  const kinds: string[] = [];
  const ui: SpeelUIAdapter = {
    ...fakeAdapter,
    Combobox: (p: ComboboxProps) => {
      create = p.create;
      if (p.create) kinds.push(p.create.state.kind);
      return <fakeAdapter.Combobox {...p} />;
    },
  };
  const { unmount } = render(
    <SpeelProvider db={db as never} ui={ui}>
      <Inner />
    </SpeelProvider>,
  );
  await screen.findByLabelText(label);
  return {
    field: {
      get value() {
        return captured?.value;
      },
    },
    create: () => create,
    kinds,
    setValue: (v) => act(() => setField!(name, v)),
    setDraft: (n, v) => act(() => setField!(n, v)),
    unmount,
  };
}

/** A one-lookup form over Offices (single `Office`, or multi `Offices`). */
async function renderLookup(
  opts: {
    creator?: OptionsCreator<Person, Office>;
    multi?: boolean;
    value?: { Id: number; Title: string };
  } = {},
): Promise<Mounted & { provider: QueryRecorder; db: DbContext }> {
  const provider = makeFakeProvider(
    { Offices: OFFICES, People: [{ ID: 7, Title: "Ada" }] },
    { applyFilter: true },
  );
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Office, (b) => {
        b.toList("Offices");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
      });
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        if (opts.multi) {
          const rb = b
            .hasMany(Office, (e) => e.Offices)
            .withMany()
            .hasForeignKey((e) => e.OfficesId)
            .hasDisplayField((o) => o.Title)
            .hasDisplayName("Office");
          if (opts.creator) rb.hasOptionsCreateAsync(opts.creator);
        } else {
          const rb = b
            .hasOne(Office, (e) => e.Office)
            .withMany()
            .hasForeignKey((e) => e.OfficeId)
            .hasDisplayField((o) => o.Title);
          if (opts.creator) rb.hasOptionsCreateAsync(opts.creator);
        }
      });
    }
  }
  const db = new Ctx({ provider } as never);
  const person = Object.assign(new Person(), { Id: 7, Title: "Ada" });
  if (opts.value) {
    const office = Object.assign(new Office(), opts.value);
    if (opts.multi) {
      person.Offices = [office];
      person.OfficesId = [opts.value.Id];
    } else {
      person.Office = office;
      person.OfficeId = opts.value.Id;
    }
  }
  const mounted = await mount(
    db,
    person,
    opts.multi ? "Offices" : "Office",
    "Office",
  );
  return { ...mounted, provider, db };
}

/** A fill-in Choice form (`Status`, or multi `Tags` labelled "Status"). */
async function renderChoice(
  opts: { multi?: boolean; value?: unknown } = {},
): Promise<Mounted> {
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        if (opts.multi)
          b.property((e) => e.Tags)
            .isMultiChoice()
            .hasOptions(["Open", "Closed"] as never)
            .allowFillIn()
            .hasDisplayName("Status");
        else
          b.property((e) => e.Status)
            .isChoice()
            .hasOptions(["Open", "Closed"])
            .allowFillIn()
            .hasDisplayName("Status");
      });
    }
  }
  const ob = new DbContextOptionsBuilder();
  ob.useProvider({} as never);
  const db = new Ctx(ob.options);
  const person = Object.assign(new Person(), { Id: 1 });
  if (opts.multi) person.Tags = opts.value as string[];
  else person.Status = opts.value as string;
  return mount(db, person, opts.multi ? "Tags" : "Status", "Status");
}

/** Types into the picker and waits for the answer to paint. */
async function type(label: string, text: string): Promise<void> {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });
}

/** A creator that "saves" by handing back a row with a fresh id. */
function creating(id = 99) {
  return vi.fn<OptionsCreator<Person, Office>>(async ({ text }) =>
    Object.assign(new Office(), { Id: id, Title: text }),
  );
}

function gate<T>(): { promise: Promise<T>; release: (v: T) => void } {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}

describe("when the Add row shows", () => {
  it("shows when nothing matches exactly", async () => {
    await renderLookup({ creator: creating() });
    await type("Office", "Zurich");
    expect(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    ).toBeInTheDocument();
  });

  it("hides on a case-insensitive exact match", async () => {
    await renderLookup({ creator: creating() });
    await type("Office", "london");
    await screen.findByRole("button", { name: "London" });
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
  });

  it("hides for blank or whitespace text", async () => {
    await renderLookup({ creator: creating() });
    await type("Office", "   ");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull(),
    );
    await type("Office", "");
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
  });

  it("never shows on a field without a creator", async () => {
    const m = await renderLookup();
    await type("Office", "Zurich");
    await screen.findByText("No matches.");
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
    expect(m.create()).toBeUndefined();
  });
});

describe("a successful create", () => {
  it("sets a single lookup to the created row", async () => {
    const creator = creating();
    const m = await renderLookup({
      creator,
      value: { Id: 1, Title: "London" },
    });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await waitFor(() =>
      expect((m.field.value as Office | null)?.Title).toBe("Zurich"),
    );
    expect((m.field.value as Office).Id).toBe(99);
    expect(creator).toHaveBeenCalledTimes(1);
    expect(creator.mock.calls[0]![0].text).toBe("Zurich");
  });

  it("appends to a multi-value lookup", async () => {
    const m = await renderLookup({
      creator: creating(),
      multi: true,
      value: { Id: 1, Title: "London" },
    });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await waitFor(() =>
      expect((m.field.value as Office[]).map((o) => o.Title)).toEqual([
        "London",
        "Zurich",
      ]),
    );
  });

  it("offers the created row on the next open with no second read", async () => {
    const m = await renderLookup({ creator: creating() });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await waitFor(() =>
      expect((m.field.value as Office | null)?.Title).toBe("Zurich"),
    );
    // "Zur" is a search, so the merge does not prepend the held value: the row offered
    // can only come from the adopted rows.
    const reads = m.provider.queries.filter((q) => q.list === "Offices").length;
    expect(reads).toBe(1);
    await type("Office", "Zur");
    expect(
      await screen.findByRole("button", { name: "Zurich" }),
    ).toBeInTheDocument();
    expect(m.provider.queries.filter((q) => q.list === "Offices")).toHaveLength(
      1,
    );
  });
});

describe("decline and failure", () => {
  it("a creator resolving undefined changes nothing and returns to idle", async () => {
    const creator = vi.fn<OptionsCreator<Person, Office>>(
      async () => undefined,
    );
    const m = await renderLookup({
      creator,
      value: { Id: 1, Title: "London" },
    });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await waitFor(() => expect(creator).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    ).toBeInTheDocument();
    expect(m.create()?.state).toEqual({ kind: "idle" });
    expect((m.field.value as Office).Title).toBe("London");
  });

  it("a rejecting creator reports the failure and leaves the value; picking again retries", async () => {
    let fail = true;
    const creator = vi.fn<OptionsCreator<Person, Office>>(async ({ text }) => {
      if (fail) throw new Error("Title is required.");
      return Object.assign(new Office(), { Id: 99, Title: text });
    });
    const m = await renderLookup({
      creator,
      value: { Id: 1, Title: "London" },
    });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    const row = await screen.findByRole("button", {
      name: 'Could not add "Zurich"',
    });
    const describedBy = row.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Title is required.",
    );
    expect(row).toHaveAccessibleDescription("Title is required.");
    expect((m.field.value as Office).Title).toBe("London");

    fail = false;
    fireEvent.click(row);
    await waitFor(() => expect((m.field.value as Office).Title).toBe("Zurich"));
    expect(creator).toHaveBeenCalledTimes(2);
  });

  it("shows Adding while in flight, and a second pick calls the creator once", async () => {
    const g = gate<Office | undefined>();
    const creator = vi.fn<OptionsCreator<Person, Office>>(() => g.promise);
    const m = await renderLookup({ creator });
    await type("Office", "Zurich");
    await screen.findByRole("button", { name: 'Add "Zurich"' });
    act(() => {
      m.create()!.onCreate("Zurich");
      m.create()!.onCreate("Zurich");
    });
    const adding = await screen.findByRole("button", {
      name: 'Adding "Zurich"…',
    });
    expect(adding).toBeDisabled();
    act(() => m.create()!.onCreate("Zurich"));
    expect(creator).toHaveBeenCalledTimes(1);
    await act(async () => {
      g.release(Object.assign(new Office(), { Id: 99, Title: "Zurich" }));
    });
    await waitFor(() => expect((m.field.value as Office).Title).toBe("Zurich"));
    expect(m.create()?.state).toEqual({ kind: "idle" });
  });
});

describe("a fill-in Choice", () => {
  it("sets the typed text as a single value, never rendering adding", async () => {
    const m = await renderChoice({ value: "Open" });
    await type("Status", "Parked");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Parked"' }),
    );
    await waitFor(() => expect(m.field.value).toBe("Parked"));
    // Every state the skin was ever rendered with, not a sample of it.
    expect(m.kinds.length).toBeGreaterThan(0);
    expect(m.kinds).not.toContain("adding");
  });

  it("appends the typed text to a multi-select, never rendering adding", async () => {
    const m = await renderChoice({ multi: true, value: ["Open"] });
    await type("Status", "Parked");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Parked"' }),
    );
    await waitFor(() => expect(m.field.value).toEqual(["Open", "Parked"]));
    expect(m.kinds).not.toContain("adding");
  });

  it("does not append a fill-in the multi-select already holds", async () => {
    // "Parked" is held but not a declared option, so a search for it offers nothing
    // and the Add row shows.
    const m = await renderChoice({ multi: true, value: ["Open", "Parked"] });
    await type("Status", "Parked");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Parked"' }),
    );
    await act(async () => {});
    expect(m.field.value).toEqual(["Open", "Parked"]);
  });
});

describe("the result lands on the value as it stands", () => {
  it("does not append a row a multi lookup already holds", async () => {
    // The creator found an existing row (as createsByDisplayField does on an exact
    // match the search did not offer): it is already held.
    const creator = vi.fn<OptionsCreator<Person, Office>>(async () =>
      Object.assign(new Office(), { Id: 2, Title: "Lisbon" }),
    );
    const m = await renderLookup({
      creator,
      multi: true,
      value: { Id: 2, Title: "Lisbon" },
    });
    await type("Office", "Lisbon HQ");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Lisbon HQ"' }),
    );
    await waitFor(() => expect(creator).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect((m.field.value as Office[]).map((o) => o.Id)).toEqual([2]);
  });

  it("keeps a single value picked while adding, and still adopts the row", async () => {
    const g = gate<Office | undefined>();
    const m = await renderLookup({
      creator: vi.fn<OptionsCreator<Person, Office>>(() => g.promise),
      value: { Id: 1, Title: "London" },
    });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await screen.findByRole("button", { name: 'Adding "Zurich"…' });
    const lisbon = Object.assign(new Office(), { Id: 2, Title: "Lisbon" });
    m.setValue(lisbon);
    await act(async () => {
      g.release(Object.assign(new Office(), { Id: 99, Title: "Zurich" }));
    });
    await waitFor(() => expect(m.create()?.state).toEqual({ kind: "idle" }));
    expect(m.field.value).toBe(lisbon);
    await type("Office", "Zur");
    expect(
      await screen.findByRole("button", { name: "Zurich" }),
    ).toBeInTheDocument();
  });

  it("does nothing when the result arrives after unmount", async () => {
    const g = gate<Office | undefined>();
    const creator = vi.fn<OptionsCreator<Person, Office>>(() => g.promise);
    const m = await renderLookup({ creator });
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await screen.findByRole("button", { name: 'Adding "Zurich"…' });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      m.unmount();
      await act(async () => {
        g.release(Object.assign(new Office(), { Id: 99, Title: "Zurich" }));
      });
      expect(creator).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});

describe("the creator's arguments", () => {
  it("receives the surfaces and the live draft values", async () => {
    const creator = creating();
    const m = await renderLookup({ creator });
    // An edit the persisted row does not have: only the live draft carries it.
    m.setDraft("Title", "Ada Lovelace");
    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    await waitFor(() => expect(creator).toHaveBeenCalledTimes(1));
    const args = creator.mock.calls[0]![0] as Parameters<
      OptionsCreator<Person, Office>
    >[0] & { surfaces?: unknown };
    expect(args.surfaces).toBeDefined();
    expect(args.surfaces).not.toBeNull();
    expect((args.source as Person).Title).toBe("Ada Lovelace");
    expect(args.displayField).toBe("Title");
    expect(args.set).toBeDefined();
    expect(args.db).toBeDefined();
  });
});

describe("a standalone field", () => {
  const fillIn: FieldConfig = {
    kind: "Choice",
    multi: false,
    fillIn: true,
    radioButtons: false,
    options: ["Open", "Closed"],
  } as FieldConfig;

  it("creates with no provider", async () => {
    let handle: FieldHandle<string> | undefined;
    function Standalone() {
      const [v, setV] = useState("Open");
      const f = useStandaloneField<string>({
        config: fillIn,
        displayName: "Status",
        value: v,
        onChange: setV,
      });
      handle = f;
      return (
        <SelectionFieldBody
          field={f as FieldHandle}
          chrome={{ label: "Status" }}
        />
      );
    }
    render(
      <UIAdapterContext.Provider value={fakeAdapter}>
        <Standalone />
      </UIAdapterContext.Provider>,
    );
    expect(handle?.create).toBeDefined();
    await type("Status", "Parked");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Parked"' }),
    );
    await waitFor(() => expect(handle?.value).toBe("Parked"));
  });
});
