import { marked } from "marked";

/**
 * Wire-format markers the admin TipTap editor writes (Vikunja #99 Phase 3
 * for collection-cta; Vikunja #68 for callout / pullquote / video). HTML
 * comments are inert in any standard markdown pipeline, so a half-shipped
 * renderer degrades to "block silently omitted" instead of "syntax leaks
 * to the reader".
 *
 * Marker syntax (kept centralized so admin + landing stay in lockstep):
 *   - Vocab CTA       — `<!-- collection-cta -->`                (atom)
 *   - Callout         — `<!-- callout:variant -->…<!-- /callout -->`
 *   - Pullquote       — `<!-- pullquote -->…<!-- /pullquote -->`
 *   - Video embed     — `<!-- video:URL -->`                     (atom)
 *
 * Allowed callout variants and video hosts mirror the admin-side node
 * validation. The landing re-checks the video URL because admin trust
 * extends only to the database layer — never trust the wire when you
 * can re-validate cheaply.
 */
const COLLECTION_CTA_MARKER = "<!-- collection-cta -->";

const CALLOUT_VARIANTS = ["info", "warning", "tip"] as const;
type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

const ALLOWED_VIDEO_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
];

marked.setOptions({
  breaks: false,
  gfm: true,
});

export type BodyPart =
  | { html: string; type: "html" }
  | { type: "collection-cta" }
  | { html: string; type: "callout"; variant: CalloutVariant }
  | { html: string; type: "pullquote" }
  | { type: "video"; embedUrl: string };

/**
 * Token from the body scanner — internal type, callers see BodyPart.
 */
type Token =
  | { kind: "text"; content: string }
  | { kind: "cta" }
  | { kind: "callout"; variant: CalloutVariant; inner: string }
  | { kind: "pullquote"; inner: string }
  | { kind: "video"; url: string };

/**
 * Single regex that captures any block-opening marker so a single scan
 * pass can find the next block of any type. Paired markers (callout,
 * pullquote) read forward for their matching close after we know the
 * type.
 */
const ANY_MARKER_RE =
  /<!--\s*(collection-cta|callout:(?:info|warning|tip)|pullquote|video:\S+?)\s*-->/g;

function findClose(body: string, from: number, closeTag: string): number {
  const closeRe = new RegExp(`<!--\\s*\\/${closeTag}\\s*-->`, "g");
  closeRe.lastIndex = from;
  const m = closeRe.exec(body);
  return m ? m.index : -1;
}

function tokenize(body: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  ANY_MARKER_RE.lastIndex = 0;

  while (pos < body.length) {
    ANY_MARKER_RE.lastIndex = pos;
    const match = ANY_MARKER_RE.exec(body);
    if (!match) {
      tokens.push({ kind: "text", content: body.slice(pos) });
      break;
    }
    if (match.index > pos) {
      tokens.push({ kind: "text", content: body.slice(pos, match.index) });
    }
    const inner = match[1];
    const consumed = match.index + match[0].length;

    if (inner === "collection-cta") {
      tokens.push({ kind: "cta" });
      pos = consumed;
      continue;
    }

    if (inner.startsWith("callout:")) {
      const variant = inner.slice("callout:".length) as CalloutVariant;
      const closeIdx = findClose(body, consumed, "callout");
      if (closeIdx === -1) {
        // Unclosed — emit the opening marker as literal text so the
        // author notices the broken markup instead of getting silent
        // content swallowing.
        tokens.push({ kind: "text", content: match[0] });
        pos = consumed;
        continue;
      }
      tokens.push({
        kind: "callout",
        variant,
        inner: body.slice(consumed, closeIdx),
      });
      pos = closeIdx + `<!-- /callout -->`.length;
      continue;
    }

    if (inner === "pullquote") {
      const closeIdx = findClose(body, consumed, "pullquote");
      if (closeIdx === -1) {
        tokens.push({ kind: "text", content: match[0] });
        pos = consumed;
        continue;
      }
      tokens.push({
        kind: "pullquote",
        inner: body.slice(consumed, closeIdx),
      });
      pos = closeIdx + `<!-- /pullquote -->`.length;
      continue;
    }

    if (inner.startsWith("video:")) {
      const url = inner.slice("video:".length).trim();
      tokens.push({ kind: "video", url });
      pos = consumed;
      continue;
    }

    // Unknown marker type — defensive fall-through preserves the marker
    // text so authors see the typo on the page. Should be unreachable
    // because ANY_MARKER_RE only matches known prefixes.
    tokens.push({ kind: "text", content: match[0] });
    pos = consumed;
  }

  return tokens;
}

/**
 * Validate a video URL against the host allowlist + protocol check.
 * Returns the canonical embed URL (youtube → youtube-nocookie, watch?v=
 * → /embed/, youtu.be → /embed/, vimeo.com/ID → player.vimeo.com/video/ID)
 * or null if the URL is malformed or off-allowlist.
 *
 * Defense-in-depth: even though the admin-side node refuses to insert a
 * non-allowlisted URL, the landing re-validates so a hand-edited DB row
 * or a future plain-text submission path can't bypass the check.
 */
function canonicalizeVideoUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!ALLOWED_VIDEO_HOSTS.includes(u.hostname)) return null;

  // YouTube — match three shapes authors paste in the wild:
  //   1. https://youtube.com/watch?v=ID                — desktop share
  //   2. https://youtu.be/ID                           — short share
  //   3. https://www.youtube.com/embed/ID              — official embed dialog
  //   Plus m.youtube.com mobile shares for any of the above.
  // `t=` / `start=` is preserved so author-set start times survive.
  // Senior review M2.
  if (
    u.hostname === "www.youtube.com" ||
    u.hostname === "youtube.com" ||
    u.hostname === "m.youtube.com"
  ) {
    let videoId: string | null = u.searchParams.get("v");
    if (!videoId) {
      const embedMatch = u.pathname.match(/^\/embed\/([\w-]{6,20})$/);
      if (embedMatch) videoId = embedMatch[1];
    }
    if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) return null;
    const start = parseStartSeconds(u);
    const suffix = start > 0 ? `?start=${start}` : "";
    return `https://www.youtube-nocookie.com/embed/${videoId}${suffix}`;
  }
  if (u.hostname === "youtu.be") {
    const videoId = u.pathname.replace(/^\//, "");
    if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) return null;
    const start = parseStartSeconds(u);
    const suffix = start > 0 ? `?start=${start}` : "";
    return `https://www.youtube-nocookie.com/embed/${videoId}${suffix}`;
  }
  if (u.hostname === "www.youtube-nocookie.com") {
    // Already canonical — pass through if shape looks right
    return u.toString();
  }

  // Vimeo — vimeo.com/ID[/HASH] → player.vimeo.com/video/ID[?h=HASH]
  // The optional second path segment is the playback grant for unlisted
  // videos. Dropping it makes the player error "Private video". Senior
  // review M3.
  if (
    u.hostname === "vimeo.com" ||
    u.hostname === "www.vimeo.com" ||
    u.hostname === "player.vimeo.com"
  ) {
    if (u.hostname === "player.vimeo.com") return u.toString();
    const segments = u.pathname.replace(/^\//, "").split("/");
    const videoId = segments[0];
    const hash = segments[1];
    if (!videoId || !/^\d{6,12}$/.test(videoId)) return null;
    const hashSuffix = hash && /^[\w-]+$/.test(hash) ? `?h=${hash}` : "";
    return `https://player.vimeo.com/video/${videoId}${hashSuffix}`;
  }

  return null;
}

/** Parse YouTube's `t=` / `start=` start-time params (supports `42s`,
 *  `1m30s`, plain integers). Returns 0 if absent or malformed. */
function parseStartSeconds(u: URL): number {
  const raw = u.searchParams.get("t") ?? u.searchParams.get("start");
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  const [, h, mi, s] = m;
  return (parseInt(h ?? "0", 10) * 3600) + (parseInt(mi ?? "0", 10) * 60) + parseInt(s ?? "0", 10);
}

/** Inject a synthetic collection-cta token at the midpoint of the body
 *  if the admin didn't insert one explicitly. Used by autoInsertCta —
 *  picks the natural break BETWEEN text tokens whose cumulative text
 *  length crosses 50% of the article. Vikunja #118.
 *
 *  Why between tokens, not inside one: each text token is a contiguous
 *  markdown block (paragraph + headings + lists between markers). Cutting
 *  inside one would orphan a heading or split a list — bad reading flow.
 *  The midpoint-after-token rule keeps every existing block intact. */
function injectCtaAtMidpoint(tokens: Token[]): Token[] {
  if (tokens.some((t) => t.kind === "cta")) return tokens;

  const totalLen = tokens.reduce(
    (sum, t) => sum + (t.kind === "text" ? t.content.length : 0),
    0,
  );
  if (totalLen === 0) return tokens;

  const halfway = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "text") {
      acc += (tokens[i] as { content: string }).content.length;
      if (acc >= halfway) {
        return [
          ...tokens.slice(0, i + 1),
          { kind: "cta" } as Token,
          ...tokens.slice(i + 1),
        ];
      }
    }
  }
  // Body has block tokens (callouts, videos) but no text — append at end.
  return [...tokens, { kind: "cta" } as Token];
}

export interface RenderOptions {
  /** When true AND the body has no explicit `<!-- collection-cta -->`
   *  marker, inject one at the body's midpoint so the caller can render
   *  the bound collection without admin authoring (legacy posts; admins
   *  who forgot the marker). Vikunja #118. */
  autoInsertCta?: boolean;
}

/**
 * Tokenize the body and render each segment. Text tokens go through
 * `marked` (markdown → HTML). Block tokens become typed BodyParts that
 * the Astro template renders via per-type components.
 *
 * Returns an empty array for null/undefined body to keep the caller's
 * mapping logic simple even when the DB layer evolves.
 */
export function renderBlogBody(
  body: string | null | undefined,
  options: RenderOptions = {},
): BodyPart[] {
  if (!body) return [];

  let tokens = tokenize(body);
  if (options.autoInsertCta) {
    tokens = injectCtaAtMidpoint(tokens);
  }

  return tokens
    .map((t): BodyPart | null => {
      switch (t.kind) {
        case "text":
          // Skip pure-whitespace segments left between adjacent blocks
          // to avoid emitting empty <p> tags between, say, a callout
          // and a following pullquote.
          if (!t.content.trim()) return null;
          return { html: marked.parse(t.content) as string, type: "html" };
        case "cta":
          return { type: "collection-cta" };
        case "callout":
          return {
            html: marked.parse(t.inner) as string,
            type: "callout",
            variant: t.variant,
          };
        case "pullquote":
          return { html: marked.parse(t.inner) as string, type: "pullquote" };
        case "video": {
          const embedUrl = canonicalizeVideoUrl(t.url);
          if (!embedUrl) return null;
          return { embedUrl, type: "video" };
        }
      }
    })
    .filter((p): p is BodyPart => p !== null);
}
