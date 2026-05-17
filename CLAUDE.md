# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A [Homey](https://homey.app) app (SDK v3, Node.js) that integrates with [Komga](https://komga.org) — a self-hosted comic/manga server — to allow automating a digital collection from Homey flows and devices.

App ID: `net.ladenius.komga`  
Komga API: Basic Auth (`Authorization: Basic base64(username:password)`)  
API docs (v1.24.4): `api-docs.json` in repo root

## Commands

```bash
npm run lint              # ESLint (athom/homey-app ruleset)
homey app run             # Install and run on a Homey (requires Homey CLI)
homey app validate        # Validate app structure
homey app publish         # Publish to Homey App Store
```

## Architecture

### Two drivers

**`komga-server`** — one device per Komga instance (any user credentials)
- Capabilities: `alarm_generic` (offline), `komga_book_count`, `komga_series_count`
- Triggers: `server_offline`, `server_online`, `book_added`, `series_added`
- Conditions: `komga_server_is_healthy`
- Actions: `scan_library` (autocomplete), `scan_all_libraries`
- New books/series are detected by polling `POST /api/v1/books/list?sort=createdDate,desc` and tracking seen IDs; first poll populates silently with no triggers

**`komga-user`** — one device per household member (per-user credentials)
- Capabilities: `komga_unread_count`, `komga_ondeck_count`, `komga_in_progress_count`
- Triggers: `book_started`, `book_finished`, `series_finished`
- Conditions: `has_unread_books`, `is_currently_reading`
- Reading activity tracked by polling `IN_PROGRESS` and `READ` books; `series_finished` fires when `booksUnreadCount + booksInProgressCount === 0` for the series

### Three widgets

| Widget | Bound device | API method | Source |
|---|---|---|---|
| `komga-recent` | server | `getRecent` | `_cachedRecentBooks` in server device |
| `komga-ondeck` | user | `getOnDeck` | Fresh `GET /api/v1/books/ondeck` per call |
| `komga-popular` | server (for thumbnails) | `getPopular` | Aggregates `getActivityBooks()` across **all** user devices |

The popular widget automatically finds all `komga-user` devices regardless of which server device is selected — it's a household-wide view.

### Thumbnail handling

Thumbnails require auth (`GET /api/v1/books/{id}/thumbnail`). They are fetched server-side in `KomgaClient._requestBinary()` and returned as `data:image/jpeg;base64,...` strings so the widget can embed them as `<img src>` without browser auth issues.

## Key rules

- **Do not edit `app.json` directly** — it is auto-generated. Edit `.homeycompose/app.json` and the driver/widget compose files, then run `homey app build`.
- Each driver has its own `driver.compose.json` (capabilities, pair, settings) and `driver.flow.compose.json` (triggers, conditions, actions).
- Capabilities are defined in `.homeycompose/capabilities/*.json` and referenced by name in driver compose files.
- `lib/KomgaClient.js` has no external dependencies — uses Node built-in `http`/`https`.

## Komga API notes (v1.24.4)

Several v1 endpoints are deprecated — use these instead:

| Purpose | Correct endpoint |
|---|---|
| Current user / auth test | `GET /api/v2/users/me` |
| List books (with optional read_status filter) | `POST /api/v1/books/list` — body `{ condition: { readStatus: { operator: 'is', value: 'UNREAD' } } }`, pagination as query params |
| List series | `POST /api/v1/series/list` — body `{}`, pagination as query params |
| On-deck books | `GET /api/v1/books/ondeck` — note: no hyphen |

`GET /api/v1/books`, `GET /api/v1/series`, and `GET /api/v1/authors` are all deprecated since 1.19–1.20. `GET /api/v1/libraries`, scan, thumbnail, and series-by-ID endpoints are current.

## Known TODOs

- All image assets (driver, app-level, widget previews) are placeholder solid-color PNGs — replace with proper artwork before App Store submission.
  - App: `assets/images/small.png` (250×175), `large.png` (500×350), `xlarge.png` (1000×700)
  - Drivers: `assets/images/small.png` (75×75), `large.png` (500×500), `xlarge.png` (1000×1000) for both `komga-server` and `komga-user`
  - Widgets: `preview-light.png` and `preview-dark.png` (512×256) per widget directory
