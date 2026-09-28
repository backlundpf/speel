import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FieldConfig } from "@speel/core";
import { FilterControl } from "../src/table/filter/controls.js";
import { fakeAdapter } from "./fakeAdapter.js";
import type {
  ComboboxProps,
  SpeelUIAdapter,
} from "../src/adapter/SpeelUIAdapter.js";

const base = { ui: fakeAdapter, fiscalStart: 10, onChange: vi.fn() };

describe("FilterControl", () => {
  it("text → emits a text criteria", () => {
    const onChange = vi.fn();
    render(
      <FilterControl
        {...base}
        onChange={onChange}
        label="Title"
        config={{ kind: "text" }}
        criteria={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "wid" },
    });
    expect(onChange).toHaveBeenCalledWith({ kind: "text", query: "wid" });
  });

  it("numberRange → emits min", () => {
    const onChange = vi.fn();
    render(
      <FilterControl
        {...base}
        onChange={onChange}
        label="Qty"
        config={{ kind: "numberRange" }}
        criteria={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Qty min"), {
      target: { value: "5" },
    });
    expect(onChange).toHaveBeenCalledWith({ kind: "numberRange", min: 5 });
  });

  it("boolean → All clears, Yes sets true", () => {
    const onChange = vi.fn();
    render(
      <FilterControl
        {...base}
        onChange={onChange}
        label="Done"
        config={{ kind: "boolean" }}
        criteria={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Done"), {
      target: { value: "yes" },
    });
    expect(onChange).toHaveBeenCalledWith({ kind: "boolean", value: true });
  });

  it("a select filter renders the combobox", () => {
    const fieldConfig = {
      kind: "Choice",
      options: ["Open", "Closed"],
      fillIn: false,
      radioButtons: false,
    } as unknown as FieldConfig;
    render(
      <FilterControl
        {...base}
        onChange={vi.fn()}
        label="Status"
        config={{ kind: "select", multi: true }}
        fieldConfig={fieldConfig}
        criteria={undefined}
      />,
    );
    expect(screen.getByLabelText("Status").tagName).toBe("INPUT");
  });

  it("typing narrows the options by their text", async () => {
    render(
      <FilterControl
        {...base}
        onChange={vi.fn()}
        label="Status"
        config={{ kind: "select", multi: true, options: ["Alpha", "Beta"] }}
        criteria={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "al" },
    });
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("picking adds to the selection and emits a select criteria", async () => {
    const onChange = vi.fn();
    render(
      <FilterControl
        {...base}
        onChange={onChange}
        label="Status"
        config={{ kind: "select", multi: true, options: ["Alpha", "Beta"] }}
        criteria={undefined}
      />,
    );
    fireEvent.focus(screen.getByLabelText("Status"));
    fireEvent.click(await screen.findByRole("button", { name: "Alpha" }));
    expect(onChange).toHaveBeenCalledWith({
      kind: "select",
      selected: ["Alpha"],
    });
  });

  it("removing the last one clears the criteria", () => {
    const onChange = vi.fn();
    let capturedOnChange: ComboboxProps["onChange"] | undefined;
    const ui: SpeelUIAdapter = {
      ...fakeAdapter,
      Combobox: (p) => {
        capturedOnChange = p.onChange;
        return <fakeAdapter.Combobox {...p} />;
      },
    };
    render(
      <FilterControl
        {...base}
        ui={ui}
        onChange={onChange}
        label="Status"
        config={{ kind: "select", multi: true, options: ["Alpha", "Beta"] }}
        criteria={{ kind: "select", selected: ["Alpha"] }}
      />,
    );
    capturedOnChange?.([]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("the boolean and date-preset filters are still dropdowns", () => {
    const boolean = render(
      <FilterControl
        {...base}
        onChange={vi.fn()}
        label="Done"
        config={{ kind: "boolean" }}
        criteria={undefined}
      />,
    );
    expect(screen.getByLabelText("Done").tagName).toBe("SELECT");
    boolean.unmount();

    render(
      <FilterControl
        {...base}
        onChange={vi.fn()}
        label="Due"
        config={{ kind: "dateRange", presets: ["thisFiscalQuarter"] }}
        criteria={undefined}
      />,
    );
    expect(screen.getByLabelText("Due preset").tagName).toBe("SELECT");
  });

  it("dateRange preset → fills from/to (federal Q for fixed clock)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4));
    const onChange = vi.fn();
    render(
      <FilterControl
        {...base}
        onChange={onChange}
        label="Due"
        config={{ kind: "dateRange", presets: ["thisFiscalQuarter"] }}
        criteria={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Due preset"), {
      target: { value: "thisFiscalQuarter" },
    });
    const arg = onChange.mock.calls[0]![0];
    expect(arg.kind).toBe("dateRange");
    expect((arg.from as Date).getMonth()).toBe(3); // April
    vi.useRealTimers();
  });

  it("dateRange preset sets criteria.preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4));
    const onChange = vi.fn();
    render(
      <FilterControl
        {...base}
        onChange={onChange}
        label="Due"
        config={{ kind: "dateRange", presets: ["thisFiscalQuarter"] }}
        criteria={undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Due preset"), {
      target: { value: "thisFiscalQuarter" },
    });
    expect(onChange.mock.calls[0]![0]).toMatchObject({
      kind: "dateRange",
      preset: "thisFiscalQuarter",
    });
    vi.useRealTimers();
  });
});
