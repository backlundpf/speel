import { defineMigration } from "@speel/migrations";

export default defineMigration("20260608T1854_AddProjectStartDate", {
  up(b) {
    b.addField("Projects", "StartDate", (f) =>
      f.dateTime({
        displayName: "Start Date",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      }),
    );
  },
  down(b) {
    b.dropField("Projects", "StartDate");
  },
});
