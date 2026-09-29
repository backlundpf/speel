import { describe, it, expect } from "vitest";
import {
  ModelBuilder,
  Entity,
  JsonShape,
  TextField,
  JsonField,
  MultiJsonField,
} from "../../../src/index.js";

@JsonShape()
class TaskDefinition {
  @TextField() Title?: string;
}

@Entity({ list: "Processes" })
class Process {
  Id?: number;
  @TextField() Title?: string;
  @MultiJsonField({ of: () => TaskDefinition }) Tasks?: TaskDefinition[];
  @JsonField({ of: () => TaskDefinition }) Headline?: TaskDefinition;
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(Process as never);
  return mb.build();
}

describe("a Json field in a model", () => {
  it("carries the shape's entity type and its multiplicity", () => {
    const et = model().findEntityType(Process as never)!;
    const tasks = et.findProperty("Tasks")!;
    const headline = et.findProperty("Headline")!;

    expect(tasks.config.kind).toBe("Json");
    expect(headline.config.kind).toBe("Json");
    const tasksConfig = tasks.config as {
      multi: boolean;
      shape: { ctor: unknown };
    };
    const headlineConfig = headline.config as {
      multi: boolean;
      shape: { ctor: unknown };
    };
    expect(tasksConfig.multi).toBe(true);
    expect(headlineConfig.multi).toBe(false);
    expect(tasksConfig.shape.ctor).toBe(TaskDefinition);
  });

  it("pulls the shape into the model even though nothing set()s it", () => {
    // The same transitive closure a navigation target gets: referenced, therefore present.
    const shape = model().findEntityType(TaskDefinition as never);
    expect(shape?.isEmbedded).toBe(true);
  });

  it("throws when the referenced class is not a shape", () => {
    class NotAShape {}
    @Entity({ list: "Broken" })
    class Broken {
      Id?: number;
      @JsonField({ of: () => NotAShape }) Thing?: NotAShape;
    }
    const mb = new ModelBuilder();
    mb.entity(Broken as never);
    expect(() => mb.build()).toThrow(/NotAShape.*@JsonShape/s);
  });
});
