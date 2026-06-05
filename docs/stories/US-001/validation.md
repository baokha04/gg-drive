# Validation

## Proof Strategy

Before declaring this story complete, we must:
- Ensure the NestJS application builds without any TypeScript/Webpack compilation errors.
- Verify that all unit and integration tests (including the new regex title extraction, Vietnamese accents removal, and mock download/store books loops) pass cleanly.
- Verify that a local database `database.db` is correctly created and populated upon application boot.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | `string.utils.spec.ts` testing Vietnamese accent removal and title extraction from URL. |
| Integration | `book-downloader.service.spec.ts` testing full sequential download execution, duplicate title checking, and Google Drive upload logic with mock providers. |

## Fixtures

- Mock HTML response: containing sample matching CDN URLs `https://cdn3.olm.vn/...` and unmatching URLs to ensure regex works selectively.
- Mock database wrapper: simulated `DatabaseService` which intercepts and logs SQLite inputs without modifying an active disk database.
- Mock Google Drive API wrapper: simulated file uploader returning a predictable `webViewLink` structure.

## Commands

### Execute Unit and Integration Tests
```bash
pnpm run test
```

### Compile for Production
```bash
pnpm run build
```

## Acceptance Evidence

All 3 test suites and 10 unit/integration tests passed successfully.
- `src/common/string.utils.spec.ts` -> PASSED
- `src/app.controller.spec.ts` -> PASSED
- `src/book-downloader/book-downloader.service.spec.ts` -> PASSED
