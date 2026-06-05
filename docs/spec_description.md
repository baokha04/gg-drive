# Technical Specification: Book Downloader Service

## 1. Project Overview

The Book Downloader Service is a RESTful API built on top of Node.js and NestJS. The core goal is to accept one or multiple web URLs of reading materials, scrape target page image links, sequentially download images to the local server, compress them into a ZIP archive, and upload the archive to Google Drive. The service uses SQLite for data persistence, storing metadata, folder mapping, download histories, and links to final uploaded archives.

## 2. Tech Stack

- **Runtime & Framework:** Node.js, NestJS
- **Database:** SQLite3 (via the direct `sqlite3` driver wrapped in a custom async provider)
- **HTTP Client:** Axios (for HTML crawling and streaming file downloads)
- **Archiving:** Archiver (ZIP compression, Level 9)
- **Cloud Storage:** Google APIs (Google Drive API v3)
- **API Documentation:** Swagger (@nestjs/swagger)

## 3. Database Schema

Four SQLite tables are defined and initialized automatically at startup:

### 3.1 Table `book`
Stores general metadata for each scraped book:
- `id` (INTEGER, PK, AUTOINCREMENT)
- `title` (TEXT, NOT NULL) - URL-extracted slug.
- `description` (TEXT) - Custom description (e.g. source details).
- `unsign_title` (TEXT) - Search key with Vietnamese accents stripped.
- `url` (TEXT, UNIQUE, NOT NULL) - Original source URL.
- `total_pages` (INTEGER, DEFAULT 0) - Scraped pages count.
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `deleted` (BOOLEAN, DEFAULT 0) - Soft-delete flag.

### 3.2 Table `book_page`
Stores download details for individual pages:
- `id` (INTEGER, PK, AUTOINCREMENT)
- `book_id` (INTEGER, FK -> book.id)
- `page_number` (INTEGER, NOT NULL)
- `image_url` (TEXT, NOT NULL) - Original page image URL.
- `download_url` (TEXT) - Temp local download path.
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `deleted` (BOOLEAN, DEFAULT 0)

### 3.3 Table `gg_folder`
Stores mapping for Google Drive directories:
- `id` (INTEGER, PK, AUTOINCREMENT)
- `folder_id` (TEXT, UNIQUE, NOT NULL) - Google Drive folder unique identifier.
- `folder_name` (TEXT, NOT NULL) - Resolved Google Drive folder name.
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `deleted` (BOOLEAN, DEFAULT 0)

### 3.4 Table `gg_drive`
Maps the final uploaded zip archive to the book and Google Drive folder:
- `id` (INTEGER, PK, AUTOINCREMENT)
- `book_id` (INTEGER, FK -> book.id)
- `gg_folder_id` (INTEGER, FK -> gg_folder.id)
- `zip_file_url` (TEXT, NOT NULL) - Drive view link.
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `deleted` (BOOLEAN, DEFAULT 0)

## 4. Business Logic Workflow

The downloader processes each input URL sequentially through the following pipeline:

1. **Title Extraction:** Analyzes the target URL to extract the book's slug as `title`.
2. **Duplicate Check:** Queries the database for the book `title`. If it already exists (and `deleted = 0`), skips processing and reports a duplicate error.
3. **Folder Resolution:** Resolves target Google Drive folder using the `GOOGLE_FOLDER_ID` env variable. Looks up or creates folder record in `gg_folder` table.
4. **Scraping:** Fetches target HTML and extracts image links using regular expressions matching the OLM CDN pattern (`https://cdn3.olm.vn*`).
5. **Database Initialization:** Inserts a new row in the `book` table to obtain a unique `book_id`.
6. **Folder Isolation:** Creates a temporary, isolated workspace directory `/downloads/book_{book_id}`.
7. **Sequential Download:** Downloads each image one-by-one into the isolated directory, storing a row in `book_page` for each page.
8. **Compression:** Compresses the isolated directory into `book_{book_id}.zip`.
9. **Google Drive Upload:** Uploads the zip archive to Google Drive. Returns the web link and records it in the `gg_drive` table.
10. **Cleanup:** Inside a `finally` block, deletes the local book subdirectory and its zip file.

## 5. API Specification

Interactive Swagger UI documentation is available at `/api/docs`.

### 5.1 POST `/api/books/download`
Downloads and archives books.

- **Request Body (JSON):**
```json
{
  "targetUrl": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
  "targetUrls": [
    "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai.4537689926"
  ]
}
```
*Either `targetUrl` or `targetUrls` can be supplied.*

- **Response Body (JSON - Success 200):**
```json
{
  "success": true,
  "message": "Processing completed. Success: 1/1",
  "results": {
    "success": [
      {
        "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
        "status": "Success",
        "bookId": 1,
        "bookTitle": "shs-toan-5-tap-mot",
        "totalPages": 120,
        "googleFolderId": "folder_id_xyz",
        "driveLink": "https://drive.google.com/file/d/mock_id/view"
      }
    ],
    "failed": []
  }
}
```

### 5.2 GET `/api/books`
Retrieves a list of all active books.
- **Response Body (JSON - Success 200):** `BookListItemDto[]`

### 5.3 GET `/api/books/:id`
Retrieves details of a specific book, including pages list.
- **Response Body (JSON - Success 200):** `BookDetailResponseDto`
- **Response status 404:** Book not found.

### 5.4 DELETE `/api/books/:id`
Soft-deletes a book and its page/drive link mappings from the database.
- **Response Body (JSON - Success 200):** `DeleteBookResponseDto`
- **Response status 404:** Book not found.

## 6. Environment & Authentication

- **Google Drive Authentication:**
  - Loads Service Account keys from the `GOOGLE_CREDENTIALS_JSON` env variable (optionally base64 encoded).
  - Alternatively loads keys from `credentials.json` at root directory or the path specified in `GOOGLE_CREDENTIALS_PATH` env variable.
- **Mock Fallback Mode:**
  - If credentials are not configured, the service logs a warning and runs in **Mock Mode**, simulating Google Drive uploading and folder resolution for safe local testing.
- **Server Port:** Configurable via `PORT` env variable (default is `3000`).
