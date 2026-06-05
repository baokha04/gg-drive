# gg-drive

Book Downloader Service built on NestJS. Accepts one or more web URLs of
reading material, scrapes target page image links, downloads them
sequentially to the local server, and compresses them into a ZIP archive.
Processing is asynchronous through a SQLite-backed job queue.

## Quick Start

```bash
pnpm install
pnpm run start:dev
```

The server boots on `http://localhost:3000` (override with `PORT`).

Interactive Swagger UI is at `http://localhost:3000/api/docs`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |

The service stores its SQLite database at `./database.db` (created on first
boot) and downloaded page archives under `./downloads/`.

## API

All endpoints are mounted under `/api/books`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/download` | Queue one or more book URLs for download. |
| `GET` | `/download/status/:id` | Get progress of a queued job. |
| `GET` | `/download/steps` | Get the download pipeline step order. |
| `GET` | `/download/jobs?status=` | List jobs, optionally filtered by status. |
| `POST` | `/download/retry/:id` | Retry a `failed` job from scratch. |
| `POST` | `/download/retry/:id/step` | Retry a `failed` job from a specific step. |
| `GET` | `/` | List all non-deleted books. |
| `GET` | `/:id` | Get a book with its pages. |
| `DELETE` | `/:id` | Soft-delete a book and its pages. |

### Queue a download

```bash
curl -X POST http://localhost:3000/api/books/download \
  -H 'Content-Type: application/json' \
  -d '{"targetUrl":"https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456"}'
```

A single URL can be passed as `targetUrl`; multiple URLs as `targetUrls`.

Duplicate URLs are resumed, not failed: if a book with the same `url` (or the
same `title`) already exists, the new job reuses the existing record and only
downloads the missing pages. See
[`docs/decisions/0006-duplicate-book-resume-policy.md`](docs/decisions/0006-duplicate-book-resume-policy.md).

## Validation

```bash
pnpm run validate:quick   # format:check + unit tests + build
pnpm run test:e2e         # full app + in-memory SQLite
pnpm run lint             # auto-fix ESLint issues
pnpm run lint:check       # strict check (pre-existing type noise)
```

## Architecture

The downloader is split into an orchestrator and four leaf services:

```
src/book-downloader/
  book-downloader.service.ts          # orchestrator, worker loop, public API
  book-downloader.controller.ts       # REST surface
  book-downloader.module.ts
  services/
    book-scraper.service.ts           # HTML fetch + OLM CDN image extraction
    page-downloader.service.ts        # sequential image download with retry
    archive.service.ts                # ZIP compression (archiver, level 9)
    book-resolver.service.ts          # duplicate detection + book/page records
```

The pipeline is `RESOLVE_BOOK → SCRAPE_PAGES → INIT_BOOK_RECORD →
DOWNLOAD_PAGES → ZIP_DIRECTORY`. Each step records its current state on
`download_job.current_step`, which is what the step-level retry endpoint
consumes.

## Docs

- [`docs/spec_description.md`](docs/spec_description.md) — full product spec.
- [`docs/HARNESS.md`](docs/HARNESS.md) — operating harness for humans and agents.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layering and boundary rules.
- [`docs/decisions/`](docs/decisions) — durable decision records.
- [`docs/stories/`](docs/stories) — story packets and validation evidence.

## Tech Stack

- **Runtime**: Node.js, NestJS 11.
- **Database**: SQLite3 (raw driver, promise-wrapped).
- **HTTP**: Axios (HTML fetch + streaming image download).
- **Archive**: Archiver (ZIP, level 9).
- **Docs**: Swagger via `@nestjs/swagger`.

## License

UNLICENSED — internal project.
