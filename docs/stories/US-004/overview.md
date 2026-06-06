# US-004 Extract and Queue book URLs from Catalog Pages

## Status

planned

## Lane

normal

## Product Contract

User provide taphuan catalog URL. System fetch catalog page. Extract book detail URLs. Fetch book detail pages. Extract book reading URLs. Queue all book URLs for sequential download.

## Relevant Product Docs

- `docs/spec_description.md`

## Acceptance Criteria

- Detect taphuan catalog URL pattern: `https://taphuan.nxbgd.vn/tap-huan/cac-bo-sach-khac*`
- Extract book detail page links: `/tap-huan/chi-tiet-sach/[^"'\s<>]+`
- Extract pagination links: `/tap-huan/cac-bo-sach-khac/page-\d+[^"'\s<>]*`
- Support scraping multiple pages if pagination exists (up to limit of 10 pages to prevent abuse/infinite loops)
- For each book detail page:
  - Fetch page content.
  - Extract reading links: `/tap-huan/doc-sach/[^"'\s<>]+` (e.g. `shs-ngu-van-6-tap-mot.4538703873`)
- Queue extracted book URLs using `BookDownloaderService.downloadAndStoreBooks`
- Return summary of crawled pages, parsed books, and queue jobs status
- Implement unit tests for catalog scraper logic
- Implement E2E test verifying catalog scraping endpoint and queueing flow

## Design Notes

- API Endpoint: `POST /api/books/download/catalog`
  - Request body:
    ```json
    {
      "catalogUrl": "https://taphuan.nxbgd.vn/tap-huan/cac-bo-sach-khac/page-1?grade=6&id_book=3",
      "crawlAllPages": true
    }
    ```
  - Response body:
    ```json
    {
      "success": true,
      "crawledPages": 1,
      "foundBooks": 12,
      "queuedUrls": [
        "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-ngu-van-6-tap-mot.4538703873",
        ...
      ],
      "jobs": [
        { "id": 10, "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-ngu-van-6-tap-mot.4538703873", "status": "pending" }
      ]
    }
    ```
- Components:
  - Add `CatalogScraperService` to parse catalog & detail pages.
  - Add controller route `POST /api/books/download/catalog` calling `CatalogScraperService` then queuing URLs via `BookDownloaderService`.

## Validation

`scripts/bin/harness-cli story update --id US-004 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `catalog-scraper.service.spec.ts` passes. |
| Integration | (none) |
| E2E | `test:e2e` passes including new catalog controller test. |
| Platform | (not applicable) |
| Release | (not applicable) |

## Harness Delta

- Added catalog-level crawling capability.

## Evidence

- `pnpm run test` output
- `pnpm run test:e2e` output
