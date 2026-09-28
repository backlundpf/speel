# Settings

## What & when

Reach for settings when something should follow the _person_ rather than the browser or the
link: a saved table arrangement, a chosen theme, which view someone starts on.

It is the one thing in this package SharePoint does not already provide. The platform owns the
users, the groups, and the permissions, but there is nowhere to put "this person's preferences
for this app" — so identity ships a list for it, and the list carries item-level security so
the server, not a query, is what keeps one user out of another's rows.

The three places state can live are worth separating deliberately. The **URL** carries what is
shareable, because a link should reproduce what the sender was looking at. **Settings** carry
what is personal, because it should follow you to another machine. **Local storage** carries
what is disposable. Reaching for the wrong one is how a filter ends up either un-shareable or,
worse, shared with everybody.

## Canonical example

```ts
// The base class declares the list; extend it instead of DbContext.
export class AppContext extends IdentityDbContext {
  public things = this.set(Thing);
}
```

```tsx
// Reads are synchronous after the first load, so a preference renders correctly on first
// paint instead of flashing its default.
function ThemeToggle(): JSX.Element {
  const [dark, setDark, ready] = useUserSetting("theme.dark", false);
  return (
    <Toggle
      checked={dark}
      disabled={!ready}
      onChange={(_, checked) => setDark(Boolean(checked))}
    />
  );
}
```

Outside React, the store is reachable directly:

```ts
await identity.settings.set("theme.dark", true);
const all = await identity.settings.getAll();
```

## Capabilities

**`IdentityDbContext` declares the list.** Extending it is what puts `UserSetting` in your
model — and the reason it is a base class rather than a builder call is that the migrations CLI
constructs contexts directly, with no builder, to read the model it diffs against the snapshot.
A field initializer runs on every construction path; builder registration does not.

**One row per key, not one blob per user.** Two features writing different settings never touch
the same row, so they cannot clobber each other from two tabs. The key lives in the built-in
`Title` column, because SharePoint makes it required and a parallel `Key` column would leave
every row carrying a dead mandatory field.

**Values are JSON**, so a setting is anything serialisable — a boolean for dark mode, or the
nested descriptor a saved table view needs.

**`getAll` rather than per-key reads.** The list returns only the current user's rows — a
handful — so one query at startup beats N round trips and makes every later read synchronous.

**Writes are optimistic and debounced.** `useUserSetting` applies the new value immediately and
flushes after a pause, so three clicks of a toggle cost one round trip, and a `pagehide`
listener covers the case the debounce creates.

**Somewhere else, if you want it.** `useSettings(createLocalUserSettingsStore())` on the
identity builder puts preferences in `localStorage` instead — for an app that has not
provisioned the list, or a test — and any object implementing `UserSettingsStore` will do.

**Saved table views ride on this.** `useTableViews` stores a user's views as settings when
identity is wired, so an arrangement follows them to another machine without the app wiring
anything.

## Boundaries & gotchas

**Item-level security is what makes this per-user, and it is set at list creation.** The
migration that provisions `Speel User Settings` carries `readSecurity`/`writeSecurity` of
`'own'`. A list created without them will not acquire them from a later model change — there is
no `updateList` operation — and every user would read and write everyone else's rows.

**`identity.settings` needs `IdentityDbContext`.** On a context extending plain `DbContext` the
entity is not in the model, and the store throws an error naming the fix rather than failing
with a bare "not mapped" from inside a query.

**Nothing migrates.** A table's views live in `localStorage` until identity is wired, and in
settings afterwards; the two are different stores and nothing carries values between them.
Anyone with saved local views re-saves them once.

**`useUserSetting` works with no identity at all**, and stays inert: values last for the
session and `ready` never turns true. That is deliberate, so a component need not know how the
app is wired — but it does mean a preference that mysteriously fails to persist is usually a
missing `identity` prop on `SpeelProvider`, three files away.

**Settings are not a security boundary.** They are a user's own preferences, readable and
writable by that user through the SharePoint UI like any other list item. Nothing sensitive
belongs here.
