# US-005 Extract Catalog Scraper into separate module with SQLite persistence

## Status

implemented

## Lane

normal

## Product Contract

Isolate catalog-scraper into its own NestJS module (`CatalogScraperModule`). Scraping catalog pages persists results in `catalog_grade`, `catalog_publisher`, and `catalog_detail` tables in SQLite. Downloader service fetches URLs from `catalog_detail` database rows.

## Relevant Product Docs

- `docs/spec_description.md`

## Acceptance Criteria

- Create database tables:
  - `catalog_grade` (id, grade, name, created_at, updated_at)
  - `catalog_publisher` (id, publisher_id, name, created_at, updated_at)
  - `catalog_detail` (id, catalog_grade_id, catalog_publisher_id, title, url, status, created_at, updated_at)
- Create `CatalogScraperModule`, `CatalogScraperController`, and `CatalogScraperService` under `src/catalog-scraper/`.
- Endpoint `POST /api/catalog/scrape` replaces/refines catalog scraper entry point.
- Scraping a catalog URL extracts grade and publisher parameters, saves/updates them in tables, and saves extracted book reading URLs into `catalog_detail` table with status `'pending'`.
- Modify `BookDownloaderService` or add a command/trigger to process `'pending'` book URLs directly from `catalog_detail` table rows (e.g. updating status to `'processing'`, then `'completed'` or `'failed'` based on download outcome).
- Ensure existing unit and E2E tests are updated and pass, and add new coverage for database persistence.

## Design Notes

- API Endpoint: `POST /api/catalog/scrape`
  - Body: `{ catalogUrl: string, crawlAllPages?: boolean }`
  - Persists tables and returns status of newly discovered books.
- API Endpoint: `POST /api/books/download/catalog-pending`
  - Automatically queues all `'pending'` URLs in `catalog_detail` for download.
- Table structures match naming convention.

## Validation

`scripts/bin/harness-cli story update --id US-005 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `catalog-scraper.service.spec.ts` unit tests updated and pass. |
| E2E | E2E tests run successfully, asserting DB inserts and downloader integration. |

## Harness Delta

- Added catalog persistence tables to SQLite schema.
