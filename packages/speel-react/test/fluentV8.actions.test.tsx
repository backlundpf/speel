import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { fluentV8Adapter } from "../src/fluent-v8/index.js";
import { V8Button, V8MessageBar } from "../src/fluent-v8/primitives.js";
import { SpeelUIProvider } from "../src/SpeelUIProvider.js";

function inSkin(node: JSX.Element) {
  return render(<SpeelUIProvider ui={fluentV8Adapter}>{node}</SpeelUIProvider>);
}

describe("V8Button danger", () => {
  it("renders a primary (filled) button for danger", () => {
    inSkin(<V8Button text="Overwrite" appearance="danger" />);
    const btn = screen.getByRole("button", { name: "Overwrite" });
    expect(btn.className).toMatch(/ms-Button--primary/);
    expect(btn).toHaveAttribute("data-appearance", "danger");
  });
});

describe("V8MessageBar actions", () => {
  // Fluent's MessageBar delay-renders its children: find*, not get*.
  it("renders an action array in Fluent's action slot", async () => {
    const onClick = vi.fn();
    inSkin(
      <V8MessageBar
        intent="error"
        actions={[{ key: "r", text: "Re-check", onClick }]}
        multiline={false}
      >
        Load failed
      </V8MessageBar>,
    );
    const bar = (await screen.findByText("Load failed")).closest(
      ".ms-MessageBar",
    )!;
    expect(bar).not.toBeNull();
    expect(bar.className).toMatch(/singleline/);
    const btn = within(bar as HTMLElement).getByRole("button", {
      name: "Re-check",
    });
    expect(btn.closest(".ms-MessageBar-actions, [class*=actions]")).not.toBe(
      null,
    );
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
  it("renders a node as-is", async () => {
    inSkin(
      <V8MessageBar intent="info" actions={<a href="#d">Details</a>}>
        Heads up
      </V8MessageBar>,
    );
    expect(
      await screen.findByRole("link", { name: "Details" }),
    ).toBeInTheDocument();
  });
});
