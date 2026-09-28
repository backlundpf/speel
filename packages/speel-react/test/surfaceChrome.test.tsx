import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelModal } from "../src/surface/SpeelModal.js";
import { SpeelPanel } from "../src/surface/SpeelPanel.js";
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
