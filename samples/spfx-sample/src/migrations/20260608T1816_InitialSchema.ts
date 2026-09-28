import { defineMigration } from "@speel/migrations";

export default defineMigration("20260608T1816_InitialSchema", {
  up(b) {
    b.createList("Programs", { template: "genericList" });
    b.createList("Projects", { template: "genericList" });
    b.createList("Tags", { template: "genericList" });
    b.addField("Programs", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 255 }),
    );
    b.addField("Projects", "Budget", (f) =>
      f.currency({
        displayName: "Budget",
        decimalPlaces: 2,
        currencyCode: "USD",
        min: 0,
      }),
    );
    b.addField("Projects", "Category", (f) =>
      f.choice(["eng", "ops", "mkt"], {
        displayName: "Category",
        fillIn: false,
        displayAs: "Dropdown",
      }),
    );
    b.addField("Projects", "Description", (f) =>
      f.note({
        displayName: "Description",
        richText: false,
        appendOnly: false,
        numberOfLines: 6,
      }),
    );
    b.addField("Projects", "DueDate", (f) =>
      f.dateTime({
        displayName: "Due Date",
        required: true,
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      }),
    );
    b.addField("Projects", "IsPublic", (f) =>
      f.boolean({ displayName: "Public" }),
    );
    b.addField("Projects", "Owner", (f) =>
      f.user({ displayName: "Owner", showField: "Title", multi: false }),
    );
    b.addField("Projects", "Priority", (f) =>
      f.choice(["Low", "Medium", "High", "Critical"], {
        displayName: "Priority",
        required: true,
        fillIn: false,
        displayAs: "Dropdown",
      }),
    );
    b.addField("Projects", "Program", (f) =>
      f.lookup({
        displayName: "Program",
        list: "Programs",
        showField: "Title",
        multi: false,
      }),
    );
    b.addField("Projects", "RepoUrl", (f) =>
      f.text({ displayName: "Repository URL", maxLength: 255 }),
    );
    b.addField("Projects", "Reviewers", (f) =>
      f.user({ displayName: "Reviewers", showField: "Title", multi: true }),
    );
    b.addField("Projects", "Status", (f) =>
      f.choice(["Planning", "Active", "On Hold", "Complete"], {
        displayName: "Status",
        required: true,
        fillIn: false,
        displayAs: "Dropdown",
      }),
    );
    b.addField("Projects", "Tags", (f) =>
      f.lookup({
        displayName: "Tags",
        list: "Tags",
        showField: "Title",
        multi: true,
      }),
    );
    b.addField("Projects", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 80 }),
    );
    b.addField("Tags", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 255 }),
    );
  },
  down(b) {
    b.dropList("Programs");
    b.dropList("Projects");
    b.dropList("Tags");
  },
});
