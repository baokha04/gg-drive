# Story Backlog

This backlog will be populated after a user provides a project spec or selects a
specific initiative.

Do not create every possible story packet up front. Create story packets when
the work is selected or when a product decision needs a durable place to land.

## Candidate Epics

| Epic | Description | Status |
| --- | --- | --- |
| E02-Observability | Structured request logs, `request_id` middleware, `/healthz` + `/readyz` endpoints. | unsliced |
| E02-Realtime | SSE or WebSocket channel for live job progress, replacing polling on `GET /download/status/:id`. | unsliced |
| E02-Multi-Scraper | Pluggable scraper strategies beyond the OLM CDN regex (generic image-link extraction, site-specific adapters). | unsliced |
| E02-Tech-Debt | Pay down pre-existing `recommendedTypeChecked` warnings on `axios`, `archiver`, and SQLite callbacks; promote `lint:check` into `validate:quick`. | unsliced |

## Recent Stories

| ID | Title | Status | Verified at |
| --- | --- | --- | --- |
| US-005 | Extract Catalog Scraper into separate module with SQLite persistence | implemented | 2026-06-06 |
| US-004 | Extract and Queue book URLs from Catalog Pages | implemented | 2026-06-05 |
| US-003 | Unit tests for retry, steps, and jobs endpoints | implemented | 2026-06-05 |
| US-002 | Refactor BookDownloaderService into leaf services | implemented | 2026-06-05 |
| US-001 | Implement Book Downloader Service core and database storage | implemented | earlier |

## Decision Records Linked From Backlog Items

- `docs/decisions/0006-duplicate-book-resume-policy.md` — closes the
  resume/fail-on-dup ambiguity. Read before opening any E02-Auth story that
  re-uses the queue.
