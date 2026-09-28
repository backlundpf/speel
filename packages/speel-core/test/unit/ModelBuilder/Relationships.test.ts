import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { NavigationConfigurationException } from "../../../src/errors.js";
import { TestSiteUser as SiteUser } from "../fakes/testPrincipals.js";

class Program {
  Id?: number;
  Title?: string;
}
class Tag {
  Id?: number;
  Title?: string;
}
class Comment {
  Id?: number;
  BlogId?: number;
  Blog?: Blog;
}
class Blog {
  Id?: number;
  Title?: string;
  Owner?: SiteUser;
  OwnerId?: number;
  Editors?: SiteUser[];
  EditorsId?: number[];
  Program?: Program;
  ProgramId?: number;
  Tags?: Tag[];
  TagsId?: number[];
  Comments?: Comment[];
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(SiteUser, (b) => b.toList("User Information List"));
  mb.entity(Program, (b) => {
    b.toList("Programs");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Tag, (b) => {
    b.toList("Tags");
    b.property((e) => e.Title).isText();
  });
  mb.entity(Comment, (b) => {
    b.toList("Comments");
    b.hasOne(Blog, (e) => e.Blog)
      .withMany((b2) => b2.Comments)
      .hasForeignKey((e) => e.BlogId);
  });
  mb.entity(Blog, (b) => {
    b.toList("Blogs");
    b.property((e) => e.Title).isText();
    b.hasOne(SiteUser, (e) => e.Owner)
      .withMany()
      .hasForeignKey((e) => e.OwnerId);
    b.hasMany(SiteUser, (e) => e.Editors)
      .withMany()
      .hasForeignKey((e) => e.EditorsId);
    b.hasOne(Program, (e) => e.Program)
      .withMany()
      .hasForeignKey((e) => e.ProgramId);
    b.hasMany(Tag, (e) => e.Tags)
      .withMany()
      .hasForeignKey((e) => e.TagsId);
    b.hasMany(Comment, (e) => e.Comments)
      .withOne((c) => c.Blog)
      .hasForeignKey((c) => c.BlogId);
  });
  return mb.build();
}

describe("relationship-owned FK column synthesis", () => {
  it("hasOne(SiteUser) synthesizes a scalar User column", () => {
    const fk = buildModel().findEntityType(Blog)!.findProperty("OwnerId")!;
    expect(fk.config.kind).toBe("Lookup");
    if (fk.config.kind === "Lookup") expect(fk.config.multi).toBe(false);
  });
  it("hasMany(SiteUser) synthesizes a multi-value User column", () => {
    const fk = buildModel().findEntityType(Blog)!.findProperty("EditorsId")!;
    expect(fk.config.kind).toBe("Lookup");
    if (fk.config.kind === "Lookup") expect(fk.config.multi).toBe(true);
  });
  it("hasOne(Program) synthesizes a scalar Lookup column with resolved target", () => {
    const m = buildModel();
    const fk = m.findEntityType(Blog)!.findProperty("ProgramId")!;
    expect(fk.config.kind).toBe("Lookup");
    if (fk.config.kind === "Lookup") {
      expect(fk.config.multi).toBe(false);
      expect(fk.config.target).toBe(m.findEntityType(Program));
    }
  });
  it("hasMany(Tag) synthesizes a multi-value Lookup column", () => {
    const fk = buildModel().findEntityType(Blog)!.findProperty("TagsId")!;
    expect(fk.config.kind).toBe("Lookup");
    if (fk.config.kind === "Lookup") expect(fk.config.multi).toBe(true);
  });
  it("bidirectional one-to-many shares one FK column on the child", () => {
    const m = buildModel();
    const comment = m.findEntityType(Comment)!;
    const blogNav = m.findEntityType(Blog)!.findNavigation("Comments")!;
    expect(comment.findProperty("BlogId")!.config.kind).toBe("Lookup");
    expect(blogNav.storage).toBe("inverse-fk");
    expect(blogNav.foreignKey).toBe(comment.findProperty("BlogId"));
    expect(blogNav.inverse).toBe(comment.findNavigation("Blog"));
  });
  it("throws when the target entity is not registered", () => {
    class Orphan {
      Id?: number;
    }
    class B {
      Id?: number;
      X?: Orphan;
      XId?: number;
    }
    const mb = new ModelBuilder();
    mb.entity(B, (b) => {
      b.toList("Bs");
      b.hasOne(Orphan, (e) => e.X)
        .withMany()
        .hasForeignKey((e) => e.XId);
    });
    expect(() => mb.build()).toThrow(NavigationConfigurationException);
  });
});

describe("RelationshipBuilder — full refinement surface", () => {
  class Prog {
    Id?: number;
    Title?: string;
  }
  class Proj {
    Id?: number;
    Title?: string;
    ProgramId?: number;
    Program?: Prog;
  }

  it("exposes hasDescription/isReadOnly/isIndexed and chains", () => {
    const mb = new ModelBuilder();
    mb.entity(Prog, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Proj, (b) => {
      b.toList("Projects");
      b.property((e) => e.Title).isText();
      b.hasOne(Prog, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId)
        .hasDescription("Owning program")
        .isReadOnly(false)
        .isIndexed();
    });
    expect(() => mb.build()).not.toThrow();
  });
});

describe("FK-name inference", () => {
  class Customer {
    Id?: number;
    Title?: string;
  }
  class Program {
    Id?: number;
    Title?: string;
    OwnedProjects?: Project[];
  }
  class Project {
    Id?: number;
    Title?: string;
    Program?: Program;
  }

  function build() {
    const mb = new ModelBuilder();
    mb.entity(Customer, (b) => {
      b.toList("Customers");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title).isText();
      b.hasMany(Project, (e) => e.OwnedProjects).withOne((p) => p.Program); // FK inferred on Project
    });
    mb.entity(Project, (b) => {
      b.toList("Projects");
      b.property((e) => e.Title).isText();
      b.hasOne(Program, (e) => e.Program).withMany((p) => p.OwnedProjects); // infers ProgramId
    });
    return mb.build();
  }

  it("infers <nav>Id when hasForeignKey is omitted", () => {
    const m = build();
    expect(m.findEntityType(Project)!.findProperty("ProgramId")).toBeDefined();
    expect(
      m.findEntityType(Project)!.findNavigation("Program")!.foreignKey
        .propertyName,
    ).toBe("ProgramId");
  });

  it("derives FK column as <lookupColumnName>Id when hasColumnName overrides the lookup name", () => {
    const mb = new ModelBuilder();
    class Mgr {
      Id?: number;
      Title?: string;
    }
    class Doc {
      Id?: number;
      Title?: string;
      Owner?: Mgr;
    }
    mb.entity(Mgr, (b) => {
      b.toList("Mgrs");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((e) => e.Title).isText();
      b.hasOne(Mgr, (e) => e.Owner)
        .withMany()
        .hasColumnName("Owner");
    });
    const m = mb.build();
    const fk = m.findEntityType(Doc)!.findNavigation("Owner")!.foreignKey;
    expect(fk.columnName).toBe("OwnerId");
  });

  it("throws when an inverse collection cannot infer its FK (no withOne selector)", () => {
    const mb = new ModelBuilder();
    class A {
      Id?: number;
      Bs?: B[];
    }
    class B {
      Id?: number;
    }
    mb.entity(A, (b) => {
      b.toList("As");
      b.hasMany(B, (e) => e.Bs).withOne();
    });
    mb.entity(B, (b) => {
      b.toList("Bs");
      b.property((e) => e.Id).isNumber();
    });
    expect(() => mb.build()).toThrow(/hasForeignKey/);
  });
});

describe("relationship refinement routing", () => {
  it("puts description on the nav, not the FK column", () => {
    const mb = new ModelBuilder();
    class Customer {
      Id?: number;
      Title?: string;
    }
    class Prog {
      Id?: number;
      Title?: string;
      Customer?: Customer;
    }
    mb.entity(Customer, (b) => {
      b.toList("Customers");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Prog, (b) => {
      b.toList("Progs");
      b.property((e) => e.Title).isText();
      b.hasOne(Customer, (e) => e.Customer)
        .withMany()
        .hasDescription("Owning customer");
    });
    const m = mb.build();
    const nav = m.findEntityType(Prog)!.findNavigation("Customer")!;
    expect(nav.description).toBe("Owning customer");
    expect(nav.foreignKey.description).toBeUndefined();
  });

  it("isReadOnly on an inverse collection marks the nav read-only but leaves the shared FK column writable", () => {
    const mb = new ModelBuilder();
    class Program2 {
      Id?: number;
      Title?: string;
      OwnedProjects?: Project2[];
    }
    class Project2 {
      Id?: number;
      Title?: string;
      Program?: Program2;
    }
    mb.entity(Program2, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title).isText();
      b.hasMany(Project2, (e) => e.OwnedProjects)
        .withOne((p) => p.Program)
        .isReadOnly();
    });
    mb.entity(Project2, (b) => {
      b.toList("Projects");
      b.property((e) => e.Title).isText();
      b.hasOne(Program2, (e) => e.Program)
        .withMany((p) => p.OwnedProjects)
        .isRequired();
    });
    const m = mb.build();
    expect(
      m.findEntityType(Program2)!.findNavigation("OwnedProjects")!.readOnly,
    ).toBe(true);
    expect(
      m.findEntityType(Project2)!.findProperty("ProgramId")!.readOnly,
    ).toBe(false);
  });

  it("throws when a column-level refinement is set on the inverse (withOne) side", () => {
    const mb = new ModelBuilder();
    class P {
      Id?: number;
      Cs?: C[];
    }
    class C {
      Id?: number;
      P?: P;
    }
    mb.entity(P, (b) => {
      b.toList("Ps");
      b.hasMany(C, (e) => e.Cs)
        .withOne((c) => c.P)
        .hasColumnName("Renamed");
    });
    mb.entity(C, (b) => {
      b.toList("Cs");
      b.hasOne(P, (e) => e.P).withMany((p) => p.Cs);
    });
    expect(() => mb.build()).toThrow(/inverse|withOne|owning side/i);
  });
});
