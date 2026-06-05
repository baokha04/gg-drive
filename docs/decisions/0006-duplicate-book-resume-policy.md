# 0006 Duplicate Book Resume Policy

Date: 2026-06-05

## Status

Accepted

## Context

The original spec (`docs/spec_description.md` §4.2.4) stated that on duplicate
book detection the worker would stop and mark the job as `failed` with a
duplicate error. The current implementation in
`src/book-downloader/book-downloader.service.ts` does the opposite: it resumes
the job, reuses the existing `book` record, and merges new pages. The mismatch
surfaced as a failing E2E test (`test/book-downloader.e2e-spec.ts` "should
queue and mark duplicate downloads as failed") and as harness friction recorded
in trace #12.

Two product behaviors are reasonable:

1. Fail loudly on duplicates so the caller knows nothing changed.
2. Resume / merge so the caller can re-trigger an incomplete download without
   losing prior progress.

The user has chosen resume / merge because it matches the actual operator
workflow (re-queuing a partially downloaded book to fill in missing pages).

## Decision

Duplicate book handling is **resume / merge**, not fail-fast.

Behavior:

- If a non-deleted `book` row already exists for the same `url`, the worker
  reuses its `id`, rewrites `total_pages` from the new scrape, and downloads
  only the pages that are missing.
- If a non-deleted `book` row exists for the same `title` (but a different
  `url`), the worker still reuses the existing `id` and merges.
- The job is marked `completed` with the existing `book_id`. No duplicate
  error is raised.
- The corresponding E2E test in `test/book-downloader.e2e-spec.ts` is updated
  to assert the resume / merge outcome.

## Alternatives Considered

1. **Fail on duplicate (original spec behavior).** Rejected — would force the
   caller to delete the old record before retrying, which is hostile to the
   common "refill a few missing pages" workflow.
2. **Configurable via env (`DUP_POLICY=resume|fail`).** Deferred — added
   complexity for a single-user operator use case. Re-evaluate if a second
   caller with different needs appears.

## Consequences

Positive:

- Re-queueing an incomplete download finishes the job instead of failing.
- Less operator friction; no manual DB cleanup needed.
- The test gap is closed; the matrix proof is restored to `e2e = yes`.

Tradeoffs:

- The original spec is no longer the source of truth for this behavior. Anyone
  reading `docs/spec_description.md` in isolation would be misled. Mitigated by
  the inline pointer to this decision file.
- A "duplicate" call now silently does work. Caller cannot distinguish "I
  queued a new book" from "I resumed an existing one" without inspecting the
  returned `book_id` and `total_pages`.

## Follow-Up

- Keep this decision linked from the spec section it overrides.
- If multiple callers with different needs appear, re-open the decision and
  consider the env-configurable alternative.
