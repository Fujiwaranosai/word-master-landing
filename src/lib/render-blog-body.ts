import { marked } from "marked";

/**
 * Same wire-format marker the admin TipTap editor writes (Vikunja #99
 * Phase 3). HTML comments aren't rendered by the markdown pipeline,
 * so we split BEFORE feeding to marked rather than trying to detect
 * them after rendering.
 */
const COLLECTION_CTA_MARKER = "<!-- collection-cta -->";

/**
 * Configure marked once at module load. GFM matches what the admin
 * editor emits (tiptap-markdown + remark-gfm on the admin preview),
 * so round-trip output stays consistent between admin preview and
 * landing render.
 */
marked.setOptions({
  breaks: false,
  gfm: true,
});

export type BodyPart =
  | { html: string; type: "html" }
  | { type: "collection-cta" };

/**
 * Split the article body on the vocab-CTA marker, render each segment
 * as markdown → HTML, and return the parts in order. The caller (Astro
 * template) interleaves the CTA component between html parts.
 *
 * If the body has no marker, the result is a single html part — the CTA
 * simply isn't rendered, which is the correct behavior for non-vocab
 * articles (announcements, updates, etc.) that don't have a bound
 * collection.
 */
export function renderBlogBody(body: string): BodyPart[] {
  const segments = body.split(COLLECTION_CTA_MARKER);
  const parts: BodyPart[] = [];
  for (let i = 0; i < segments.length; i++) {
    const html = marked.parse(segments[i]) as string;
    parts.push({ html, type: "html" });
    if (i < segments.length - 1) {
      parts.push({ type: "collection-cta" });
    }
  }
  return parts;
}
