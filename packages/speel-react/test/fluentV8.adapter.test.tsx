import { describe, it, expect } from "vitest";
import { fluentV8Adapter } from "../src/fluent-v8/index.js";
import type { SpeelUIAdapter } from "../src/adapter/SpeelUIAdapter.js";

describe("fluentV8Adapter", () => {
  it("implements every SpeelUIAdapter member", () => {
    const keys: (keyof SpeelUIAdapter)[] = [
      "TextInput",
      "RichTextInput",
      "NumberInput",
      "Dropdown",
      "RadioGroup",
      "Checkbox",
      "DatePicker",
      "PeoplePicker",
      "Spinner",
      "FieldDisplay",
      "Table",
      "SearchBox",
    ];
    for (const k of keys) expect(typeof fluentV8Adapter[k]).toBe("function");
  });
});
