import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelModal } from "../src/surface/SpeelModal.js";
import { SpeelPanel } from "../src/surface/SpeelPanel.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
import type { ButtonProps } from "../src/adapter/SpeelUIAdapter.js";
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
const ctx = () =>
  new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
const wrap = (node: JSX.Element) =>
  render(
    <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
const entity = () => Object.assign(new Task(), { Id: 1, Title: "T" });

describe("surface chrome (fakeAdapter)", () => {
  it("modal shows fullscreen toggle + close + resize handle by default", () => {
    wrap(
      <SpeelModal open onOpenChange={() => {}} entity={entity()} mode="edit" />,
    );
    expect(screen.getByLabelText("Toggle fullscreen")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("fullscreen toggle flips data-fullscreen; close calls onOpenChange", () => {
    const onOpenChange = vi.fn();
    wrap(
      <SpeelModal
        open
        onOpenChange={onOpenChange}
        entity={entity()}
        mode="edit"
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-fullscreen", "false");
    fireEvent.click(screen.getByLabelText("Toggle fullscreen"));
    expect(dialog).toHaveAttribute("data-fullscreen", "true");
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("respects opt-outs and blocking", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        blocking
        resizable={false}
        fullscreenToggle={false}
        entity={entity()}
        mode="edit"
      />,
    );
    expect(screen.queryByLabelText("Toggle fullscreen")).toBeNull();
    expect(screen.queryByLabelText("Close")).toBeNull(); // blocking hides close
    expect(screen.queryByTestId("resize-handle")).toBeNull();
  });

  it("content variant opens maximized when defaultFullscreen is set", () => {
    wrap(
      <SpeelModal open onOpenChange={() => {}} defaultFullscreen>
        <p>body</p>
      </SpeelModal>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-fullscreen",
      "true",
    );
  });

  it("form variant opens maximized when defaultFullscreen is set", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        defaultFullscreen
        entity={entity()}
        mode="edit"
      />,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-fullscreen",
      "true",
    );
  });

  it("panel shows a resize handle by default and omits it when resizable=false", () => {
    const { rerender } = wrap(
      <SpeelPanel open onOpenChange={() => {}} entity={entity()} mode="edit" />,
    );
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
    rerender(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <SpeelPanel
          open
          onOpenChange={() => {}}
          resizable={false}
          entity={entity()}
          mode="edit"
        />
      </SpeelProvider>,
    );
    expect(screen.queryByTestId("resize-handle")).toBeNull();
  });
});

describe("surfaces forward ariaLabel (fakeAdapter)", () => {
  it("SpeelModal content variant", () => {
    wrap(
      <SpeelModal open onOpenChange={() => {}} ariaLabel="Named modal">
        body
      </SpeelModal>,
    );
    expect(
      screen.getByRole("dialog", { name: "Named modal" }),
    ).toBeInTheDocument();
  });

  it("SpeelPanel content variant", () => {
    wrap(
      <SpeelPanel open onOpenChange={() => {}} ariaLabel="Named panel">
        body
      </SpeelPanel>,
    );
    expect(
      screen.getByRole("dialog", { name: "Named panel" }),
    ).toBeInTheDocument();
  });

  it("SurfaceForm (form variant)", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        entity={entity()}
        mode="edit"
        ariaLabel="Named form"
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Named form" }),
    ).toBeInTheDocument();
  });
});

describe("surface style reaches the skin (fakeAdapter)", () => {
  const styleOf = () =>
    JSON.parse(screen.getByRole("dialog").getAttribute("data-style")!);

  it("content modal", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        title="M"
        style={{ height: "auto", top: "10px" }}
      >
        body
      </SpeelModal>,
    );
    expect(styleOf()).toEqual({ height: "auto", top: "10px" });
  });

  it("form modal", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        entity={entity()}
        mode="edit"
        style={{ height: "auto", top: "10px" }}
      />,
    );
    expect(styleOf()).toEqual({ height: "auto", top: "10px" });
  });

  it("content panel", () => {
    wrap(
      <SpeelPanel
        open
        onOpenChange={() => {}}
        title="P"
        style={{ width: "30vw" }}
      >
        body
      </SpeelPanel>,
    );
    expect(styleOf()).toEqual({ width: "30vw" });
  });

  it("showForm modal", async () => {
    function Opener() {
      const { showForm } = useSurfaces();
      return (
        <button
          onClick={() => {
            void showForm({
              surface: "modal",
              entity: entity(),
              style: { width: "50vw" },
            });
          }}
        >
          open
        </button>
      );
    }
    wrap(<Opener />);
    await act(async () => {
      fireEvent.click(screen.getByText("open"));
    });
    expect(styleOf()).toEqual({ width: "50vw" });
  });
});

describe("modal actions and description (fakeAdapter)", () => {
  it("an autoFocus action takes focus when the modal opens", () => {
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        title="M"
        actions={[
          { key: "a", text: "First", align: "start" },
          { key: "b", text: "Second" },
          { key: "c", text: "Third", autoFocus: true },
        ]}
      >
        body
      </SpeelModal>,
    );
    expect(document.activeElement).toBe(screen.getByText("Third"));
  });

  it("ariaDescribedBy reaches the dialog", () => {
    wrap(
      <SpeelModal open onOpenChange={() => {}} title="M" ariaDescribedBy="d">
        <p id="d">Described</p>
      </SpeelModal>,
    );
    expect(
      screen.getByRole("dialog", { description: "Described" }),
    ).toBeInTheDocument();
  });
});

describe("autoFocus finds its button by id, whatever the skin's Button renders", () => {
  it("a Button with an extra inner button still focuses the right action", () => {
    // A skin whose Button renders a second <button> (an info toggle) before its own.
    const ui = {
      ...fakeAdapter,
      Button: (p: ButtonProps) => (
        <span>
          <button tabIndex={-1} aria-label={`About ${p.text}`}>
            i
          </button>
          <button id={p.id} onClick={p.onClick}>
            {p.text}
          </button>
        </span>
      ),
    };
    render(
      <SpeelProvider db={ctx() as never} ui={ui}>
        <SpeelModal
          open
          onOpenChange={() => {}}
          title="M"
          actions={[
            { key: "delete", text: "Delete" },
            { key: "cancel", text: "Cancel", autoFocus: true },
          ]}
        >
          body
        </SpeelModal>
      </SpeelProvider>,
    );
    expect(document.activeElement).toBe(screen.getByText("Cancel"));
  });
});
