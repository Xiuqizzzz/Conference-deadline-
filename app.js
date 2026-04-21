const ui = {
  list: document.querySelector("#deadline-list"),
  rowTemplate: document.querySelector("#row-template"),
  meta: document.querySelector("#meta"),
  searchInput: document.querySelector("#search-input"),
  categoryFilter: document.querySelector("#category-filter"),
  sortSelect: document.querySelector("#sort-select"),
  timezoneMode: document.querySelector("#timezone-mode"),
  showPast: document.querySelector("#show-past"),
};

const state = {
  rows: [],
  category: "all",
  search: "",
  sort: "soonest",
  timezoneMode: "local",
  showPast: false,
};

function parseDeadline(deadline, timezone) {
  if (!deadline) {
    return null;
  }

  const normalizedTimezone = timezone || "Etc/UTC";
  const timezoneOffsetMap = {
    "Etc/UTC": "Z",
    UTC: "Z",
    "America/New_York": "-04:00",
    "America/Los_Angeles": "-07:00",
  };

  const explicitOffset = timezoneOffsetMap[normalizedTimezone] || "Z";
  const withOffset = `${deadline}${explicitOffset}`;
  const parsed = new Date(withOffset);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function dateStatus(dateValue) {
  if (!dateValue) {
    return "unknown";
  }

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0
  );
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  if (dateValue >= startOfToday && dateValue < startOfTomorrow) {
    return "today";
  }
  if (dateValue < now) {
    return "past";
  }
  return "upcoming";
}

function countdownText(dateValue) {
  if (!dateValue) {
    return "Deadline not announced";
  }

  const now = new Date();
  const diff = dateValue.getTime() - now.getTime();
  const absDiff = Math.abs(diff);

  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((absDiff / (1000 * 60)) % 60);

  if (diff >= 0) {
    return `${days}d ${hours}h ${minutes}m remaining`;
  }
  return `${days}d ${hours}h ${minutes}m ago`;
}

function formatInTimezone(dateValue, timezoneMode, conferenceTimezone) {
  if (!dateValue) {
    return "TBD";
  }

  let timezone;
  if (timezoneMode === "conference") {
    timezone = conferenceTimezone || "Etc/UTC";
  } else if (timezoneMode === "utc") {
    timezone = "Etc/UTC";
  } else {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(dateValue);
}

function toICSUrl(row) {
  if (!row.deadlineDate) {
    return "#";
  }

  const pad = (value) => String(value).padStart(2, "0");
  const date = row.deadlineDate;
  const toUtcString = (d) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
      d.getUTCDate()
    )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const startUtc = toUtcString(date);
  const endUtc = toUtcString(new Date(date.getTime() + 60 * 60 * 1000));
  const safeTitle = `${row.conference.name} - ${row.track}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${row.conference.id}-${row.track.replaceAll(" ", "-")}@conference-tracker`,
    `DTSTAMP:${toUtcString(new Date())}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:Submission deadline for ${safeTitle}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;
}

function render() {
  const filteredRows = state.rows
    .filter((row) => {
      if (!state.showPast && row.status === "past") {
        return false;
      }

      if (state.category !== "all" && !row.categories.includes(state.category)) {
        return false;
      }

      const haystack = [
        row.conference.name,
        row.conference.fullName || "",
        row.conference.description || "",
        row.conference.location || "",
        row.track,
        row.categories.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(state.search.toLowerCase())) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (state.sort === "name") {
        return a.conference.name.localeCompare(b.conference.name);
      }

      const aTime = a.deadlineDate ? a.deadlineDate.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.deadlineDate ? b.deadlineDate.getTime() : Number.POSITIVE_INFINITY;

      return state.sort === "soonest" ? aTime - bTime : bTime - aTime;
    });

  ui.list.innerHTML = "";

  if (filteredRows.length === 0) {
    ui.meta.textContent = "No matching deadlines found for the current filters.";
    return;
  }

  const nextUpcoming = filteredRows.find((row) => row.status === "upcoming" || row.status === "today");
  const nextText = nextUpcoming
    ? `Next deadline: ${nextUpcoming.conference.name} (${nextUpcoming.track})`
    : "No upcoming deadlines in current view.";
  ui.meta.textContent = `${filteredRows.length} submission deadlines shown. ${nextText}`;

  const fragment = document.createDocumentFragment();

  for (const row of filteredRows) {
    const rowEl = ui.rowTemplate.content.firstElementChild.cloneNode(true);

    rowEl.querySelector(".conf-name").textContent = row.conference.name;
    rowEl.querySelector(".full-name").textContent = row.conference.fullName || "";
    rowEl.querySelector(".track-name").textContent = row.track;
    rowEl.querySelector(".description").textContent = row.conference.description || "";
    rowEl.querySelector(".location-text").textContent =
      row.conference.location || "Location TBA";

    const categoriesEl = rowEl.querySelector(".categories");
    categoriesEl.innerHTML = "";
    for (const category of row.categories) {
      const chip = document.createElement("span");
      chip.className = "category-chip";
      chip.textContent = category;
      categoriesEl.appendChild(chip);
    }

    rowEl.querySelector(".deadline-time").textContent = formatInTimezone(
      row.deadlineDate,
      state.timezoneMode,
      row.timezone
    );
    rowEl.querySelector(".countdown").textContent = countdownText(row.deadlineDate);

    const statusBadge = rowEl.querySelector(".status-badge");
    statusBadge.classList.add(row.status);
    if (row.status === "today") statusBadge.textContent = "Due today";
    else if (row.status === "upcoming") statusBadge.textContent = "Upcoming";
    else if (row.status === "past") statusBadge.textContent = "Past";
    else statusBadge.textContent = "TBD";

    const websiteLink = rowEl.querySelector(".website-link");
    websiteLink.href = row.conference.website;

    const calendarLink = rowEl.querySelector(".calendar-link");
    calendarLink.href = toICSUrl(row);
    if (!row.deadlineDate) {
      calendarLink.removeAttribute("href");
      calendarLink.setAttribute("aria-disabled", "true");
      calendarLink.style.pointerEvents = "none";
      calendarLink.style.opacity = "0.5";
    } else {
      calendarLink.setAttribute("download", `${row.conference.id}-${row.track}.ics`);
    }

    fragment.appendChild(rowEl);
  }

  ui.list.appendChild(fragment);
}

function syncCategoryOptions() {
  const all = new Set();
  for (const row of state.rows) {
    for (const category of row.categories) {
      all.add(category);
    }
  }
  const categories = [...all].sort();

  ui.categoryFilter.innerHTML = '<option value="all">All categories</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    ui.categoryFilter.appendChild(option);
  }
}

function attachEvents() {
  ui.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    render();
  });

  ui.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  ui.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  ui.timezoneMode.addEventListener("change", (event) => {
    state.timezoneMode = event.target.value;
    render();
  });

  ui.showPast.addEventListener("change", (event) => {
    state.showPast = event.target.checked;
    render();
  });
}

function normalizeCategories(conference) {
  if (Array.isArray(conference.categories) && conference.categories.length > 0) {
    return conference.categories;
  }
  if (conference.category) {
    return [conference.category];
  }
  return ["Other"];
}

async function init() {
  const response = await fetch("./conferences.json");
  const conferenceData = await response.json();

  const rows = [];
  for (const conference of conferenceData) {
    const categories = normalizeCategories(conference);
    for (const submission of conference.submissions) {
      const deadlineDate = parseDeadline(submission.deadline, submission.timezone);
      rows.push({
        conference,
        categories,
        track: submission.track,
        timezone: submission.timezone,
        deadlineDate,
        status: dateStatus(deadlineDate),
      });
    }
  }

  state.rows = rows;
  syncCategoryOptions();
  attachEvents();
  render();

  setInterval(() => {
    for (const row of state.rows) {
      row.status = dateStatus(row.deadlineDate);
    }
    render();
  }, 60 * 1000);
}

init().catch((error) => {
  ui.meta.textContent = "Failed to load conference data. Check conferences.json.";
  console.error(error);
});
