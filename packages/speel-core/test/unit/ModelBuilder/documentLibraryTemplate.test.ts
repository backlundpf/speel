import { describe, it, expect } from "vitest";
import { SpeelEntity } from "../../../src/SpeelEntity.js";
import { SpeelDocument } from "../../../src/SpeelDocument.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { Entity, Key } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import { TextField } from "../../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

/** A builder with the test principal source already registered. */
function newBuilder(): ModelBuilder {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  return mb;
}

/**
 * A SpeelDocument maps to a SharePoint document library, and provisioning has to
 * know that. The class already declares it — it carries the document brand the
 * builder reads — so requiring the author to repeat it in `@Entity` is what lets
 * the two disagree.
 */

class FluentReport extends SpeelDocument {
  Title: string | null = null;
}
class FluentTask extends SpeelEntity {
  Title: string | null = null;
}

@Entity({ list: "DecoratedReports" })
class DecoratedReport extends SpeelDocument {
  @Key public Id?: number = undefined;
  @TextField() public Title: string | null = null;
}

@Entity({ list: "DecoratedTasks" })
class DecoratedTask extends SpeelEntity {
  @Key public Id?: number = undefined;
  @TextField() public Title: string | null = null;
}

// A document that is deliberately provisioned as a plain list — the override must win.
@Entity({ list: "OverriddenReports", template: "genericList" })
class OverriddenReport extends SpeelDocument {
  @Key public Id?: number = undefined;
  @TextField() public Title: string | null = null;
}

@Entity({
  list: "AnnotatedReports",
  template: "documentLibrary",
  url: "Lists/AnnotatedReports",
  description: "Annotated",
  onQuickLaunch: true,
})
class AnnotatedReport extends SpeelDocument {
  @Key public Id?: number = undefined;
  @TextField() public Title: string | null = null;
}

describe("document library provisioning", () => {
  it("infers documentLibrary for a decorated SpeelDocument", () => {
    const mb = newBuilder();
    mb.entity(DecoratedReport);
    const et = mb.build().entityTypes.find((e) => e.ctor === DecoratedReport)!;
    expect(et.listProvisioning?.template).toBe("documentLibrary");
  });

  it("infers documentLibrary for a fluent SpeelDocument too", () => {
    const mb = newBuilder();
    mb.entity(FluentReport, (b) => {
      b.toList("FluentReports");
      b.property((e) => e.Title).isText();
    });
    const et = mb.build().entityTypes.find((e) => e.ctor === FluentReport)!;
    expect(et.listProvisioning?.template).toBe("documentLibrary");
  });

  it("leaves a plain SpeelEntity alone, so the snapshot default still applies", () => {
    const mb = newBuilder();
    mb.entity(DecoratedTask);
    mb.entity(FluentTask, (b) => {
      b.toList("FluentTasks");
      b.property((e) => e.Title).isText();
    });
    const model = mb.build();
    expect(
      model.entityTypes.find((e) => e.ctor === DecoratedTask)!.listProvisioning
        ?.template,
    ).toBeUndefined();
    expect(
      model.entityTypes.find((e) => e.ctor === FluentTask)!.listProvisioning
        ?.template,
    ).toBeUndefined();
  });

  it("an explicit template wins over the inference", () => {
    const mb = newBuilder();
    mb.entity(OverriddenReport);
    const et = mb.build().entityTypes.find((e) => e.ctor === OverriddenReport)!;
    expect(et.listProvisioning?.template).toBe("genericList");
  });

  it("an explicit fluent template wins over the inference", () => {
    const mb = newBuilder();
    mb.entity(FluentReport, (b) => {
      b.toList("FluentReports", { template: "genericList" });
      b.property((e) => e.Title).isText();
    });
    const et = mb.build().entityTypes.find((e) => e.ctor === FluentReport)!;
    expect(et.listProvisioning?.template).toBe("genericList");
  });

  it("carries the rest of the provisioning bag from @Entity", () => {
    const mb = newBuilder();
    mb.entity(AnnotatedReport);
    const p = mb
      .build()
      .entityTypes.find((e) => e.ctor === AnnotatedReport)!.listProvisioning;
    expect(p).toEqual({
      template: "documentLibrary",
      url: "Lists/AnnotatedReports",
      description: "Annotated",
      onQuickLaunch: true,
    });
  });
});
