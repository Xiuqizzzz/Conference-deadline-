import {
  buildDeadlineItem,
  dateStatus,
  dedupeSubmissions,
  formatDeadlineLabel,
  formatEventSummary,
  isAbstractSubmission,
  isCameraReadySubmission,
  isEventPast,
  loadConferences,
  pickPrimarySubmission,
  sortByRelevance,
} from "./utils.js";

const ui = {
  list: document.querySelector("#deadline-list"),
  rowTemplate: document.querySelector("#row-template"),
  meta: document.querySelector("#meta"),
  searchInput: document.querySelector("#search-input"),
  categoryFilter: document.querySelector("#category-filter"),
  showPast: document.querySelector("#show-past"),
};

const state = {
  conferences: [],
  categories: new Set(),
  search: "",
  showPast: false,
};

function toggleCategory(category) {
  if (state.categories.has(category)) state.categories.delete(category);
  else state.categories.add(category);
  renderCategoryFilter();
  render();
}

function render() {
  const displayTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const list = state.conferences
    .map((conf) => {
      const visibleSubmissions = dedupeSubmissions(conf.submissions).filter(
        (s) =>
          !isAbstractSubmission(s) &&
          !isCameraReadySubmission(s) &&
          (state.showPast || s.status !== "past")
      );
      const primarySubmission = pickPrimarySubmission(visibleSubmissions);
      return { ...conf, visibleSubmissions, primarySubmission };
    })
    .filter((conf) => conf.visibleSubmissions.length > 0 && conf.primarySubmission)
    .filter(
      (conf) =>
        state.categories.size === 0 ||
        conf.categories.some((category) => state.categories.has(category))
    )
    .filter((conf) => {
      const haystack = [
        conf.name,
        conf.fullName || "",
        conf.upcomingEvent ? conf.upcomingEvent.location || "" : "",
        conf.categories.join(" "),
        ...conf.visibleSubmissions.map((s) => `${s.deadlineType} ${s.forEdition} ${s.note || ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(state.search.toLowerCase());
    })
    .sort((a, b) => {
      const hasCountdown = (conf) => {
        const s = conf.primarySubmission;
        return !!(s && s.deadlineDate && (s.status === "upcoming" || s.status === "today"));
      };
      const rank = (conf) => {
        if (hasCountdown(conf)) return 0;
        const event = conf.upcomingEvent;
        if (!event || !event.startDate) return 3;
        return isEventPast(event) ? 2 : 1;
      };
      const deadlineTime = (conf) =>
        conf.primarySubmission?.deadlineDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const eventTime = (conf) => {
        const event = conf.upcomingEvent;
        if (!event || !event.startDate) return 0;
        return new Date(`${event.startDate}T12:00:00Z`).getTime();
      };
      const aRank = rank(a);
      const bRank = rank(b);
      if (aRank !== bRank) return aRank - bRank;
      if (aRank === 0) return deadlineTime(a) - deadlineTime(b);
      if (aRank === 1) return eventTime(a) - eventTime(b);
      if (aRank === 2) return eventTime(b) - eventTime(a);
      return 0;
    });

  ui.list.innerHTML = "";
  if (list.length === 0) {
    ui.meta.textContent = "No matching conferences found for the current filters.";
    return;
  }

  const next = list
    .flatMap((c) => {
      const primary = pickPrimarySubmission(c.visibleSubmissions);
      return primary ? [{ c, s: primary }] : [];
    })
    .filter((x) => x.s.status === "upcoming" || x.s.status === "today")
    .sort(
      (a, b) =>
        (a.s.deadlineDate?.getTime() || Number.POSITIVE_INFINITY) -
        (b.s.deadlineDate?.getTime() || Number.POSITIVE_INFINITY)
    )[0];

  ui.meta.textContent = `Deadlines are shown in ${displayTimezone} time. ${list.length} conferences shown. ${
    next ? `Next deadline: ${next.c.name} (${formatDeadlineLabel(next.s)}).` : "No upcoming deadlines in current view."
  }`;

  const fragment = document.createDocumentFragment();
  for (const conf of list) {
    const rowEl = ui.rowTemplate.content.firstElementChild.cloneNode(true);

    const nameLink = rowEl.querySelector(".conf-name-link");
    nameLink.textContent = conf.name;
    nameLink.href = `./conference.html?id=${encodeURIComponent(conf.id)}`;

    const confLink = rowEl.querySelector(".conf-link");
    confLink.href = conf.website;

    rowEl.querySelector(".full-name").textContent = conf.fullName || "";

    const event = conf.upcomingEvent && !isEventPast(conf.upcomingEvent) ? conf.upcomingEvent : null;
    rowEl.querySelector(".event-line").textContent = event ? formatEventSummary(event) : "";

    const categoriesEl = rowEl.querySelector(".categories");
    categoriesEl.innerHTML = "";
    for (const category of conf.categories) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "category-chip";
      if (state.categories.has(category)) chip.classList.add("active");
      chip.textContent = category;
      chip.setAttribute("aria-pressed", state.categories.has(category) ? "true" : "false");
      chip.addEventListener("click", () => toggleCategory(category));
      categoriesEl.appendChild(chip);
    }

    const itemsContainer = rowEl.querySelector(".deadline-items");
    const orderedSubmissions = sortByRelevance(conf.visibleSubmissions);
    for (const submission of orderedSubmissions) {
      itemsContainer.appendChild(buildDeadlineItem(conf, submission));
    }
    fragment.appendChild(rowEl);
  }
  ui.list.appendChild(fragment);
}

function renderCategoryFilter() {
  const categories = [...new Set(state.conferences.flatMap((c) => c.categories))].sort();
  ui.categoryFilter.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "filter-chip";
  if (state.categories.size === 0) allChip.classList.add("active");
  allChip.textContent = "All";
  allChip.addEventListener("click", () => {
    state.categories.clear();
    renderCategoryFilter();
    render();
  });
  ui.categoryFilter.appendChild(allChip);

  for (const category of categories) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    if (state.categories.has(category)) chip.classList.add("active");
    chip.textContent = category;
    chip.setAttribute("aria-pressed", state.categories.has(category) ? "true" : "false");
    chip.addEventListener("click", () => toggleCategory(category));
    ui.categoryFilter.appendChild(chip);
  }
}

function attachEvents() {
  ui.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    render();
  });
  ui.showPast.addEventListener("change", (event) => {
    state.showPast = event.target.checked;
    render();
  });
}

async function init() {
  state.conferences = await loadConferences();
  renderCategoryFilter();
  attachEvents();
  render();

  setInterval(() => {
    for (const conference of state.conferences) {
      for (const submission of conference.submissions) {
        submission.status = dateStatus(submission.deadlineDate);
      }
    }
    render();
  }, 60 * 1000);
}

init().catch((error) => {
  ui.meta.textContent = "Failed to load conference data. Check conferences.json.";
  console.error(error);
});
