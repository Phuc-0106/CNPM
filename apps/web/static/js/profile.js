const API_BASE = (() => {
  if (window.API_BASE) return window.API_BASE;
  const { protocol, hostname } = window.location;
  const localHostnames =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.");
  if (localHostnames) return `${protocol}//${hostname}:4000`;
  return "/api";
})();

function api(path) {
  if (!path.startsWith("/")) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

const els = {
  logout: document.querySelector("#logoutBtn"),
  avatar: document.querySelector("#profile-avatar"),
  name: document.querySelector("#profile-name"),
  email: document.querySelector("#profile-email"),
  id: document.querySelector("#profile-id"),
  major: document.querySelector("#profile-major"),
  phone: document.querySelector("#profile-phone"),
  historyAttendance: document.querySelector("#history-attendance"),
  historyBookings: document.querySelector("#history-bookings"),
  bookedList: document.querySelector("#booked-list"),
  bookedCount: document.querySelector("#booked-count"),
  attendedList: document.querySelector("#attended-list"),
  attendedCount: document.querySelector("#attended-count"),
  progressList: document.querySelector("#progress-list"),
  statHours: document.querySelector("#stat-hours"),
  statSessions: document.querySelector("#stat-sessions"),
  msg: document.querySelector("#profile-message"),
  tabRecent: document.querySelector("#tab-recent"),
  tabAll: document.querySelector("#tab-all"),
  attTabRecent: document.querySelector("#att-tab-recent"),
  attTabAll: document.querySelector("#att-tab-all"),
};

let profileData = null;
let tab = "recent";
let attendedTab = "recent";
let attendedSessions = [];
let editing = false;
let resourcesOpen = true;

function formatDateShort(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateCompact(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(
    d.getFullYear(),
  ).slice(-2)}`;
}

function formatPhoneDisplay(value) {
  if (!value) return "-";
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) return value;
  if (digits.length <= 4) return digits;
  return digits.replace(/(\+\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4").trim();
}

function formatEmailDisplay(value) {
  return value ? String(value).trim().toLowerCase() : "-";
}

function setMsg(text, error = false) {
  if (!els.msg) return;
  els.msg.textContent = text || "";
  els.msg.style.color = error ? "#fca5a5" : "var(--muted)";
}

function renderPrefs(prefs) {
  // preferences no longer shown
}

function renderHistory(list, container) {
  container.innerHTML = "";
  if (!list || !list.length) {
    const div = document.createElement("div");
    div.className = "muted tiny-top";
    div.textContent = "Nothing recorded.";
    container.appendChild(div);
    return;
  }

  list.slice(0, 2).forEach((h) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `
      <div class="history-date">${formatDateShort(h.date)}</div>
      <div class="history-text">${h.courseCode} - ${h.courseTitle} - ${h.mode}</div>
    `;
    container.appendChild(row);
  });
}

function renderBooked() {
  const all = profileData?.bookings || profileData?.bookedSessions || [];
  const recent = all.slice(0, 10);
  const visible = tab === "recent" ? recent : all;
  els.bookedList.innerHTML = "";
  els.bookedCount.textContent = `${all.length} total`;

  if (!visible.length) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.innerHTML = `<div class="empty-title">No booked sessions yet</div><p class="muted">Go to <a href="/student.html">Browse</a> and add a course.</p>`;
    els.bookedList.appendChild(div);
    return;
  }

  visible.forEach((s) => {
    const card = document.createElement("article");
    card.className = "booked-card";

    const top = document.createElement("div");
    top.className = "booked-top-row";
    const title = document.createElement("div");
    title.className = "booked-code";
    title.textContent = `${s.code} - ${s.title}`;
    const actions = document.createElement("div");
    actions.className = "booked-actions";
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const feedbackBtn = document.createElement("button");
    feedbackBtn.className = "btn tiny ghost";
    feedbackBtn.type = "button";
    feedbackBtn.textContent = "Feedback";
    feedbackBtn.addEventListener("click", () => openFeedbackModal(s));

    const viewLink = document.createElement("a");
    viewLink.className = "btn tiny primary";
    viewLink.href = `/session.html?id=${s.sessionId || s.id}`;
    viewLink.textContent = "View Session";

    actions.appendChild(feedbackBtn);
    actions.appendChild(viewLink);
    top.appendChild(title);
    top.appendChild(actions);

    const dates = document.createElement("div");
    dates.className = "booked-dates";
    dates.innerHTML = `<div><span class="muted">Added </span>${formatDateCompact(s.addedAt || s.date)}</div>
      <div><span class="muted">Scheduled </span>${formatDateCompact(s.scheduledAt || s.startDate)}</div>`;

    card.appendChild(top);
    card.appendChild(dates);
    els.bookedList.appendChild(card);
  });
}

function renderAttended() {
  const all = attendedSessions || [];
  const recent = all.slice(0, 10);
  const visible = attendedTab === "recent" ? recent : all;
  if (els.attendedCount) els.attendedCount.textContent = `${all.length} total`;
  if (!els.attendedList) return;
  els.attendedList.innerHTML = "";

  if (!visible.length) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.innerHTML = `<div class="empty-title">No attended sessions yet</div><p class="muted">Attend a session to see it here.</p>`;
    els.attendedList.appendChild(div);
    return;
  }

  visible.forEach((s) => {
    const card = document.createElement("article");
    card.className = "attended-card";

    const top = document.createElement("div");
    top.className = "booked-top-row";
    const title = document.createElement("div");
    title.className = "booked-code";
    title.textContent = `${s.code} - ${s.title}`;

    const actions = document.createElement("div");
    actions.className = "booked-actions";
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const feedbackBtn = document.createElement("button");
    feedbackBtn.className = "btn tiny ghost";
    feedbackBtn.type = "button";
    feedbackBtn.textContent = "Feedback";
    feedbackBtn.addEventListener("click", () => openFeedbackModal(s));

    const viewLink = document.createElement("a");
    viewLink.className = "btn tiny primary";
    viewLink.href = `/attended.html?id=${s.id}`;
    viewLink.textContent = "View Session";

    actions.appendChild(feedbackBtn);
    actions.appendChild(viewLink);
    top.appendChild(title);
    top.appendChild(actions);

    const dates = document.createElement("div");
    dates.className = "booked-dates";
    dates.innerHTML = `<div><span class="muted">Completed </span>${formatDateCompact(s.completedAt)}</div>
      <div><span class="muted">Tutor </span>${s.tutor || "TBD"}</div>`;

    card.appendChild(top);
    card.appendChild(dates);
    if (s.mode || s.dayOfWeek || (s.start && s.end)) {
      const meta = document.createElement("div");
      meta.className = "booked-dates";
      meta.innerHTML = `
        ${s.mode ? `<div><span class="muted">Mode </span>${s.mode}</div>` : ""}
        ${s.dayOfWeek ? `<div><span class="muted">Day </span>${s.dayOfWeek}</div>` : ""}
        ${s.start && s.end ? `<div><span class="muted">Time </span>${s.start}-${s.end}</div>` : ""}
      `;
      card.appendChild(meta);
    }
    els.attendedList.appendChild(card);
  });
}

function buildProgressFromHistory(history) {
  if (!history || !history.length) return [];
  return history.map((h, idx) => ({
    id: h.id || `hist-${idx}`,
    sessionId: h.sessionId || h.id || `hist-${idx}`,
    code: h.courseCode,
    title: h.courseTitle,
    startDate: h.date,
    endDate: h.date,
    percent: 80,
  }));
}

function renderProgress(list) {
  els.progressList.innerHTML = "";
  if (!list || !list.length) {
    const div = document.createElement("div");
    div.className = "muted tiny-top";
    div.textContent = "No active courses yet.";
    els.progressList.appendChild(div);
    return;
  }

  const percent = (start, end) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const now = Date.now();
    if (!s || !e || e <= s) return 0;
    const total = e - s;
    const elapsed = Math.min(Math.max(now - s, 0), total);
    return Math.round((elapsed / total) * 100);
  };

  list.forEach((p) => {
    const pct = p.percent ?? percent(p.startDate, p.endDate);
    const row = document.createElement("div");
    row.className = "progress-item";
    row.innerHTML = `
      <div class="progress-header">
        <span class="progress-code">${p.code}</span>
        <span class="progress-pct">${pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width:${pct}%;"></div>
      </div>
    `;
    els.progressList.appendChild(row);
  });
}

function renderProfile(data) {
  const me = data?.student || data?.me || {};
  els.avatar.textContent = (me.fullName || me.email || "ST").slice(0, 2).toUpperCase();
  els.name.textContent = me.fullName || "Student";
  els.email.textContent = formatEmailDisplay(me.email);
  els.id.textContent = me.studentId || "-";
  els.major.textContent = me.major || "-";
  els.phone.textContent = formatPhoneDisplay(me.phone);
  const bioEl = document.querySelector("#profile-bio");
  if (bioEl) {
    const words = (me.bio || "").trim().split(/\s+/).filter(Boolean);
    const maxWords = 40;
    const trimmed = words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : words.join(" ");
    bioEl.textContent = trimmed || "No bio yet.";
  }
  if (me.avatarUrl) {
    const img = document.createElement("img");
    img.src = me.avatarUrl;
    img.alt = "Avatar";
    img.style.maxWidth = "90px";
    img.style.borderRadius = "12px";
    els.avatar.innerHTML = "";
    els.avatar.appendChild(img);
  }

  renderPrefs(data?.preferences || []);
  // Attendance list mirrors attended sessions to stay consistent.
  const attendanceView = (attendedSessions || []).map((s, idx) => ({
    id: s.id || `att-${idx}`,
    date: s.completedAt,
    courseCode: s.code,
    courseTitle: s.title,
    mode: s.mode,
  }));
  renderHistory(attendanceView, els.historyAttendance);
  renderHistory(data?.history?.bookings || [], els.historyBookings);
  renderBooked();
  renderAttended();
  const progressItems = (data?.progress && data.progress.length ? data.progress : buildProgressFromHistory(data?.history?.attendance)) || [];
  renderProgress(progressItems);
  els.statHours.textContent = data?.stats?.hoursStudied ?? 0;
  els.statSessions.textContent = data?.stats?.sessionsAttended ?? 0;
}

async function fetchProfile() {
  try {
    const res = await fetch(api("/students/profile"), {
      credentials: "include",
    });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      setMsg("Unable to load profile.", true);
      return;
    }
    profileData = await res.json();
    renderProfile(profileData);
  } catch (err) {
    console.error(err);
    window.location.href = "/login.html";
  }
}

async function fetchAttended() {
  try {
    const res = await fetch(api("/sessions/attended"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    attendedSessions = data.attended || [];
    renderAttended();
    const attendanceView = (attendedSessions || []).map((s, idx) => ({
      id: s.id || `att-${idx}`,
      date: s.completedAt,
      courseCode: s.code,
      courseTitle: s.title,
      mode: s.mode,
    }));
    renderHistory(attendanceView, els.historyAttendance);
  } catch (err) {
    console.error(err);
  }
}

function attachEvents() {
  els.logout?.addEventListener("click", async () => {
    try {
      await fetch(api("/auth/logout"), { method: "POST", credentials: "include" });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.href = "/login.html";
    }
  });

  els.tabRecent?.addEventListener("click", () => {
    tab = "recent";
    els.tabRecent.classList.add("booked-tab-active");
    els.tabAll.classList.remove("booked-tab-active");
    renderBooked();
  });
  els.tabAll?.addEventListener("click", () => {
    tab = "all";
    els.tabAll.classList.add("booked-tab-active");
    els.tabRecent.classList.remove("booked-tab-active");
    renderBooked();
  });

  els.attTabRecent?.addEventListener("click", () => {
    attendedTab = "recent";
    els.attTabRecent.classList.add("booked-tab-active");
    els.attTabAll.classList.remove("booked-tab-active");
    renderAttended();
  });
  els.attTabAll?.addEventListener("click", () => {
    attendedTab = "all";
    els.attTabAll.classList.add("booked-tab-active");
    els.attTabRecent.classList.remove("booked-tab-active");
    renderAttended();
  });
}

(function modalSetup() {
  const editBtn = document.querySelector("#edit-profile-btn");
  const modal = document.querySelector("#edit-modal");
  const modalForm = document.querySelector("#modal-form");
  const modalClose = document.querySelector("#modal-close");
  const modalName = document.querySelector("#modal-name");
  const modalPhone = document.querySelector("#modal-phone");
  const modalMajor = document.querySelector("#modal-major");
  const modalBio = document.querySelector("#modal-bio");
  const modalEmail = document.querySelector("#modal-email");
  const modalStudentId = document.querySelector("#modal-studentId");
  const modalAvatar = document.querySelector("#modal-avatar");
  const modalPreview = document.querySelector("#modal-avatar-preview");

  if (!modal) return;

  function openModal() {
    if (!profileData) return;
    editing = true;
    modal.style.display = "grid";
    const me = profileData.student || profileData.me || {};
    modalName.value = me.fullName || "";
    modalPhone.value = me.phone ? formatPhoneDisplay(me.phone) : "";
    modalMajor.value = me.major || "";
    modalEmail.value = formatEmailDisplay(me.email) || "";
    modalStudentId.value = me.studentId || "";
    modalBio.value = me.bio || "";
    modalPreview.innerHTML = "";
    if (me.avatarUrl) {
      const img = document.createElement("img");
      img.src = me.avatarUrl;
      modalPreview.appendChild(img);
    } else {
      modalPreview.textContent = (me.fullName || "ST").slice(0, 2).toUpperCase();
    }
  }

  function closeModal() {
    editing = false;
    modal.style.display = "none";
  }

  editBtn?.addEventListener("click", openModal);
  modalClose?.addEventListener("click", closeModal);
  document.querySelector("#modal-cancel")?.addEventListener("click", closeModal);

  modalForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!profileData) return;
    setMsg("Saving...");

    try {
      const body = {
        fullName: modalName.value.trim(),
        phone: modalPhone.value.trim(),
        major: modalMajor.value.trim(),
        bio: modalBio.value.trim(),
      };

      await fetch(api("/students/profile"), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const file = modalAvatar.files?.[0];
      if (file) {
        const form = new FormData();
        form.append("file", file);
        await fetch(api("/students/profile/avatar"), {
          method: "POST",
          credentials: "include",
          body: form,
        });
      }

      await fetchProfile();
      setMsg("Profile updated.");
      closeModal();
    } catch (err) {
      console.error(err);
      setMsg("Failed to update profile.", true);
    }
  });

  modalAvatar?.addEventListener("change", () => {
    const file = modalAvatar.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        modalPreview.innerHTML = "";
        const img = document.createElement("img");
        img.src = reader.result;
        modalPreview.appendChild(img);
      }
    };
    reader.readAsDataURL(file);
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
})();

function setupResources() {
  const seeAll = document.querySelector("#resources-see-all");
  if (seeAll) {
    seeAll.onclick = openDownloadsPanel;
  }
  renderDownloads(4);
}

function setupModals() {
  const historyBtn = document.querySelector("#history-see-all");
  historyBtn?.addEventListener("click", () => openHistoryPanel());
}

let feedbackModalEl = null;
function openFeedbackModal(session) {
  if (feedbackModalEl) feedbackModalEl.remove();
  feedbackModalEl = document.createElement("div");
  feedbackModalEl.className = "modal-backdrop";
  feedbackModalEl.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Feedback for ${session.code}</h3>
        <button class="modal-close" aria-label="Close" id="fb-close">A-</button>
      </div>
      <div class="modal-body">
        <p class="muted">Share quick thoughts about ${session.title || "this session"}.</p>
        <textarea class="input modal-input" rows="4" placeholder="Your feedback..."></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" type="button" id="fb-cancel">Close</button>
        <button class="btn primary" type="button" id="fb-submit" disabled>Submit (mock)</button>
      </div>
    </div>
  `;
  document.body.appendChild(feedbackModalEl);
  const close = () => feedbackModalEl?.remove();
  feedbackModalEl.addEventListener("click", (e) => {
    if (e.target.id === "fb-close" || e.target.id === "fb-cancel" || e.target === feedbackModalEl) close();
  });
}

function getDownloads() {
  try {
    const raw = localStorage.getItem("bk_downloads");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDownloads(list) {
  try {
    localStorage.setItem("bk_downloads", JSON.stringify(list.slice(0, 50)));
  } catch (err) {
    console.error(err);
  }
}

function renderDownloads(limit = 4) {
  const list = document.querySelector("#resources-list");
  if (!list) return;
  const downloads = getDownloads();
  list.innerHTML = "";
  if (!downloads.length) {
    const div = document.createElement("div");
    div.className = "muted tiny-top";
    div.textContent = "No downloads yet. Download a resource from an attended session.";
    list.appendChild(div);
    return;
  }
  downloads.slice(0, limit).forEach((r) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `<div class="history-date">${r.date || ""}</div><div class="history-text">${r.name || ""}${r.size ? ` (${r.size})` : ""}</div>`;
    list.appendChild(row);
  });
}

function openDownloadsPanel() {
  let panel = document.querySelector("#downloads-panel");
  if (panel) panel.remove();
  panel = document.createElement("div");
  panel.id = "downloads-panel";
  panel.className = "modal-backdrop";
  const downloads = getDownloads();
  const rows =
    downloads
      .map(
        (r) => `
      <div class="history-item">
        <div class="history-date">${formatDateShort(r.date)}</div>
        <div class="history-text">${r.name || ""}${r.size ? ` (${r.size})` : ""}</div>
      </div>`
      )
      .join("") || `<div class="muted">No downloads yet.</div>`;

  panel.innerHTML = `
    <div class="modal" style="max-width:600px;max-height:80vh;overflow:auto;">
      <div class="modal-header">
        <h3 class="modal-title">Downloaded resources</h3>
        <button class="modal-close" aria-label="Close" id="dl-close">A-</button>
      </div>
      <div class="modal-body">
        <div class="history-list">${rows}</div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" type="button" id="dl-close-btn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  const close = () => panel?.remove();
  panel.addEventListener("click", (e) => {
    if (e.target === panel || e.target.id === "dl-close" || e.target.id === "dl-close-btn") close();
  });
}

let historyPanelEl = null;
function openHistoryPanel() {
  if (historyPanelEl) historyPanelEl.remove();
  historyPanelEl = document.createElement("div");
  historyPanelEl.className = "modal-backdrop";

  const attendance = (attendedSessions || []).map((s) => ({
    date: s.completedAt,
    courseCode: s.code,
    courseTitle: s.title,
    mode: s.mode,
  }));
  const bookings = profileData?.bookings || profileData?.bookedSessions || [];
  const bookingView = bookings.map((b, idx) => ({
    id: b.id || `bk-${idx}`,
    date: b.addedAt || b.scheduledAt || b.startDate,
    courseCode: b.code,
    courseTitle: b.title,
    mode: b.mode,
  }));

  const renderList = (items) =>
    (items || [])
      .map(
        (h) => `
      <div class="history-item">
        <div class="history-date">${formatDateShort(h.date)}</div>
        <div class="history-text">${h.courseCode || ""} - ${h.courseTitle || ""} - ${h.mode || ""}</div>
      </div>`
      )
      .join("") || `<div class="muted">No records.</div>`;

  historyPanelEl.innerHTML = `
    <div class="modal" style="max-width:720px;max-height:80vh;overflow:auto;">
      <div class="modal-header">
        <h3 class="modal-title">All history</h3>
        <button class="modal-close" aria-label="Close" id="hist-close">A-</button>
      </div>
      <div class="modal-body">
        <h4 class="profile-subtitle">Attended</h4>
        <div class="history-list">${renderList(attendance)}</div>
        <h4 class="profile-subtitle" style="margin-top:12px;">Booked</h4>
        <div class="history-list">${renderList(bookingView)}</div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" type="button" id="hist-close-btn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(historyPanelEl);
  const close = () => historyPanelEl?.remove();
  historyPanelEl.addEventListener("click", (e) => {
    if (e.target === historyPanelEl || e.target.id === "hist-close" || e.target.id === "hist-close-btn") close();
  });
}

(async function init() {
  attachEvents();
  await fetchProfile();
  await fetchAttended();
  setupResources();
  setupModals();
})();
