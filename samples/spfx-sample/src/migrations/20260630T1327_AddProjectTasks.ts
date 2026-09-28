import { defineMigration } from "@speel/migrations";

export default defineMigration("20260630T1327_AddProjectTasks", {
  up(b) {
    b.createList("TaskComments", { template: "genericList" });
    b.createList("Tasks", { template: "genericList" });
    b.addField("TaskComments", "Body", (f) =>
      f.note({
        displayName: "Comment",
        required: true,
        richText: false,
        appendOnly: false,
        numberOfLines: 6,
      }),
    );
    b.addField("TaskComments", "Task", (f) =>
      f.lookup({
        displayName: "Task",
        list: "Tasks",
        showField: "Title",
        multi: false,
      }),
    );
    b.addField("Tasks", "Cost", (f) =>
      f.currency({
        displayName: "Cost",
        decimalPlaces: 2,
        currencyCode: "USD",
        min: 0,
      }),
    );
    b.addField("Tasks", "Details", (f) =>
      f.note({
        displayName: "Details",
        richText: true,
        appendOnly: false,
        numberOfLines: 6,
      }),
    );
    b.addField("Tasks", "DueDate", (f) =>
      f.dateTime({
        displayName: "Due Date",
        displayFormat: "DateTime",
        friendlyFormat: "Disabled",
      }),
    );
    b.addField("Tasks", "EstimateHours", (f) =>
      f.number({ displayName: "Estimate (h)", min: 0, decimalPlaces: 1 }),
    );
    b.addField("Tasks", "IsBillable", (f) =>
      f.boolean({ displayName: "Billable" }),
    );
    b.addField("Tasks", "Labels", (f) =>
      f.multiChoice(["frontend", "backend", "design", "ops"], {
        displayName: "Labels",
        fillIn: false,
        displayAs: "Dropdown",
      }),
    );
    b.addField("Tasks", "Project", (f) =>
      f.lookup({
        displayName: "Project",
        list: "Projects",
        showField: "Title",
        multi: false,
      }),
    );
    b.addField("Tasks", "Status", (f) =>
      f.choice(["To Do", "In Progress", "Blocked", "Done"], {
        displayName: "Status",
        required: true,
        fillIn: false,
        displayAs: "RadioButtons",
      }),
    );
    b.addField("Tasks", "Tags", (f) =>
      f.lookup({
        displayName: "Tags",
        list: "Tags",
        showField: "Title",
        multi: true,
      }),
    );
    b.addField("Tasks", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 120 }),
    );
    b.alterField("Tags", "Title", (f) =>
      f.text({
        displayName: "Title",
        required: true,
        maxLength: 255,
        minLength: 3,
      }),
    );
  },
  down(b) {
    b.dropList("TaskComments");
    b.dropList("Tasks");
    b.alterField("Tags", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 255 }),
    );
  },
});
