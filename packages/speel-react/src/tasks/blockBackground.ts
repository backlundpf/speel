import { ABOVE_BLOCKING_ATTR, BLOCKING_OVERLAY_ATTR } from "../layers.js";

/** Elements that render nothing; sealing them would only add noise to the DOM. */
const NON_RENDERING = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "TEMPLATE",
  "NOSCRIPT",
]);

const KEY_EVENTS = ["keydown", "keypress", "keyup"] as const;

interface Sealed {
  el: HTMLElement;
  inert: boolean;
  hidden: boolean;
}

/**
 * Makes everything on the page except the blocking overlay non-interactive, and returns
 * the function that lifts it again.
 *
 * The scope is every child of `document.body`, not just the provider's own subtree: the
 * surfaces a blocking task usually starts from (a Fluent `Layer`, a Radix portal) render
 * outside that subtree, at the body. Each sibling of the overlay gets `inert`; where the
 * browser has no `inert`, `aria-hidden="true"` stands in for its AT half. Layers marked
 * {@link ABOVE_BLOCKING_ATTR} (toasts, the running-task stack) stay reachable, and a
 * layer added while the block holds is sealed as it arrives.
 *
 * Belt and braces, for engines without `inert` and for whatever already held focus:
 * focus that lands outside the overlay is sent back to `focusTarget`, and key events
 * aimed outside it are stopped in the capture phase before any app handler sees them.
 *
 * On release, only the attributes this call added are removed, and focus returns to the
 * element that held it when the block began — if it is still in the document and focus
 * is not already somewhere useful (a toast the user moved to).
 */
export function blockBackground(
  overlay: HTMLElement,
  focusTarget: HTMLElement,
): () => void {
  const doc = overlay.ownerDocument;
  const win = doc.defaultView ?? window;
  const supportsInert = "inert" in win.HTMLElement.prototype;
  const previous =
    doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null;

  const sealed: Sealed[] = [];
  const seal = (node: Node): void => {
    if (!(node instanceof win.HTMLElement)) return;
    if (node === overlay || NON_RENDERING.has(node.tagName)) return;
    if (
      node.hasAttribute(ABOVE_BLOCKING_ATTR) ||
      node.hasAttribute(BLOCKING_OVERLAY_ATTR)
    )
      return;
    const rec: Sealed = { el: node, inert: false, hidden: false };
    if (!node.hasAttribute("inert")) {
      node.setAttribute("inert", "");
      rec.inert = true;
    }
    if (!supportsInert && node.getAttribute("aria-hidden") !== "true") {
      node.setAttribute("aria-hidden", "true");
      rec.hidden = true;
    }
    if (rec.inert || rec.hidden) sealed.push(rec);
  };

  // Record focus before sealing: an inert focused element loses focus to the body.
  Array.from(doc.body.children).forEach(seal);
  const observer = new win.MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(seal);
  });
  observer.observe(doc.body, { childList: true });

  const reachable = (target: EventTarget | null): boolean => {
    if (!(target instanceof win.Node)) return false;
    if (overlay.contains(target)) return true;
    const el =
      target instanceof win.Element ? target : (target.parentElement ?? null);
    return !!el?.closest(`[${ABOVE_BLOCKING_ATTR}]`);
  };
  const onFocusIn = (e: FocusEvent): void => {
    if (!reachable(e.target)) focusTarget.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent): void => {
    if (reachable(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  // Window, capture phase: ahead of every document, root and element listener — React
  // 17's root-container listeners included.
  win.addEventListener("focusin", onFocusIn, true);
  for (const k of KEY_EVENTS) win.addEventListener(k, onKey, true);

  focusTarget.focus({ preventScroll: true });

  return () => {
    observer.disconnect();
    win.removeEventListener("focusin", onFocusIn, true);
    for (const k of KEY_EVENTS) win.removeEventListener(k, onKey, true);
    for (const r of sealed) {
      if (r.inert) r.el.removeAttribute("inert");
      if (r.hidden) r.el.removeAttribute("aria-hidden");
    }
    const active = doc.activeElement;
    const focusLost =
      !active || active === doc.body || overlay.contains(active);
    if (focusLost && previous && previous.isConnected && previous !== doc.body)
      previous.focus({ preventScroll: true });
  };
}
