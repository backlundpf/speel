/**
 * A hover title for a cell the skin has cut off — and only for one that is. Call it from the
 * cell's `mouseenter`: it sets the title on the element itself rather than through state, so
 * hovering costs no render, and the text is only computed when the content overflows.
 */
export function setOverflowTitle(el: HTMLElement, getText: () => string): void {
  const text = el.scrollWidth > el.clientWidth ? getText() : "";
  if (text !== "") el.title = text;
  else el.removeAttribute("title");
}
