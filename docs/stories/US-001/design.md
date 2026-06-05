# Design

## Domain Model

- **Book**: Represents a book resource with a `title` (slug extracted from URL), `url` (original web source), `unsign_title` (accents-stripped search key), and `total_pages` count.
- **BookPage**: Represents a single page image containing its sequence number, CDN source URL, and local temporary download path.

## Application Flow

- **Downloader Service**:
  - Validates input boundaries.
  - Queries DB for duplicates.
  - Scrapes HTML page for `https://cdn3.olm.vn` images.
  - Inserts `book` record.
  - Loops and downloads each image sequentially.
  - Runs ZIP archiver stream on output folder.
  - Invokes local file/folder deletion cleanup inside a `finally` block.

## Interface Contract

### HTTP Request
`POST /api/books/download`
```json
{
  "targetUrls": [
    "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456"
  ]
}
```

### HTTP Response
```json
{
  "success": true,
  "message": "Books queued for download.",
  "jobs": [
    {
      "id": 1,
      "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
      "status": "pending"
    }
  ]
}
```

## Data Model

Three SQLite tables are defined:
- `book`: stores title, description, unsign_title, url, total_pages, and audit timestamps.
- `book_page`: stores FK book_id, page_number, image_url, and local download_url.
- `download_job`: tracks download requests, status, and page progress in the background queue.

## UI / Platform Impact

- API-only service. No direct UI impacts. Runs on Node.js port 3000 (default) or configurable env `PORT`.

## Observability

- Uses NestJS standard `Logger` which outputs to stdout. Prints detailed debug steps for downloading, zipping, and cleaning up.

## Alternatives Considered

1. **Using TypeORM / Sequelize**: Rejected to avoid unnecessary boilerplate and complex mapping logic for a simple 3-table SQLite setup. Raw SQLite3 with promise wrappers is extremely fast, highly customizable, and easy to run tests against.
