import { describe, it } from "vitest";
import {
  Entity,
  SpeelEntity,
  TextField,
  NoteField,
  NumberField,
  CurrencyField,
  BooleanField,
  DateTimeField,
  ChoiceField,
  MultiChoiceField,
  ManyToOne,
  OneToOne,
  OneToMany,
  ManyToMany,
} from "../../../src/index.js";
import { TestSiteUser as SiteUser } from "../fakes/testPrincipals.js";

// These declarations are never executed — `npm run test:types` (tsc -p tsconfig.test.json)
// is the assertion. vitest does not run *.test-d.ts.
describe("decorated property declarations", () => {
  it("a readOnly member may be declared `?: T = undefined` on every field kind", () => {
    // DbSet.add() warns about (and never writes) a read-only property that holds a
    // value, so `= undefined` is the quiet initializer. Before the context type was
    // widened this whole class failed with TS1240.
    @Entity({ list: "ReadOnlyDecls" })
    class R extends SpeelEntity {
      @TextField({ readOnly: true }) public Name?: string = undefined;
      @NoteField({ readOnly: true }) public Body?: string = undefined;
      @NumberField({ columnName: "Legacy_x0020_Score", readOnly: true })
      public Score?: number = undefined;
      @CurrencyField({ readOnly: true }) public Cost?: number = undefined;
      @BooleanField({ readOnly: true }) public Locked?: boolean = undefined;
      @DateTimeField({ readOnly: true }) public Checked?: Date = undefined;
      @ChoiceField({ options: ["Lo", "Hi"], readOnly: true }) public Level?:
        "Lo" | "Hi" = undefined;
      @MultiChoiceField({ options: ["x", "y"], readOnly: true })
      public Tags?: string[] = undefined;
    }
    void R;
  });

  it("a readOnly navigation may be declared `?: T = undefined` too", () => {
    @Entity({ list: "ReadOnlyNavs" })
    class N extends SpeelEntity {
      @ManyToOne(() => SiteUser, { readOnly: true })
      public Approver?: SiteUser = undefined;
      @OneToOne(() => SiteUser, { readOnly: true }) public Delegate?: SiteUser =
        undefined;
      @OneToMany(() => N, { inverse: (n: N) => n.Parent })
      public Children?: N[] = undefined;
      @ManyToMany(() => SiteUser, { readOnly: true })
      public Watchers?: SiteUser[] = undefined;
      @ManyToOne(() => N, { inverse: (n: N) => n.Children })
      public Parent: N | null = null;
    }
    void N;
  });

  it("the `| null` declarations still compile unchanged (this is a widening)", () => {
    @Entity({ list: "NullableDecls" })
    class W extends SpeelEntity {
      @TextField({ maxLength: 80 }) public Title: string | null = null;
      @NumberField({ min: 0 }) public Hours: number | null = null;
      @BooleanField({}) public Billable: boolean | null = null;
      @DateTimeField({}) public Due: Date | null = null;
      @ChoiceField({ options: ["a", "b"] }) public Pick: "a" | "b" | null =
        null;
      @MultiChoiceField({ options: ["a", "b"] }) public Picks: string[] | null =
        null;
      @ManyToMany(() => SiteUser, {}) public Watchers: SiteUser[] | null = null;
    }
    void W;
  });

  it("the decorated type is still checked — widening admitted undefined, not anything", () => {
    @Entity({ list: "MismatchedDecls" })
    class M extends SpeelEntity {
      // @ts-expect-error — @NumberField does not accept a string property
      @NumberField({}) public Wrong: string | null = null;
      // @ts-expect-error — a collection decorator does not accept a scalar property
      @ManyToMany(() => SiteUser, {}) public AlsoWrong: SiteUser | null = null;
    }
    void M;
  });
});
