import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  V8Checkbox,
  V8Combobox,
  V8DatePicker,
  V8Dropdown,
  V8FieldDisplay,
  V8FileInput,
  V8IconButton,
  V8NumberInput,
  V8PeoplePicker,
  V8RadioGroup,
  V8TextInput,
} from "../src/fluent-v8/primitives.js";

const opts = [{ key: "a", text: "Alpha", data: "a" }];
const none = vi.fn();
const NAME = "Comments for item 7";

describe("v8 field primitives are named by ariaLabel when they have no label", () => {
  it.each([
    ["TextInput", <V8TextInput ariaLabel={NAME} value="" onChange={none} />],
    [
      "TextInput multiline",
      <V8TextInput ariaLabel={NAME} multiline value="" onChange={none} />,
    ],
    [
      "NumberInput",
      <V8NumberInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "Checkbox",
      <V8Checkbox ariaLabel={NAME} checked={false} onChange={none} />,
    ],
    [
      "Dropdown",
      <V8Dropdown
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "RadioGroup",
      <V8RadioGroup
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "DatePicker",
      <V8DatePicker ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "PeoplePicker",
      <V8PeoplePicker
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "Combobox",
      <V8Combobox
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "FileInput",
      <V8FileInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    ["FieldDisplay", <V8FieldDisplay ariaLabel={NAME}>x</V8FieldDisplay>],
  ])("%s", (_name, ui) => {
    render(ui);
    expect(screen.getAllByLabelText(NAME).length).toBeGreaterThan(0);
  });

  it("names the radiogroup itself, and the file button people reach", () => {
    render(
      <>
        <V8RadioGroup
          ariaLabel={NAME}
          value={undefined}
          options={opts}
          onChange={none}
        />
        <V8FileInput ariaLabel="Attachment" value={undefined} onChange={none} />
      </>,
    );
    expect(screen.getByRole("radiogroup", { name: NAME })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Attachment/ }),
    ).toBeInTheDocument();
  });

  it("a visible label wins over ariaLabel", () => {
    render(
      <V8TextInput label="Title" ariaLabel={NAME} value="" onChange={none} />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    expect(screen.queryByLabelText(NAME)).toBeNull();
  });
});

describe("placeholder and autoGrow", () => {
  it("TextInput and NumberInput show a placeholder", () => {
    render(
      <>
        <V8TextInput
          ariaLabel="t"
          placeholder="Add a comment"
          value=""
          onChange={none}
        />
        <V8NumberInput
          ariaLabel="n"
          placeholder="0.00"
          value={undefined}
          onChange={none}
        />
      </>,
    );
    expect(screen.getByPlaceholderText("Add a comment")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
  });

  it("autoGrow sizes a multiline box from its content (Fluent writes an inline height)", () => {
    render(
      <>
        <V8TextInput
          ariaLabel="grow"
          multiline
          autoGrow
          value="x"
          onChange={none}
        />
        <V8TextInput ariaLabel="fixed" multiline value="x" onChange={none} />
      </>,
    );
    expect(screen.getByLabelText("grow").style.height).not.toBe("");
    expect(screen.getByLabelText("fixed").style.height).toBe("");
  });
});

describe("V8IconButton ariaLabel", () => {
  it("names the button while the tooltip stays the title", () => {
    render(
      <V8IconButton iconName="Edit" title="Edit" ariaLabel="Edit item 7" />,
    );
    const b = screen.getByRole("button", { name: "Edit item 7" });
    expect(b).toHaveAttribute("title", "Edit");
  });
});
