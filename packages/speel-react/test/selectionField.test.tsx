import { describe, it, expect, vi } from "vitest";
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
  OPTIONS_QUERY_TAKE,
  searchesDisplayField,
  type OptionContext,
  type OptionsLoader,
  type OptionsThunk,
} from "@speel/core";
import { IdentityDbContext, Principal } from "@speel/identity";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useField } from "../src/form/useField.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import { useSelectionOptions } from "../src/fields/useSelectionOptions.js";
import { SEARCH_DEBOUNCE_MS } from "../src/fields/useDebouncedResolver.js";
import type {
  ComboboxProps,
  OptionItem,
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
  Status?: string;
  Tags?: string[];
}
class Program {
  Id?: number;
  Title?: string;
  OwnedProjects?: Project[];
}
class Project {
  Id?: number;
  Title?: string;
  Program?: Program;
  ProgramId?: number;
}

const OFFICES = [
  { ID: 1, Title: "London" },
  { ID: 2, Title: "Lisbon" },
  { ID: 3, Title: "Oslo" },
];

interface Mounted {
  field: { readonly value: unknown };
  /**
   * The skin's own handle on the picker — what a real skin calls on a menu open and
   * on every keystroke. A test that needs to time the answer calls it directly,
   * because the fake skin's `<input>` models typing but not opening.
   */
  resolveSuggestions: (q: string) => Promise<OptionItem[]>;
  /** Sets the sibling field named by `mount`'s `sibling`, as its own control would. */
  setSibling: (v: unknown) => void;
}

interface MountOpts {
  /** A second field of the same draft whose setter the test drives. */
  sibling?: string;
  mode?: "create" | "edit";
}

/**
 * Renders the real `SpeelField` for one field of `entity`, so the dispatch under test
 * is the thing exercised, not a hand-picked body. `field.value` is a live getter: the
 * handle is rebuilt on every render, so a test that reads it after a click sees the
 * draft as it stands then.
 */
async function mount(
  db: DbContext,
  entity: object,
  name: string,
  label: string,
  opts: MountOpts = {},
): Promise<Mounted> {
  let captured: FieldHandle | undefined;
  let sibling: FieldHandle | undefined;
  function Probe() {
    captured = useField(name);
    return null;
  }
  function SiblingProbe({ of }: { of: string }) {
    sibling = useField(of);
    return null;
  }
  function Inner() {
    const form = useEntityForm(entity as never, opts.mode ?? "edit");
    return (
      <EntityFormProvider value={form as never}>
        <Probe />
        {opts.sibling && <SiblingProbe of={opts.sibling} />}
        <SpeelField name={name} />
      </EntityFormProvider>
    );
  }
  // Everything the fake skin does, plus a tap on the one prop a test may need to
  // drive itself — the skin is otherwise unchanged.
  let resolver: ComboboxProps["onResolveSuggestions"] | undefined;
  const ui: SpeelUIAdapter = {
    ...fakeAdapter,
    Combobox: (p: ComboboxProps) => {
      resolver = p.onResolveSuggestions;
      return <fakeAdapter.Combobox {...p} />;
    },
  };
  render(
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
    resolveSuggestions: (q: string) => {
      if (!resolver) throw new Error("no Combobox was rendered");
      return resolver(q);
    },
    setSibling: (v: unknown) => {
      if (!sibling) throw new Error("mount was given no sibling");
      act(() => sibling!.setValue(v));
    },
  };
}

/** Everything a lookup navigation can declare about its options. */
interface LookupOpts {
  options?: readonly Office[] | OptionsThunk<Office>;
  optionsQuery?: (q: string, o: readonly Office[]) => readonly Office[];
  optionsQueryAsync?: OptionsLoader<Person, Office>;
  optionsFilter?: (ctx: OptionContext) => boolean;
  optionsRender?: (o: Office) => unknown;
  optionsValue?: (o: Office) => unknown;
}

/**
 * A one-lookup form over Offices. The provider applies filters for real, so a
 * narrowed read and a client-side sieve are distinguishable in the read log.
 */
async function renderLookup(
  opts: LookupOpts & {
    rows?: Record<string, unknown>[];
    /** The office already on the entity: the current selection. */
    value?: { Id: number; Title: string };
  } & MountOpts = {},
): Promise<Mounted & { provider: QueryRecorder; db: DbContext }> {
  const provider = makeFakeProvider(
    { Offices: opts.rows ?? OFFICES, People: [{ ID: 7, Title: "Ada" }] },
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
        const rb = b
          .hasOne(Office, (e) => e.Office)
          .withMany()
          .hasForeignKey((e) => e.OfficeId)
          .hasDisplayField((o) => o.Title);
        if (opts.options) rb.hasOptions(opts.options);
        if (opts.optionsQuery) rb.hasOptionsQuery(opts.optionsQuery);
        if (opts.optionsQueryAsync)
          rb.hasOptionsQueryAsync(opts.optionsQueryAsync);
        if (opts.optionsFilter) rb.hasOptionsFilter(opts.optionsFilter);
        if (opts.optionsRender) rb.hasOptionsRender(opts.optionsRender);
        if (opts.optionsValue) rb.hasOptionsValue(opts.optionsValue);
      });
    }
  }
  const db = new Ctx({ provider } as never);
  const person = Object.assign(new Person(), { Id: 7, Title: "Ada" });
  if (opts.value) {
    person.Office = Object.assign(new Office(), opts.value);
    person.OfficeId = opts.value.Id;
  }
  const mounted = await mount(db, person, "Office", "Office", opts);
  return { ...mounted, provider, db };
}

/** Everything a Choice can declare, for a `Status` (or multi `Tags`) field. */
interface ChoiceOpts {
  multi?: boolean;
  options?: readonly string[] | OptionsThunk<string>;
  radio?: boolean;
  value?: unknown;
  optionsFilter?: (ctx: OptionContext) => boolean;
  title?: string;
}

async function renderChoice(
  opts: ChoiceOpts & MountOpts = {},
): Promise<Mounted> {
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        if (opts.multi) {
          b.property((e) => e.Tags)
            .isMultiChoice()
            .hasOptions((opts.options ?? ["Open", "Closed"]) as never)
            .hasDisplayName("Status");
        } else {
          const cb = b
            .property((e) => e.Status)
            .isChoice()
            .hasOptions(opts.options ?? ["Open", "Closed"])
            .hasDisplayName("Status");
          if (opts.radio) cb.asRadioButtons();
          if (opts.optionsFilter) cb.hasOptionsFilter(opts.optionsFilter);
        }
      });
    }
  }
  const ob = new DbContextOptionsBuilder();
  ob.useProvider({} as never);
  const db = new Ctx(ob.options);
  const person = Object.assign(new Person(), { Id: 1, Title: opts.title });
  if (opts.multi) person.Tags = opts.value as string[];
  else person.Status = opts.value as string;
  if (opts.radio) {
    // A radio group has no combobox to tap; mount without waiting on one.
    function Inner() {
      const form = useEntityForm(person, "edit");
      return (
        <EntityFormProvider value={form as never}>
          <SpeelField name="Status" />
        </EntityFormProvider>
      );
    }
    render(
      <SpeelProvider db={db as never} ui={fakeAdapter}>
        <Inner />
      </SpeelProvider>,
    );
    return {
      field: { value: undefined },
      resolveSuggestions: () => {
        throw new Error("a radio group has no resolver");
      },
      setSibling: () => {
        throw new Error("a radio group mounts no sibling");
      },
    };
  }
  return mount(db, person, opts.multi ? "Tags" : "Status", "Status", opts);
}

const texts = (o: OptionItem[]): string[] => o.map((x) => String(x.text));

/** A promise and the hand that settles it, for timing a load against a keystroke. */
function gate<T>(): { promise: Promise<T>; release: (v: T) => void } {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}

describe("every selection field is the combobox", () => {
  it("a Choice renders the combobox, not a dropdown", async () => {
    await renderChoice();
    // A text input, not the fake dropdown's <select>, and no radio group.
    expect(screen.getByLabelText("Status").tagName).toBe("INPUT");
    expect(document.querySelector("select")).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("a lookup renders the combobox", async () => {
    await renderLookup();
    expect(screen.getByLabelText("Office").tagName).toBe("INPUT");
    expect(document.querySelector("select")).toBeNull();
  });

  it("an inverse collection renders a multi combobox", async () => {
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Program, (b) => {
          b.toList("Programs");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
          b.hasMany(Project, (e) => e.OwnedProjects)
            .withOne((p) => p.Program)
            .hasDisplayName("Projects");
        });
        mb.entity(Project, (b) => {
          b.toList("Projects");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
          b.hasOne(Program, (e) => e.Program).withMany((p) => p.OwnedProjects);
        });
      }
    }
    const provider = makeFakeProvider({
      Projects: [
        { ID: 1, Title: "Apollo" },
        { ID: 2, Title: "Gemini" },
      ],
    });
    const prog = Object.assign(new Program(), {
      Id: 9,
      OwnedProjects: [{ Id: 1, Title: "Apollo" }],
    });
    const { field } = await mount(
      new Ctx({ provider } as never),
      prog,
      "OwnedProjects",
      "Projects",
    );
    expect(screen.getByLabelText("Projects").tagName).toBe("INPUT");
    // Multi: a second pick adds to the membership rather than replacing it.
    fireEvent.change(screen.getByLabelText("Projects"), {
      target: { value: "gem" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Gemini" }));
    expect((field.value as { Id: number }[]).map((p) => p.Id).sort()).toEqual([
      1, 2,
    ]);
  });

  it("a Choice declared asRadioButtons renders radios", async () => {
    await renderChoice({ radio: true, value: "Open" });
    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(screen.queryByLabelText("Status")?.tagName).not.toBe("INPUT");
  });

  it("a thunk-sourced Choice with asRadioButtons renders its loaded options as radios", async () => {
    await renderChoice({
      radio: true,
      options: async () => ["Planning", "Active", "Done"],
    });
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  /**
   * `LookupDispatchBody` tests the target's source first, and the order is the whole
   * ruling: a person column is a people picker because the control resolves an
   * identity — searching a directory, merging the site's groups, refusing someone the
   * site has never heard of — not because the target list is long. Declaring a server
   * search on it does not ask to give that up for a combobox over a list of rows.
   */
  it("a person column stays the people picker, even with a declared query", async () => {
    class Task {
      Id?: number;
      OwnerId?: number;
      Owner?: Principal | null;
    }
    class TaskCtx extends IdentityDbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        super.onModelCreating(mb);
        mb.entity(Task, (b) => {
          b.toList("Tasks");
          b.hasOne(Principal, (e) => e.Owner)
            .withMany()
            .hasForeignKey((e) => e.OwnerId)
            .hasDisplayName("Owner")
            .hasDisplayField((p) => p.Title)
            .hasOptionsQueryAsync(searchesDisplayField());
        });
      }
    }
    const provider = makeFakeProvider({ Tasks: [], siteGroups: [] });
    const ctx = new TaskCtx({ provider } as never);
    const task = Object.assign(new Task(), { Id: 1 });
    function Inner() {
      const form = useEntityForm(task, "edit");
      return (
        <EntityFormProvider value={form as never}>
          <SpeelField name="Owner" />
        </EntityFormProvider>
      );
    }
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Inner />
      </SpeelProvider>,
    );
    // Two discriminators, because either alone could drift. The people picker has a
    // separate search box beside a read-only mirror of the value; the combobox has one
    // writable input and nothing named `-search`.
    expect(await screen.findByLabelText("Owner-search")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner")).toHaveAttribute("readonly");
  });
});

/**
 * Nothing loads until the list is first asked for. The combobox builds the held value
 * from the field itself, so a form with several lookups has no reason to read each
 * target just to open — the first read waits for a focus, a click or typing.
 */
describe("options load on first use, not on mount", () => {
  it("opening a form with a list-mode lookup reads nothing", async () => {
    const { provider } = await renderLookup({
      value: { Id: 2, Title: "Lisbon" },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(provider.queries).toHaveLength(0);
    // The held value still shows without a read.
    expect(screen.getByText("Lisbon")).toBeInTheDocument();
  });

  it("opening a form with a query-mode lookup reads nothing", async () => {
    const { provider } = await renderLookup({
      optionsQueryAsync: searchesDisplayField<Person, Office>(),
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(provider.queries).toHaveLength(0);
  });

  it("does not call an options thunk until the list is asked for", async () => {
    let calls = 0;
    const { resolveSuggestions } = await renderLookup({
      options: async ({ db }) => {
        calls++;
        return db.set(Office).toArrayAsync();
      },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(calls).toBe(0);
    let answer: OptionItem[] = [];
    await act(async () => {
      answer = await resolveSuggestions("");
    });
    expect(calls).toBe(1);
    expect(texts(answer)).toEqual(["London", "Lisbon", "Oslo"]);
  });

  it("the first ask of a list-mode lookup reads once and answers with the rows", async () => {
    const { provider, resolveSuggestions } = await renderLookup();
    let answer: OptionItem[] = [];
    await act(async () => {
      answer = await resolveSuggestions("");
    });
    expect(provider.queries).toHaveLength(1);
    expect(texts(answer)).toEqual(["London", "Lisbon", "Oslo"]);
  });

  it("the first ask of a query-mode lookup reads once, capped, and answers", async () => {
    const { provider, resolveSuggestions } = await renderLookup({
      optionsQueryAsync: searchesDisplayField<Person, Office>(),
    });
    let answer: OptionItem[] = [];
    await act(async () => {
      answer = await resolveSuggestions("");
    });
    expect(provider.queries).toHaveLength(1);
    expect(provider.lastQuery().top).toBe(OPTIONS_QUERY_TAKE);
    expect(texts(answer)).toEqual(["London", "Lisbon", "Oslo"]);
  });

  it("radio buttons still load on mount, because they are all on screen", async () => {
    await renderChoice({
      radio: true,
      options: async () => ["Open", "Closed"],
    });
    expect(await screen.findAllByRole("radio")).toHaveLength(2);
  });
});

describe("list mode", () => {
  it("loads a lookup once, and typing does not read again", async () => {
    const { provider, resolveSuggestions } = await renderLookup();
    let answers: OptionItem[][] = [];
    await act(async () => {
      answers = [
        await resolveSuggestions(""),
        await resolveSuggestions("L"),
        await resolveSuggestions("Lo"),
      ];
    });
    // The single uncapped read a lookup declaring nothing has always issued.
    expect(provider.queries).toHaveLength(1);
    expect(provider.queries[0]!.filter).toBeUndefined();
    expect(answers.map(texts)).toEqual([
      ["London", "Lisbon", "Oslo"],
      ["London", "Lisbon", "Oslo"],
      ["London", "Oslo"],
    ]);
  });

  it("calls an options thunk once per field instance, not per keystroke", async () => {
    let calls = 0;
    let sawDb = false;
    const { provider, resolveSuggestions, db } = await renderLookup({
      options: async ({ db }) => {
        calls++;
        sawDb = db instanceof DbContext;
        return db.set(Office).toArrayAsync();
      },
    });
    await act(async () => {
      await resolveSuggestions("");
      await resolveSuggestions("o");
      await resolveSuggestions("os");
    });
    expect(calls).toBe(1);
    expect(sawDb).toBe(true);
    expect(db).toBeInstanceOf(DbContext);
    // The thunk's own read, once — and not the default load beside it.
    expect(provider.queries).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "osl" },
    });
    expect(
      await screen.findByRole("button", { name: "Oslo" }),
    ).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it("searches the rendered text case-insensitively by default", async () => {
    const { resolveSuggestions } = await renderLookup();
    let found: OptionItem[] = [];
    await act(async () => {
      found = await resolveSuggestions("lo");
    });
    // Lisbon does not contain "lo"; London and Oslo do, whatever the case.
    expect(texts(found)).toEqual(["London", "Oslo"]);
    await act(async () => {
      found = await resolveSuggestions("LON");
    });
    expect(texts(found)).toEqual(["London"]);
  });

  it("a custom optionsQuery replaces the default search", async () => {
    const { resolveSuggestions } = await renderLookup({
      // Prefix match, where the default is substring: "o" finds only Oslo.
      optionsQuery: (q, opts) =>
        opts.filter((o) => (o.Title ?? "").toLowerCase().startsWith(q)),
    });
    let found: OptionItem[] = [];
    await act(async () => {
      found = await resolveSuggestions("o");
    });
    expect(texts(found)).toEqual(["Oslo"]);
  });

  it("optionsFilter applies BEFORE optionsQuery", async () => {
    const { resolveSuggestions } = await renderLookup({
      // Truncates, so the order of the two is observable.
      optionsQuery: (_q, opts) => opts.slice(0, 1),
      optionsFilter: (c) => (c.option as Office).Title !== "London",
    });
    let found: OptionItem[] = [];
    await act(async () => {
      found = await resolveSuggestions("");
    });
    // Filter-then-truncate: [Lisbon]. Truncate-then-filter would have given [].
    expect(texts(found)).toEqual(["Lisbon"]);
  });

  it("answers a keystroke asked before the load finished once it lands", async () => {
    const pending = gate<Office[]>();
    const { resolveSuggestions } = await renderLookup({
      options: () => pending.promise,
    });
    const early = resolveSuggestions("lo");
    const outcome = await Promise.race([
      early.then(() => "answered"),
      new Promise<string>((r) => setTimeout(() => r("still waiting"), 0)),
    ]);
    // Nothing to answer from yet — answering [] would say "no matches".
    expect(outcome).toBe("still waiting");
    await act(async () => {
      pending.release(
        OFFICES.map((o) =>
          Object.assign(new Office(), { Id: o.ID, Title: o.Title }),
        ),
      );
    });
    expect(texts(await early)).toEqual(["London", "Oslo"]);
  });

  it("settles an ask queued before the load rejects with nothing, and says why", async () => {
    // A gate that rejects: the load stays in flight until the test fails it.
    let fail!: (e: unknown) => void;
    const rejecting = new Promise<Office[]>((_, reject) => (fail = reject));
    const { resolveSuggestions } = await renderLookup({
      value: { Id: 1, Title: "London" },
      options: () => rejecting,
    });
    // Asked while the load is still in flight — queued, not answered.
    const early = resolveSuggestions("");
    const outcome = await Promise.race([
      early.then(() => "answered"),
      new Promise<string>((r) => setTimeout(() => r("still waiting"), 0)),
    ]);
    expect(outcome).toBe("still waiting");
    await act(async () => {
      fail(new Error("offline"));
    });
    // Not the held value dressed up as a hit: a failed load has no answer.
    expect(await early).toEqual([]);
    // And the skin is told it was a failure, not an empty match.
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lon" },
    });
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("says the load failed rather than that nothing matched", async () => {
    await renderLookup({
      options: async () => {
        throw new Error("offline");
      },
    });
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lon" },
    });
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });
});

describe("availability and the selection", () => {
  const rows = [
    { ID: 1, Title: "London" },
    { ID: 2, Title: "Closed" },
  ];
  /** The model's declaration under test: an option is available unless it is Closed. */
  const notClosed = (c: OptionContext): boolean =>
    (c.option as Office).Title !== "Closed";

  async function offered(
    opts: Parameters<typeof renderLookup>[0],
  ): Promise<OptionItem[]> {
    const { resolveSuggestions } = await renderLookup(opts);
    let found: OptionItem[] = [];
    await act(async () => {
      found = await resolveSuggestions("");
    });
    return found;
  }

  it("drops rows the predicate rejects", async () => {
    // Both halves matter: the rejected row is gone AND the accepted one survived.
    // A predicate stubbed `() => false` must not pass this.
    expect(texts(await offered({ rows, optionsFilter: notClosed }))).toEqual([
      "London",
    ]);
  });

  it("offers every row when no predicate is declared", async () => {
    expect(texts(await offered({ rows }))).toEqual(["London", "Closed"]);
  });

  it("keeps the current selection even when the predicate would drop it", async () => {
    const found = texts(
      await offered({
        rows,
        value: { Id: 2, Title: "Closed" },
        optionsFilter: notClosed,
      }),
    );
    // A value already saved must stay offered, or the form silently rewrites it.
    expect(found).toContain("Closed");
    expect(found).toContain("London");
  });

  it("prepends a selection the load never returned, unfiltered", async () => {
    expect(
      texts(
        await offered({
          rows: [{ ID: 1, Title: "London" }],
          value: { Id: 2, Title: "Closed" },
          optionsFilter: notClosed,
        }),
      ),
    ).toEqual(["Closed", "London"]);
  });

  // The skin already shows the held value; a search it does not match must not
  // answer with it, or the results are polluted and a skin can re-add it.
  it("prepends a held value only to the list as it opens, not to a search it misses", async () => {
    const { resolveSuggestions } = await renderLookup({
      value: { Id: 1, Title: "London" },
    });
    let typed: OptionItem[] = [];
    let opened: OptionItem[] = [];
    await act(async () => {
      typed = await resolveSuggestions("os");
      opened = await resolveSuggestions("");
    });
    expect(texts(typed)).toEqual(["Oslo"]);
    expect(texts(opened)).toContain("London");
  });

  // I1 regression: the entity's expanded Office is a different instance than the row
  // the load returns for the same id. The merge substitutes the value's own instance,
  // so a skin matching by identity still recognises the selection.
  it("offers the selection's own instance when its id is also a loaded row", async () => {
    const { resolveSuggestions, field } = await renderLookup({
      value: { Id: 1, Title: "London" },
    });
    let found: OptionItem[] = [];
    await act(async () => {
      found = await resolveSuggestions("");
    });
    expect(texts(found)).toEqual(["London", "Lisbon", "Oslo"]);
    expect(found[0]!.data).toBe(field.value);
  });

  it("takes an option's text from optionsRender rather than the display field", async () => {
    expect(
      texts(await offered({ optionsRender: (o) => `${o.Title} office` })),
    ).toEqual(["London office", "Lisbon office", "Oslo office"]);
  });

  it("takes an option's key from optionsValue rather than the row id", async () => {
    expect(
      (await offered({ optionsValue: (o) => `office-${o.Title}` })).map(
        (o) => o.key,
      ),
    ).toEqual(["office-London", "office-Lisbon", "office-Oslo"]);
  });

  it("falls back to the display field and the row id when neither is declared", async () => {
    const found = await offered({});
    expect(texts(found)).toEqual(["London", "Lisbon", "Oslo"]);
    expect(found.map((o) => o.key)).toEqual(["1", "2", "3"]);
  });

  // With no optionsValue, a Choice option's identity is the option itself. For an
  // object that must be the reference: `String(o)` is "[object Object]" for every
  // option, which substituted the held value for ALL of them.
  it("an object-valued Choice with no optionsValue merges and keys by reference", async () => {
    const red = { name: "Red" };
    const blue = { name: "Blue" };
    const held = red;
    const field: FieldHandle = {
      name: "Colour",
      mode: "edit",
      config: {
        kind: "Choice",
        multi: false,
        fillIn: false,
        radioButtons: false,
        options: [red, blue],
        optionsRender: (o) => (o as { name: string }).name,
      },
      displayName: "Colour",
      value: held,
      values: { Colour: held },
      visible: true,
      readOnly: false,
      enabled: true,
      required: false,
      errors: [],
      touched: false,
      render: undefined,
      setValue: () => {},
      markTouched: () => {},
      options: { mode: "list", load: () => Promise.resolve([red, blue]) },
    };
    let got: ReturnType<typeof useSelectionOptions> | undefined;
    function Probe() {
      got = useSelectionOptions(field, "", true);
      return null;
    }
    render(<Probe />);
    await waitFor(() => expect(got!.loading).toBe(false));

    const opts = got!.options;
    // Both still offered — not two copies of the held value.
    expect(texts(opts)).toEqual(["Red", "Blue"]);
    expect(opts[0]!.data).toBe(red);
    expect(opts[1]!.data).toBe(blue);
    // Keys are distinct, and the held value's key matches its own option's only.
    expect(new Set(opts.map((o) => o.key)).size).toBe(2);
    expect(got!.selectedItems.map((o) => o.key)).toEqual([opts[0]!.key]);
    // Stable across renders.
    expect(got!.optionsFor("").map((o) => o.key)).toEqual(
      opts.map((o) => o.key),
    );
  });
});

describe("availability sees the draft", () => {
  async function open(m: Mounted): Promise<string[]> {
    let found: OptionItem[] = [];
    await act(async () => {
      found = await m.resolveSuggestions("");
    });
    return texts(found);
  }

  it("a lookup's predicate reads a sibling field, and re-filters when it changes", async () => {
    const m = await renderLookup({
      sibling: "Title",
      // Ada may not pick Oslo; anyone else may.
      optionsFilter: (c) =>
        (c.values as Person).Title !== "Ada" ||
        (c.option as Office).Title !== "Oslo",
    });
    expect(await open(m)).toEqual(["London", "Lisbon"]);
    m.setSibling("Bea");
    expect(await open(m)).toEqual(["London", "Lisbon", "Oslo"]);
  });

  it("a Choice's predicate reads a sibling field, and re-filters when it changes", async () => {
    const m = await renderChoice({
      title: "Ada",
      sibling: "Title",
      options: ["Open", "Closed", "Parked"],
      optionsFilter: (c) =>
        (c.values as Person).Title !== "Ada" || c.option !== "Parked",
    });
    expect(await open(m)).toEqual(["Open", "Closed"]);
    m.setSibling("Bea");
    expect(await open(m)).toEqual(["Open", "Closed", "Parked"]);
  });

  it("hands the predicate the field's own value and the form's mode", async () => {
    const seen: OptionContext[] = [];
    const m = await renderChoice({
      value: "Open",
      mode: "create",
      optionsFilter: (c) => {
        seen.push(c);
        return true;
      },
    });
    await open(m);
    expect(seen.length).toBeGreaterThan(0);
    for (const c of seen) {
      expect(c.value).toBe("Open");
      expect(c.mode).toBe("create");
    }
    expect(seen.map((c) => c.option)).toContain("Closed");
  });
});

describe("query mode", () => {
  const search = { optionsQueryAsync: searchesDisplayField<Person, Office>() };

  it("asks the source per term, debounced, capped by searchesDisplayField", async () => {
    const { provider } = await renderLookup(search);
    const box = screen.getByLabelText("Office");
    // Typing is a burst, and every keystroke would otherwise be a SharePoint read.
    fireEvent.change(box, { target: { value: "l" } });
    fireEvent.change(box, { target: { value: "lo" } });
    fireEvent.change(box, { target: { value: "lon" } });
    await waitFor(() => expect(provider.lastQuery().filter).toContain("lon"));
    // Exactly one narrowed read, for the whole word — the mount's cold read carries
    // no filter, so it is not in this list.
    expect(provider.queries.map((q) => q.filter).filter(Boolean)).toEqual([
      'contains(Title, "lon")',
    ]);
    expect(provider.lastQuery().top).toBe(OPTIONS_QUERY_TAKE);
    // The source searched; the answer is what it returned.
    expect(
      await screen.findByRole("button", { name: "London" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oslo" })).toBeNull();
  });

  it("the cap applies here and not to options or the default load", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      ID: i + 1,
      Title: `Office ${i + 1}`,
    }));

    const byDefault = await renderLookup({ rows: many });
    let found: OptionItem[] = [];
    await act(async () => {
      found = await byDefault.resolveSuggestions("");
    });
    expect(found).toHaveLength(150);
    expect(byDefault.provider.queries.map((q) => q.top)).not.toContain(
      OPTIONS_QUERY_TAKE,
    );
    document.body.innerHTML = "";

    const byOptions = await renderLookup({
      rows: many,
      options: ({ db }) => db.set(Office).toArrayAsync(),
    });
    await act(async () => {
      found = await byOptions.resolveSuggestions("");
    });
    expect(found).toHaveLength(150);
    expect(byOptions.provider.queries.map((q) => q.top)).not.toContain(
      OPTIONS_QUERY_TAKE,
    );
    document.body.innerHTML = "";

    const bySearch = await renderLookup({ rows: many, ...search });
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "office 1" },
    });
    await waitFor(() =>
      expect(bySearch.provider.lastQuery().filter).toContain("office 1"),
    );
    expect(bySearch.provider.lastQuery().top).toBe(OPTIONS_QUERY_TAKE);
  });

  it("sets the picked row as the field value", async () => {
    const { field } = await renderLookup(search);
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lon" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "London" }));
    expect(field.value).toMatchObject({ Title: "London" });
  });

  // The skins ask on every menu open, normally with "". Putting that ask behind the
  // debounce means an already loaded list blinks empty for the whole window each time
  // it opens, for an answer that was in hand before the click.
  it("answers a menu open on a settled load without waiting out the debounce", async () => {
    const { provider, resolveSuggestions } = await renderLookup(search);
    // The first ask also waits out the mount load, so the list is settled after it.
    await act(async () => {
      await resolveSuggestions("");
    });
    const readsBefore = provider.queries.length;
    // A microtask beats a zero-delay macrotask every time, so "answered" can only
    // mean the resolver never armed a timer.
    const second = resolveSuggestions("");
    const outcome = await Promise.race([
      second.then(() => "answered"),
      new Promise<string>((r) => setTimeout(() => r("still waiting"), 0)),
    ]);
    expect(outcome).toBe("answered");
    expect(texts(await second)).toEqual(["London", "Lisbon", "Oslo"]);
    expect(provider.queries).toHaveLength(readsBefore);
  });

  // A slow read for an earlier prefix can land while the newest keystroke is still
  // inside its debounce window. Answering the pending call with it shows the wrong
  // list AND leaves the right one with nobody waiting.
  //
  // Fake timers on purpose: "lands while the newest keystroke is still inside its
  // debounce window" is a timing claim, and on real timers it only holds if the test
  // outruns the window — a flake waiting for a loaded CI box. Here the window cannot
  // close until the test says so. (No waitFor/findBy while the clock is faked: their
  // polling runs on the faked timers.)
  it("waits for the load for the text last typed, not an earlier one that lands first", async () => {
    const gates: { query: string; release: (rows: Office[]) => void }[] = [];
    await renderLookup({
      optionsQueryAsync: ({ query }) =>
        new Promise<Office[]>((release) => {
          gates.push({ query, release });
        }),
    });
    vi.useFakeTimers();
    try {
      const box = screen.getByLabelText("Office");
      fireEvent.change(box, { target: { value: "lo" } });
      await act(async () => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      });
      // gates[0] is the first ask's cold load; gates[1] is "lo".
      expect(gates.map((g) => g.query)).toEqual(["", "lo"]);

      fireEvent.change(box, { target: { value: "lon" } });
      // "lon" is now inside its window, and stays there: the clock does not move
      // while the slower "lo" read lands.
      await act(async () => {
        gates[1]!.release([
          Object.assign(new Office(), { Id: 2, Title: "Lisbon" }),
        ]);
      });
      expect(gates).toHaveLength(2);
      expect(screen.queryByText("Lisbon")).toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      });
      expect(gates.map((g) => g.query)).toEqual(["", "lo", "lon"]);
      await act(async () => {
        gates[2]!.release([
          Object.assign(new Office(), { Id: 1, Title: "London" }),
        ]);
      });
      expect(screen.getByText("London")).toBeInTheDocument();
      expect(screen.queryByText("Lisbon")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says the load failed rather than that nothing matched", async () => {
    await renderLookup({
      optionsQueryAsync: async () => {
        throw new Error("offline");
      },
    });
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lon" },
    });
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });

  // The merge prepends the held value only to the list as it opens (an empty query);
  // a typed search is answered from the load alone. So a failed load answers a search
  // with nothing — offering the held value there would dress a broken read up as a
  // successful one.
  it("does not dress a failed load up as a hit on the held value", async () => {
    await renderLookup({
      value: { Id: 1, Title: "London" },
      optionsQueryAsync: async () => {
        throw new Error("offline");
      },
    });
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lon" },
    });
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    // Shown as the value (a <span>), not offered as a pick (a <button>).
    expect(screen.queryByRole("button", { name: "London" })).toBeNull();
    expect(screen.getByText("London").tagName).toBe("SPAN");
  });
});

describe("the value", () => {
  it("a single Choice pick writes the value, not the OptionItem", async () => {
    const { field } = await renderChoice({ value: "Open" });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "clo" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Closed" }));
    expect(field.value).toBe("Closed");
    expect(screen.getByText("Closed").tagName).toBe("SPAN");
  });

  it("a multi Choice writes an array", async () => {
    const { field } = await renderChoice({ multi: true, value: ["Open"] });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "clo" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Closed" }));
    expect(field.value).toEqual(["Open", "Closed"]);
  });

  it("a saved Choice value outside the loaded list still shows its text", async () => {
    const { resolveSuggestions } = await renderChoice({ value: "Archived" });
    // Shown as the value…
    expect(screen.getByText("Archived").tagName).toBe("SPAN");
    // …and still offered, so the form does not silently rewrite it.
    let found: OptionItem[] = [];
    await act(async () => {
      found = await resolveSuggestions("");
    });
    expect(texts(found)).toEqual(["Archived", "Open", "Closed"]);
  });

  it("a lookup pick writes the row object", async () => {
    const { field } = await renderLookup();
    fireEvent.change(screen.getByLabelText("Office"), {
      target: { value: "lis" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Lisbon" }));
    expect(field.value).toMatchObject({ Id: 2, Title: "Lisbon" });
  });
});
