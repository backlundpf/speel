import { DbContext, ModelBuilder } from "@speel/core";

export class Widget {
  Id?: number;
  Title?: string;
}

export class AppContext extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Widget, (b) => {
      b.toList("Widgets", { template: "genericList" });
      b.property((e) => e.Title)
        .isText()
        .isRequired();
    });
  }
}
