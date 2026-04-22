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

- `index.html`: main list page layout
- `conference.html`: per-conference detail page (`?id=<conference-id>`)
- `styles.css`: visual style
- `app.js`: main page filtering, sorting, countdowns
- `conference.js`: detail page rendering
- `utils.js`: shared parsing/formatting helpers
- `conferences.json`: all conference records and deadlines
- `scripts/fetch_deadlines.py`: optional helper that scrapes each conference's
  homepage and produces `deadlines-report.md` with candidate dates to review
  before editing `conferences.json` by hand

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

## Auto-scrape candidate deadlines (optional)

The homepage of each conference often has an "Important Dates" block. The
helper script below fetches each site listed in `conferences.json`, pulls out
any line that mentions deadline-ish keywords plus a date, and writes a
markdown report for you to review. It never touches `conferences.json`.

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/fetch_deadlines.py              # all conferences
python3 scripts/fetch_deadlines.py --id chi drs # only selected ids
python3 scripts/fetch_deadlines.py --json       # also dump raw JSON
```

Output: `deadlines-report.md` (ignored by git). Open it, compare to the
existing entries listed for each conference, and edit `conferences.json`
manually when something looks right. Expect some sites to 403 or to lack
structured date text — in that case follow the link and copy by hand.
