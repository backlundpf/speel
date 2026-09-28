import "@testing-library/jest-dom/vitest";

// ProseMirror (TipTap) probes DOM measurement APIs jsdom doesn't implement.
if (typeof Range !== "undefined") {
  if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = function (): DOMRectList {
      return {
        length: 0,
        item: () => null,
        [Symbol.iterator]: Array.prototype[Symbol.iterator],
      } as unknown as DOMRectList;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== "function") {
    Range.prototype.getBoundingClientRect = function (): DOMRect {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  }
}
if (
  typeof document !== "undefined" &&
  typeof document.elementFromPoint !== "function"
) {
  document.elementFromPoint = () => null;
}

// jsdom ships no PointerEvent, so RTL's fireEvent.pointer* would drop clientX/clientY
// and every pointer-driven drag would read NaN. MouseEvent carries exactly the
// coordinate fields the resize hooks use.
if (
  typeof window !== "undefined" &&
  typeof window.PointerEvent !== "function"
) {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = JsdomPointerEvent as unknown as typeof PointerEvent;
}
