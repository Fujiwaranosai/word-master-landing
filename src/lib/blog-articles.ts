/**
 * Build-time fetcher for blog articles from the Vocab Mine public blog
 * API (Vikunja #76 — landing site sources articles from the DB instead
 * of static .md files).
 *
 * Called at build time inside `getStaticPaths`. The public endpoints
 * (`GET /blog/articles` and `GET /blog/articles/:id`) require NO auth
 * token — they only ever expose published articles, so no admin Bearer
 * token is sent. Only the API base URL is read from the environment.
 */

const API_BASE = process.env.BLOG_API_BASE_URL ?? "http://192.168.1.9:8020";

export interface ArticleSummary {
  author: string;
  collectionId: string | null;
  createdAt: string;
  description: string;
  id: string;
  publishedAt: string | null;
  slug: string;
  status: "draft" | "published" | "archived";
  title: string;
  topic: ArticleTopic;
  updatedAt: string;
}

/** Editorial topic — single value per article. Mirrors the backend
 *  allowlist in libs/core/src/database/drizzle/schema/articles.ts.
 *  Vikunja #113. */
export const ARTICLE_TOPICS = [
  "vocabulary",
  "writing",
  "announcement",
  "learning-science",
  "story",
] as const;
export type ArticleTopic = (typeof ARTICLE_TOPICS)[number];
export const ARTICLE_TOPIC_LABELS: Record<ArticleTopic, string> = {
  announcement: "Announcement",
  "learning-science": "Learning Science",
  story: "Story",
  vocabulary: "Vocabulary",
  writing: "Writing",
};

export interface SourceRef {
  attribution: string;
  license?: string;
  url: string;
}

export interface ArticleCollectionRef {
  id: string;
  name: string;
  slug: string | null;
  wordCount: number;
}

export interface SuggestedVocabItem {
  cefr?: string;
  kind?: string;
  word: string;
}

export interface ArticleDetail extends ArticleSummary {
  body: string;
  collection: ArticleCollectionRef | null;
  heroImageAlt: string | null;
  heroImageUrl: string | null;
  sources: SourceRef[];
  suggestedVocab: SuggestedVocabItem[];
  tags: string[];
}

/** Max attempts per request before giving up (1 initial + 3 retries). */
const MAX_FETCH_ATTEMPTS = 4;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Backoff for a retryable response. Honours the server's `Retry-After`
 * header (the backend throttler sets it) when present; otherwise falls
 * back to exponential backoff with a little jitter so parallel workers
 * don't all wake and re-burst in lockstep.
 */
function retryDelayMs(res: Response | null, attempt: number): number {
  const header = res?.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  }
  const base = Math.min(500 * 2 ** (attempt - 1), 4000); // 500ms, 1s, 2s, 4s…
  return base + Math.floor(Math.random() * 250);
}

async function publicFetch<T>(path: string): Promise<T> {
  // Public blog endpoints — no Authorization header. Only published
  // articles are ever returned, so no token is required.
  //
  // Retry on 429/503: the build fans out one detail fetch per article,
  // so a large blog can momentarily brush the backend's per-IP rate
  // limiter (short tier: 20 req/s). Rather than let the first 429 abort
  // the whole build, back off (respecting Retry-After) and retry. Paired
  // with the bounded concurrency in fetchArticleDetails, this keeps the
  // build robust without weakening the limiter for real traffic.
  const url = `${API_BASE}${path}`;
  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url);
    } catch (err) {
      // Network hiccup — treat as retryable.
      lastDetail = err instanceof Error ? err.message : "network error";
      if (attempt < MAX_FETCH_ATTEMPTS) {
        await sleep(retryDelayMs(null, attempt));
        continue;
      }
      break;
    }

    if ((res.status === 429 || res.status === 503) && attempt < MAX_FETCH_ATTEMPTS) {
      lastDetail = `HTTP ${res.status} ${res.statusText}`;
      await sleep(retryDelayMs(res, attempt));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { data: T; success: boolean };
    if (!body.success) {
      throw new Error(`Blog API returned success=false for ${path}`);
    }
    return body.data;
  }

  throw new Error(
    `Failed to fetch ${url} after ${MAX_FETCH_ATTEMPTS} attempts (last: ${lastDetail})`,
  );
}

/**
 * List ALL published articles. Used by both the blog index page and as
 * the seed for getStaticPaths on the per-article route.
 */
export async function fetchPublishedArticles(): Promise<ArticleSummary[]> {
  const data = await publicFetch<{ articles: ArticleSummary[] }>(
    "/blog/articles",
  );
  // Defensive: the public endpoint always returns { articles: [] } even
  // when empty, but guard against an unexpected shape so a zero-article
  // prod build can never crash on .sort of undefined.
  const articles = data.articles ?? [];
  // Newest first — matches the existing .md-based sort order.
  return articles.sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });
}

/**
 * Full article fetch. Includes body, sources, suggested vocab, and the
 * bound collection summary needed for the inline CTA.
 */
export async function fetchArticleById(id: string): Promise<ArticleDetail> {
  return publicFetch<ArticleDetail>(`/blog/articles/${id}`);
}

/**
 * How many detail fetches the build keeps in flight at once. Kept well
 * under the backend's per-IP short tier (20 req/s) so a normal blog
 * never trips it; publicFetch's retry absorbs any momentary overshoot
 * (e.g. very low-latency responses letting the pool exceed the cap).
 */
const BUILD_FETCH_CONCURRENCY = 6;

/**
 * Fetch every article's full detail with bounded concurrency, preserving
 * input order. Replaces an unbounded `Promise.all(ids.map(fetchArticleById))`
 * that fired all detail fetches simultaneously and blew past the backend
 * rate limiter on any blog with more than ~20 articles.
 */
export async function fetchArticleDetails(
  ids: readonly string[],
): Promise<ArticleDetail[]> {
  const results = new Array<ArticleDetail>(ids.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= ids.length) return;
      results[index] = await fetchArticleById(ids[index]);
    }
  };
  const poolSize = Math.min(BUILD_FETCH_CONCURRENCY, ids.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}
