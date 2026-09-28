import { describe, it, expect } from "vitest";
import { TextFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";

interface Opt {
  id: string;
  label: string;
}
const OPTS: Opt[] = [
  { id: "a", label: "Apple" },
  { id: "b", label: "Banana" },
];

describe("FieldBuilderBase.hasCodec", () => {
  it("stores a bidirectional codec on the built Property", () => {
    const p = new TextFieldBuilder()
      .hasCodec<Opt, string>({
        toProvider: (o) => o.id,
        fromProvider: (s) => OPTS.find((o) => o.id === s)!,
      })
      .build("Fruit", false);
    expect(p.codec).toBeDefined();
    expect(p.codec!.toProvider!({ id: "a", label: "Apple" })).toBe("a");
    expect(p.codec!.fromProvider!("b")).toEqual({
      id: "b",
      label: "Banana",
    });
  });

  it("leaves codec undefined when hasCodec is not called", () => {
    expect(new TextFieldBuilder().build("X", false).codec).toBeUndefined();
  });
});
