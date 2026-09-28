// src/changeParse.ts
//
// Pure string parsing for the GetListItemChangesSinceToken XML response. Kept
// dependency-free (regex, no DOM) so it runs in Node tests and the browser.

/** Extract item Ids whose change is a deletion. */
export function parseDeletedIds(xml: string): number[] {
  const ids: number[] = [];
  const re = /<Id\b[^>]*\bChangeType="Delete"[^>]*>(\d+)<\/Id>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    ids.push(Number(m[1]));
  }
  return ids;
}

/**
 * Read the new change token off the <Changes> element. This advances as the
 * list changes, unlike the list's coarse CurrentChangeToken property.
 */
export function parseLastChangeToken(xml: string): string | undefined {
  const m = /<Changes\b[^>]*\bLastChangeToken="([^"]+)"/.exec(xml);
  return m ? m[1] : undefined;
}
