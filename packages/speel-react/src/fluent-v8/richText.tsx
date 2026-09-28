import * as React from "react";
import { TextField, getTheme } from "@fluentui/react";
import { V8Field, chromeFrom, useFieldAria } from "./Field.js";
import type { RichTextInputProps } from "../adapter/SpeelUIAdapter.js";

// The editor (TipTap + ProseMirror) loads as its own chunk — forms without a rich
// text field never fetch it. @speel/react ships ESM, so this import() reaches the
// consumer's webpack intact and SPFx code-splits it.
const LazyRichTextEditor = React.lazy(() => import("./RichTextEditor.js"));

export class RichTextErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Placeholder(): JSX.Element {
  const theme = getTheme();
  return (
    <div
      aria-busy="true"
      style={{
        border: `1px solid ${theme.semanticColors.inputBorder}`,
        borderRadius: 2,
        minHeight: 128,
      }}
    />
  );
}

export function V8RichTextInput(p: RichTextInputProps): JSX.Element {
  // If the editor chunk can't load (offline, CDN broken), degrade to the plain
  // multiline TextField so the form stays usable.
  const chrome = chromeFrom(p);
  const aria = useFieldAria(chrome);
  // The fallback is a real TextField, so it takes the label the way the other
  // Fluent-owned controls do rather than the chrome's.
  const plainFallback = (
    <TextField
      multiline
      {...(p.label !== undefined ? { label: p.label } : {})}
      {...(aria.describedBy !== undefined
        ? { "aria-describedby": aria.describedBy }
        : {})}
      value={p.value}
      disabled={!!p.disabled}
      onChange={(_e, v) => p.onChange(v ?? "")}
      {...(p.onBlur ? { onBlur: p.onBlur } : {})}
    />
  );
  return (
    <V8Field chrome={chrome} aria={aria}>
      <RichTextErrorBoundary fallback={plainFallback}>
        <React.Suspense fallback={<Placeholder />}>
          <LazyRichTextEditor
            value={p.value}
            onChange={p.onChange}
            onBlur={p.onBlur}
            disabled={p.disabled}
            ariaLabelledBy={aria.labelId}
            ariaDescribedBy={aria.describedBy}
          />
        </React.Suspense>
      </RichTextErrorBoundary>
    </V8Field>
  );
}
