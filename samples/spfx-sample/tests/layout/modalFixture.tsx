// Bundled by modalLayout.spec.ts: both skins' modals, one at a time. The spec calls
// `window.showModal(skin, style)` to open one and `window.setLines(n)` to change how much
// content it holds, then measures the frame in place.
import * as React from "react";
import * as ReactDOM from "react-dom";
import { createTheme, loadTheme } from "@fluentui/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import type { DialogProps, ModalStyle } from "@speel/react";
import { ShadDialog } from "@/components/speel/overlays";

loadTheme(
  createTheme({
    defaultFontStyle: { fontFamily: "'Liberation Sans', Arial, sans-serif" },
  }),
);

const skins: Record<string, React.ComponentType<DialogProps>> = {
  v8: fluentV8Adapter.Dialog!,
  shadcn: ShadDialog,
};

interface Shown {
  skin: string;
  style?: ModalStyle;
}

declare global {
  interface Window {
    showModal: (skin: string, style?: ModalStyle) => void;
    setLines: (n: number) => void;
  }
}

function App(): JSX.Element | null {
  const [shown, setShown] = React.useState<Shown | null>(null);
  const [lines, setLines] = React.useState(1);
  window.showModal = (skin, style) => {
    setLines(1);
    setShown({ skin, ...(style ? { style } : {}) });
  };
  window.setLines = setLines;
  if (!shown) return null;
  const Dialog = skins[shown.skin]!;
  return (
    <div className="speel-shadcn">
      <Dialog
        open
        onOpenChange={() => setShown(null)}
        title="Sized"
        {...(shown.style ? { style: shown.style } : {})}
        footer={<button data-testid="footer-button">OK</button>}
      >
        <div data-testid="content">
          {Array.from({ length: lines }, (_, i) => (
            <p key={i} style={{ margin: 0, height: 20 }}>
              Line {i + 1}
            </p>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
