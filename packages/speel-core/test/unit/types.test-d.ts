// test/unit/types.test-d.ts
import { describe, it, expectTypeOf } from "vitest";
import type { IEntity, EntityCtor, IListHandle } from "../../src/types.js";
import type { FilterBuilder } from "../../src/Query/FilterBuilder.js";
import type { FilterNode } from "../../src/Query/FilterNode.js";
import { EntityTypeBuilder } from "../../src/ModelBuilder/EntityTypeBuilder.js";
import type { PropertyBuilderFor } from "../../src/ModelBuilder/PropertyBuilder.js";

class Foo implements IEntity {
  Id?: number;
  Title?: string;
}

describe("shared types", () => {
  it("EntityCtor<T> is a parameterless constructor of T", () => {
    expectTypeOf<EntityCtor<Foo>>().toEqualTypeOf<new () => Foo>();
  });

  it("IListHandle is a tagged union of title / id forms", () => {
    expectTypeOf<IListHandle>().toEqualTypeOf<
      { kind: "title"; value: string } | { kind: "id"; value: string }
    >();
  });
});

describe("FilterBuilder conditional method gating", () => {
  class Blog {
    Id?: number;
    Title?: string;
    ViewCount?: number;
    IsPublished?: boolean;
    PublishedAt?: Date;
    Tags?: string[];
  }

  type FB = FilterBuilder<Blog>;

  it("string properties have string-only operators", () => {
    expectTypeOf<FB["Title"]["startsWith"]>().toBeFunction();
    expectTypeOf<FB["Title"]["endsWith"]>().toBeFunction();
    expectTypeOf<FB["Title"]["contains"]>().toBeFunction();
    expectTypeOf<FB["Title"]["in"]>().toBeFunction();
    // negative — startsWith should NOT exist on number
    // @ts-expect-error startsWith is not a method on number filter
    expectTypeOf<FB["ViewCount"]["startsWith"]>();
  });

  it("number properties have comparison operators; string ops are absent", () => {
    expectTypeOf<FB["ViewCount"]["gt"]>().toBeFunction();
    expectTypeOf<FB["ViewCount"]["between"]>().toBeFunction();
    // @ts-expect-error gt is not a method on string filter
    expectTypeOf<FB["Title"]["gt"]>();
  });

  it("boolean properties have isTrue/isFalse; date ops are absent", () => {
    expectTypeOf<FB["IsPublished"]["isTrue"]>().toBeFunction();
    expectTypeOf<FB["IsPublished"]["isFalse"]>().toBeFunction();
    // @ts-expect-error between is not a method on boolean filter
    expectTypeOf<FB["IsPublished"]["between"]>();
  });

  it("date properties have comparison + between; string ops absent", () => {
    expectTypeOf<FB["PublishedAt"]["gt"]>().toBeFunction();
    expectTypeOf<FB["PublishedAt"]["between"]>().toBeFunction();
    // @ts-expect-error startsWith is not a method on date filter
    expectTypeOf<FB["PublishedAt"]["startsWith"]>();
  });

  it("string[] (MultiChoice) properties have multichoice operators", () => {
    expectTypeOf<FB["Tags"]["contains"]>().toBeFunction();
    expectTypeOf<FB["Tags"]["containsAny"]>().toBeFunction();
    expectTypeOf<FB["Tags"]["isEmpty"]>().toBeFunction();
    // @ts-expect-error gt is not a method on multichoice filter
    expectTypeOf<FB["Tags"]["gt"]>();
  });

  it("all properties have universal operators eq, ne, isNull, isNotNull", () => {
    expectTypeOf<FB["Title"]["eq"]>().toBeFunction();
    expectTypeOf<FB["ViewCount"]["eq"]>().toBeFunction();
    expectTypeOf<FB["IsPublished"]["eq"]>().toBeFunction();
    expectTypeOf<FB["PublishedAt"]["isNull"]>().toBeFunction();
    expectTypeOf<FB["Tags"]["isNull"]>().toBeFunction();
  });
});

describe("FilterBuilder navigation traversal", () => {
  class Author {
    Id?: number;
    Title?: string;
    Age?: number;
  }
  class Post {
    Id?: number;
    Title?: string;
    AuthorId?: number;
    Author?: Author | null; // reference nav
    Comments?: Post[]; // collection nav
  }

  type FBPost = FilterBuilder<Post>;

  it("reference nav descends into a nested FilterBuilder", () => {
    // Discriminating assertion: the nav property IS a nested FilterBuilder.
    expectTypeOf<FBPost["Author"]>().toEqualTypeOf<FilterBuilder<Author>>();
    expectTypeOf<FBPost["Author"]["Title"]["startsWith"]>().toBeFunction();
    expectTypeOf<FBPost["Author"]["Age"]["gt"]>().toBeFunction();
  });

  it("scalar FK column keeps scalar operators", () => {
    expectTypeOf<FBPost["AuthorId"]["eq"]>().toBeFunction();
    // @ts-expect-error a number FK column has no startsWith
    expectTypeOf<FBPost["AuthorId"]["startsWith"]>();
  });

  it("collection nav is not traversable", () => {
    // @ts-expect-error cannot descend into a collection navigation
    expectTypeOf<FBPost["Comments"]["Title"]>();
  });
});

describe("PropertyBuilder method gating (method-absent)", () => {
  it("string exposes text/note/choice; number methods absent", () => {
    expectTypeOf<PropertyBuilderFor<string>["isText"]>().toBeFunction();
    expectTypeOf<PropertyBuilderFor<string>["isChoice"]>().toBeFunction();
    // @ts-expect-error isNumber is not available on a string property
    expectTypeOf<PropertyBuilderFor<string>["isNumber"]>();
  });
  it("optional string keeps string methods", () => {
    expectTypeOf<
      PropertyBuilderFor<string | undefined>["isNote"]
    >().toBeFunction();
  });
  it("number exposes number/currency; isText absent", () => {
    expectTypeOf<PropertyBuilderFor<number>["isCurrency"]>().toBeFunction();
    // @ts-expect-error isText is not available on a number property
    expectTypeOf<PropertyBuilderFor<number>["isText"]>();
  });
  it("string[] exposes isMultiChoice; single isChoice absent", () => {
    expectTypeOf<
      PropertyBuilderFor<string[]>["isMultiChoice"]
    >().toBeFunction();
    // @ts-expect-error single isChoice is not available on a string[] property
    expectTypeOf<PropertyBuilderFor<string[]>["isChoice"]>();
  });
  it("boolean/Date gating", () => {
    expectTypeOf<PropertyBuilderFor<boolean>["isBoolean"]>().toBeFunction();
    expectTypeOf<PropertyBuilderFor<Date>["isDateTime"]>().toBeFunction();
    // @ts-expect-error isDateTime is not available on a boolean property
    expectTypeOf<PropertyBuilderFor<boolean>["isDateTime"]>();
  });
});

describe("hasForeignKey selector typing", () => {
  class U {
    Id?: number;
  }
  class T2 {
    Id?: number;
  }
  class P {
    Id?: number;
    OwnerId?: number | null;
    TagsId?: number[] | null;
    Owner?: U | null;
    Tags?: T2[] | null;
  }

  it("withMany FK selector is typed to self with the right multiplicity", () => {
    const eb = new EntityTypeBuilder<P>(P);
    eb.hasOne(U, (e) => e.Owner)
      .withMany()
      .hasForeignKey((e) => e.OwnerId);
    eb.hasMany(T2, (e) => e.Tags)
      .withMany()
      .hasForeignKey((e) => e.TagsId);
  });
  it("a reference (scalar) nav rejects an array FK column", () => {
    const eb = new EntityTypeBuilder<P>(P);
    eb.hasOne(U, (e) => e.Owner)
      .withMany()
      // @ts-expect-error hasOne FK must be number, not number[]
      .hasForeignKey((e) => e.TagsId);
  });
  it("a collection (multi) nav rejects a scalar FK column", () => {
    const eb = new EntityTypeBuilder<P>(P);
    eb.hasMany(T2, (e) => e.Tags)
      .withMany()
      // @ts-expect-error hasMany().withMany() FK must be number[], not number
      .hasForeignKey((e) => e.OwnerId);
  });
});

describe("PropertyBuilder object-choice gating", () => {
  interface Opt {
    id: string;
    label: string;
  }

  it("an object property exposes isChoice (object mode)", () => {
    expectTypeOf<PropertyBuilderFor<Opt>["isChoice"]>().toBeFunction();
    // @ts-expect-error isText is not available on an object property
    expectTypeOf<PropertyBuilderFor<Opt>["isText"]>();
  });

  it("an object[] property exposes isMultiChoice", () => {
    expectTypeOf<PropertyBuilderFor<Opt[]>["isMultiChoice"]>().toBeFunction();
    // @ts-expect-error single isChoice is not available on an object[] property
    expectTypeOf<PropertyBuilderFor<Opt[]>["isChoice"]>();
  });

  it("string[] still exposes isMultiChoice (not the object branch)", () => {
    expectTypeOf<
      PropertyBuilderFor<string[]>["isMultiChoice"]
    >().toBeFunction();
  });
});
