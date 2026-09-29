import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  SpeelEntityTable,
  type SpeelEntityTableHandle,
} from "../src/table/SpeelEntityTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SpeelEntityTable", () => {
  it("shows the spinner (with loadingMessage), then rows loaded from db.set(of)", async () => {
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [{ Id: 1, Title: "Loaded" }] }),
    } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelEntityTable of={Task} loadingMessage="Fetching…" />
      </SpeelProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Fetching…");
    await waitFor(() => expect(screen.getByText("Loaded")).toBeInTheDocument());
  });

  it("passes display props through to the inner table (emptyMessage)", async () => {
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [] }),
    } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelEntityTable of={Task} emptyMessage="Nothing here" />
      </SpeelProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Nothing here")).toBeInTheDocument(),
    );
  });

  it("renders a fetch error in a MessageBar", async () => {
    const provider = makeFakeProvider({ Tasks: [] });
    (
      provider as unknown as { getItemsPagedAsync: unknown }
    ).getItemsPagedAsync = async () => {
      throw new Error("boom");
    };
    const ctx = new TCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelEntityTable of={Task} />
      </SpeelProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("ref.reload() re-fetches", async () => {
    let rows = [{ Id: 1, Title: "First" }];
    const provider = makeFakeProvider({ Tasks: [] });
    (
      provider as unknown as { getItemsPagedAsync: unknown }
    ).getItemsPagedAsync = async () => ({ items: rows, nextCursor: null });
    const ctx = new TCtx({ provider } as never);

    const Harness: React.FC = () => {
      const ref = useRef<SpeelEntityTableHandle>(null);
      return (
        <SpeelProvider db={ctx as never} ui={fakeAdapter}>
          <button
            onClick={() => {
              rows = [{ Id: 2, Title: "Second" }];
              void ref.current?.reload();
            }}
          >
            go
          </button>
          <SpeelEntityTable of={Task} ref={ref} />
        </SpeelProvider>
      );
    };
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("First")).toBeInTheDocument());
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(screen.getByText("Second")).toBeInTheDocument());
  });

  it("reload() preserves applied column filters", async () => {
    const provider = makeFakeProvider({
      Tasks: [
        { Id: 1, Title: "Apple" },
        { Id: 2, Title: "Banana" },
      ],
    });
    const ctx = new TCtx({ provider } as never);
    const Harness: React.FC = () => {
      const ref = useRef<SpeelEntityTableHandle>(null);
      return (
        <SpeelProvider db={ctx as never} ui={fakeAdapter}>
          <button onClick={() => void ref.current?.reload()}>go</button>
          <SpeelEntityTable of={Task} ref={ref} columns={["Title"]} />
        </SpeelProvider>
      );
    };
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("Apple")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Filter Title" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "app" },
    });
    expect(screen.queryByText("Banana")).toBeNull();
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(screen.getByText("Apple")).toBeInTheDocument());
    expect(screen.getByText("Title: app")).toBeInTheDocument(); // filter badge survived the reload
    expect(screen.queryByText("Banana")).toBeNull();
  });

  it("forwards query to every fetch, including reload()", async () => {
    const provider = makeFakeProvider({ Tasks: [{ Id: 1, Title: "Q" }] });
    const ctx = new TCtx({ provider } as never);
    let calls = 0;
    const Harness: React.FC = () => {
      const ref = useRef<SpeelEntityTableHandle>(null);
      return (
        <SpeelProvider db={ctx as never} ui={fakeAdapter}>
          <button onClick={() => void ref.current?.reload()}>go</button>
          <SpeelEntityTable
            of={Task}
            ref={ref}
            query={(set) => {
              calls++;
              return set;
            }}
          />
        </SpeelProvider>
      );
    };
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("Q")).toBeInTheDocument());
    expect(calls).toBeGreaterThanOrEqual(1);
    const before = calls;
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it("forwards print to the inner table — button and handle alike", async () => {
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [{ Id: 1, Title: "Printable" }] }),
    } as never);
    const written: string[] = [];
    const fakeWin = {
      document: {
        write: (s: string) => written.push(s),
        close: () => undefined,
      },
      focus: () => undefined,
      print: () => undefined,
      close: () => undefined,
      addEventListener: () => undefined,
    };
    vi.spyOn(window, "open").mockReturnValue(fakeWin as unknown as Window);

    const ref = React.createRef<SpeelEntityTableHandle>();
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelEntityTable of={Task} ref={ref} print columns={["Title"]} />
      </SpeelProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Printable")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    ref.current!.print();
    expect(written.join("")).toContain("<td>Printable</td>");
  });

  it("expands a lookup column so it renders the related display value", async () => {
    class Program {
      Id?: number;
      Title?: string;
    }
    class Project {
      Id?: number;
      Title?: string;
      Program?: Program;
      ProgramId?: number;
    }
    class PCtx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Program, (b) => {
          b.toList("Programs");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
        mb.entity(Project, (b) => {
          b.toList("Projects");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
          b.hasOne(Program, (e) => e.Program)
            .withMany()
            .hasDisplayName("Program");
        });
      }
    }
    const provider = makeFakeProvider(
      {
        Projects: [{ ID: 1, Title: "P1", ProgramId: 7 }],
        Programs: [{ ID: 7, Title: "Alpha" }],
      },
      {
        joins: { Program: { foreignKey: "ProgramId", targetList: "Programs" } },
      },
    );
    const ctx = new PCtx({ provider } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelEntityTable of={Project} />
      </SpeelProvider>,
    );
    // Without the auto-expand the Program column would be blank (only the FK id is present).
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });
});
