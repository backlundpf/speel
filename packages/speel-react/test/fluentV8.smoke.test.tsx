import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { V8Field, useFieldAria } from "../src/fluent-v8/Field.js";
import {
  V8TextInput,
  V8NumberInput,
  V8Checkbox,
  V8FieldDisplay,
  V8Dropdown,
  V8RadioGroup,
  V8DatePicker,
  V8PeoplePicker,
  V8Button,
  V8IconButton,
  V8MessageBar,
  V8Dialog,
  V8Panel,
  V8Table,
  V8ProgressBar,
  V8Popover,
} from "../src/fluent-v8/primitives.js";

describe("V8Field chrome", () => {
  /** The chrome takes its ids from the hook, the way every primitive does. */
  function Harness(): JSX.Element {
    const chrome = {
      label: "Title",
      required: true,
      error: "Required",
      description: "help",
    };
    const aria = useFieldAria(chrome);
    return (
      <V8Field chrome={chrome} aria={aria}>
        <input
          id={aria.controlId}
          aria-labelledby={aria.labelId}
          aria-describedby={aria.describedBy}
        />
      </V8Field>
    );
  }

  it("renders label, error, and description around children", () => {
    render(<Harness />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("help")).toBeInTheDocument();
    // The label names the control rather than floating beside it.
    expect(screen.getByLabelText("Title").tagName).toBe("INPUT");
  });

  it("describes the control with the error and the description", () => {
    render(<Harness />);
    const ids = (
      screen.getByLabelText("Title").getAttribute("aria-describedby") ?? ""
    ).split(/\s+/);
    const text = ids
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(text).toContain("Required");
    expect(text).toContain("help");
  });
});

describe("Fluent v8 primitives smoke", () => {
  it("TextInput renders label + value", () => {
    render(<V8TextInput label="Title2" value="hi" onChange={() => {}} />);
    expect(screen.getByDisplayValue("hi")).toBeInTheDocument();
    expect(screen.getByText("Title2")).toBeInTheDocument();
  });
  it("NumberInput renders prefix adornment", () => {
    render(
      <V8NumberInput label="Budget" value={5} onChange={() => {}} prefix="$" />,
    );
    expect(screen.getByText("$")).toBeInTheDocument();
  });
  it("Checkbox renders its label", () => {
    render(<V8Checkbox label="Active2" checked onChange={() => {}} />);
    expect(screen.getByText("Active2")).toBeInTheDocument();
  });
  it("FieldDisplay shows children", () => {
    render(<V8FieldDisplay label="When3">2026-06-03</V8FieldDisplay>);
    expect(screen.getByText("2026-06-03")).toBeInTheDocument();
  });
  it("Dropdown renders its label", () => {
    render(
      <V8Dropdown
        label="Status2"
        value={undefined}
        onChange={() => {}}
        options={[{ key: "o", text: "Open", data: "o" }]}
      />,
    );
    expect(screen.getByText("Status2")).toBeInTheDocument();
  });
  it("RadioGroup renders its options", () => {
    render(
      <V8RadioGroup
        label="Pri2"
        value={undefined}
        onChange={() => {}}
        options={[{ key: "l", text: "Low2", data: "l" }]}
      />,
    );
    expect(screen.getByText("Low2")).toBeInTheDocument();
  });
  it("DatePicker renders its label", () => {
    render(
      <V8DatePicker
        label="When4"
        value={new Date("2026-06-03")}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("When4")).toBeInTheDocument();
  });
  it("PeoplePicker renders its label", () => {
    render(
      <V8PeoplePicker
        label="Owner2"
        value={[]}
        onChange={() => {}}
        onResolveSuggestions={async () => []}
      />,
    );
    expect(screen.getByText("Owner2")).toBeInTheDocument();
  });
  it("Button renders its text", () => {
    render(<V8Button text="Save" appearance="primary" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("IconButton renders an aria-labelled button", () => {
    render(<V8IconButton iconName="Edit" title="Edit" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
  it("MessageBar renders an error bar", () => {
    const { container } = render(
      <V8MessageBar intent="error">Boom</V8MessageBar>,
    );
    expect(container.querySelector(".ms-MessageBar--error")).toBeTruthy();
  });
  it("Dialog renders its body when open", () => {
    render(
      <V8Dialog open onOpenChange={() => {}} title="Edit">
        <div>dlgbody</div>
      </V8Dialog>,
    );
    expect(screen.getByText("dlgbody")).toBeInTheDocument();
  });
  // Whatever opened the modal (a combobox's Add row, a button) may still hold focus;
  // the modal takes it on open.
  it("Dialog moves focus to the first field in its body on open", async () => {
    render(
      <>
        <button>opener</button>
        <V8Dialog
          open
          onOpenChange={() => {}}
          title="New program"
          footer={<button>Save</button>}
        >
          <label>
            Title <input aria-label="Title" />
          </label>
        </V8Dialog>
      </>,
    );
    screen.getByText("opener").focus();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
  });
  it("Dialog with nothing to fill in focuses its own frame, not a footer button", async () => {
    render(
      <V8Dialog
        open
        onOpenChange={() => {}}
        title="Confirm"
        blocking
        fullscreenToggle={false}
        footer={<button>Delete</button>}
      >
        <p>Delete this project?</p>
      </V8Dialog>,
    );
    const frame = document.querySelector(".speel-modal") as HTMLElement;
    await waitFor(() => expect(frame).toHaveFocus());
    expect(screen.getByText("Delete")).not.toHaveFocus();
  });
  it("Dialog renders nothing when closed", () => {
    render(
      <V8Dialog open={false} onOpenChange={() => {}}>
        <div>dlgclosed</div>
      </V8Dialog>,
    );
    expect(screen.queryByText("dlgclosed")).toBeNull();
  });
  it("Panel renders its body when open", () => {
    render(
      <V8Panel open onOpenChange={() => {}} title="Side">
        <div>pnlbody</div>
      </V8Panel>,
    );
    expect(screen.getByText("pnlbody")).toBeInTheDocument();
  });
  it("Table renders a DetailsList", () => {
    const { container } = render(
      <V8Table
        columns={[
          {
            key: "a",
            header: "Col A",
            render: (r) => String((r as { a: string }).a),
          },
        ]}
        items={[{ a: "x" }]}
      />,
    );
    expect(container.querySelector(".ms-DetailsList")).toBeTruthy();
  });
  it("Table shows the empty message", () => {
    render(<V8Table columns={[]} items={[]} emptyMessage="None yet" />);
    expect(screen.getByText("None yet")).toBeInTheDocument();
  });
  it("V8Table fires onSortChange on a sortable header click", () => {
    const onSortChange = vi.fn();
    render(
      <V8Table
        columns={[
          {
            key: "Title",
            header: "Title",
            render: (r) => (r as { Title: string }).Title,
            sortable: true,
          },
        ]}
        items={[{ Title: "A" }]}
        sort={{ key: "Title", direction: "asc" }}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText("Title"));
    expect(onSortChange).toHaveBeenCalledWith("Title");
  });
  it("ProgressBar renders a progress indicator with its label", () => {
    const { container } = render(<V8ProgressBar label="Saving" value={0.5} />);
    expect(container.querySelector(".ms-ProgressIndicator")).toBeTruthy();
    expect(screen.getByText("Saving")).toBeInTheDocument();
  });
  it("Popover shows children when open", () => {
    render(
      <V8Popover open onOpenChange={() => {}} trigger={<button>anchor</button>}>
        <div>pop-body</div>
      </V8Popover>,
    );
    expect(screen.getByText("pop-body")).toBeInTheDocument();
  });
  it("V8Table renders a filter button for a headerFilter column", () => {
    render(
      <V8Table
        columns={[
          {
            key: "Status",
            header: "Status",
            render: (r) => String((r as { Status: string }).Status),
            headerFilter: { active: false, content: <div>ctl</div> },
          },
        ]}
        items={[{ Status: "Open" }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Filter Status" }),
    ).toBeInTheDocument();
  });
});

describe("v8 surface chrome", () => {
  it("V8Dialog renders a title bar with a fullscreen toggle + close, and toggles without throwing", () => {
    const onOpenChange = vi.fn();
    render(
      <V8Dialog open onOpenChange={onOpenChange} title="Hi">
        body
      </V8Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle fullscreen" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("V8Dialog opens maximized when asked, and the toggle still restores it", () => {
    render(
      <V8Dialog open onOpenChange={() => {}} title="Big" defaultFullscreen>
        body
      </V8Dialog>,
    );
    // Maximized: no resize handle, and the toggle offers the way back.
    expect(screen.queryByTestId("resize-handle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle fullscreen" }));
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("V8Dialog opens windowed by default", () => {
    render(
      <V8Dialog open onOpenChange={() => {}} title="Small">
        body
      </V8Dialog>,
    );
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("V8Panel mounts with a resize handle without throwing", () => {
    render(
      <V8Panel open onOpenChange={() => {}} title="Side">
        body
      </V8Panel>,
    );
    expect(screen.getByText("Side")).toBeInTheDocument();
  });
});
