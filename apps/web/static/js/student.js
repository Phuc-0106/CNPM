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

// ==================== STATE ====================
const state = {
  query: "",
  modes: { Online: true, "On campus": true },
  availability: [0, 24],
  selectedDays: [],
  page: 1,
  pageSize: 4,
  profile: null,
  courses: [],
  registered: new Set(),
  confirmed: new Set(),
  bookings: [],
  sidebar: null,
  activeConvId: null,
  activeConvTitle: "",
  messages: [],
};

// ==================== DOM ELEMENTS ====================
const els = {
  logout: document.querySelector("#logoutBtn"),
  searchInput: document.querySelector("#search-input"),
  // Try multiple selectors for course list
  coursesList: document.querySelector(".sessions-scroll") || document.querySelector("#courses-list"),
  coursesEmpty: document.querySelector(".sessions-empty"),
  coursesCount: document.querySelector(".sessions-count"),
  dayChips: document.querySelector(".chip-group") || document.querySelector("#day-chips"),
  modeOnline: document.querySelector("#mode-online"),
  modeCampus: document.querySelector("#mode-campus"),
  hourSlider: document.querySelector("#hour-slider"),
  hourLabel: document.querySelector("#hour-label"),
  resetFilters: document.querySelector("#reset-filters"),
  pageInfo: document.querySelector(".page-info"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  regList: document.querySelector(".reg-list") || document.querySelector("#course-registration"),
  // Profile elements - UPDATED
  profileAvatar: document.querySelector("#msg-avatar"),
  profileName: document.querySelector("#msg-name"),
  profileId: document.querySelector("#msg-id"),
};

// ==================== POLLING INTERVALS ====================
let sessionPollInterval = null;
let bookingPollInterval = null;
const SESSION_POLL_MS = 15000;
const BOOKING_POLL_MS = 5000;

// ==================== NOTIFICATION ====================
function showNotification(message, type = "success") {
  let toast = document.getElementById("session-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "session-toast";
    document.body.appendChild(toast);
  }

  const colors = {
    success: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    error: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    warning: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    info: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
  };

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${colors[type] || colors.success};
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 9999;
    transform: translateY(0);
    opacity: 1;
    transition: all 0.3s ease;
    max-width: 400px;
  `;

  toast.textContent = message;

  setTimeout(() => {
    toast.style.transform = "translateY(100px)";
    toast.style.opacity = "0";
  }, 4000);
}

// ==================== HELPER FUNCTIONS ====================

function formatScheduleLabel(course) {
  if (course.date) return course.date;
  const dayMap = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0 };
  const dayNum = dayMap[course.dayOfWeek] || 1;
  const today = new Date();
  const diff = (dayNum - today.getDay() + 7) % 7;
  const nextDay = new Date(today);
  nextDay.setDate(today.getDate() + diff + 7);
  return nextDay.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

function updatePager(total) {
  const totalPages = Math.ceil(total / state.pageSize) || 1;
  if (els.pageInfo) els.pageInfo.textContent = `${state.page} / ${totalPages}`;
  if (els.prevPage) els.prevPage.disabled = state.page <= 1;
  if (els.nextPage) els.nextPage.disabled = state.page >= totalPages;
}

// ==================== FETCH SESSIONS ====================
async function fetchSessions() {
  console.log("[student] Fetching sessions...");
  try {
    const res = await fetch(api("/sessions/browse"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      console.error("[student] Sessions API error:", res.status);
      return;
    }
    const data = await res.json();
    console.log("[student] Sessions response:", data);

    state.courses = (data.sessions || []).map((s) => ({
      id: s.id,
      code: s.code || s.courseCode || "COURSE",
      title: s.title || s.courseTitle || "Session",
      tutor: s.tutor || s.tutorName || "Tutor",
      tutorId: s.tutorId,
      dayOfWeek: s.dayOfWeek || (s.slots?.[0]?.day?.toUpperCase()?.slice(0, 3)) || "MON",
      start: s.start || s.slots?.[0]?.startTime || "09:00",
      end: s.end || s.slots?.[0]?.endTime || "11:00",
      mode: s.mode || (s.slots?.[0]?.mode === "online" ? "Online" : "On campus"),
      date: s.date || "",
    }));

    console.log(`[student] Loaded ${state.courses.length} courses`);
    renderCourses();
  } catch (err) {
    console.error("[student] Fetch sessions error:", err);
  }
}

// ==================== FETCH MY BOOKINGS ====================
async function fetchMyBookings() {
  console.log("[student] Fetching bookings...");
  try {
    const res = await fetch(api("/bookings"), { credentials: "include" });
    if (!res.ok) {
      console.error("[student] Bookings API error:", res.status);
      return;
    }

    const data = await res.json();
    state.bookings = data.bookings || [];

    state.registered.clear();
    state.confirmed.clear();

    state.bookings.forEach((b) => {
      if (b.status === "pending") {
        state.registered.add(b.sessionId);
      } else if (b.status === "confirmed") {
        state.confirmed.add(b.sessionId);
      }
    });

    console.log(`[student] Bookings: ${state.bookings.length} total, ${state.registered.size} pending, ${state.confirmed.size} confirmed`);
    renderCourses();
    renderCourseRegistration();
  } catch (err) {
    console.error("[student] Fetch bookings error:", err);
  }
}

// ==================== FETCH PROFILE ====================
async function fetchProfile() {
  console.log("[student] Fetching profile...");
  try {
    const res = await fetch(api("/students/profile"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      console.error("[student] Profile API error:", res.status);
      return;
    }
    const data = await res.json();
    console.log("[student] Profile response:", data);
    state.profile = data;
    renderProfile();
  } catch (err) {
    console.error("[student] Fetch profile error:", err);
  }
}

// ==================== FETCH SIDEBAR (GROUP/PRIVATE) ====================
async function fetchSidebar() {
  console.log("[student] Fetching sidebar...");
  try {
    const res = await fetch(api("/students/messaging/sidebar"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      console.error("[student] Sidebar API error:", res.status);
      return;
    }
    const data = await res.json();
    console.log("[student] Sidebar response:", data);
    state.sidebar = data;
    renderSidebar();
  } catch (err) {
    console.error("[student] Fetch sidebar error:", err);
  }
}

// ==================== RENDER PROFILE ====================
function renderProfile() {
  if (!state.profile) return;
  
  const me = state.profile.student || state.profile.me || {};
  
  // Update profile name in sidebar
  if (els.profileName) {
    els.profileName.textContent = me.fullName || me.email || "Student";
  }
  
  // Update profile ID
  if (els.profileId) {
    const studentId = me.studentId || me.id || "-";
    els.profileId.textContent = `ID: ${studentId}`;
  }
  
  // Update avatar
  if (els.profileAvatar) {
    if (me.avatarUrl) {
      els.profileAvatar.innerHTML = "";
      const img = document.createElement("img");
      img.src = me.avatarUrl;
      img.alt = me.fullName || "Avatar";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.borderRadius = "50%";
      els.profileAvatar.appendChild(img);
    } else {
      const initials = (me.fullName || me.email || "ST").slice(0, 2).toUpperCase();
      els.profileAvatar.textContent = initials;
    }
  }

  console.log("[student] Profile rendered:", me.fullName, me.studentId);
}

// ==================== RENDER SIDEBAR (GROUP/PRIVATE) ====================
function renderSidebar() {
  if (!state.sidebar) {
    console.log("[student] No sidebar data available");
    return;
  }

  const sidebar = state.sidebar;
  const groupThreads = document.querySelector("#group-threads");
  const directThreads = document.querySelector("#direct-threads");
  const groupCount = document.querySelector("#group-count");
  const directCount = document.querySelector("#direct-count");

  // Update counts
  if (groupCount) {
    groupCount.textContent = `(${sidebar.groups?.length || 0})`;
  }
  if (directCount) {
    directCount.textContent = `(${sidebar.directs?.length || 0})`;
  }

  // Render group threads
  if (groupThreads) {
    groupThreads.innerHTML = "";
    if (sidebar.groups && sidebar.groups.length > 0) {
      sidebar.groups.forEach((conv) => {
        const thread = document.createElement("div");
        thread.className = "thread";
        thread.innerHTML = `
          <div class="thread-title">${conv.title || "Group"}</div>
          <div class="thread-last muted">${conv.last || "No messages yet"}</div>
          ${conv.unreadCount > 0 ? `<span class="thread-badge">${conv.unreadCount}</span>` : ""}
        `;
        thread.addEventListener("click", () => openConversation(conv));
        groupThreads.appendChild(thread);
      });
    } else {
      groupThreads.innerHTML = '<div class="muted" style="padding: 10px; text-align: center;">No groups</div>';
    }
  }

  // Render direct threads
  if (directThreads) {
    directThreads.innerHTML = "";
    if (sidebar.directs && sidebar.directs.length > 0) {
      sidebar.directs.forEach((conv) => {
        const thread = document.createElement("div");
        thread.className = "thread";
        thread.innerHTML = `
          <div class="thread-title">${conv.title || "Direct"}</div>
          <div class="thread-last muted">${conv.last || "No messages yet"}</div>
          ${conv.unreadCount > 0 ? `<span class="thread-badge">${conv.unreadCount}</span>` : ""}
        `;
        thread.addEventListener("click", () => openConversation(conv));
        directThreads.appendChild(thread);
      });
    } else {
      directThreads.innerHTML = '<div class="muted" style="padding: 10px; text-align: center;">No conversations</div>';
    }
  }

  console.log("[student] Sidebar rendered with", sidebar.groups?.length || 0, "groups and", sidebar.directs?.length || 0, "directs");
}

// ==================== OPEN CONVERSATION ====================
async function openConversation(conv) {
  console.log("[student] Opening conversation:", conv.id);
  state.activeConvId = conv.id;
  state.activeConvTitle = conv.title;

  const activeTitle = document.querySelector("#active-conv-title");
  if (activeTitle) {
    activeTitle.textContent = conv.title;
  }

  // Clear messages
  state.messages = [];
  renderMessages();

  // Fetch messages for this conversation
  try {
    const res = await fetch(api(`/students/messaging/conversations/${conv.id}/messages`), {
      credentials: "include",
    });
    if (!res.ok) {
      console.error("[student] Failed to fetch messages:", res.status);
      return;
    }
    const data = await res.json();
    state.messages = data.messages || [];
    renderMessages();
  } catch (err) {
    console.error("[student] Error fetching messages:", err);
  }
}

// ==================== RENDER MESSAGES ====================
function renderMessages() {
  const messageList = document.querySelector("#message-list");
  if (!messageList) return;

  messageList.innerHTML = "";

  if (!state.activeConvId) {
    messageList.innerHTML = '<div class="muted">Pick a group or private chat to start messaging.</div>';
    return;
  }

  if (!state.messages || state.messages.length === 0) {
    messageList.innerHTML = '<div class="muted">No messages yet. Start the conversation!</div>';
    return;
  }

  state.messages.forEach((m) => {
    const bubble = document.createElement("div");
    const isSelf = m.sender?.id === (state.profile?.student?.id || state.profile?.me?.id);
    bubble.className = `msg-bubble ${isSelf ? "msg-bubble-self" : ""}`;

    const author = m.sender?.displayName || m.sender?.fullName || "Unknown";
    const content = m.content || "";
    const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

    bubble.innerHTML = `
      <div class="msg-bubble-author">${author}</div>
      <div>${content}</div>
      <div class="muted" style="font-size: 11px; margin-top: 4px;">${time}</div>
    `;

    messageList.appendChild(bubble);
  });

  // Scroll to bottom
  messageList.scrollTop = messageList.scrollHeight;
}

// ==================== SEND MESSAGE ====================
async function sendMessage() {
  if (!state.activeConvId) {
    console.log("[student] No active conversation");
    return;
  }

  const messageInput = document.querySelector("#message-input");
  if (!messageInput) return;

  const content = messageInput.value.trim();
  if (!content) return;

  console.log("[student] Sending message to", state.activeConvId);

  try {
    const res = await fetch(api(`/students/messaging/conversations/${state.activeConvId}/messages`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      console.error("[student] Failed to send message:", res.status);
      return;
    }

    const data = await res.json();
    console.log("[student] Message sent:", data);

    // Add message to state and re-render
    if (data.message) {
      state.messages.push(data.message);
      renderMessages();
    }

    // Clear input
    messageInput.value = "";
  } catch (err) {
    console.error("[student] Error sending message:", err);
  }
}

// ==================== ATTACH MESSAGING EVENTS ====================
function attachMessagingEvents() {
  const sendBtn = document.querySelector("#send-message");
  const messageInput = document.querySelector("#message-input");
  const toggleGroups = document.querySelector("#toggle-groups");
  const toggleDirects = document.querySelector("#toggle-directs");

  if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Toggle group threads
  if (toggleGroups) {
    toggleGroups.addEventListener("click", () => {
      const groupThreads = document.querySelector("#group-threads");
      if (groupThreads) {
        const isCollapsed = groupThreads.classList.toggle("collapsed");
        console.log("[student] Groups", isCollapsed ? "collapsed" : "expanded");
      }
    });
  }

  // Toggle direct threads
  if (toggleDirects) {
    toggleDirects.addEventListener("click", () => {
      const directThreads = document.querySelector("#direct-threads");
      if (directThreads) {
        const isCollapsed = directThreads.classList.toggle("collapsed");
        console.log("[student] Directs", isCollapsed ? "collapsed" : "expanded");
      }
    });
  }
}

// ==================== ADD TO REGISTRATION ====================
async function addToRegistration(sessionId) {
  const session = state.courses.find((c) => c.id === sessionId);
  if (!session) return;

  if (state.registered.has(sessionId)) {
    showNotification("Already pending approval", "warning");
    return;
  }
  if (state.confirmed.has(sessionId)) {
    showNotification("Already confirmed", "info");
    return;
  }

  const btn = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }

  try {
    const res = await fetch(api("/bookings"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId,
        slotId: null,
        message: `I would like to book ${session.title || session.code}.`,
      }),
    });

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await res.json();
    console.log("[student] Booking response:", data);

    if (!res.ok) {
      showNotification(data.detail || "Failed to send request", "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Add to registration";
      }
      return;
    }

    state.registered.add(sessionId);
    state.bookings.push(data.booking);

    if (btn) {
      btn.textContent = "Pending";
      btn.classList.add("pending");
    }

    showNotification("✅ Request sent! Status: Pending", "success");
    renderCourses();
  } catch (err) {
    console.error("[student] Booking error:", err);
    showNotification("Failed to send request", "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Add to registration";
    }
  }
}

window.addToRegistration = addToRegistration;

// ==================== RENDER COURSES ====================
function renderCourses() {
  const container = els.coursesList;
  if (!container) {
    console.error("[student] coursesList not found");
    return;
  }

  // Apply filters
  let filtered = state.courses.filter((c) => {
    if (!state.modes[c.mode]) return false;
    if (state.selectedDays.length && !state.selectedDays.includes(c.dayOfWeek)) return false;
    const startHour = parseInt(c.start?.split(":")[0] || 0);
    if (startHour < state.availability[0] || startHour > state.availability[1]) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const searchable = `${c.code} ${c.title} ${c.tutor}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / state.pageSize) || 1;
  const start = (state.page - 1) * state.pageSize;
  const paged = filtered.slice(start, start + state.pageSize);

  if (els.coursesCount) els.coursesCount.textContent = `${total} course(s)`;
  if (els.coursesEmpty) els.coursesEmpty.style.display = total === 0 ? "block" : "none";
  updatePager(total);

  if (!paged.length) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #64748b;">
        <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
        <div>No sessions available</div>
      </div>
    `;
    return;
  }

  container.innerHTML = paged.map((c) => {
    const isPending = state.registered.has(c.id);
    const isConfirmed = state.confirmed.has(c.id);

    let buttonHtml = "";
    if (isConfirmed) {
      buttonHtml = `<button class="btn small primary confirmed" disabled>✓ Confirmed</button>`;
    } else if (isPending) {
      buttonHtml = `<button class="btn small primary pending" disabled>Pending</button>`;
    } else {
      buttonHtml = `<button class="btn small ghost" data-session-id="${c.id}" onclick="addToRegistration('${c.id}')">Add to registration</button>`;
    }

    return `
      <article class="course-card">
        <div class="course-head">
          <div>
            <div class="tutor">${c.tutor}</div>
            <div class="meta">${c.code} - ${c.title}</div>
          </div>
          <button class="btn tiny ghost">View profile</button>
        </div>
        <div class="course-tags">
          <span class="badge">${c.mode}</span>
          <span class="badge">${c.start}-${c.end}</span>
          <span class="badge">${formatScheduleLabel(c)}</span>
          <span class="badge">${c.dayOfWeek}</span>
        </div>
        <div class="course-actions">
          ${buttonHtml}
        </div>
      </article>
    `;
  }).join("");

  console.log(`[student] Rendered ${paged.length} course cards`);
}

// ==================== RENDER COURSE REGISTRATION ====================
function renderCourseRegistration() {
  const container = els.regList;
  if (!container) return;

  const confirmedBookings = state.bookings.filter((b) => b.status === "confirmed");

  if (!confirmedBookings.length) {
    container.innerHTML = `<li class="muted">No confirmed sessions yet</li>`;
    return;
  }

  container.innerHTML = confirmedBookings.map((b) => {
    const session = state.courses.find((c) => c.id === b.sessionId);
    return `
      <li>
        <div style="font-weight: 600;">${session?.code || b.sessionId}</div>
        <div style="font-size: 12px; color: var(--muted);">
          ${session?.title || "Session"} - ${session?.dayOfWeek || ""} ${session?.start || ""}-${session?.end || ""}
        </div>
      </li>
    `;
  }).join("");
}

// ==================== RENDER DAY CHIPS ====================
function renderDayChips() {
  const container = els.dayChips;
  if (!container) return;

  container.innerHTML = DAY_LABELS.map((day) => `
    <button class="chip ${state.selectedDays.includes(day) ? "active" : ""}" data-day="${day}">
      ${day}
    </button>
  `).join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const day = chip.dataset.day;
      if (state.selectedDays.includes(day)) {
        state.selectedDays = state.selectedDays.filter((d) => d !== day);
        chip.classList.remove("active");
      } else {
        state.selectedDays.push(day);
        chip.classList.add("active");
      }
      state.page = 1;
      renderCourses();
    });
  });
}

// ==================== FORMAT HOUR LABEL ====================
function formatHourLabel() {
  if (els.hourLabel) {
    els.hourLabel.textContent = `${state.availability[0]}:00 - ${state.availability[1]}:00`;
  }
}

// ==================== POLLING ====================
function startSessionPolling() {
  if (sessionPollInterval) clearInterval(sessionPollInterval);
  sessionPollInterval = setInterval(fetchSessions, SESSION_POLL_MS);
}

function startBookingPolling() {
  if (bookingPollInterval) clearInterval(bookingPollInterval);
  bookingPollInterval = setInterval(async () => {
    const oldConfirmedCount = state.confirmed.size;
    await fetchMyBookings();
    if (state.confirmed.size > oldConfirmedCount) {
      showNotification("🎉 A session has been confirmed!", "success");
    }
  }, BOOKING_POLL_MS);
}

function stopPolling() {
  if (sessionPollInterval) clearInterval(sessionPollInterval);
  if (bookingPollInterval) clearInterval(bookingPollInterval);
}

window.addEventListener("beforeunload", stopPolling);

// ==================== ATTACH EVENTS ====================
function attachEvents() {
  els.logout?.addEventListener("click", async () => {
    try {
      await fetch(api("/auth/logout"), { method: "POST", credentials: "include" });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.replace("/login.html?logout=1");
    }
  });

  els.searchInput?.addEventListener("input", (e) => {
    state.query = e.target.value;
    state.page = 1;
    renderCourses();
  });

  els.modeOnline?.addEventListener("click", () => {
    state.modes["Online"] = !state.modes["Online"];
    els.modeOnline.classList.toggle("active", state.modes["Online"]);
    state.page = 1;
    renderCourses();
  });

  els.modeCampus?.addEventListener("click", () => {
    state.modes["On campus"] = !state.modes["On campus"];
    els.modeCampus.classList.toggle("active", state.modes["On campus"]);
    state.page = 1;
    renderCourses();
  });

  els.resetFilters?.addEventListener("click", () => {
    state.query = "";
    state.modes = { Online: true, "On campus": true };
    state.selectedDays = [];
    state.availability = [0, 24];
    state.page = 1;
    if (els.searchInput) els.searchInput.value = "";
    if (els.modeOnline) els.modeOnline.classList.add("active");
    if (els.modeCampus) els.modeCampus.classList.add("active");
    renderDayChips();
    formatHourLabel();
    renderCourses();
  });

  els.prevPage?.addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      renderCourses();
    }
  });

  els.nextPage?.addEventListener("click", () => {
    const totalPages = Math.ceil(state.courses.length / state.pageSize);
    if (state.page < totalPages) {
      state.page++;
      renderCourses();
    }
  });
}

// ==================== INITIALIZE ====================
(async function init() {
  console.log("[student] Initializing...");

  // Check auth
  try {
    const authRes = await fetch(api("/auth/me"), { credentials: "include" });
    if (!authRes.ok) {
      window.location.href = "/login.html";
      return;
    }
  } catch (err) {
    window.location.href = "/login.html";
    return;
  }

  attachEvents();
  attachMessagingEvents(); // NEW: Attach messaging events
  renderDayChips();
  formatHourLabel();

  // Fetch data
  await Promise.all([
    fetchSessions(),
    fetchMyBookings(),
    fetchProfile(),
    fetchSidebar(), // NEW: Fetch sidebar data
  ]);

  // Start polling
  startSessionPolling();
  startBookingPolling();

  console.log("[student] Ready");
})();