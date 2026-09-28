import { ModelBuilder } from "../../../src/index.js";

class TaskDefinition {
  Title?: string;
}
class Process {
  Id?: number;
  Tasks?: TaskDefinition[];
  Headline?: TaskDefinition;
}

const mb = new ModelBuilder();
mb.entity(Process, (b) => {
  // An array of shapes takes the multi verb…
  b.property((e) => e.Tasks).isMultiJson({ of: () => TaskDefinition });
  // …and a single shape takes the singular one.
  b.property((e) => e.Headline).isJson({ of: () => TaskDefinition });

  // @ts-expect-error — a single shape is not a list of them.
  b.property((e) => e.Headline).isMultiJson({ of: () => TaskDefinition });
  // @ts-expect-error — a list of shapes is not one.
  b.property((e) => e.Tasks).isJson({ of: () => TaskDefinition });
});

export { mb };
