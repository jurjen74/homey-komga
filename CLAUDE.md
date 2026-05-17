# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A [Homey](https://homey.app) app (SDK v3, Node.js) that integrates with [Komga](https://komga.org) — a self-hosted comic/manga server — to allow automating a digital collection from Homey flows and devices.

App ID: `net.ladenius.komga`  
Komga API: Basic Auth (`Authorization: Basic base64(username:password)`)  
API docs (v1.24.4): `api-docs.json` in repo root  
Homey Community topic: 154996  
GitHub: https://github.com/jurjen74/homey-komga  

## Status

The app has been submitted to the Homey App Store (as of 2026-05-17). Treat any breaking changes carefully.

## Commands

```bash
npm run lint              # ESLint (athom/homey-app ruleset)
homey app build           # Regenerate app.json from .homeycompose — run after any compose file change
homey app run             # Install and run on a Homey (requires Homey CLI)
homey app validate        # Validate app structure
homey app publish         # Publish to Homey App Store
```

## Architecture

### Two drivers

**`komga-server`** — one device per Komga instance (any user credentials)
- Capabilities: `alarm_generic` (offline), `komga_book_count`, `komga_series_count`
- Triggers: `server_offline`, `server_online`, `book_added`, `series_added`
- Cross-device triggers (fired on server device): `any_user_book_started`, `any_user_book_finished`, `any_user_series_finished`
- Conditions: `komga_server_is_healthy`
- Actions: `scan_library` (autocomplete), `scan_all_libraries`
- New books/series detected by polling `POST /api/v1/books/list?sort=createdDate,desc` with page size 20; first poll populates silently
- `_cachedRecentBooks` stores slim objects (id, title, subtitle, badge, date, libraryId) — not full Komga DTOs

**`komga-user`** — one device per household member (per-user credentials)
- Capabilities: `komga_unread_count`, `komga_ondeck_count`, `komga_in_progress_count`
- Triggers: `book_started`, `book_finished`, `series_finished`
- Conditions: `has_unread_books`, `is_currently_reading`
- Reading activity tracked by polling IN_PROGRESS and READ books (page size 20); `series_finished` fires when `booksUnreadCount + booksInProgressCount === 0`

### Three widgets

**`komga-recent`** — bound to a server device; serves `_cachedRecentBooks` from the server device (no extra API call)  
**`komga-ondeck`** — bound to a user device; fresh `GET /api/v1/books/ondeck` per widget call  
**`komga-popular`** — bound to a server device (for thumbnails only); aggregates `getActivityBooks()` across **all** user devices — household-wide view  

### Thumbnail handling

Thumbnails require auth (`GET /api/v1/books/{id}/thumbnail`). Fetched server-side in `KomgaClient._requestBinary()` and returned as `data:image/jpeg;base64,...` strings so widgets embed them as `<img src>` without browser auth issues.

### Memory considerations

Homey self-hosted devices can be memory-constrained. Key decisions made to limit usage:
- `KomgaClient._request` collects response chunks as Buffers (not string concat) to avoid O(n²) allocations
- Poll page sizes capped at 20 (not 50) for books, series, in-progress, and read lists
- `_cachedRecentBooks` stores pre-extracted slim objects, not full Komga book DTOs
- Popular widget requests 20 activity books per user device (not 50)

## Key rules

- **Do not edit `app.json` directly** — it is auto-generated. Edit `.homeycompose/app.json` and the driver/widget compose files, then run `homey app build`.
- Each driver has its own `driver.compose.json` (capabilities, pair, settings) and `driver.flow.compose.json` (triggers, conditions, actions).
- Capabilities are defined in `.homeycompose/capabilities/*.json` and referenced by name in driver compose files.
- `lib/KomgaClient.js` has no external dependencies — uses Node built-in `http`/`https`.
- All translatable strings in compose files use `{ "en": "...", "nl": "...", "de": "..." }`. Locale files (`locales/en.json`, `nl.json`, `de.json`) cover pair screens and widget JS strings.

## SVG icon rules

- All icons (`assets/icon.svg`, `drivers/*/assets/icon.svg`) must have `viewBox="0 0 500 520"` — without it the icon does not render.
- Fill must use the brand color `#005ed3`, not white. White on transparent is invisible in the App Store and Homey web UI.
- Pair screens (`drivers/*/pair/connect.html`) inline the icon paths directly to avoid asset path resolution issues in the Homey webview.

## Asset sizes (for reference)

App images: `small.png` (250×175), `large.png` (500×350), `xlarge.png` (1000×700)  
Driver images: `small.png` (75×75), `large.png` (500×500), `xlarge.png` (1000×1000) — all three sizes required  
Widget previews: `preview-light.png` and `preview-dark.png` (1024×1024) — auto-discovered from widget folder, no compose entry needed  
Icons: `.svg` with transparent background and `viewBox` set  

## Komga API notes (v1.24.4)

Deprecated — do not use: `GET /api/v1/books`, `GET /api/v1/series`, `GET /api/v1/authors` (deprecated since 1.19–1.20).

Use these instead:

- Auth test / current user: `GET /api/v2/users/me`
- List books: `POST /api/v1/books/list` — body `{ condition: { readStatus: { operator: 'is', value: 'UNREAD' } } }`, pagination as query params
- List series: `POST /api/v1/series/list` — body `{}`, pagination as query params
- On-deck books: `GET /api/v1/books/ondeck` (no hyphen)
- Libraries, scan, thumbnail, series-by-ID: current v1 endpoints, no change needed
