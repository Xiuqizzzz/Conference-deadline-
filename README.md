# Conference Deadline Tracker

Simple internal deadline tracker inspired by [HCI Deadlines](https://hci-deadlines.github.io/).

## Features

- Search by conference name
- Filter by submission track
- Sort by soonest/latest/name
- Toggle local time vs conference timezone vs UTC
- Show/hide past deadlines
- Live countdown per deadline
- One-click "Add to calendar" (`.ics`) for each entry

## Files

- `index.html`: page layout
- `styles.css`: visual style
- `app.js`: filtering, sorting, countdowns, timezone formatting
- `conferences.json`: all conference records and deadlines

## Update deadlines

Edit `conferences.json` and change any submission `deadline` value to:

`YYYY-MM-DDTHH:mm:ss`

Example:

```json
{ "track": "Papers", "deadline": "2026-09-12T19:00:00", "timezone": "Etc/UTC" }
```

Use `null` for unknown dates.

## Run locally

Because the app reads `conferences.json`, open it with a local server (not directly from Finder).

From this folder:

```bash
python3 -m http.server 8080
```

Then open:

http://localhost:8080
