import { vi } from "vitest";

export interface FocusCall {
  el: HTMLElement;
  opts: FocusOptions | undefined;
}

/** Records every `HTMLElement.focus` call (element + options) and still moves focus. */
export function spyFocus(): { calls: FocusCall[]; restore(): void } {
  const calls: FocusCall[] = [];
  const original = HTMLElement.prototype.focus;
  const spy = vi
    .spyOn(HTMLElement.prototype, "focus")
    .mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
      calls.push({ el: this, opts });
      original.call(this, opts);
    });
  return { calls, restore: () => spy.mockRestore() };
}
