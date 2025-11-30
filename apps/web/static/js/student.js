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
  availableSlots: [],
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
  availableSlots: document.querySelector("#available-slots"),
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

// ==================== NEW: Fetch from Sessions Service ====================

async function fetchCourses() {
  setLoadingCourses(true);
  try {
    // Now fetches from Sessions Service via gateway
    const res = await fetch(api("/sessions/browse"), { credentials: "include" });

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      setCoursesError("Failed to load sessions");
      return;
    }

    const data = await res.json();
    // Map sessions to course format for compatibility
    state.courses = (data.sessions || []).map((s) => ({
      id: s.id,
      code: s.courseCode,
      title: s.courseTitle,
      tutor: s.tutorName,
      tutorId: s.tutorId,
      mode: s.slots?.[0]?.mode === "online" ? "Online" : "On campus",
      dayOfWeek: s.slots?.[0]?.day?.substring(0, 3).toUpperCase() || "MON",
      start: s.slots?.[0]?.startTime || "09:00",
      end: s.slots?.[0]?.endTime || "11:00",
      rating: 4.5,
      capacity: s.capacity,
      enrolled: s.enrolled,
      availableSlots: s.availableSlots,
      slots: s.slots,
    }));

    renderCourses();
  } catch (err) {
    console.error("Fetch courses error:", err);
    setCoursesError("Network error");
  } finally {
    setLoadingCourses(false);
  }
}

// ==================== NEW: Book Session via Tutors Service ====================

async function bookSession(sessionId, slotId = null) {
  try {
    const res = await fetch(api("/bookings"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        slotId,
        message: "",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Failed to book session");
      return false;
    }

    alert("Session booked successfully!");
    return true;
  } catch (err) {
    console.error("Book session error:", err);
    alert("Failed to book session");
    return false;
  }
}

// ==================== UPDATE: Confirm Registration ====================

async function confirmRegistration() {
  if (!state.cart.length) {
    alert("No sessions selected.");
    return;
  }

  // Book each session via Tutors Service
  let successCount = 0;
  for (const sessionId of state.cart) {
    const success = await bookSession(sessionId);
    if (success) {
      successCount++;
      state.registered.add(sessionId);
    }
  }

  if (successCount > 0) {
    state.cart = [];
    renderCart();
    renderCourses();
    alert(`Successfully booked ${successCount} session(s)`);
  }
}

function refreshCourses() {
  if (fetchCoursesHandle) clearTimeout(fetchCoursesHandle);
  fetchCoursesHandle = setTimeout(fetchCourses, 250);
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

  els.confirm?.addEventListener("click", confirmRegistration);
}

// ==================== FETCH AVAILABLE SLOTS FROM SESSIONS SERVICE ====================

async function fetchAvailableSlots() {
  try {
    // Students browse availability directly from Sessions Service
    const res = await fetch(api("/sessions/browse/availability"), { credentials: "include" });

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      console.error("Failed to load availability");
      return;
    }

    const data = await res.json();
    // data.slots contains all published, available slots from all tutors
    state.availableSlots = data.slots || [];
    renderAvailableSlots();
  } catch (err) {
    console.error("Fetch available slots error:", err);
  }
}

function renderAvailableSlots() {
  const container = document.querySelector("#available-slots");
  if (!container) return;

  if (!state.availableSlots.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-text">No available slots</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.availableSlots
    .map((slot) => `
      <div class="slot-card" data-slot-id="${slot.id}" data-tutor-id="${slot.tutorId}">
        <div class="slot-tutor">${slot.tutorName}</div>
        <div class="slot-day">${slot.day}</div>
        <div class="slot-time">${slot.startTime} - ${formatEndTime(slot.startTime, slot.duration)}</div>
        <div class="slot-mode badge ${slot.mode}">${slot.mode}</div>
        ${slot.location ? `<div class="slot-location">📍 ${slot.location}</div>` : ""}
        <button class="btn small primary" onclick="bookSlot('${slot.id}', '${slot.tutorId}')">
          Book This Slot
        </button>
      </div>
    `)
    .join("");
}

// ==================== BOOK A SLOT (creates booking request) ====================

window.bookSlot = async function(slotId, tutorId) {
  const message = prompt("Add a message for the tutor (optional):");
  
  try {
    const res = await fetch(api("/bookings"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId,
        tutorId,
        message: message || "",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Failed to book slot");
      return;
    }

    alert("Booking request sent! Wait for tutor confirmation.");
    await fetchAvailableSlots(); // Refresh the list
  } catch (err) {
    console.error("Book slot error:", err);
    alert("Failed to send booking request");
  }
};

function formatEndTime(startTime, duration) {
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + duration;
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

// ==================== AUTO-REFRESH FOR SESSIONS ====================
let sessionPollInterval = null;
const POLL_INTERVAL_MS = 10000; // 10 seconds

// Fetch sessions from Sessions service
async function fetchSessions() {
  console.log("Fetching sessions from Sessions service...");
  
  try {
    const res = await fetch(api("/sessions/browse"), { credentials: "include" });

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      console.error("Failed to load sessions:", res.status);
      return;
    }

    const data = await res.json();
    console.log("Sessions data:", data);
    
    // Map sessions to courses format for existing rendering
    const newCourses = (data.sessions || []).map(session => ({
      id: session.id,
      code: session.courseCode,
      title: session.courseTitle,
      tutor: session.tutorName,
      tutorId: session.tutorId,
      dayOfWeek: session.slots?.[0]?.day?.toUpperCase()?.slice(0, 3) || "MON",
      start: session.slots?.[0]?.startTime || "09:00",
      end: session.slots?.[0]?.endTime || "11:00",
      mode: session.slots?.[0]?.mode === "online" ? "Online" : "On campus",
      location: session.slots?.[0]?.location,
      rating: 4.5,
      capacity: session.capacity,
      enrolled: session.enrolled,
      availableSlots: session.availableSlots,
      slots: session.slots,
    }));

    // Check if sessions changed
    const oldCount = state.courses.length;
    const newCount = newCourses.length;
    
    state.courses = newCourses;
    console.log(`Loaded ${state.courses.length} sessions`);
    
    // Show notification if new sessions appeared
    if (newCount > oldCount && oldCount > 0) {
      showNotification(`${newCount - oldCount} new session(s) available!`);
    }
    
    renderCourses();
  } catch (err) {
    console.error("Fetch sessions error:", err);
  }
}

// Start polling for session updates
function startSessionPolling() {
  if (sessionPollInterval) {
    clearInterval(sessionPollInterval);
  }
  console.log("Starting session polling every", POLL_INTERVAL_MS / 1000, "seconds");
  sessionPollInterval = setInterval(() => {
    console.log("Polling for session updates...");
    fetchSessions();
  }, POLL_INTERVAL_MS);
}

// Stop polling
function stopSessionPolling() {
  if (sessionPollInterval) {
    clearInterval(sessionPollInterval);
    sessionPollInterval = null;
    console.log("Stopped session polling");
  }
}

// Show notification toast
function showNotification(message) {
  // Create toast element if not exists
  let toast = document.getElementById("session-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "session-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
      z-index: 9999;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.style.transform = "translateY(0)";
  toast.style.opacity = "1";
  
  setTimeout(() => {
    toast.style.transform = "translateY(100px)";
    toast.style.opacity = "0";
  }, 4000);
}

// Manual refresh button handler
window.refreshSessions = function() {
  console.log("Manual refresh triggered");
  showNotification("Refreshing sessions...");
  fetchSessions();
};

// Stop polling when leaving page
window.addEventListener("beforeunload", () => {
  stopSessionPolling();
});

// Visibility change - pause polling when tab is hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopSessionPolling();
  } else {
    fetchSessions(); // Immediate refresh when tab becomes visible
    startSessionPolling();
  }
});

(async function init() {
  renderDayChips();
  formatHourLabel();
  attachEvents();
  await checkSession();
  await fetchProfileAndRegistered();
  fetchSidebar();
  refreshCourses();
  renderCart();
  fetchAvailableSlots();
  fetchSessions(); // Initial fetch
  startSessionPolling(); // Start polling
})();
