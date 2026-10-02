---
"@speel/react": minor
---

One `actions` shape everywhere: forms (`SpeelForm`, `SpeelDocumentForm`), the surface content variant (`SpeelModal`/`SpeelPanel`) and the adapter's `MessageBar` take `actions?: SpeelAction[] | ReactNode` — an action array rendered as the skin's buttons, or any node rendered as-is in the action slot. `SpeelAction` gains `appearance` (`primary`/`secondary`/`subtle`/`danger`; `primary: true` stays a shorthand) and `align: "start" | "end"`; `ButtonProps.appearance` gains `"danger"` (v8: red primary button; shadcn: `destructive`). `MessageBarProps` gains `actions` and `multiline`; skins render actions with the exported `SpeelActionBar`. `SpeelFormAction` is now a deprecated alias of `SpeelAction<EntityForm>`. Forms, surface forms and `showForm` requests gain `allowEdit?: boolean | ((entity) => boolean)` (default `true`) for read-only display forms with no Edit path. Custom skins must handle `appearance: "danger"` and `MessageBarProps.actions`.
