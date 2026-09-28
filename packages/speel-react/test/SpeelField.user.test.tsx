import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useStore } from "@tanstack/react-form";
import type { ModelBuilder } from "@speel/core";
import {
  IdentityDbContext,
  Principal,
  initSpeelIdentity,
} from "@speel/identity";
import { FakeIdentityProvider } from "@speel/identity/testing";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  OwnerId?: number;
  Owner?: Principal;
}
class Ctx extends IdentityDbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    super.onModelCreating(mb);
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.hasOne(Principal, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId)
        .hasDisplayName("Owner");
    });
  }
}
const groups = [
  {
    Id: 12,
    Title: "Audit Members",
    LoginName: "Audit Members",
    PrincipalType: 8,
  },
];

/**
 * A site with more users than one read brings back, and the person we want at
 * the far end of it — Id 412, the 150th row in provider order. Any answer that
 * comes from scanning a page of this directory gets her wrong.
 */
const bigDirectory = [
  ...Array.from({ length: 149 }, (_, i) => ({
    Id: i + 1,
    Title: `User ${i + 1}`,
    LoginName: `i:0#.f|m|u${i + 1}@x`,
    Email: `u${i + 1}@x`,
    PrincipalType: 1,
  })),
  {
    Id: 412,
    Title: "Zoe Zephyr",
    LoginName: "i:0#.f|m|zoe@x",
    Email: "zoe@x",
    PrincipalType: 1,
  },
];

function Inner({ task }: { task: Task }) {
  const form = useEntityForm(task, "edit");
  // The draft's Owner id, so a test can tell the site's record from an id-less hit.
  const ownerId = useStore(
    form.form.store,
    (s) => (s.values as { Owner?: { Id?: number } | null }).Owner?.Id,
  );
  return (
    <EntityFormProvider value={form as never}>
      <SpeelField name="Owner" />
      <span data-testid="owner-id">{ownerId ?? ""}</span>
    </EntityFormProvider>
  );
}

describe("a principal-targeted lookup", () => {
  it("renders the people picker with an identity in context: searches, merges groups, ensures the picked person", async () => {
    const provider = makeFakeProvider({ Tasks: [], siteGroups: groups });
    const ctx = new Ctx({ provider } as never);
    const ids = new FakeIdentityProvider();
    // The site already knows Ada: ensure resolves the picker's id-less hit to her record.
    ids.seedUser({ Id: 7, Title: "Ada Lovelace", LoginName: "i:0#.f|m|ada@x" });
    const identity = initSpeelIdentity(ctx, (b) => b.useProvider(ids));
    const peopleSearch = async (q: string) =>
      q
        ? [
            {
              Title: "Ada Lovelace",
              LoginName: "i:0#.f|m|ada@x",
              PrincipalType: 1,
            },
          ]
        : [];
    const task = Object.assign(new Task(), { Id: 1 });
    render(
      <SpeelProvider
        db={ctx as never}
        ui={fakeAdapter}
        identity={identity}
        peopleSearch={peopleSearch}
      >
        <Inner task={task} />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Owner-search/), {
      target: { value: "A" },
    });
    await waitFor(() =>
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument(),
    );
    // A Principal target admits groups: the site's groups that match join the list.
    expect(screen.getByText("Audit Members")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    await waitFor(() => expect(ids.calls).toContain("ensureUserAsync"));
    // The field now holds the ensured record (the form's draft; the entity is
    // written on submit): the picker shows it as the selection.
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>("Owner").value).toBe(
        "Ada Lovelace",
      ),
    );
  });

  it("is still the people picker without an identity: peopleSearch suggests, and a picked id-less person is matched to the site's own record by login", async () => {
    const provider = makeFakeProvider({
      Tasks: [],
      principals: [
        {
          Id: 7,
          Title: "Ada Lovelace",
          LoginName: "i:0#.f|m|ada@x",
          PrincipalType: 1,
        },
      ],
    });
    const ctx = new Ctx({ provider } as never);
    // Graph-style search: names and logins, no site ids.
    const peopleSearch = async (q: string) =>
      q
        ? [
            {
              Title: "Ada Lovelace",
              LoginName: "i:0#.f|m|ada@x",
              PrincipalType: 1,
            },
          ]
        : [];
    const task = Object.assign(new Task(), { Id: 1 });
    render(
      <SpeelProvider
        db={ctx as never}
        ui={fakeAdapter}
        peopleSearch={peopleSearch}
      >
        <Inner task={task} />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Owner-search/), {
      target: { value: "A" },
    });
    await waitFor(() =>
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>("Owner").value).toBe(
        "Ada Lovelace",
      ),
    );
    // The draft holds the site's record (it carries the id the save needs), not the id-less hit.
    await waitFor(() =>
      expect(screen.getByTestId("owner-id")).toHaveTextContent("7"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("without an identity or a peopleSearch, the picker suggests the target's own rows", async () => {
    const provider = makeFakeProvider({
      Tasks: [],
      principals: [
        { Id: 7, Title: "Ada Lovelace", LoginName: "ada", PrincipalType: 1 },
        { Id: 8, Title: "Bob Byte", LoginName: "bob", PrincipalType: 1 },
      ],
    });
    const ctx = new Ctx({ provider } as never);
    const task = Object.assign(new Task(), { Id: 1 });
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Inner task={task} />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Owner-search/), {
      target: { value: "bo" },
    });
    await waitFor(() =>
      expect(screen.getByText("Bob Byte")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });

  // The refusal above is the right answer for a stranger and a DATA-LOSS bug for
  // a colleague: it also sets the field to undefined, so the save clears the
  // column. Resolution therefore asks the site about the one person picked; it
  // must not depend on how many rows a read of the directory brings back.
  it("without an identity, resolves a picked person the site knows only past the first page of users", async () => {
    const provider = makeFakeProvider(
      { Tasks: [], principals: bigDirectory },
      { applyFilter: true },
    );
    const ctx = new Ctx({ provider } as never);
    const peopleSearch = async (q: string) =>
      q
        ? [
            {
              Title: "Zoe Zephyr",
              LoginName: "i:0#.f|m|zoe@x",
              PrincipalType: 1,
            },
          ]
        : [];
    const task = Object.assign(new Task(), { Id: 1 });
    render(
      <SpeelProvider
        db={ctx as never}
        ui={fakeAdapter}
        peopleSearch={peopleSearch}
      >
        <Inner task={task} />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Owner-search/), {
      target: { value: "Z" },
    });
    await waitFor(() =>
      expect(screen.getByText("Zoe Zephyr")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoe Zephyr" }));
    // Accepted, with her site id — not refused, and not blanked.
    await waitFor(() =>
      expect(screen.getByTestId("owner-id")).toHaveTextContent("412"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    // It asked for HER, by login — not for a page of the site's users.
    expect(provider.lastQuery().filter).toContain("LoginName");
  });

  it("without anything wired, suggests a person past the first page — the directory read is narrowed at the source", async () => {
    const provider = makeFakeProvider(
      { Tasks: [], principals: bigDirectory },
      { applyFilter: true },
    );
    const ctx = new Ctx({ provider } as never);
    const task = Object.assign(new Task(), { Id: 1 });
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Inner task={task} />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Owner-search/), {
      target: { value: "zoe" },
    });
    await waitFor(() =>
      expect(screen.getByText("Zoe Zephyr")).toBeInTheDocument(),
    );
    expect(provider.lastQuery().filter).toContain("zoe");
  });

  it("without an identity, a pick the site does not know is refused with a reason rather than set id-less (the save would clear the column)", async () => {
    const provider = makeFakeProvider({ Tasks: [], principals: [] });
    const ctx = new Ctx({ provider } as never);
    const peopleSearch = async (q: string) =>
      q
        ? [{ Title: "Zed Zero", LoginName: "i:0#.f|m|zed@x", PrincipalType: 1 }]
        : [];
    const task = Object.assign(new Task(), { Id: 1 });
    render(
      <SpeelProvider
        db={ctx as never}
        ui={fakeAdapter}
        peopleSearch={peopleSearch}
      >
        <Inner task={task} />
      </SpeelProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Owner-search/), {
      target: { value: "Z" },
    });
    await waitFor(() =>
      expect(screen.getByText("Zed Zero")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zed Zero" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Zed Zero/),
    );
    expect(screen.getByLabelText<HTMLInputElement>("Owner").value).toBe("");
  });
});
