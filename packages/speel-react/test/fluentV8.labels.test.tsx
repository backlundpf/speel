import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  V8TextInput,
  V8NumberInput,
  V8Dropdown,
  V8RadioGroup,
  V8Checkbox,
  V8DatePicker,
  V8PeoplePicker,
  V8FileInput,
  V8FieldDisplay,
} from "../src/fluent-v8/primitives.js";

const opts = [
  { key: "a", text: "Alpha", data: "a" },
  { key: "b", text: "Beta", data: "b" },
];
const noop = (): void => {};

/** Every field the v8 skin renders with chrome, and the label it is given. */
const fields: Array<[string, (label: string) => JSX.Element]> = [
  [
    "TextInput",
    (label) => <V8TextInput label={label} value="" onChange={noop} />,
  ],
  [
    "NumberInput",
    (label) => <V8NumberInput label={label} value={1} onChange={noop} />,
  ],
  [
    "Dropdown",
    (label) => (
      <V8Dropdown label={label} options={opts} value="a" onChange={noop} />
    ),
  ],
  [
    "Dropdown (multiselect)",
    (label) => (
      <V8Dropdown
        multiselect
        label={label}
        options={opts}
        value={["a"]}
        onChange={noop}
      />
    ),
  ],
  [
    "RadioGroup",
    (label) => (
      <V8RadioGroup label={label} options={opts} value="a" onChange={noop} />
    ),
  ],
  [
    "Checkbox",
    (label) => <V8Checkbox label={label} checked={false} onChange={noop} />,
  ],
  [
    "DatePicker",
    (label) => <V8DatePicker label={label} value={undefined} onChange={noop} />,
  ],
  [
    "PeoplePicker",
    (label) => (
      <V8PeoplePicker
        label={label}
        value={[]}
        onChange={noop}
        onResolveSuggestions={() => Promise.resolve([])}
      />
    ),
  ],
  [
    "FileInput",
    (label) => <V8FileInput label={label} value={undefined} onChange={noop} />,
  ],
  ["FieldDisplay", (label) => <V8FieldDisplay label={label}>x</V8FieldDisplay>],
];

describe("fluent-v8 field labels are associated with their controls", () => {
  it.each(fields)("%s is reachable by its label", (_name, renderField) => {
    render(renderField("First Name"));
    // The canonical selector: a screen reader and a test see the same name.
    expect(screen.getByLabelText("First Name")).toBeInTheDocument();
  });
});

/** DatePicker and ChoiceGroup overwrite or drop any aria-describedby handed to
 *  them, so they are absent here on purpose — see the skins doc. */
const describable: Array<[string, (d: string, e?: string) => JSX.Element]> = [
  [
    "TextInput",
    (description, error) => (
      <V8TextInput
        label="F"
        description={description}
        {...(error !== undefined ? { error } : {})}
        value=""
        onChange={noop}
      />
    ),
  ],
  [
    "NumberInput",
    (description, error) => (
      <V8NumberInput
        label="F"
        description={description}
        {...(error !== undefined ? { error } : {})}
        value={1}
        onChange={noop}
      />
    ),
  ],
  [
    "Dropdown",
    (description, error) => (
      <V8Dropdown
        label="F"
        description={description}
        {...(error !== undefined ? { error } : {})}
        options={opts}
        value="a"
        onChange={noop}
      />
    ),
  ],
  [
    "FileInput",
    (description, error) => (
      <V8FileInput
        label="F"
        description={description}
        {...(error !== undefined ? { error } : {})}
        value={undefined}
        onChange={noop}
      />
    ),
  ],
];

const describedText = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("fluent-v8 field help text is announced with the control", () => {
  it.each(describable)("%s points at its description", (_n, renderField) => {
    render(renderField("Two initials, no dots"));
    expect(describedText(screen.getByLabelText("F"))).toContain(
      "Two initials, no dots",
    );
  });

  it.each(describable)("%s points at its error too", (_n, renderField) => {
    render(renderField("Two initials, no dots", "Required"));
    const text = describedText(screen.getByLabelText("F"));
    expect(text).toContain("Required");
    expect(text).toContain("Two initials, no dots");
  });
});

/**
 * Fluent's DatePicker is the one field whose `isRequired` also switches on its
 * OWN validation, and `validateOnLoad` defaults to true — so a required date
 * announced itself as invalid before the user had touched anything, while every
 * other required field stayed quiet. Error messaging belongs to the chrome,
 * which shows it only once the field is touched.
 */
describe("a required date does not accuse the user on arrival", () => {
  // Asserted on `aria-invalid`, not on the message text: Fluent delay-renders
  // the text, so a queryByText runs before it appears and passes while the
  // field is still announcing itself invalid.
  const pristine = (): HTMLElement => {
    render(
      <V8DatePicker
        label="Due Date"
        required
        value={undefined}
        onChange={noop}
      />,
    );
    return screen.getByLabelText("Due Date");
  };

  it("is not marked invalid before anything is entered", () => {
    expect(pristine()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("is still marked required", () => {
    expect(pristine()).toHaveAttribute("aria-required", "true");
  });

  it("shows the chrome's error when the form supplies one", async () => {
    render(
      <V8DatePicker
        label="Due Date"
        required
        error="Due Date is required"
        value={undefined}
        onChange={noop}
      />,
    );
    expect(await screen.findByText("Due Date is required")).toBeInTheDocument();
  });
});

/**
 * An empty number column arrives as `null`, not `undefined` — the entity
 * declares `number | null`, and SpeelField cast that away before handing it to
 * the adapter. `String(null)` is the four-letter word "null", which is what
 * ended up sitting in the box.
 */
describe("an empty number field is empty, not the word null", () => {
  it("renders nothing for a null value", () => {
    render(
      <V8NumberInput
        label="Budget"
        value={null as unknown as number | undefined}
        onChange={noop}
      />,
    );
    expect(screen.getByLabelText("Budget")).toHaveValue("");
  });

  it("still renders a real number", () => {
    render(<V8NumberInput label="Budget" value={42} onChange={noop} />);
    expect(screen.getByLabelText("Budget")).toHaveValue("42");
  });
});
