import { expectTypeOf } from "vitest";
import {
  Entity,
  JsonField,
  JsonShape,
  ModelBuilder,
  MultiJsonField,
  TextField,
} from "../../../src/index.js";

// A shape is embedded: it has no Id, so it shares no member with the all-optional
// IEntity. Every shape entry point must still accept it.
class PlainShape {
  Title?: string;
}

@JsonShape()
class DecoratedShape {
  @TextField() Title?: string;
}

const mb = new ModelBuilder();
mb.shape(PlainShape, (b) => {
  b.property((s) => s.Title).isText();
});
mb.shape(DecoratedShape);

@Entity({ list: "Processes" })
class Process {
  Id?: number;
  @JsonField({ of: () => PlainShape }) Headline?: PlainShape;
  @MultiJsonField({ of: () => DecoratedShape }) Tasks?: DecoratedShape[];
}

expectTypeOf(new Process().Headline).toEqualTypeOf<PlainShape | undefined>();

export { mb };
