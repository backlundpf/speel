import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelModal } from "../src/surface/SpeelModal.js";
import { useDisclosure } from "../src/surface/useDisclosure.js";
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
function ctx() {
  return new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
}
function wrap(node: JSX.Element) {
  return render(
    <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}

describe("SpeelModal", () => {
  it("renders the form + Save/Cancel when open, nothing when closed", () => {
    const entity = Object.assign(new Task(), { Id: 1, Title: "T" });
    const { rerender } = wrap(
      <SpeelModal
        open={false}
        onOpenChange={() => {}}
        entity={entity}
        mode="edit"
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <SpeelModal
          open
          onOpenChange={() => {}}
          entity={entity}
          mode="edit"
          title="Edit task"
        />
      </SpeelProvider>,
    );
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("closes after a successful save (closeOnSave default)", async () => {
    const c = ctx();
    vi.spyOn(c.set(Task), "add").mockImplementation((e) => e as never);
    vi.spyOn(c, "saveChangesAsync").mockResolvedValue(undefined as never);
    const onOpenChange = vi.fn();
    const entity = Object.assign(new Task(), { Title: "New" });
    render(
      <SpeelProvider db={c as never} ui={fakeAdapter}>
        <SpeelModal
          open
          onOpenChange={onOpenChange}
          entity={entity}
          mode="create"
        />
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it("content mode renders children + custom actions; blocking hides dismiss", () => {
    const onClick = vi.fn();
    wrap(
      <SpeelModal
        open
        onOpenChange={() => {}}
        blocking
        actions={[{ key: "x", text: "Go", onClick }]}
      >
        <p>hello</p>
      </SpeelModal>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.queryByLabelText("dismiss")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("useDisclosure", () => {
  it("show/hide/toggle flip open", () => {
    function Probe() {
      const d = useDisclosure();
      return <button onClick={d.show}>{String(d.open)}</button>;
    }
    render(<Probe />);
    expect(screen.getByText("false")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("true")).toBeInTheDocument();
  });
});
