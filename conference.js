import {
  buildDeadlineItem,
  dedupeSubmissions,
  formatEventSummary,
  isEventPast,
  loadConferences,
  sortByRelevance,
} from "./utils.js";

const detailEl = document.querySelector("#detail");

function getConferenceId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function renderNotFound(id) {
  detailEl.innerHTML = "";
  const heading = document.createElement("h1");
  heading.textContent = "Conference not found";
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent = id
    ? `No conference matches id "${id}".`
    : "No conference id was provided in the URL.";
  detailEl.appendChild(heading);
  detailEl.appendChild(note);
}

function renderConference(conference) {
  document.title = `${conference.name} · Conference Deadlines`;
  detailEl.innerHTML = "";

  const header = document.createElement("header");
  header.className = "detail-header";

  const titleLine = document.createElement("div");
  titleLine.className = "title-line";
  const h1 = document.createElement("h1");
  h1.className = "conf-name";
  h1.textContent = conference.name;
  titleLine.appendChild(h1);
  if (conference.website) {
    const link = document.createElement("a");
    link.className = "conf-link";
    link.href = conference.website;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.setAttribute("aria-label", "Conference website");
    link.textContent = "🌐";
    titleLine.appendChild(link);
  }
  header.appendChild(titleLine);

  if (conference.fullName) {
    const fullName = document.createElement("p");
    fullName.className = "full-name";
    fullName.textContent = conference.fullName;
    header.appendChild(fullName);
  }

  const event =
    conference.upcomingEvent && !isEventPast(conference.upcomingEvent) ? conference.upcomingEvent : null;
  if (event) {
    const eventLine = document.createElement("p");
    eventLine.className = "event-line";
    eventLine.textContent = formatEventSummary(event);
    header.appendChild(eventLine);
  }

  if (conference.categories && conference.categories.length > 0) {
    const categoriesEl = document.createElement("div");
    categoriesEl.className = "categories";
    for (const category of conference.categories) {
      const chip = document.createElement("a");
      chip.className = "category-chip";
      chip.href = `./index.html#category=${encodeURIComponent(category)}`;
      chip.textContent = category;
      categoriesEl.appendChild(chip);
    }
    header.appendChild(categoriesEl);
  }

  detailEl.appendChild(header);

  if (conference.description) {
    const descSection = document.createElement("section");
    descSection.className = "detail-section";
    const descTitle = document.createElement("h2");
    descTitle.textContent = "About";
    const descBody = document.createElement("p");
    descBody.className = "description";
    descBody.textContent = conference.description;
    descSection.appendChild(descTitle);
    descSection.appendChild(descBody);
    detailEl.appendChild(descSection);
  }

  const deadlineSection = document.createElement("section");
  deadlineSection.className = "detail-section";
  const deadlineTitle = document.createElement("h2");
  deadlineTitle.textContent = "Deadlines";
  deadlineSection.appendChild(deadlineTitle);

  const submissions = sortByRelevance(dedupeSubmissions(conference.submissions));
  if (submissions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No deadlines listed yet.";
    deadlineSection.appendChild(empty);
  } else {
    const itemsContainer = document.createElement("div");
    itemsContainer.className = "deadline-items detail-deadlines";
    for (const submission of submissions) {
      const item = buildDeadlineItem(conference, submission);

      if (submission.forEdition) {
        const edition = document.createElement("p");
        edition.className = "deadline-edition";
        edition.textContent = `For ${submission.forEdition}${submission.estimated ? " · estimated" : ""}`;
        item.insertBefore(edition, item.children[1] || null);
      }

      itemsContainer.appendChild(item);
    }
    deadlineSection.appendChild(itemsContainer);
  }

  detailEl.appendChild(deadlineSection);
}

async function init() {
  const id = getConferenceId();
  try {
    const conferences = await loadConferences();
    const conference = conferences.find((c) => c.id === id);
    if (!conference) {
      renderNotFound(id);
      return;
    }
    renderConference(conference);
  } catch (error) {
    detailEl.innerHTML = "";
    const note = document.createElement("p");
    note.className = "meta";
    note.textContent = "Failed to load conference data. Check conferences.json.";
    detailEl.appendChild(note);
    console.error(error);
  }
}

init();
