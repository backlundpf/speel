/**
 * The text of each line an element renders, read from per-character client rects: a
 * character whose top is clearly below the current line's starts a new one. Characters cut
 * off by `text-overflow` still report rects on their own line, so a word that ends in "…"
 * reads whole here — exactly what "never split across lines" needs.
 *
 * Self-contained on purpose: Playwright serialises it into the page.
 */
export function lineTexts(el: Element): string[] {
  const lines: string[] = [];
  let lineTop = Number.NEGATIVE_INFINITY;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.top > lineTop + 3) {
        lines.push("");
        lineTop = rect.top;
      }
      lines[lines.length - 1] += text[i];
    }
  }
  return lines.map((l) => l.trim()).filter((l) => l !== "");
}

/** Whether every whitespace-separated word of `text` sits whole on one of `lines`. */
export function wordsWhole(lines: string[], text: string): boolean {
  return text
    .split(/\s+/)
    .every((word) => lines.some((line) => line.split(/\s+/).includes(word)));
}
