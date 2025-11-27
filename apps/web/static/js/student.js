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

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const state = {
  query: "",
  modes: { Online: true, "On campus": true },
  availability: [0, 24],
  selectedDays: [],
  page: 1,
  pageSize: 4,
  profile: null,
  courses: [],
  cart: [],
  registered: new Set(),
  sidebar: null,
  activeConvId: null,
  activeConvTitle: "",
  messages: [],
};

const els = {
  logout: document.querySelector("#logoutBtn"),
  code: document.querySelector("#filter-code"),
  dayChips: document.querySelector("#day-chips"),
  fromHour: document.querySelector("#from-hour"),
  toHour: document.querySelector("#to-hour"),
  rangeLabel: document.querySelector("#range-label"),
  modeOnline: document.querySelector("#mode-online"),
  modeCampus: document.querySelector("#mode-campus"),
  reset: document.querySelector("#reset-filters"),
  coursesLoading: document.querySelector("#courses-loading"),
  coursesError: document.querySelector("#courses-error"),
  coursesList: document.querySelector("#courses-list"),
  coursesCount: document.querySelector("#courses-count"),
  coursesEmpty: document.querySelector("#courses-empty"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  pageInfo: document.querySelector("#page-info"),
  regList: document.querySelector("#reg-list"),
  confirm: document.querySelector("#confirm-btn"),
  msgAvatar: document.querySelector("#msg-avatar"),
  msgName: document.querySelector("#msg-name"),
  msgId: document.querySelector("#msg-id"),
  groupThreads: document.querySelector("#group-threads"),
  directThreads: document.querySelector("#direct-threads"),
  groupCount: document.querySelector("#group-count"),
  directCount: document.querySelector("#direct-count"),
  activeTitle: document.querySelector("#active-conv-title"),
  messageList: document.querySelector("#message-list"),
  messageInput: document.querySelector("#message-input"),
  sendMessage: document.querySelector("#send-message"),
  toggleGroups: document.querySelector("#toggle-groups"),
  toggleDirects: document.querySelector("#toggle-directs"),
};

let openGroups = true;
let openDirects = true;

function formatHourLabel() {
  els.rangeLabel.textContent = `${state.availability[0]}:00 - ${state.availability[1]}:00`;
}

const DAY_TO_JAN = { MON: 12, TUE: 13, WED: 14, THU: 15, FRI: 16, SAT: 17 };
function formatScheduleLabel(session) {
  const targetDay = DAY_TO_JAN[session.dayOfWeek] || 12;
  const now = new Date();
  const year = now.getMonth() <= 0 ? now.getFullYear() : now.getFullYear() + 1;
  const dt = new Date(Date.UTC(year, 0, targetDay, 9, 0, 0));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const yy = String(dt.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function renderDayChips() {
  els.dayChips.innerHTML = "";
  DAY_LABELS.forEach((d) => {
    const btn = document.createElement("button");
    const active = state.selectedDays.includes(d);
    btn.type = "button";
    btn.className = `chip ${active ? "chip-on" : ""}`;
    btn.textContent = d;
    btn.addEventListener("click", () => {
      if (active) {
        state.selectedDays = state.selectedDays.filter((x) => x !== d);
      } else {
        state.selectedDays = [...state.selectedDays, d];
      }
      refreshCourses();
      renderDayChips();
    });
    els.dayChips.appendChild(btn);
  });
}

function setLoadingCourses(on) {
  els.coursesLoading.style.display = on ? "block" : "none";
}

function setCoursesError(text) {
  if (!text) {
    els.coursesError.style.display = "none";
    return;
  }
  els.coursesError.textContent = text;
  els.coursesError.style.display = "block";
}

function updatePager(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  els.pageInfo.textContent = `Page ${state.page} / ${totalPages}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
}

function renderCourses() {
  const start = (state.page - 1) * state.pageSize;
  const pageItems = state.courses.slice(start, start + state.pageSize);

  els.coursesList.innerHTML = "";

  if (!state.courses.length) {
    els.coursesEmpty.style.display = "block";
  } else {
    els.coursesEmpty.style.display = "none";
  }

  els.coursesCount.textContent = `${state.courses.length} session(s)`;
  updatePager(state.courses.length);

  pageItems.forEach((c) => {
    const card = document.createElement("article");
    card.className = "course-card";

    card.innerHTML = `
      <div class="course-head">
        <div>
          <div class="tutor">${c.tutor}</div>
          <div class="meta">${c.code} - ${c.title}</div>
        </div>
        <button class="btn tiny ghost" type="button">View profile</button>
      </div>
      <div class="course-tags">
        <span class="badge">${c.mode}</span>
        <span class="badge">${c.start}-${c.end}</span>
        <span class="badge">${formatScheduleLabel(c)}</span>
        <span class="badge">${c.dayOfWeek}</span>
      </div>
      <div class="course-actions">
        <button class="btn small ${state.cart.includes(c.id) || state.registered.has(c.id) ? "primary" : "ghost"}" data-id="${c.id}">
          ${state.cart.includes(c.id) || state.registered.has(c.id) ? "Added" : "Add to registration"}
        </button>
      </div>
    `;

    const btn = card.querySelector("button[data-id]");
    if (state.registered.has(c.id)) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => toggleCart(c.id));
    }
    els.coursesList.appendChild(card);
  });
}

function renderCart() {
  els.regList.innerHTML = "";
  if (!state.cart.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No courses selected yet. Add sessions above to build your plan.";
    els.regList.appendChild(li);
    return;
  }

  state.cart.forEach((id) => {
    const c = state.courses.find((x) => x.id === id);
    const li = document.createElement("li");
    if (c) {
      li.textContent = `${c.code} - ${c.title} (${c.dayOfWeek} ${c.start}-${c.end}, ${c.mode})`;
    } else {
      li.textContent = id;
    }
    els.regList.appendChild(li);
  });
}

function renderMessages() {
  els.messageList.innerHTML = "";
  if (!state.activeConvId) {
    const div = document.createElement("div");
    div.className = "msg-window-empty muted";
    div.textContent = "Pick a group or private chat to start messaging.";
    els.messageList.appendChild(div);
    return;
  }

  state.messages.forEach((m) => {
    const bubble = document.createElement("div");
    const self = state.sidebar?.me?.id === m.sender.id;
    bubble.className = `msg-bubble${self ? " msg-bubble-self" : ""}`;
    bubble.innerHTML = `<div class="msg-bubble-author">${m.sender.displayName}</div><div class="msg-bubble-text">${m.content}</div>`;
    els.messageList.appendChild(bubble);
  });

  // keep view at bottom
  els.messageList.scrollTop = els.messageList.scrollHeight;
  const msgWindow = document.querySelector(".msg-window");
  msgWindow?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderSidebar() {
  if (!state.sidebar && !state.profile) return;
  const sidebar = state.sidebar || {};
  const profileMe = state.profile?.me || {};
  const sidebarMe = sidebar.me || {};
  const me = { ...sidebarMe, ...profileMe }; // profile data overrides sidebar defaults

  const display =
    profileMe.fullName ||
    profileMe.displayName ||
    sidebarMe.fullName ||
    sidebarMe.displayName ||
    profileMe.email ||
    sidebarMe.email ||
    "ST";
  const avatarUrl = profileMe.avatarUrl || sidebarMe.avatarUrl;

  els.msgAvatar.innerHTML = "";
  els.msgAvatar.textContent = display.slice(0, 2).toUpperCase();
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = display;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.borderRadius = "50%";
    els.msgAvatar.innerHTML = "";
    els.msgAvatar.appendChild(img);
  }
  els.msgName.textContent = display;
  if (els.msgId) {
    const sid = profileMe.studentId || profileMe.id || sidebarMe.id || "";
    els.msgId.textContent = sid ? `ID: ${sid}` : "";
  }

  const renderThreads = (container, threads) => {
    container.innerHTML = "";
    if (!threads.length) {
      const div = document.createElement("div");
      div.className = "muted";
      div.textContent = "No chats yet.";
      container.appendChild(div);
      return;
    }

    threads.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `thread-btn${state.activeConvId === t.id ? " thread-active" : ""}`;
      btn.innerHTML = `<div class="thread-name">${t.title}</div><div class="thread-last muted">${t.last}</div>`;
      btn.addEventListener("click", () => openConversation(t));
      container.appendChild(btn);
    });
  };

  renderThreads(els.groupThreads, sidebar.groups || []);
  renderThreads(els.directThreads, sidebar.directs || []);

  els.groupCount.textContent = `(${sidebar.groups?.length ?? 0})`;
  els.directCount.textContent = `(${sidebar.directs?.length ?? 0})`;

  els.groupThreads.classList.toggle("collapsed", !openGroups);
  els.directThreads.classList.toggle("collapsed", !openDirects);
}

function toggleCart(id) {
  if (state.cart.includes(id)) {
    state.cart = state.cart.filter((x) => x !== id);
  } else {
    state.cart = [...state.cart, id];
  }
  renderCourses();
  renderCart();
}

async function fetchCourses() {
  setLoadingCourses(true);
  setCoursesError("");
  els.coursesList.innerHTML = "";

  try {
    const params = new URLSearchParams();
    if (state.query.trim()) params.set("code", state.query.trim());
    params.set("fromHour", String(state.availability[0]));
    params.set("toHour", String(state.availability[1]));
    if (!state.modes.Online) params.set("online", "false");
    if (!state.modes["On campus"]) params.set("onCampus", "false");
    if (state.selectedDays.length) params.set("days", state.selectedDays.join(","));

    const res = await fetch(api(`/sessions/browse?${params.toString()}`), {
      credentials: "include",
    });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      setCoursesError("Unable to load sessions.");
      return;
    }
    const payload = await res.json();
    state.courses = payload.sessions || payload.courses || [];
    state.page = 1;
    renderCourses();
  } catch (err) {
    console.error(err);
    setCoursesError("Network error.");
  } finally {
    setLoadingCourses(false);
  }
}

async function fetchProfileAndRegistered() {
  try {
    const [studentsRes, usersRes] = await Promise.all([
      fetch(api("/students/profile"), { credentials: "include" }),
      fetch(api("/users/student/profile"), { credentials: "include" }),
    ]);

    if (studentsRes.status === 401 || usersRes.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const studentsData = studentsRes.ok ? await studentsRes.json() : null;
    const usersData = usersRes.ok ? await usersRes.json() : null;

    const studentMe = studentsData?.student || studentsData?.me || {};
    const userMe = usersData?.me || usersData?.student || {};
    const me = { ...userMe, ...studentMe }; // prefer freshest data from students service

    state.profile = { me, students: studentsData, users: usersData };

    const registeredSet = new Set();
    (studentsData?.bookedSessions || studentsData?.bookings || []).forEach((s) => {
      if (s.sessionId) registeredSet.add(s.sessionId);
    });
    state.registered = registeredSet;
    renderSidebar();
  } catch (err) {
    console.error(err);
  }
}

let fetchCoursesHandle = null;
function refreshCourses() {
  if (fetchCoursesHandle) clearTimeout(fetchCoursesHandle);
  fetchCoursesHandle = setTimeout(fetchCourses, 250);
}

async function fetchSidebar() {
  try {
    const res = await fetch(api("/messaging/sidebar"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    state.sidebar = data;
    renderSidebar();
  } catch (err) {
    console.error(err);
    // keep page, just log
  }
}

async function openConversation(conv) {
  state.activeConvId = conv.id;
  state.activeConvTitle = conv.title;
  els.activeTitle.textContent = conv.title;
  state.messages = [];
  renderMessages();

  try {
    const res = await fetch(api(`/messaging/conversations/${conv.id}/messages`), {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      state.messages = data.messages || [];
      renderMessages();
    }
  } catch (err) {
    console.error(err);
  }
}

async function sendMessage() {
  if (!state.activeConvId) return;
  const content = els.messageInput.value.trim();
  if (!content) return;

  try {
    const res = await fetch(api(`/messaging/conversations/${state.activeConvId}/messages`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ content }).toString(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.message) {
        state.messages.push(data.message);
        renderMessages();
        els.messageInput.value = "";
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function checkSession() {
  try {
    const res = await fetch(api("/auth/me"), { credentials: "include" });
    if (!res.ok) {
      window.location.href = "/login.html";
      return;
    }
  } catch (err) {
    console.error(err);
    window.location.href = "/login.html";
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

  els.code?.addEventListener("input", (e) => {
    state.query = e.target.value.toUpperCase();
    refreshCourses();
  });

  els.fromHour?.addEventListener("input", (e) => {
    state.availability[0] = Number(e.target.value);
    formatHourLabel();
    refreshCourses();
  });
  els.toHour?.addEventListener("input", (e) => {
    state.availability[1] = Number(e.target.value);
    formatHourLabel();
    refreshCourses();
  });

  els.modeOnline?.addEventListener("click", () => {
    state.modes.Online = !state.modes.Online;
    els.modeOnline.classList.toggle("on", state.modes.Online);
    refreshCourses();
  });
  els.modeCampus?.addEventListener("click", () => {
    state.modes["On campus"] = !state.modes["On campus"];
    els.modeCampus.classList.toggle("on", state.modes["On campus"]);
    refreshCourses();
  });

  els.reset?.addEventListener("click", () => {
    state.query = "";
    state.modes = { Online: true, "On campus": true };
    state.availability = [0, 24];
    state.selectedDays = [];
    state.page = 1;
    els.code.value = "";
    els.modeOnline.classList.add("on");
    els.modeCampus.classList.add("on");
    els.fromHour.value = "0";
    els.toHour.value = "24";
    formatHourLabel();
    renderDayChips();
    refreshCourses();
  });

  els.prevPage?.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderCourses();
  });

  els.nextPage?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.courses.length / state.pageSize));
    state.page = Math.min(totalPages, state.page + 1);
    renderCourses();
  });

  els.sendMessage?.addEventListener("click", sendMessage);
  els.messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.toggleGroups?.addEventListener("click", () => {
    openGroups = !openGroups;
    if (els.groupThreads) {
      els.groupThreads.classList.toggle("collapsed", !openGroups);
    }
  });

  els.toggleDirects?.addEventListener("click", () => {
    openDirects = !openDirects;
    if (els.directThreads) {
      els.directThreads.classList.toggle("collapsed", !openDirects);
    }
  });

  els.confirm?.addEventListener("click", () => {
    if (!state.cart.length) {
      alert("No sessions selected.");
      return;
    }
    fetch(api("/students/register"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds: state.cart }),
    })
      .then((res) => res.json())
      .then(() => {
        alert("Sessions registered.");
        state.cart.forEach((id) => state.registered.add(id));
        state.cart = [];
        renderCart();
        renderCourses();
      })
      .catch(() => alert("Registration failed."));
  });
}

(async function init() {
  renderDayChips();
  formatHourLabel();
  attachEvents();
  await checkSession();
  await fetchProfileAndRegistered();
  fetchSidebar();
  refreshCourses();
  renderCart();
})();
