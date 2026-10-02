# JSON shapes

## What & when

Some values have structure but no rows of their own: a checklist of steps on a request, an
address on a vendor, a set of thresholds on a policy. A **shape** is a class declared with
`@JsonShape()` and the same field decorators an entity uses; a `Json` field stores one instance
(`@JsonField`) or an array of them (`@MultiJsonField`) as JSON inside a single Note column. Reach
for a shape when the value belongs to its row and is always read with it — when it needs its own
queries, its own permissions, or links from elsewhere, it is a related list
([relationships.md](relationships.md)).

## Canonical example

```ts
import {
  DbContext,
  DateTimeField,
  Entity,
  JsonShape,
  MultiJsonField,
  SpeelEntity,
  TextField,
} from "@speel/core";

@Entity({ list: "Requests" })
class Request extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;

  // `of` is a thunk, so the shape may be declared below the entity.
  @MultiJsonField({ of: () => TaskDefinition, displayName: "Tasks" })
  public Tasks: TaskDefinition[] | null = null;
}

@JsonShape()
class TaskDefinition {
  @TextField({ displayName: "Task", required: true }) Title?: string;
  @DateTimeField({ displayFormat: "DateOnly" }) DueDate?: Date;
}

class RequestContext extends DbContext {
  public requests = this.set(Request);
}

// A load hands back TaskDefinition instances with real Dates, not parsed JSON.
const request = await ctx.requests.findAsync(7);
request?.Tasks?.[0]?.DueDate?.getFullYear();
```

## Capabilities

### Declaring a shape

`@JsonShape()` declares a class with no rows of its own: the shape of a value stored inside a
`Json` field, serialized into a single Note column. It takes the same field decorators an
entity does, which is what lets `@speel/react` render one with no adapter of its own; the
fluent equivalent is `mb.shape(TaskDefinition, …)`.

```ts
@JsonShape()
class TaskDefinition {
  @TextField({ displayName: "Task" }) Title?: string;
  @DateTimeField({ displayFormat: "DateOnly" }) DueDate?: Date;
}
```

`@JsonField({ of: () => TaskDefinition })` on an entity property holds one instance;
`@MultiJsonField` holds an array — `of` is a thunk, so a shape may be declared after the entity
referencing it, the same circular-safety a navigation's target gets.

A shape holds field kinds only, no navigations — a `@ManyToOne` inside one is a
model-construction error, since a relationship has no FK column to expand once it is living in
a blob rather than a row. It needs a no-argument constructor, the same one a load runs to build
one from stored JSON, and it is not `set()`-able: there is no rowset to read.

On disk a `Json` column is a Note column underneath; the JSON inside is speel's own business,
invisible to provisioning and the schema reader. A load returns typed instances of the shape
class, not parsed JSON — real `Date`s, a Choice's declared option value — through each
property's `codec` ([modeling.md](modeling.md#field-refinements)). Keys the shape doesn't declare round-trip untouched on every save,
so an older client's save never deletes a field a newer model version added.

### In forms and tables

`@speel/react` renders a `Json` field with no adapter of its own: in a form, a fieldset of the
shape's visible properties (once per element, with reorder, remove, and Add for a multi
field); in a table, the shape's first visible property as the cell text. See
[fields](../../speel-react/docs/fields.md) and
[table sort, filter, and search](../../speel-react/docs/table-filtering.md).

> Stability: still settling — the first cycle of an editing surface.

## Boundaries & gotchas

- **A shape's validations are per property; a removed one leaves residue.** There is no
  shape-level rule spanning two properties (`DueDate` after `StartDate` has nowhere to live
  this cycle), and preserving unknown keys (above) means a deleted property still rides along
  in already-stored rows until something rewrites them — the price of not losing a newer
  client's field.
- **A shape is not queryable, and its Note column has an unguarded ~64k-character ceiling.**
  SharePoint cannot filter or sort inside a Note column, so `.filter()`/`.orderBy()` over a
  shape's properties is impossible by construction; nothing checks a shape's serialized size
  against the column's limit before a save either.
