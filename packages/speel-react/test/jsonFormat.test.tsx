import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ModelBuilder } from "@speel/core";
import { formatFieldValue } from "../src/fields/format.js";

function text(node: React.ReactNode): string {
  const { container } = render(<>{node}</>);
  return container.textContent ?? "";
}

// A shape with Title first, Notes second.
class TaskDefinition {
  Title?: string;
  Notes?: string;
}

class Process {
  Id?: number;
  Title?: string;
  Headline?: TaskDefinition;
  Tasks?: TaskDefinition[];
}

// Real model, built with the fluent API (the packages this test lives in has no
// decorator transform wired into vitest — see packages/speel-core/vitest.config.ts's
// unplugin-swc note — so it follows the fluent idiom the rest of this package's
// tests already use, not the @Entity/@JsonField decorators jsonField.model.test.ts
// shows on the core side).
function fieldConfigs() {
  const mb = new ModelBuilder();
  mb.shape(TaskDefinition, (b) => {
    b.property((e) => e.Title).isText();
    b.property((e) => e.Notes).isText();
  });
  mb.entity(Process, (b) => {
    b.toList("Processes");
    b.property((e) => e.Id).isNumber();
    b.property((e) => e.Title).isText();
    b.property((e) => e.Headline).isJson({ of: () => TaskDefinition });
    b.property((e) => e.Tasks).isMultiJson({ of: () => TaskDefinition });
  });
  const et = mb.build().findEntityType(Process as never)!;
  return {
    single: et.findProperty("Headline")!.config,
    multi: et.findProperty("Tasks")!.config,
  };
}

describe("formatFieldValue: Json", () => {
  const { single, multi } = fieldConfigs();

  it("single → the shape's headline property", () => {
    expect(
      text(formatFieldValue(single, { Title: "Review", Notes: "irrelevant" })),
    ).toBe("Review");
  });

  it("multi → headlines joined", () => {
    expect(
      text(
        formatFieldValue(multi, [
          { Title: "Review", Notes: "a" },
          { Title: "Approve", Notes: "b" },
        ]),
      ),
    ).toBe("Review, Approve");
  });

  it("empty → the EMPTY placeholder", () => {
    expect(text(formatFieldValue(single, undefined))).toBe("—");
  });

  it("an element whose first visible property is unset contributes nothing to the join", () => {
    expect(
      text(
        formatFieldValue(multi, [
          { Notes: "no title here" },
          { Title: "Approve" },
        ]),
      ),
    ).toBe("Approve");
  });

  it("present but saying nothing → the EMPTY placeholder, like any other empty cell", () => {
    // The value is there, so formatFieldValue's own isEmpty guard never fires — but
    // no element has a headline, so there is nothing to show. A blank here would make
    // Json the one kind whose empty display differs from every other field's.
    expect(text(formatFieldValue(single, { Notes: "no title here" }))).toBe(
      "—",
    );
    expect(text(formatFieldValue(multi, [{ Notes: "a" }, {}]))).toBe("—");
  });
});
