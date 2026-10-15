import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

const none = vi.fn();
const NAME = "Comments for item 7";
const opts = [{ key: "a", text: "Alpha", data: "a" }];

describe("shadcn field primitives are named by ariaLabel when they have no label", () => {
  it.each([
    ["TextInput", <ui.TextInput ariaLabel={NAME} value="" onChange={none} />],
    [
      "TextInput multiline",
      <ui.TextInput ariaLabel={NAME} multiline value="" onChange={none} />,
    ],
    [
      "NumberInput",
      <ui.NumberInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "Checkbox",
      <ui.Checkbox ariaLabel={NAME} checked={false} onChange={none} />,
    ],
    [
      "Dropdown",
      <ui.Dropdown
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "Dropdown multi",
      <ui.Dropdown
        ariaLabel={NAME}
        multiselect
        value={[]}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "RadioGroup",
      <ui.RadioGroup
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "DatePicker",
      <ui.DatePicker ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "Combobox",
      <ui.Combobox
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "PeoplePicker",
      <ui.PeoplePicker
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "FileInput",
      <ui.FileInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
  ])("%s", (_n, node) => {
    render(node);
    expect(screen.getAllByLabelText(NAME).length).toBeGreaterThan(0);
  });

  it("names the radiogroup itself, and the file input people reach", () => {
    render(
      <>
        <ui.RadioGroup
          ariaLabel={NAME}
          value={undefined}
          options={opts}
          onChange={none}
        />
        <ui.FileInput
          ariaLabel="Attachment"
          value={undefined}
          onChange={none}
        />
      </>,
    );
    expect(screen.getByRole("radiogroup", { name: NAME })).toBeInTheDocument();
    expect(screen.getByLabelText("Attachment")).not.toHaveStyle({
      display: "none",
    });
  });

  it("a visible label wins over ariaLabel", () => {
    render(
      <ui.TextInput label="Title" ariaLabel={NAME} value="" onChange={none} />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    expect(screen.queryByLabelText(NAME)).toBeNull();
  });

  it("placeholder on TextInput and NumberInput; IconButton ariaLabel", () => {
    render(
      <>
        <ui.TextInput
          ariaLabel="t"
          placeholder="Add a comment"
          value=""
          onChange={none}
        />
        <ui.NumberInput
          ariaLabel="n"
          placeholder="0.00"
          value={undefined}
          onChange={none}
        />
        <ui.IconButton iconName="Edit" title="Edit" ariaLabel="Edit item 7" />
      </>,
    );
    expect(screen.getByPlaceholderText("Add a comment")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit item 7" }),
    ).toBeInTheDocument();
  });

  it("buttons carry the aria fields", () => {
    render(
      <>
        <ui.Button
          text="Views"
          ariaExpanded={false}
          ariaHasPopup="menu"
          ariaControls="m1"
        />
        <ui.IconButton
          iconName="Filter"
          title="Filter"
          ariaExpanded
          ariaHasPopup="dialog"
          ariaControls="p1"
        />
      </>,
    );
    const views = screen.getByRole("button", { name: "Views" });
    expect(views).toHaveAttribute("aria-haspopup", "menu");
    expect(views).toHaveAttribute("aria-expanded", "false");
    expect(views).toHaveAttribute("aria-controls", "m1");
    const filter = screen.getByRole("button", { name: "Filter" });
    expect(filter).toHaveAttribute("aria-expanded", "true");
    expect(filter).toHaveAttribute("aria-controls", "p1");
  });
});
