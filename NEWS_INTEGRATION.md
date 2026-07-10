# Technology News Integration (NewsAPI)

This document describes how live **technology news** from [NewsAPI](https://newsapi.org)
is integrated into the existing News module, alongside the company/admin news that
was already there. Nothing about the existing admin CRUD or public News page was
rebuilt — external news was added on top of it.

---

## 1. What changed (high level)

- The public **News page** (`/news`) now shows **company news + external technology
  news** in one combined, searchable, sortable, paginated list.
- A new **server-side** endpoint proxies NewsAPI so the API key never reaches the
  browser.
- External articles open in an internal **preview page** (`/news-external`) with a
  “Read Full Article” link to the original publisher.
- The **admin panel** gets an *External Technology News* section (status, refresh,
  enable/disable, page size, cache duration) — read-only feed, not editable records.
- Company news gained optional **category, SEO title, meta description, publish date**.

Existing admin-added news continues to work exactly as before (same DB table, same
`/api/news` CRUD, same `/news-detail?slug=` page).

---

## 2. Environment variables

Set the **key** server-side only. Everything else has safe defaults and can also be
changed from the admin panel.

| Variable | Default | Notes |
|---|---|---|
| `NEWS_API_KEY` | *(empty)* | **Required for external news.** Server-only secret. |
| `NEWS_API_BASE_URL` | `https://newsapi.org/v2` | |
| `NEWS_API_CATEGORY` | `technology` | Only technology headlines are requested. |
| `NEWS_API_LANGUAGE` | `en` | |
| `NEWS_API_PAGE_SIZE` | `20` | Public page uses 9/req; admin-overridable (1–50). |
| `NEWS_API_CACHE_MINUTES` | `30` | Admin-overridable (1–1440). |
| `NEWS_API_TIMEOUT` | `8` | Seconds before falling back to cache/manual news. |
| `NEWS_API_ENABLED` | `true` | Master switch (admin-overridable). |

`.env.example` contains these as **placeholders only** (no real key). `.env` is
git-ignored.

### Local setup

```env
NEWS_API_KEY=YOUR_PRIVATE_KEY
NEWS_API_BASE_URL=https://newsapi.org/v2
NEWS_API_CATEGORY=technology
NEWS_API_LANGUAGE=en
NEWS_API_PAGE_SIZE=20
NEWS_API_CACHE_MINUTES=30
```

### Production (cPanel — recommended)

Add **one line** to `api/config.local.php` (already used for DB creds; git-ignored and
excluded from deploy, so it is never committed or overwritten):

```php
define('NEWS_API_KEY', 'your-real-newsapi-key');
```

That is the **only** manual backend step. Tables, cache and settings are created
automatically on the first request. Environment variables (`getenv('NEWS_API_KEY')`)
also work if your host supports them.

---

## 3. Backend endpoint

Front controller: `api/index.php`. Logic: `api/news_service.php`.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/news/technology?page=&pageSize=&search=&sort=` | public | Combined company + external feed (normalized, deduped, sorted, paginated). |
| GET | `/api/news/external/{id}` | public | One external article by stable id (for the preview page). |
| GET | `/api/news/external/status` | admin | Connection status, last sync, cached article list. |
| POST | `/api/news/external/refresh` | admin | Force-refresh the external cache. |
| POST | `/api/news/external/settings` | admin | `{enabled,pageSize,cacheMinutes}` overrides. |
| GET/POST/PUT/DELETE | `/api/news*` | (unchanged) | Existing company-news CRUD. |

NewsAPI is called server-side as:

```
GET {NEWS_API_BASE_URL}/top-headlines?category=technology&language=en&pageSize=..&page=1
Header:  X-Api-Key: <server-only key>
```

Query params are validated: `page ≥ 1`, `pageSize` capped at 50, `search` trimmed to
120 chars with control/angle chars stripped, invalid `sort` falls back to `latest`.

### Normalized article shape (both sources)

```json
{
  "id": "ext-<hash>|manual-<id>", "type": "external|manual", "category": "technology",
  "title": "...", "slug": "...", "description": "...", "contentPreview": "...",
  "imageUrl": "...", "sourceName": "...", "sourceId": "...", "author": "...",
  "publishedAt": "ISO-8601", "originalUrl": "...|null", "isExternal": true|false,
  "sourceLabel": "External Technology News | Company News", "readingTime": 3
}
```

Stable ids are `sha1(url)`-based (never the array index). Articles are dropped when the
title/URL is missing, the title is `[Removed]`, the URL is invalid, or the URL is a
duplicate. Missing/invalid images fall back to `NEWS_PLACEHOLDER_IMAGE`.

---

## 4. Database migration

All migrations are automatic and safe (guarded `CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE ADD COLUMN` — see `api/db.php`). Existing rows are never deleted or
corrupted.

- `news` table gains: `category` (default `technology`), `seo_title`,
  `meta_description`, `published_at`. Legacy rows are back-filled to category
  `technology`.
- New `news_cache` table: server-side cache for external responses
  (`cache_key`, `payload`, `expires_at`).
- New `news_settings` table: admin-editable overrides (`external_enabled`,
  `page_size`, `cache_minutes`).

Works on MySQL and on the built-in SQLite fallback.

---

## 5. How company + external news combine

1. Published company news with `category = technology` is loaded from the DB.
2. External technology articles are loaded from cache (or fetched once per cache
   window).
3. Both are normalized to the shape above, merged, de-duplicated (by URL/slug/title),
   filtered by the search term, **sorted by `publishedAt` descending** (or ascending),
   then paginated.
4. Cards are labelled **“Company News”** or **“External Technology News”** and carry a
   **Technology** badge. Only the technology category is shown.

---

## 6. Caching strategy

- **Store:** database (`news_cache`) — portable across shared hosting, no Redis needed.
- **Key:** `ext_pool:{category}:{language}:{poolSize}` (search/sort/pagination are applied
  in-memory over the cached pool, so typing in the search box never hits NewsAPI).
- **TTL:** `NEWS_API_CACHE_MINUTES` (default 30). One upstream request per window
  (≈48/day max — well within the free tier).
- **Refresh:** on expiry, or immediately from *Admin → Refresh Cache*.
- **Debounce:** the search box waits 450 ms and reuses the cached pool.

---

## 7. Error-handling behaviour

Handled: missing/invalid/disabled API key, rate limit (429), provider 5xx, timeout,
no connectivity, empty article array, invalid JSON, image load failure (front-end
`onerror` → placeholder), database error, cache error.

Degradation order when NewsAPI fails:

1. Serve **stale cached** external news if available.
2. Otherwise continue showing **company news**.
3. Show a friendly message only if there is genuinely nothing to display.
4. The News page never crashes.

Success/error response shapes:

```json
{ "success": true, "message": "Technology news retrieved successfully.",
  "data": [], "pagination": {"page":1,"pageSize":20,"totalResults":0,"hasNextPage":false},
  "meta": {"source":"combined","cached":true,"category":"technology","language":"en"} }
```

```json
{ "success": false, "message": "Technology news is temporarily unavailable.",
  "errorCode": "NEWS_PROVIDER_UNAVAILABLE" }
```

The API key is never logged and never appears in any response (including errors).
Stack traces are not exposed (`display_errors=0`, generic 500 message).

---

## 8. Frontend integration

- `assets/js/pages/news.js` — combined feed, debounced search, sort, Load More,
  skeleton/empty/error/retry states, image fallbacks.
- `news-external/index.html` + `assets/js/pages/news-external.js` — external preview.
  “Read Full Article” uses `target="_blank" rel="noopener noreferrer nofollow"`.
  The page is `noindex, follow` and does not reproduce the full article.
- `assets/js/pages/news-detail.js` — company article page; now emits SEO title, meta
  description, canonical, Open Graph and Twitter tags.
- `assets/css/pages/news-module.css` — additive styles (badges, flags, skeletons,
  toolbar, preview) using the existing design tokens.

---

## 9. Admin panel

*Admin → News → External Technology News* shows connection status, last sync time,
cached-article count and latest titles, plus controls to refresh the cache,
enable/disable external news, and set page size / cache duration. External articles
are **not** stored as records and cannot be edited or deleted. The API key is never
displayed.

Company-news CRUD is unchanged and now also supports category, SEO title, meta
description and publish date.

---

## 10. Testing

```bash
php api/tests/news_test.php
```

NewsAPI is **mocked** (`$GLOBALS['NEWS_HTTP_MOCK']`) — no real request or quota is used.
Covers: normalization, invalid/`[Removed]`/duplicate filtering, missing-image
fallback, error-code mapping, merge of company + external, sort by date, search,
param sanitization, pagination and the end-to-end feed shape.

---

## 11. Deployment

Standard deploy (GitHub Actions FTP mirror). `api/config.local.php` is excluded, so set
`NEWS_API_KEY` there once on the server. No build step. Tables auto-create on first hit.

---

## 12. NewsAPI plan limitations

- Free/Developer plan: ~100 requests/day, results delayed ~24h, **development use
  only** and **no browser CORS** (server-side proxy — which we use — is required).
- `top-headlines` returns up to 100 results per query; deep pagination is limited.
- For production/commercial use and live (non-delayed) headlines, a paid NewsAPI plan
  is required. The caching layer keeps usage minimal on any plan.
