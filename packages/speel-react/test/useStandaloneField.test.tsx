import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import type { DbContext, FieldConfig } from "@speel/core";
import { useStandaloneField } from "../src/form/useStandaloneField.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { UIAdapterContext } from "../src/context.js";
import { fakeAdapter } from "./fakeAdapter.js";

const textConfig: FieldConfig = {
  kind: "Text",
  multiline: false,
  maxLength: 255,
};

function Standalone() {
  const [v, setV] = useState("");
  const f = useStandaloneField<string>({
    config: textConfig,
    displayName: "Search",
    value: v,
    onChange: setV,
  });
  return (
    <fakeAdapter.TextInput
      label={f.displayName}
      value={f.value}
      onChange={f.setValue}
    />
  );
}

function Toggleable({ enabled }: { enabled?: boolean }) {
  const [v, setV] = useState("");
  const f = useStandaloneField<string>({
    config: textConfig,
    displayName: "Search",
    value: v,
    onChange: setV,
    ...(enabled !== undefined ? { enabled } : {}),
  });
  return (
    <fakeAdapter.TextInput
      label={f.displayName}
      value={f.value}
      onChange={f.setValue}
      disabled={!f.enabled}
    />
  );
}

describe("useStandaloneField", () => {
  it("drives a controlled field with no DbContext", () => {
    render(<Standalone />);
    const input = screen.getByLabelText(/Search/);
    fireEvent.change(input, { target: { value: "hello" } });
    expect(input).toHaveValue("hello");
  });

  it("is enabled when the caller says nothing", () => {
    render(<Toggleable />);
    expect(screen.getByLabelText(/Search/)).toBeEnabled();
  });

  it("disables the control when the caller passes enabled: false", () => {
    render(<Toggleable enabled={false} />);
    expect(screen.getByLabelText(/Search/)).toBeDisabled();
  });
});

const choiceConfig = (
  over: Partial<Extract<FieldConfig, { kind: "Choice" }>> = {},
): FieldConfig => ({
  kind: "Choice",
  multi: false,
  fillIn: false,
  radioButtons: false,
  options: ["Open", "Closed", "Deferred"],
  ...over,
});

function StandaloneChoice({
  config,
  onPick,
}: {
  config: FieldConfig;
  onPick?: (v: string | null) => void;
}) {
  const [v, setV] = useState<string | null>(null);
  const f = useStandaloneField<string | null>({
    config,
    displayName: "Status",
    value: v,
    onChange: (next) => {
      setV(next);
      onPick?.(next);
    },
  });
  return <SpeelField field={f as FieldHandle} />;
}

/** The skin alone — no SpeelProvider, so no DbContext: a literal list needs none. */
const withSkinOnly = (ui: JSX.Element) =>
  render(
    <UIAdapterContext.Provider value={fakeAdapter}>
      {ui}
    </UIAdapterContext.Provider>,
  );

describe("useStandaloneField — a Choice", () => {
  it("offers a literal list with no provider at all", async () => {
    withSkinOnly(<StandaloneChoice config={choiceConfig()} />);
    fireEvent.focus(screen.getByLabelText(/Status/));
    expect(await screen.findByRole("button", { name: "Open" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Closed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deferred" })).toBeTruthy();
  });

  it("filters the literal list by the typed text", async () => {
    withSkinOnly(<StandaloneChoice config={choiceConfig()} />);
    fireEvent.change(screen.getByLabelText(/Status/), {
      target: { value: "clo" },
    });
    expect(await screen.findByRole("button", { name: "Closed" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deferred" })).toBeNull();
  });

  it("a pick writes the value through onChange", async () => {
    const picked: (string | null)[] = [];
    withSkinOnly(
      <StandaloneChoice
        config={choiceConfig()}
        onPick={(v) => picked.push(v)}
      />,
    );
    fireEvent.focus(screen.getByLabelText(/Status/));
    fireEvent.click(await screen.findByRole("button", { name: "Deferred" }));
    expect(picked).toEqual(["Deferred"]);
    expect(screen.getByText("Deferred").tagName).toBe("SPAN");
  });

  it("a thunk list reads the provider's DbContext when one is present", async () => {
    const seen: unknown[] = [];
    const db = { marker: "db" } as unknown as DbContext;
    render(
      <SpeelProvider db={db} ui={fakeAdapter}>
        <StandaloneChoice
          config={choiceConfig({
            options: (args) => {
              seen.push(args.db);
              return Promise.resolve(["Alpha", "Beta"]);
            },
          })}
        />
      </SpeelProvider>,
    );
    fireEvent.focus(screen.getByLabelText(/Status/));
    expect(await screen.findByRole("button", { name: "Beta" })).toBeTruthy();
    expect(seen[0]).toBe(db);
  });

  it("a thunk list with no provider says it needs one, rather than offering nothing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      withSkinOnly(
        <StandaloneChoice
          config={choiceConfig({ options: () => Promise.resolve(["A"]) })}
        />,
      ),
    ).toThrow(/SpeelProvider/);
    err.mockRestore();
  });
});
