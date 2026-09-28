import { describe, it, expect } from "vitest";
import { ChoiceFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/ChoiceFieldBuilder.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";

interface Opt {
  id: string;
  label: string;
}
const OPTS: Opt[] = [
  { id: "a", label: "Apple" },
  { id: "b", label: "Banana" },
];

const asChoice = (c: FieldConfig) =>
  c as Extract<FieldConfig, { kind: "Choice" }>;

describe("ChoiceFieldBuilder object options (presentation-only)", () => {
  it("stores the object option source, value key, and renderer in config", () => {
    const value = (o: Opt): string => o.id;
    const render = (o: Opt): string => o.label;
    const p = new ChoiceFieldBuilder<Opt>()
      .hasOptions(OPTS)
      .hasOptionsValue(value)
      .hasOptionsRender(render)
      .build("Fruit", false);
    expect(p.config.kind).toBe("Choice");
    expect(asChoice(p.config).options).toEqual(OPTS);
    expect(asChoice(p.config).optionsValue).toBe(value);
    expect(asChoice(p.config).optionsRender).toBe(render);
  });

  it("still accepts plain string options", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["A", "B"])
      .build("S", false);
    expect(asChoice(p.config).options).toEqual(["A", "B"]);
  });
});
