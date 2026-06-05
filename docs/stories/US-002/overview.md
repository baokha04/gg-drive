# US-002 Refactor BookDownloaderService into Leaf Services

## Status

planned

## Lane

normal

## Product Contract

The `BookDownloaderService` continues to expose the same public API
(`downloadAndStoreBooks`, `findJobById`, `findAllJobs`, `findAllBooks`,
`findBookById`, `softDeleteBook`, `retryJob`, `retryJobStep`,
`getStepsList`). Internally, the worker pipeline is composed of leaf
services with single responsibilities.

## Relevant Product Docs

- `docs/spec_description.md`
- `docs/decisions/0006-duplicate-book-resume-policy.md`

## Acceptance Criteria

- `src/book-downloader/book-downloader.service.ts` is reduced to an
  orchestrator that owns `StepContext`, the step loop, the worker loop,
  and the public read/update API.
- Four leaf services live under `src/book-downloader/services/`:
  - `book-scraper.service.ts` — HTTP fetch and OLM image extraction.
  - `page-downloader.service.ts` — sequential image download with retry.
  - `archive.service.ts` — ZIP compression.
  - `book-resolver.service.ts` — duplicate detection, `book` row
    insert, `book_page` row insert, and resume-state reads.
- Each leaf service is ≤ 200 lines.
- All existing unit tests pass without modification of their assertions.
- All existing e2e tests pass without modification.

## Design Notes

- Commands: `pnpm run test`, `pnpm run test:e2e`.
- Queries: unchanged.
- API: unchanged (controller untouched).
- Tables: unchanged.
- Domain rules: duplicate policy is resume/merge per decision 0006.
- UI surfaces: none (backend only).

## Validation

`scripts/bin/harness-cli story update --id US-002 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | Existing `book-downloader.service.spec.ts` passes after refactor. |
| Integration | (none) |
| E2E | `pnpm run test:e2e` is green. |
| Platform | (not applicable) |
| Release | (not applicable) |

## Harness Delta

- New service layout recorded; future stories can target a single leaf.
- No new decision needed.

## Evidence

- `pnpm run test` output.
- `pnpm run test:e2e` output.
