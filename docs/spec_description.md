# Technical Specification: Book Downloader Service

## 1. Project Overview

The Book Downloader Service is a RESTful API built on top of Node.js and NestJS. The core goal is to accept one or multiple web URLs of reading materials, scrape target page image links, sequentially download images to the local server, and compress them into a ZIP archive. To prevent long-running download blocking, the system processes downloads asynchronously via a database-backed job queue. The service uses SQLite for data persistence, storing metadata, download job statuses, and histories.

## 2. Tech Stack

- **Runtime & Framework:** Node.js, NestJS
- **Database:** SQLite3 (via the direct `sqlite3` driver wrapped in a custom async provider)
- **HTTP Client:** Axios (for HTML crawling and streaming file downloads)
- **Archiving:** Archiver (ZIP compression, Level 9)
- **API Documentation:** Swagger (@nestjs/swagger)

## 3. Database Schema

Three SQLite tables are defined and initialized automatically at startup:

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

### 3.3 Table `download_job`
Tracks download requests, status, and page progress in the background queue:
- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
- `url` (TEXT, NOT NULL) - Target book URL.
- `status` (TEXT, NOT NULL) - 'pending', 'processing', 'completed', or 'failed'.
- `total_pages` (INTEGER, DEFAULT 0) - Calculated total page count after HTML scraping.
- `current_page` (INTEGER, DEFAULT 0) - Number of pages downloaded so far.
- `book_id` (INTEGER, FK -> book.id) - Linked book ID upon completion.
- `error_message` (TEXT) - Failure reason if job fails.
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

## 4. Business Logic Workflow

### 4.1 Client Request & Queuing
1. The client submits a download request (`POST /api/books/download`).
2. The service immediately inserts jobs into the `download_job` table with a `pending` status.
3. The API returns the job IDs and status `pending` to the client instantly, without blocking.
4. An internal queue worker is triggered asynchronously in the background.

### 4.2 Background Queue Worker Processing
The worker runs a loop processing `pending` jobs sequentially:
1. Picks the next `pending` job ordered by ID.
2. Updates the job status to `processing`.
3. **Title Extraction:** Analyzes the target URL to extract the book's slug as `title`.
4. **Duplicate Check:** Queries the database for the book `title`. If it exists (and `deleted = 0`), stops and marks the job as `failed` with a duplicate error.
5. **Scraping:** Fetches target HTML and extracts image links using regular expressions matching the OLM CDN pattern (`https://cdn3.olm.vn*`).
6. **Total Pages Update:** Updates the job record with the total page count.
7. **Database Initialization:** Inserts a new row in the `book` table to obtain a unique `book_id`.
8. **Folder Isolation:** Creates a temporary, isolated workspace directory `/downloads/book_{book_id}`.
9. **Sequential Download:** Downloads each image one-by-one into the isolated directory, storing a row in `book_page` and updating the job `current_page` field for progress tracking.
10. **Compression:** Compresses the isolated directory into `book_{book_id}.zip`.
11. **Completion Update:** Updates job status to `completed` and links the generated `book_id`.
12. **Cleanup & Failure Handling:** Inside a `finally` block, deletes local workspaces and zip files. If an exception occurs, updates job status to `failed` and saves the `error_message`.

## 5. API Specification

Interactive Swagger UI documentation is available at `/api/docs`.

### 5.1 POST `/api/books/download`
Queues book download tasks.

- **Request Body (JSON):**
```json
{
  "targetUrl": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
  "targetUrls": [
    "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai.4537689926"
  ]
}
```

- **Response Body (JSON - Success 200):**
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

### 5.2 GET `/api/books/download/status/:id`
Retrieves progress and status of a queued download job.

- **Response Body (JSON - Success 200):**
```json
{
  "id": 1,
  "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
  "status": "processing",
  "total_pages": 120,
  "current_page": 45,
  "book_id": null,
  "error_message": null,
  "created_at": "2026-06-05 08:30:00",
  "updated_at": "2026-06-05 08:31:12"
}
```

### 5.3 GET `/api/books`
Retrieves a list of all active books.
- **Response Body (JSON - Success 200):** `BookListItemDto[]`

### 5.4 GET `/api/books/:id`
Retrieves details of a specific book, including pages list.
- **Response Body (JSON - Success 200):** `BookDetailResponseDto`
- **Response status 404:** Book not found.

### 5.5 DELETE `/api/books/:id`
Soft-deletes a book and its page records from the database.
- **Response Body (JSON - Success 200):** `DeleteBookResponseDto`
- **Response status 404:** Book not found.

## 6. Environment

- **Server Port:** Configurable via `PORT` env variable (default is `3000`).
