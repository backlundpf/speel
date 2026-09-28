import { defineMigration } from "@speel/migrations";

export default defineMigration("20260824T1503_AddProjectLabels", {
  up(b) {
    b.addField("Projects", "Labels", (f) =>
      f.multiChoice(["Compliance", "Security", "Finance", "HR"], {
        displayName: "Labels",
        fillIn: false,
        displayAs: "Dropdown",
      }),
    );
  },
  down(b) {
    b.dropField("Projects", "Labels");
  },
});
