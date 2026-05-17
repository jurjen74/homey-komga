# Komga for Homey

Integrate your self-hosted [Komga](https://komga.org) comic and manga server with Homey. Monitor your library, track reading activity per household member, and trigger Homey flows when books are added or finished.

## Requirements

- A running Komga instance (v1.19 or newer) reachable from your Homey
- At least one Komga user account

---

## Devices

### Komga Server

One device represents one Komga server. It monitors the library and tracks newly added content.

**Sensors**

- **Books** — total number of books in the library
- **Series** — total number of series in the library
- **Status** — whether the Komga server is reachable

**Triggers**

- Komga server went offline
- Komga server came back online
- Book added to library — tokens: title, series, library
- Series added to library — tokens: title, library, number of books
- Any user started reading a book — tokens: title, series, user
- Any user finished reading a book — tokens: title, series, user
- Any user finished a complete series — tokens: series, number of books, user

**Conditions**

- Komga server is / is not online

**Actions**

- Scan a specific library
- Scan all libraries

---

### Komga User

One device per household member. Uses that person's own Komga credentials to track their individual reading activity.

**Sensors**

- **Unread** — number of unread books
- **On Deck** — number of books Komga recommends reading next
- **Reading** — number of books currently in progress

**Triggers**

- Started reading a book — tokens: title, series
- Finished reading a book — tokens: title, series
- Finished reading a complete series — tokens: series, number of books

**Conditions**

- User has / has no unread books
- User is / is not currently reading

---

## Widgets

### Recently Added

Shows the most recently added books from the server's library. Configurable layout (text only, cover and text, or covers only), optional week/month grouping, and adjustable item count.

### On Deck

Shows the books Komga recommends next for a specific user — books in series where the user has already started reading. Displays reading progress as a percentage.

### Popular

Shows the most-read books across all Komga User devices in the household, ranked by how many users have touched them. Useful for shared libraries.

All widgets support three display modes:

- **Text only** — compact list with title and subtitle
- **Cover & text** — book cover thumbnail alongside metadata
- **Covers only** — grid of thumbnails

---

## Setup

### Adding a server

1. Go to **Devices** and add a new device from the Komga app
2. Choose **Komga Server**
3. Enter the full host URL including port, e.g. `http://192.168.1.10:25600`
4. Enter admin or read-only credentials and test the connection
5. Adjust the poll interval in device settings (default: 60 seconds, minimum: 15)

### Adding a user

1. Add another device and choose **Komga User**
2. Enter the same host URL as the server device
3. Enter that user's own Komga credentials
4. Each person in the household gets their own device

---

## Notes

- The first poll after adding a device silently populates known books and series. Triggers only fire for content added after that point.
- The **series finished** trigger fires when a user has read every book in a series — Komga tracks this per user.
- Thumbnails in widgets are fetched server-side with authentication so they display without browser auth issues.
- The popular widget automatically aggregates reading activity from all Komga User devices, regardless of which server device is selected for it.
