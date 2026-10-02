import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DbContext, ModelBuilder, SpeelDocument } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import { SpeelDocumentForm } from "../src/form/SpeelDocumentForm.js";
import { SpeelModal } from "../src/surface/SpeelModal.js";
import { SpeelPanel } from "../src/surface/SpeelPanel.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
import { useSpeelUI } from "../src/context.js";
import {
  SpeelActionBar,
  isActionArray,
  resolveAppearance,
} from "../src/actions.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Locked?: boolean;
}
class Doc extends SpeelDocument {
  Title: string | null = null;
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
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}
function wrap(node: JSX.Element) {
  const ctx = new TCtx({
    provider: makeFakeProvider({ Tasks: [], Docs: [] }),
  } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}
const task = (over: Partial<Task> = {}) =>
  Object.assign(new Task(), { Id: 1, Title: "T", ...over });

describe("actions union helpers", () => {
  it("tells an action array from a node", () => {
    expect(isActionArray([])).toBe(true);
    expect(isActionArray([{ key: "a", text: "A" }])).toBe(true);
    expect(isActionArray(<span />)).toBe(false);
    expect(isActionArray([<span key="a" />])).toBe(false);
    expect(isActionArray("text")).toBe(false);
    expect(isActionArray(undefined)).toBe(false);
  });
  it("resolves appearance: explicit wins, primary is shorthand, default secondary", () => {
    expect(resolveAppearance({ key: "a", text: "A" })).toBe("secondary");
    expect(resolveAppearance({ key: "a", text: "A", primary: true })).toBe(
      "primary",
    );
    expect(
      resolveAppearance({
        key: "a",
        text: "A",
        primary: true,
        appearance: "danger",
      }),
    ).toBe("danger");
  });
});

describe("SpeelActionBar", () => {
  it("renders buttons with their appearance; start-aligned actions come first", () => {
    const onClick = vi.fn();
    wrap(
      <SpeelActionBar
        actions={[
          { key: "ok", text: "OK", appearance: "danger", onClick },
          { key: "help", text: "Help", align: "start", appearance: "subtle" },
        ]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Help", "OK"]);
    expect(buttons[1]).toHaveAttribute("data-appearance", "danger");
    expect(buttons[0]).toHaveAttribute("data-appearance", "subtle");
    fireEvent.click(buttons[1]!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("renders a node as-is", () => {
    wrap(<SpeelActionBar actions={<em>status text</em>} />);
    expect(screen.getByText("status text").tagName).toBe("EM");
  });
});

describe("forms: actions as a node", () => {
  it("SpeelForm renders a node footer in place of the default buttons", () => {
    wrap(
      <SpeelForm
        entity={task()}
        mode="edit"
        actions={<span>custom footer</span>}
      />,
    );
    expect(screen.getByText("custom footer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  it("SpeelForm array actions honour appearance and receive the form", () => {
    const onClick = vi.fn();
    wrap(
      <SpeelForm
        entity={task()}
        mode="edit"
        actions={[
          { key: "del", text: "Delete", appearance: "danger", onClick },
          { key: "go", text: "Go", primary: true },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-appearance",
      "danger",
    );
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute(
      "data-appearance",
      "primary",
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onClick.mock.calls[0]![0]).toHaveProperty("submit");
  });
});

describe("surfaces: content actions", () => {
  it("SpeelModal renders a node footer as-is", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        actions={
          <label>
            <input type="checkbox" /> Don&apos;t ask again
          </label>
        }
      >
        <p>body</p>
      </SpeelModal>,
    );
    expect(screen.getByLabelText(/ask again/)).toBeInTheDocument();
  });
  it("SpeelPanel renders a danger action", () => {
    const onClick = vi.fn();
    wrap(
      <SpeelPanel
        open
        onOpenChange={() => {}}
        actions={[
          {
            key: "x",
            text: "Overwrite",
            appearance: "danger",
            onClick: () => onClick(),
          },
        ]}
      >
        <p>body</p>
      </SpeelPanel>,
    );
    const btn = screen.getByRole("button", { name: "Overwrite" });
    expect(btn).toHaveAttribute("data-appearance", "danger");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});

describe("MessageBar actions", () => {
  function Bar(props: { actions: unknown; multiline?: boolean }) {
    const ui = useSpeelUI();
    return (
      <ui.MessageBar
        intent="error"
        actions={props.actions as never}
        {...(props.multiline !== undefined
          ? { multiline: props.multiline }
          : {})}
      >
        Load failed
      </ui.MessageBar>
    );
  }
  it("renders an action array as buttons in the bar", () => {
    const onClick = vi.fn();
    wrap(<Bar actions={[{ key: "r", text: "Re-check", onClick }]} multiline />);
    const bar = screen.getByRole("alert");
    fireEvent.click(within(bar).getByRole("button", { name: "Re-check" }));
    expect(onClick).toHaveBeenCalled();
  });
  it("renders a node as-is", () => {
    wrap(<Bar actions={<a href="#x">Details</a>} />);
    expect(
      within(screen.getByRole("alert")).getByRole("link", { name: "Details" }),
    ).toBeInTheDocument();
  });
});

describe("allowEdit", () => {
  it("SpeelForm: allowEdit=false hides Edit in view mode", () => {
    wrap(<SpeelForm entity={task()} mode="view" allowEdit={false} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("SpeelForm: the predicate sees the entity", () => {
    const pred = vi.fn((t: Task) => !t.Locked);
    const locked = task({ Locked: true });
    wrap(<SpeelForm entity={locked} mode="view" allowEdit={pred} />);
    expect(pred).toHaveBeenCalledWith(locked);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("SpeelForm: predicate true keeps Edit", () => {
    wrap(
      <SpeelForm entity={task()} mode="view" allowEdit={(t) => !t.Locked} />,
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
  it("SpeelDocumentForm: allowEdit=false hides Edit", () => {
    const doc = Object.assign(new Doc(), {
      Id: 7,
      Title: "Stored",
      FileLeafRef: "stored.pdf",
      FileRef: "/sites/dev/Docs/stored.pdf",
    });
    wrap(<SpeelDocumentForm entity={doc} mode="view" allowEdit={false} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("surface form: no Edit, Close still closes", () => {
    const onOpenChange = vi.fn();
    wrap(
      <SpeelPanel
        open
        onOpenChange={onOpenChange}
        entity={task()}
        mode="view"
        allowEdit={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("showForm forwards allowEdit", () => {
    function Opener() {
      const s = useSurfaces();
      return (
        <button
          onClick={() =>
            void s.showForm({
              entity: task(),
              mode: "view",
              allowEdit: () => false,
            })
          }
        >
          open
        </button>
      );
    }
    wrap(<Opener />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
