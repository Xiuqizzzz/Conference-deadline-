"""Fetch candidate deadlines from each conference's website.

Usage:
    python3 scripts/fetch_deadlines.py                 # writes deadlines-report.md
    python3 scripts/fetch_deadlines.py --id chi drs    # only these ids
    python3 scripts/fetch_deadlines.py --json          # also dump raw JSON

Strategy (heuristic, never rewrites conferences.json automatically):
  1. Read conferences.json for each conference's website URL.
  2. Fetch the page HTML (with a polite User-Agent and 15s timeout).
  3. Strip scripts/styles, collapse whitespace, keep the visible text.
  4. Look for lines that mention deadline-ish keywords (deadline, submission,
     due, abstract, camera-ready, paper, notification, ...).
  5. Extract any dates found on those lines using a small set of regexes.
  6. Write a markdown report so the user can eyeball, compare to the current
     JSON, and decide what to update.

The goal is to be a reliable drafting aid, not a silent overwriter.
Install deps once:
    python3 -m pip install -r scripts/requirements.txt
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as exc:  # pragma: no cover - informative message only
    sys.stderr.write(
        "Missing dependency. Run: python3 -m pip install -r scripts/requirements.txt\n"
    )
    raise SystemExit(1) from exc


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFERENCES_JSON = PROJECT_ROOT / "conferences.json"
REPORT_MD = PROJECT_ROOT / "deadlines-report.md"
REPORT_JSON = PROJECT_ROOT / "deadlines-report.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
        "(KHTML, like Gecko) conference-deadline-tracker/0.1"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.8",
}

KEYWORDS = [
    "deadline",
    "due",
    "submission",
    "submit",
    "paper",
    "abstract",
    "camera-ready",
    "camera ready",
    "notification",
    "notify",
    "acceptance",
    "important dates",
    "call for papers",
]

MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december|"
    "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
)

DATE_PATTERNS = [
    # e.g. "September 11, 2025" / "11 September 2025"
    re.compile(rf"\b(?:{MONTHS})\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{{4}}\b", re.I),
    re.compile(rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{MONTHS})\s+\d{{4}}\b", re.I),
    # e.g. "2026-01-17"
    re.compile(r"\b\d{4}-\d{1,2}-\d{1,2}\b"),
    # e.g. "01/17/2026"
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b"),
    # e.g. "17.01.2026"
    re.compile(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b"),
]


@dataclass
class Candidate:
    context: str
    dates: list[str] = field(default_factory=list)


@dataclass
class FetchResult:
    id: str
    name: str
    website: str
    status: str  # "ok" | "http-error" | "network-error" | "skipped"
    detail: str = ""
    candidates: list[Candidate] = field(default_factory=list)


def load_conferences() -> list[dict]:
    with CONFERENCES_JSON.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def fetch_html(url: str, timeout: float = 15.0) -> tuple[int, str]:
    response = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
    response.raise_for_status()
    return response.status_code, response.text


def extract_visible_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def find_dates(text: str) -> list[str]:
    found: list[str] = []
    for pattern in DATE_PATTERNS:
        found.extend(match.group(0) for match in pattern.finditer(text))
    seen: set[str] = set()
    unique: list[str] = []
    for item in found:
        normalized = re.sub(r"\s+", " ", item).strip()
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(normalized)
    return unique


def pick_candidate_lines(text: str, window: int = 1) -> list[Candidate]:
    lines = text.splitlines()
    candidates: list[Candidate] = []
    for index, line in enumerate(lines):
        lower = line.lower()
        if not any(keyword in lower for keyword in KEYWORDS):
            continue
        start = max(0, index - window)
        end = min(len(lines), index + window + 1)
        window_text = " ".join(lines[start:end])
        dates = find_dates(window_text)
        if not dates:
            continue
        context = line if len(line) < 240 else line[:240] + "…"
        candidates.append(Candidate(context=context, dates=dates))

    deduped: list[Candidate] = []
    seen_contexts: set[str] = set()
    for cand in candidates:
        key = (cand.context.lower(), tuple(cand.dates))
        if key in seen_contexts:
            continue
        seen_contexts.add(key)
        deduped.append(cand)
    return deduped


def process_conference(conference: dict) -> FetchResult:
    cid = conference["id"]
    name = conference["name"]
    website = conference.get("website", "")
    if not website:
        return FetchResult(id=cid, name=name, website="", status="skipped", detail="no website in JSON")
    try:
        status_code, html = fetch_html(website)
    except requests.HTTPError as exc:
        return FetchResult(
            id=cid,
            name=name,
            website=website,
            status="http-error",
            detail=f"{exc.response.status_code} {exc.response.reason}",
        )
    except requests.RequestException as exc:
        return FetchResult(
            id=cid,
            name=name,
            website=website,
            status="network-error",
            detail=str(exc),
        )
    text = extract_visible_text(html)
    candidates = pick_candidate_lines(text)
    return FetchResult(
        id=cid,
        name=name,
        website=website,
        status="ok",
        detail=f"HTTP {status_code}, {len(candidates)} candidate lines",
        candidates=candidates,
    )


def write_markdown_report(results: Iterable[FetchResult], conferences: list[dict]) -> None:
    known_deadlines: dict[str, list[dict]] = {}
    for conf in conferences:
        known_deadlines[conf["id"]] = [
            {
                "track": sub.get("track", ""),
                "deadlineType": sub.get("deadlineType", ""),
                "forEdition": sub.get("forEdition", ""),
                "deadline": sub.get("deadline"),
                "estimated": sub.get("estimated", False),
            }
            for sub in conf.get("submissions", [])
        ]

    out: list[str] = []
    out.append("# Conference deadline scraping report\n")
    out.append(f"_Generated {time.strftime('%Y-%m-%d %H:%M:%S %Z')}_\n")
    out.append("Review each section and update `conferences.json` manually when a")
    out.append("candidate looks trustworthy. This report never modifies the JSON.\n")

    for result in results:
        out.append(f"## {result.name} (`{result.id}`)\n")
        out.append(f"- Website: {result.website or '—'}")
        out.append(f"- Fetch status: **{result.status}** — {result.detail or 'ok'}")

        existing = known_deadlines.get(result.id, [])
        if existing:
            out.append("- Currently in JSON:")
            for sub in existing:
                tag = " _(estimated)_" if sub["estimated"] else ""
                out.append(
                    f"    - `{sub['deadlineType']}` / `{sub['track']}` / `{sub['forEdition']}`: "
                    f"{sub['deadline'] or 'TBD'}{tag}"
                )
        else:
            out.append("- Currently in JSON: no submissions listed")

        if result.status != "ok":
            out.append("")
            continue

        if not result.candidates:
            out.append("- No deadline-like lines found on the homepage.\n")
            continue

        out.append("- Candidate lines from the site:")
        for cand in result.candidates:
            dates_fmt = ", ".join(f"`{d}`" for d in cand.dates)
            out.append(f"    - {dates_fmt} — {cand.context}")
        out.append("")

    REPORT_MD.write_text("\n".join(out), encoding="utf-8")


def write_json_report(results: Iterable[FetchResult]) -> None:
    payload = [
        {
            "id": r.id,
            "name": r.name,
            "website": r.website,
            "status": r.status,
            "detail": r.detail,
            "candidates": [
                {"context": c.context, "dates": c.dates} for c in r.candidates
            ],
        }
        for r in results
    ]
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--id", nargs="+", help="Only process these conference ids")
    parser.add_argument("--json", action="store_true", help="Also write deadlines-report.json")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay seconds between fetches")
    args = parser.parse_args()

    conferences = load_conferences()
    if args.id:
        wanted = set(args.id)
        conferences = [c for c in conferences if c["id"] in wanted]
        missing = wanted - {c["id"] for c in conferences}
        if missing:
            sys.stderr.write(f"Warning: unknown ids: {', '.join(sorted(missing))}\n")

    results: list[FetchResult] = []
    for index, conference in enumerate(conferences):
        name = conference["name"]
        print(f"[{index + 1}/{len(conferences)}] {name} …", flush=True)
        result = process_conference(conference)
        print(f"    {result.status}: {result.detail}")
        results.append(result)
        if index + 1 < len(conferences):
            time.sleep(args.delay)

    write_markdown_report(results, load_conferences())
    if args.json:
        write_json_report(results)

    print(f"\nReport: {REPORT_MD.relative_to(PROJECT_ROOT)}")
    if args.json:
        print(f"JSON:   {REPORT_JSON.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
