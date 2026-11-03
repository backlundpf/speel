import * as React from "react";
import { SpeelModal, useSpeelUI, useSurfaces } from "@speel/react";
import type { ModalStyle } from "@speel/react";

/**
 * A live exhibit of modal sizing: auto height (centred, and placed with `top`) whose
 * content grows and shrinks on demand, and `useSurfaces().confirm()`. Needs no list data.
 * The e2e spec `modalSizing.spec.ts` drives it.
 */

const Lines: React.FC<{ count: number }> = ({ count }) => (
  <div data-testid="sizing-lines">
    {Array.from({ length: count }, (_, i) => (
      <p key={i} style={{ margin: 0, lineHeight: "20px" }}>
        Line {i + 1}
      </p>
    ))}
  </div>
);

export const ModalSizingDemo: React.FC = () => {
  const ui = useSpeelUI();
  const { confirm } = useSurfaces();
  const [open, setOpen] = React.useState<ModalStyle | null>(null);
  const [lines, setLines] = React.useState(1);
  const [answer, setAnswer] = React.useState("none");

  const show = (style: ModalStyle): void => {
    setLines(1);
    setOpen(style);
  };
  const ask = async (): Promise<void> => {
    const ok = await confirm({
      title: "Delete item?",
      message: "This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    setAnswer(ok ? "yes" : "no");
  };

  return (
    <section style={{ marginTop: 24 }} aria-label="Modal sizing demo">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ui.Button
          text="Open auto modal"
          onClick={() => show({ height: "auto" })}
        />
        <ui.Button
          text="Open placed modal"
          onClick={() => show({ height: "auto", top: "40px" })}
        />
        <ui.Button text="Ask to confirm" onClick={() => void ask()} />
        <span data-testid="confirm-answer">Answer: {answer}</span>
      </div>
      <SpeelModal
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
        title="Sized to content"
        {...(open ? { style: open } : {})}
        actions={[
          {
            key: "more",
            text: "More lines",
            onClick: () => setLines((n) => n + 9),
          },
          {
            key: "fewer",
            text: "Fewer lines",
            onClick: () => setLines(1),
          },
        ]}
      >
        <Lines count={lines} />
      </SpeelModal>
    </section>
  );
};
