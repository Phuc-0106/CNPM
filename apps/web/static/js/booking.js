// ==================== API BASE ====================
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

// ==================== STATE ====================
let sessions = [];
let myBookings = [];
let selectedSession = null;

// ==================== DOM ELEMENTS ====================
const els = {
  sessionsList: document.querySelector("#sessions-list"),
  bookingsList: document.querySelector("#bookings-list"),
  sessionDetail: document.querySelector("#session-detail"),
  bookingModal: document.querySelector("#booking-modal"),
  bookingForm: document.querySelector("#booking-form"),
  alertBox: document.querySelector("#alertBox"),
  logout: document.querySelector("#logoutBtn"),
};

// ==================== UTILITIES ====================
function showAlert(message, type = "success") {
  if (!els.alertBox) return;
  els.alertBox.textContent = message;
  els.alertBox.className = `alert ${type} active`;
  setTimeout(() => els.alertBox.classList.remove("active"), 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ==================== API CALLS ====================

// Fetch all available sessions from Sessions Service
async function fetchSessions() {
  try {
    const res = await fetch(api("/sessions/browse"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      showAlert("Failed to load sessions", "error");
      return;
    }
    const data = await res.json();
    sessions = data.sessions || [];
    renderSessions();
  } catch (err) {
    console.error("Fetch sessions error:", err);
    showAlert("Failed to load sessions", "error");
  }
}

// Fetch session detail from Sessions Service
async function fetchSessionDetail(sessionId) {
  try {
    const res = await fetch(api(`/sessions/${sessionId}`), { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.session;
  } catch (err) {
    console.error("Fetch session detail error:", err);
    return null;
  }
}

// Fetch student's bookings from Tutors Service
async function fetchMyBookings() {
  try {
    const res = await fetch(api("/bookings"), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      console.error("Failed to load bookings");
      return;
    }
    const data = await res.json();
    myBookings = data.bookings || [];
    renderMyBookings();
  } catch (err) {
    console.error("Fetch bookings error:", err);
  }
}

// Create a new booking via Tutors Service
async function createBooking(sessionId, slotId = null, message = "") {
  try {
    const res = await fetch(api("/bookings"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, slotId, message }),
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Failed to create booking", "error");
      return null;
    }

    showAlert("Booking created successfully!");
    return data.booking;
  } catch (err) {
    console.error("Create booking error:", err);
    showAlert("Failed to create booking", "error");
    return null;
  }
}

// Cancel a booking via Tutors Service
async function cancelBooking(bookingId, reason = "") {
  try {
    const res = await fetch(api(`/bookings/${bookingId}/cancel`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Failed to cancel booking", "error");
      return false;
    }

    showAlert("Booking cancelled");
    return true;
  } catch (err) {
    console.error("Cancel booking error:", err);
    showAlert("Failed to cancel booking", "error");
    return false;
  }
}

// ==================== RENDERING ====================

function renderSessions() {
  if (!els.sessionsList) return;

  if (!sessions.length) {
    els.sessionsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-text">No sessions available</div>
      </div>
    `;
    return;
  }

  els.sessionsList.innerHTML = sessions
    .map((s) => {
      const isBooked = myBookings.some(
        (b) => b.sessionId === s.id && b.status !== "cancelled"
      );
      const isFull = s.availableSlots <= 0;

      return `
        <div class="session-card ${isBooked ? 'booked' : ''}" data-id="${s.id}">
          <div class="session-header">
            <div class="session-title">${s.courseCode} - ${s.courseTitle}</div>
            <span class="badge ${isFull ? 'full' : 'available'}">
              ${isFull ? 'Full' : `${s.availableSlots} slots`}
            </span>
          </div>
          <div class="session-tutor">👤 ${s.tutorName}</div>
          <div class="session-slots">
            ${(s.slots || []).map((slot) => `
              <div class="slot-badge ${slot.mode}">
                ${slot.day} ${slot.startTime}-${slot.endTime} (${slot.mode})
              </div>
            `).join("")}
          </div>
          <div class="session-actions">
            ${isBooked 
              ? '<span class="badge success">✓ Booked</span>'
              : isFull
                ? '<button class="btn small" disabled>Full</button>'
                : `<button class="btn small primary" onclick="openBookingModal('${s.id}')">Book Now</button>`
            }
            <button class="btn small ghost" onclick="viewSessionDetail('${s.id}')">Details</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderMyBookings() {
  if (!els.bookingsList) return;

  if (!myBookings.length) {
    els.bookingsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">No bookings yet</div>
        <div class="empty-subtext">Browse sessions and make a booking</div>
      </div>
    `;
    return;
  }

  els.bookingsList.innerHTML = myBookings
    .map((b) => {
      const statusClass = {
        pending: "warning",
        confirmed: "success",
        cancelled: "error",
        completed: "info",
      }[b.status] || "";

      return `
        <div class="booking-card">
          <div class="booking-header">
            <div class="booking-session">${b.sessionId}</div>
            <span class="badge ${statusClass}">${b.status}</span>
          </div>
          <div class="booking-date">Created: ${formatDate(b.createdAt)}</div>
          ${b.message ? `<div class="booking-message">"${b.message}"</div>` : ""}
          <div class="booking-actions">
            ${b.status === "pending" || b.status === "confirmed"
              ? `<button class="btn small danger" onclick="handleCancelBooking('${b.id}')">Cancel</button>`
              : ""
            }
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSessionDetail(session) {
  if (!els.sessionDetail || !session) return;

  els.sessionDetail.innerHTML = `
    <div class="detail-header">
      <h2>${session.courseCode} - ${session.courseTitle}</h2>
      <span class="badge ${session.status}">${session.status}</span>
    </div>
    <div class="detail-info">
      <div class="info-row">
        <span class="label">Tutor:</span>
        <span class="value">${session.tutorName}</span>
      </div>
      <div class="info-row">
        <span class="label">Capacity:</span>
        <span class="value">${session.enrolled} / ${session.capacity}</span>
      </div>
      <div class="info-row">
        <span class="label">Available:</span>
        <span class="value">${session.availableSlots} slots</span>
      </div>
    </div>
    <div class="detail-slots">
      <h3>Schedule</h3>
      ${(session.slots || []).map((slot) => `
        <div class="slot-detail">
          <div class="slot-day">${slot.day}</div>
          <div class="slot-time">${slot.startTime} - ${slot.endTime}</div>
          <div class="slot-mode badge ${slot.mode}">${slot.mode}</div>
          ${slot.location ? `<div class="slot-location">📍 ${slot.location}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

// ==================== MODAL HANDLERS ====================

window.openBookingModal = function (sessionId) {
  selectedSession = sessions.find((s) => s.id === sessionId);
  if (!selectedSession) return;

  if (els.bookingModal) {
    document.querySelector("#modal-session-title").textContent =
      `${selectedSession.courseCode} - ${selectedSession.courseTitle}`;

    // Populate slot select if session has multiple slots
    const slotSelect = document.querySelector("#booking-slot");
    if (slotSelect && selectedSession.slots?.length) {
      slotSelect.innerHTML = `
        <option value="">Any available slot</option>
        ${selectedSession.slots.map((s) => `
          <option value="${s.id}">${s.day} ${s.startTime}-${s.endTime} (${s.mode})</option>
        `).join("")}
      `;
    }

    els.bookingModal.classList.add("active");
  }
};

window.closeBookingModal = function () {
  if (els.bookingModal) {
    els.bookingModal.classList.remove("active");
  }
  selectedSession = null;
};

window.viewSessionDetail = async function (sessionId) {
  const session = await fetchSessionDetail(sessionId);
  if (session) {
    renderSessionDetail(session);
    // Scroll to detail or open in modal
  }
};

window.handleCancelBooking = async function (bookingId) {
  if (!confirm("Are you sure you want to cancel this booking?")) return;

  const reason = prompt("Reason for cancellation (optional):");
  const success = await cancelBooking(bookingId, reason || "");

  if (success) {
    await fetchMyBookings();
    await fetchSessions(); // Refresh available slots
  }
};

// ==================== EVENT LISTENERS ====================

function attachEvents() {
  // Logout
  els.logout?.addEventListener("click", async () => {
    try {
      await fetch(api("/auth/logout"), { method: "POST", credentials: "include" });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.href = "/login.html";
    }
  });

  // Booking form submit
  els.bookingForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedSession) return;

    const slotId = document.querySelector("#booking-slot")?.value || null;
    const message = document.querySelector("#booking-message")?.value || "";

    const booking = await createBooking(selectedSession.id, slotId, message);

    if (booking) {
      closeBookingModal();
      await fetchMyBookings();
      await fetchSessions();
    }
  });

  // Close modal on backdrop click
  els.bookingModal?.addEventListener("click", (e) => {
    if (e.target === els.bookingModal) {
      closeBookingModal();
    }
  });
}

// ==================== INITIALIZE ====================

(async function init() {
  console.log("Initializing booking page...");
  attachEvents();
  await Promise.all([fetchSessions(), fetchMyBookings()]);
})();