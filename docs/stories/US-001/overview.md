# Overview

## Current Behavior

No book downloader module exists. The repository is a blank NestJS boilerplate template without database integration, file crawlers, zipping utilities, or Google Drive service uploaders.

## Target Behavior

A RESTful endpoint `POST /api/books/download` is exposed that:
- Batch-processes book URLs.
- Scrapes the image links (matching `https://cdn3.olm.vn*`).
- Downloads images locally into a `/downloads/book_{book_id}` directory.
- Archives the directory into a ZIP file.
- Uploads the ZIP to a specified Google Drive folder or Root.
- Cleans up temporary local files.
- Persists all operations in a local SQLite database (`database.db`) using four interconnected tables (`book`, `book_page`, `gg_folder`, `gg_drive`).
- Falls back to a simulated mock mode for Google Drive if `credentials.json` is missing.

## Affected Users

- API consumers and downstream client applications fetching books.

## Affected Product Docs

- `docs/spec_description.md`

## Non-Goals

- User Authentication/Authorization on the REST API endpoint (handled by infrastructure/gateway).
- Multi-threaded parallel file downloading for a single book (sequential download ensures proper ordering of pages).
