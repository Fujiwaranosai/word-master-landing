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
  updatedAt: string;
}

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

async function publicFetch<T>(path: string): Promise<T> {
  // Public blog endpoints — no Authorization header. Only published
  // articles are ever returned, so no token is required.
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${API_BASE}${path}: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { data: T; success: boolean };
  if (!body.success) {
    throw new Error(`Blog API returned success=false for ${path}`);
  }
  return body.data;
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
