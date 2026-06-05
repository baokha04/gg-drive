# Design

## Domain Model

- **Book**: Represents a book resource with a `title` (slug extracted from URL), `url` (original web source), `unsign_title` (accents-stripped search key), and `total_pages` count.
- **BookPage**: Represents a single page image containing its sequence number, CDN source URL, and local temporary download path.
- **GoogleFolder**: Represents an output directory on Google Drive.
- **GoogleDriveZIP**: Represents the link between a book, its destination folder, and its resulting Google Drive file view URL.

## Application Flow

- **Downloader Service**:
  - Validates input boundaries.
  - Queries DB for duplicates.
  - Queries Google Drive for folder details, then registers in SQLite.
  - Scrapes HTML page for `https://cdn3.olm.vn` images.
  - Inserts `book` record.
  - Loops and downloads each image sequentially.
  - Runs ZIP archiver stream on output folder.
  - Authenticates and uploads ZIP to Google Drive.
  - Inserts `gg_drive` record.
  - Invokes local file/folder deletion cleanup inside a `finally` block.

## Interface Contract

### HTTP Request
`POST /api/books/download`
```json
{
  "googleFolderId": "1a2b3c4d5e6f7g8h9i0j_ABCXYZ",
  "targetUrls": [
    "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456"
  ]
}
```

### HTTP Response
```json
{
  "success": true,
  "message": "Đã xử lý xong. Thành công: 1/1",
  "results": {
    "success": [
      {
        "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
        "status": "Thành công",
        "bookId": 1,
        "bookTitle": "shs-toan-5-tap-mot",
        "totalPages": 120,
        "googleFolderId": "1a2b3c4d5e6f7g8h9i0j_ABCXYZ",
        "driveLink": "https://drive.google.com/file/d/mock_id_xyz/view"
      }
    ],
    "failed": []
  }
}
```

## Data Model

Four SQLite tables are defined:
- `book`: stores title, description, unsign_title, url, total_pages, and audit timestamps.
- `book_page`: stores FK book_id, page_number, image_url, and local download_url.
- `gg_folder`: stores unique folder_id and folder_name.
- `gg_drive`: stores FK book_id, FK gg_folder_id, and zip_file_url link.

## UI / Platform Impact

- API-only service. No direct UI impacts. Runs on Node.js port 3000 (default) or configurable env `PORT`.

## Observability

- Uses NestJS standard `Logger` which outputs to stdout. Prints detailed debug steps for downloading, zipping, uploading, and cleaning up.

## Alternatives Considered

1. **Using TypeORM / Sequelize**: Rejected to avoid unnecessary boilerplate and complex mapping logic for a simple 4-table SQLite setup. Raw SQLite3 with promise wrappers is extremely fast, highly customizable, and easy to run tests against.
