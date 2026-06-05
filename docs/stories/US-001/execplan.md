# Exec Plan

## Goal

Successfully implement and verify the Book Downloader Service in NestJS.

## Scope

In scope:
- Express-free, NestJS modular layout under `src/`.
- Automatic table initialization in SQLite `database.db`.
- Axios-driven HTML crawling and image stream download.
- Local sequential file-saving to preserve page order.
- ZIP archival using `archiver`.
- Service Account Google Drive uploading.
- Automatic disk space cleanup of downloaded assets.
- Mock mode fallback for local testing when `credentials.json` is missing.

Out of scope:
- User logins / token auth endpoint (gateway level).
- Dynamic scraper templates (hardcoded for OLM cdn).

## Risk Classification

Risk flags:
- Data model (SQLite tables schema creation).
- External systems (Axios scraper, Google Drive uploads).
- Public contracts (Exposing POST API endpoint).
- Weak proof (Requires mock testing environment).

Hard gates:
- External provider behavior (Google Drive service account).

## Work Phases

1. **Discovery**: Reviewed NestJS setup and specification.
2. **Design**: Drafted modular structure and db queries.
3. **Validation planning**: Designed mock tests for crawler and database operations.
4. **Implementation**: Added utility files, database, google drive, and downloader modules.
5. **Verification**: Executed Jest tests and verified build.
6. **Harness update**: Record execution traces.

## Stop Conditions

Pause for human confirmation if:
- Target image URL matching pattern changes from `https://cdn3.olm.vn*`.
- Google Service Account requirements require interactive OAuth login instead of JSON key file.
