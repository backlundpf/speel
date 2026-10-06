import { expectTypeOf, it } from "vitest";
import type { SerializedEntity } from "../../../src/index.js";

class Step {
  Title?: string;
  At?: Date;
}
class Department {
  Id?: number;
  Title: string | null = null;
  Projects: Project[] | null = null;
}
class Project {
  Id?: number;
  readonly Created?: Date;
  Title: string | null = null;
  Head?: Step;
  Steps?: Step[];
  Department: Department | null = null;
  DepartmentId: number | null = null;
  describe(): string {
    return "";
  }
}

it("maps values, stubs navigations, drops methods and readonly", () => {
  type S = SerializedEntity<Project>;
  expectTypeOf<S["Created"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<S["Title"]>().toEqualTypeOf<string | null>();
  expectTypeOf<S["Head"]>().toEqualTypeOf<
    { Title?: string; At?: string } | undefined
  >();
  expectTypeOf<S["Steps"]>().toEqualTypeOf<
    { Title?: string; At?: string }[] | undefined
  >();
  expectTypeOf<S["Department"]>().toEqualTypeOf<{ Id: number } | null>();
  expectTypeOf<S>().not.toHaveProperty("describe");
  const s = {} as S;
  s.Created = "x"; // not readonly
});

it("full mode types loaded targets as stub-mode serialized entities", () => {
  type F = SerializedEntity<Project, "full">;
  expectTypeOf<NonNullable<F["Department"]>>().toEqualTypeOf<
    SerializedEntity<Department, "stub"> | { Id: number }
  >();
});
