export function parseDeadline(deadline, timezone) {
  if (!deadline) return null;
  const timezoneOffsetMap = {
    "Etc/UTC": "Z",
    UTC: "Z",
    "America/New_York": "-04:00",
    "America/Los_Angeles": "-07:00",
    "Etc/GMT+12": "-12:00",
    AoE: "-12:00",
    "Asia/Seoul": "+09:00",
  };
  const explicitOffset = timezoneOffsetMap[timezone || "Etc/UTC"] || "Z";
  const parsed = new Date(`${deadline}${explicitOffset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateStatus(dateValue) {
  if (!dateValue) return "unknown";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  if (dateValue >= startOfToday && dateValue < startOfTomorrow) return "today";
  if (dateValue < now) return "past";
  return "upcoming";
}

export function countdownText(dateValue) {
  if (!dateValue) return "Deadline not announced";
  const diff = dateValue.getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((absDiff / (1000 * 60)) % 60);
  return diff >= 0
    ? `${days}d ${hours}h ${minutes}m remaining`
    : `${days}d ${hours}h ${minutes}m ago`;
}

export function formatInTimezone(dateValue, conferenceTimezone) {
  if (!dateValue) return "TBD";
  const timezone = conferenceTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).format(dateValue);
}

export function formatEventSummary(event) {
  if (!event || (!event.startDate && !event.endDate)) return "Event dates TBA";
  const start = event.startDate ? new Date(`${event.startDate}T12:00:00Z`) : null;
  const end = event.endDate ? new Date(`${event.endDate}T12:00:00Z`) : null;
  const monthDay = (d) =>
    new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "Etc/UTC" }).format(d);
  const year = (d) =>
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Etc/UTC" }).format(d);
  const locationText = event.location ? `, ${event.location}` : "";
  if (start && end) return `${monthDay(start)}-${monthDay(end)} ${year(end)}${locationText}`;
  const only = start || end;
  return `${monthDay(only)} ${year(only)}${locationText}`;
}

function toUtcCompact(dateValue) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${dateValue.getUTCFullYear()}${pad(dateValue.getUTCMonth() + 1)}${pad(
    dateValue.getUTCDate()
  )}T${pad(dateValue.getUTCHours())}${pad(dateValue.getUTCMinutes())}${pad(dateValue.getUTCSeconds())}Z`;
}

export function toICSUrl(conference, submission) {
  if (!submission.deadlineDate) return "#";
  const startUtc = toUtcCompact(submission.deadlineDate);
  const endUtc = toUtcCompact(new Date(submission.deadlineDate.getTime() + 60 * 60 * 1000));
  const summary = `${conference.name} - ${submission.deadlineType}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${conference.id}-${submission.deadlineType.replaceAll(" ", "-")}@conference-tracker`,
    `DTSTAMP:${toUtcCompact(new Date())}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${submission.deadlineType} for ${conference.name} ${submission.forEdition || ""}`.trim(),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;
}

export function normalizeCategories(conference) {
  if (Array.isArray(conference.categories) && conference.categories.length > 0) return conference.categories;
  if (conference.category) return [conference.category];
  return ["Other"];
}

export function isEventPast(event) {
  if (!event || !event.endDate) return false;
  return new Date(`${event.endDate}T23:59:59Z`).getTime() < Date.now();
}

export function isPaperLike(submission) {
  const text = `${submission.deadlineType || ""} ${submission.track || ""}`.toLowerCase();
  return (
    text.includes("paper") ||
    text.includes("main track") ||
    text.includes("full") ||
    text.includes("submission")
  );
}

export function isAbstractSubmission(submission) {
  const text = `${submission.deadlineType || ""} ${submission.track || ""}`.toLowerCase();
  return text.includes("abstract");
}

export function isCameraReadySubmission(submission) {
  const text = `${submission.deadlineType || ""} ${submission.track || ""}`.toLowerCase();
  return text.includes("camera-ready") || text.includes("camera ready");
}

export function sortByRelevance(submissions) {
  const statusRank = (submission) => {
    if (submission.status === "today" || submission.status === "upcoming") return 0;
    if (submission.status === "unknown") return 1;
    return 2;
  };
  return [...submissions].sort((a, b) => {
    const rankDiff = statusRank(a) - statusRank(b);
    if (rankDiff !== 0) return rankDiff;
    const aTime = a.deadlineDate ? a.deadlineDate.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.deadlineDate ? b.deadlineDate.getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

export function pickPrimarySubmission(submissions) {
  const paperCandidates = submissions.filter(isPaperLike);
  const pool = paperCandidates.length > 0 ? paperCandidates : submissions;
  const sorted = sortByRelevance(pool);
  return sorted[0] || null;
}

export function dedupeSubmissions(submissions) {
  const seen = new Set();
  const unique = [];
  for (const submission of submissions) {
    const key = [
      submission.deadlineType || "",
      submission.track || "",
      submission.forEdition || "",
      submission.deadlineDate ? submission.deadlineDate.getTime() : "none",
      submission.timezone || "",
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(submission);
  }
  return unique;
}

export function formatDeadlineLabel(submission) {
  const rawLabel = (submission.deadlineType || submission.track || "Deadline").trim();
  const compactLabel = rawLabel.replace(/\s+deadline$/i, "");
  return compactLabel || "Deadline";
}

export function buildDeadlineItem(conference, submission) {
  const item = document.createElement("div");
  item.className = "deadline-item";
  item.dataset.status = submission.status || "unknown";

  const titleEl = document.createElement("p");
  titleEl.className = "deadline-title";
  titleEl.textContent = formatDeadlineLabel(submission);

  const dateEl = document.createElement("p");
  dateEl.className = "deadline-date";
  dateEl.textContent = formatInTimezone(submission.deadlineDate, submission.timezone);

  const countdown = document.createElement("p");
  countdown.className = "deadline-countdown";
  if (!submission.deadlineDate && submission.estimateBasis) {
    countdown.textContent = submission.estimateBasis;
  } else {
    countdown.textContent = countdownText(submission.deadlineDate);
  }

  const calendar = document.createElement("a");
  calendar.className = "calendar-link";
  calendar.textContent = "📅 Add to Calendar";
  calendar.href = toICSUrl(conference, submission);
  if (submission.deadlineDate) {
    calendar.setAttribute(
      "download",
      `${conference.id}-${(submission.deadlineType || "deadline").replaceAll(" ", "-")}.ics`
    );
  } else {
    calendar.removeAttribute("href");
    calendar.style.pointerEvents = "none";
    calendar.style.opacity = "0.45";
  }

  item.appendChild(titleEl);
  item.appendChild(dateEl);
  item.appendChild(countdown);
  item.appendChild(calendar);
  return item;
}

export async function loadConferences() {
  const response = await fetch("./conferences.json");
  const conferenceData = await response.json();
  return conferenceData.map((conference) => ({
    ...conference,
    categories: normalizeCategories(conference),
    submissions: (conference.submissions || []).map((submission) => {
      const deadlineDate = parseDeadline(submission.deadline, submission.timezone);
      return {
        ...submission,
        deadlineDate,
        status: dateStatus(deadlineDate),
        estimateBasis: submission.estimate_basis || "",
      };
    }),
  }));
}
