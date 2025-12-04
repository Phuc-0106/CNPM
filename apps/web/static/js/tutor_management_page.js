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

// State
let currentWeekStart = getWeekStart(new Date());
let availabilityData = { slots: [], exceptions: [], policy: {}, weekUsage: 0 };
let editingSlotId = null;
let bookingRequests = [];

// ==================== AUTO-POLLING FOR BOOKING REQUESTS ====================
let bookingPollInterval = null;
const BOOKING_POLL_INTERVAL_MS = 2000; // 2 seconds for fast updates

function startBookingPolling() {
  if (bookingPollInterval) {
    clearInterval(bookingPollInterval);
  }
  console.log("[tutor] Starting booking polling every", BOOKING_POLL_INTERVAL_MS / 1000, "seconds");
  
  bookingPollInterval = setInterval(() => {
    fetchBookingRequests(true); // silent fetch
  }, BOOKING_POLL_INTERVAL_MS);
}

function stopBookingPolling() {
  if (bookingPollInterval) {
    clearInterval(bookingPollInterval);
    bookingPollInterval = null;
  }
}

function updateRequestsTabBadge(pendingCount) {
  const requestsTab = document.querySelector('.tab[data-tab="requests"]');
  if (!requestsTab) return;
  
  // Remove existing badge
  const existingBadge = requestsTab.querySelector(".pending-badge");
  if (existingBadge) existingBadge.remove();
  
  // Add new badge if there are pending requests
  if (pendingCount > 0) {
    const badge = document.createElement("span");
    badge.className = "pending-badge";
    badge.style.cssText = `
      background: #ef4444;
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      margin-left: 8px;
    `;
    badge.textContent = pendingCount;
    requestsTab.appendChild(badge);
  }
}

// Stop polling when leaving page
window.addEventListener("beforeunload", stopBookingPolling);

// Visibility API - pause when tab hidden, resume when visible
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopBookingPolling();
  } else {
    fetchBookingRequests();
    startBookingPolling();
  }
});

// Helpers
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// DOM Elements
const els = {
  logout: document.querySelector("#logoutBtn"),
  alertBox: document.querySelector("#alertBox"),
  weekDisplay: document.querySelector("#weekDisplay"),
  prevWeek: document.querySelector("#prevWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  weekUsage: document.querySelector("#weekUsage"),
  calendarContainer: document.querySelector("#calendarContainer"),
  slotsTableBody: document.querySelector("#slotsTableBody"),
  exceptionsTableBody: document.querySelector("#exceptionsTableBody"),
  requestsTableBody: document.querySelector("#requestsTableBody"),
  addSlotBtn: document.querySelector("#addSlotBtn"),
  publishAllBtn: document.querySelector("#publishAllBtn"),
  copyLastWeek: document.querySelector("#copyLastWeek"),
  bulkDeleteUnpublished: document.querySelector("#bulkDeleteUnpublished"),
  addExceptionBtn: document.querySelector("#addExceptionBtn"),
  slotModal: document.querySelector("#slotModal"),
  slotForm: document.querySelector("#slotForm"),
  cancelSlotBtn: document.querySelector("#cancelSlotBtn"),
  exceptionModal: document.querySelector("#exceptionModal"),
  exceptionForm: document.querySelector("#exceptionForm"),
  cancelExceptionBtn: document.querySelector("#cancelExceptionBtn"),
  tabs: document.querySelectorAll(".tab"),
  tabContents: document.querySelectorAll(".tab-content"),
};

function formatWeekDisplay(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const opts = { month: "short", day: "numeric" };
  const startStr = startDate.toLocaleDateString("en-US", opts);
  const endStr = endDate.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${startStr} - ${endStr}`;
}

function formatDateShort(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function showAlert(message, type = "success") {
  if (!els.alertBox) return;
  els.alertBox.textContent = message;
  els.alertBox.className = `alert ${type} active`;
  setTimeout(() => {
    els.alertBox.classList.remove("active");
  }, 3000);
}

function formatTime(time, duration) {
  if (!time) return "-";
  const [h, m] = time.split(":").map(Number);
  const endMinutes = h * 60 + m + duration;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return `${time} - ${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

// ==================== API CALLS (now calling Sessions service) ====================

async function fetchAvailability() {
  console.log("Fetching availability from Sessions service...");
  try {
    const res = await fetch(api("/sessions/availability"), { credentials: "include" });
    
    if (res.status === 401 || res.status === 403) {
      window.location.href = "/login.html";
      return;
    }
    
    if (!res.ok) {
      console.error("Failed to fetch availability:", res.status);
      showAlert("Failed to load availability", "error");
      return;
    }
    
    const data = await res.json();
    console.log("Availability data:", data);
    
    availabilityData = {
      slots: data.slots || [],
      exceptions: data.exceptions || [],
      policy: data.policy || {},
      weekUsage: data.slots?.length || 0,
    };
    
    renderCalendar();
    renderSlotsTable();
    renderExceptionsTable();
    updateWeekUsage();
  } catch (err) {
    console.error("Fetch availability error:", err);
    showAlert("Failed to load availability", "error");
  }
}

// ==================== BOOKING REQUESTS ====================

async function fetchBookingRequests(silent = false) {
  try {
    const res = await fetch(api("/tutors/tutor/bookings"), { credentials: "include" });

    if (res.status === 401 || res.status === 403) {
      return;
    }

    if (!res.ok) {
      if (!silent) console.error("Failed to load booking requests:", res.status);
      return;
    }

    const data = await res.json();
    bookingRequests = data.bookings || [];
    
    // Update badge
    const pendingCount = bookingRequests.filter(b => b.status === "pending").length;
    updateRequestsTabBadge(pendingCount);
    
    // Always re-render the table
    renderBookingRequests();
    
  } catch (err) {
    if (!silent) console.error("Fetch booking requests error:", err);
  }
}

// ==================== SLOT CRUD ====================

async function addSlot(slotData) {
  try {
    const res = await fetch(api("/sessions/availability/slots"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slotData),
    });
    
    if (!res.ok) {
      const error = await res.json();
      showAlert(error.detail || "Failed to add slot", "error");
      return false;
    }
    
    showAlert("Slot added successfully!", "success");
    await fetchAvailability();
    return true;
  } catch (err) {
    console.error("Add slot error:", err);
    showAlert("Failed to add slot", "error");
    return false;
  }
}

async function updateSlot(slotId, slotData) {
  try {
    const res = await fetch(api(`/sessions/availability/slots/${slotId}`), {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slotData),
    });
    
    if (!res.ok) {
      const error = await res.json();
      showAlert(error.detail || "Failed to update slot", "error");
      return false;
    }
    
    showAlert("Slot updated successfully!", "success");
    await fetchAvailability();
    return true;
  } catch (err) {
    console.error("Update slot error:", err);
    showAlert("Failed to update slot", "error");
    return false;
  }
}

window.deleteSlot = async function(slotId) {
  if (!confirm("Are you sure you want to delete this slot?")) return;
  
  try {
    const res = await fetch(api(`/sessions/availability/slots/${slotId}`), {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to delete slot", "error");
      return;
    }
    
    showAlert("Slot deleted!", "success");
    await fetchAvailability();
  } catch (err) {
    console.error("Delete slot error:", err);
    showAlert("Failed to delete slot", "error");
  }
};

window.publishSlot = async function(slotId) {
  try {
    const res = await fetch(api(`/sessions/availability/slots/${slotId}/publish`), {
      method: "POST",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to publish slot", "error");
      return;
    }
    
    showAlert("Slot published!", "success");
    await fetchAvailability();
  } catch (err) {
    console.error("Publish slot error:", err);
    showAlert("Failed to publish slot", "error");
  }
};

// ==================== PUBLISH ALL SLOTS ====================

async function publishAllSlots() {
  try {
    const res = await fetch(api("/sessions/availability/publish-all"), {
      method: "POST",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to publish all slots", "error");
      return;
    }
    
    const data = await res.json();
    showAlert(`Published ${data.published || 0} slots!`, "success");
    await fetchAvailability();
  } catch (err) {
    console.error("Publish all error:", err);
    showAlert("Failed to publish all slots", "error");
  }
}

// ==================== BULK DELETE UNPUBLISHED ====================

async function bulkDeleteUnpublished() {
  if (!confirm("Are you sure you want to delete all unpublished slots?")) return;
  
  try {
    const res = await fetch(api("/sessions/availability/bulk-delete-unpublished"), {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to delete unpublished slots", "error");
      return;
    }
    
    const data = await res.json();
    showAlert(`Deleted ${data.deleted || 0} slots!`, "success");
    await fetchAvailability();
  } catch (err) {
    console.error("Bulk delete error:", err);
    showAlert("Failed to delete unpublished slots", "error");
  }
}

// ==================== EXCEPTIONS ====================

async function addException(excData) {
  try {
    const res = await fetch(api("/sessions/availability/exceptions"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(excData),
    });
    
    if (!res.ok) {
      showAlert("Failed to add exception", "error");
      return false;
    }
    
    showAlert("Exception added!", "success");
    await fetchAvailability();
    return true;
  } catch (err) {
    console.error("Add exception error:", err);
    showAlert("Failed to add exception", "error");
    return false;
  }
}

window.deleteException = async function(excId) {
  if (!confirm("Are you sure you want to delete this exception?")) return;
  
  try {
    const res = await fetch(api(`/sessions/availability/exceptions/${excId}`), {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to delete exception", "error");
      return;
    }
    
    showAlert("Exception deleted!", "success");
    await fetchAvailability();
  } catch (err) {
    console.error("Delete exception error:", err);
    showAlert("Failed to delete exception", "error");
  }
};

// ==================== BOOKING ACTIONS ====================

window.confirmBooking = async function(bookingId) {
  try {
    const res = await fetch(api(`/tutors/tutor/bookings/${bookingId}/confirm`), {
      method: "POST",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to confirm booking", "error");
      return;
    }
    
    showAlert("Booking confirmed!", "success");
    await fetchBookingRequests();
  } catch (err) {
    console.error("Confirm booking error:", err);
    showAlert("Failed to confirm booking", "error");
  }
};

window.rejectBooking = async function(bookingId) {
  if (!confirm("Are you sure you want to reject this booking?")) return;
  
  try {
    const res = await fetch(api(`/tutors/tutor/bookings/${bookingId}/reject`), {
      method: "POST",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to reject booking", "error");
      return;
    }
    
    showAlert("Booking rejected", "warning");
    await fetchBookingRequests();
  } catch (err) {
    console.error("Reject booking error:", err);
    showAlert("Failed to reject booking", "error");
  }
};

window.completeBooking = async function(bookingId) {
  try {
    const res = await fetch(api(`/tutors/tutor/bookings/${bookingId}/complete`), {
      method: "POST",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to complete booking", "error");
      return;
    }
    
    showAlert("Booking marked as complete!", "success");
    await fetchBookingRequests();
  } catch (err) {
    console.error("Complete booking error:", err);
    showAlert("Failed to complete booking", "error");
  }
};

// ==================== RECURRENCE TYPE HANDLING ====================

function setupRecurrenceHandling() {
  const recurrenceSelect = document.getElementById("recurrence");
  const slotDaySelect = document.getElementById("slotDay");
  const slotDateInput = document.getElementById("slotDate");
  const dayGroup = document.getElementById("dayGroup");
  const dateGroup = document.getElementById("dateGroup");
  const dayRequired = document.getElementById("dayRequired");
  const dateRequired = document.getElementById("dateRequired");
  const dayHint = document.getElementById("dayHint");
  const dateHint = document.getElementById("dateHint");

  if (!recurrenceSelect || !slotDaySelect || !slotDateInput) return;

  recurrenceSelect.addEventListener("change", updateRecurrenceUI);
  
  // Auto-fill day from date for one-time slots
  slotDateInput.addEventListener("change", () => {
    const recurrence = recurrenceSelect.value;
    if (recurrence === "once" && slotDateInput.value) {
      const selectedDate = new Date(slotDateInput.value);
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      slotDaySelect.value = dayNames[selectedDate.getDay()];
    }
  });

  // Initial setup
  updateRecurrenceUI();

  function updateRecurrenceUI() {
    const recurrence = recurrenceSelect.value;
    
    if (recurrence === "once") {
      // ONE-TIME: Date is required, Day is auto-filled and disabled
      slotDaySelect.disabled = true;
      slotDaySelect.required = false;
      slotDateInput.disabled = false;
      slotDateInput.required = true;
      
      if (dayGroup) dayGroup.classList.add("disabled");
      if (dateGroup) dateGroup.classList.remove("disabled");
      if (dayRequired) dayRequired.style.display = "none";
      if (dateRequired) dateRequired.style.display = "inline";
      if (dayHint) dayHint.style.display = "block";
      if (dateHint) {
        dateHint.style.display = "block";
        dateHint.textContent = "Required for one-time slots";
      }
      
      // Auto-fill day if date is already set
      if (slotDateInput.value) {
        const selectedDate = new Date(slotDateInput.value);
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        slotDaySelect.value = dayNames[selectedDate.getDay()];
      }
    } else {
      // WEEKLY: Day is required, Date is disabled
      slotDaySelect.disabled = false;
      slotDaySelect.required = true;
      slotDateInput.disabled = true;
      slotDateInput.required = false;
      slotDateInput.value = ""; // Clear date when switching to weekly
      
      if (dayGroup) dayGroup.classList.remove("disabled");
      if (dateGroup) dateGroup.classList.add("disabled");
      if (dayRequired) dayRequired.style.display = "inline";
      if (dateRequired) dateRequired.style.display = "none";
      if (dayHint) dayHint.style.display = "none";
      if (dateHint) {
        dateHint.style.display = "block";
        dateHint.textContent = "Not needed for weekly slots";
      }
    }
  }
}

// ==================== EDIT SLOT ====================

window.editSlot = function(slotId) {
  const slot = availabilityData.slots.find((s) => s.id === slotId);
  if (!slot) return;
  
  editingSlotId = slotId;
  
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };
  
  setVal("courseCode", slot.courseCode);
  setVal("courseTitle", slot.courseTitle);
  setVal("recurrence", slot.recurrence || "once");
  setVal("slotDay", slot.day);
  setVal("slotDate", slot.date);
  setVal("startTime", slot.startTime);
  setVal("duration", slot.duration || 60);
  setVal("mode", slot.mode || "online");
  setVal("capacity", slot.capacity || 1);
  setVal("location", slot.location);
  setVal("leadTime", slot.leadTime || 24);
  setVal("cancelWindow", slot.cancelWindow || 12);
  
  const recurrenceSelect = document.getElementById("recurrence");
  if (recurrenceSelect) {
    recurrenceSelect.dispatchEvent(new Event("change"));
  }
  
  const header = document.querySelector("#slotModal .modal-header");
  if (header) header.textContent = "Edit Availability Slot";
  
  if (els.slotModal) els.slotModal.classList.add("active");
};

// ==================== RENDERING ====================

function renderCalendar() {
  if (!els.calendarContainer) return;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const hours = [];
  for (let h = 7; h <= 21; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
  }

  let headerHtml = '<tr><th class="time-header">Time</th>';
  days.forEach((day, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    headerHtml += `<th>${day}<br><span style="font-size:11px;color:#64748b;">${formatDateShort(date)}</span></th>`;
  });
  headerHtml += '</tr>';

  // Build a map of slots by day
  const slotsByDay = {};
  days.forEach(day => {
    slotsByDay[day] = availabilityData.slots.filter(s => s.day === day);
  });

  console.log("[tutor] All slots:", availabilityData.slots);
  console.log("[tutor] Slots by day:", slotsByDay);

  let bodyHtml = '';
  hours.forEach((hour) => {
    const hourNum = parseInt(hour.split(":")[0]);
    bodyHtml += `<tr><td class="time-cell">${hour}</td>`;
    
    days.forEach((day) => {
      // Find slots that START at this hour
      const slotsStartingHere = slotsByDay[day].filter(slot => {
        if (!slot.startTime) return false;
        const slotHour = parseInt(slot.startTime.split(":")[0]);
        return slotHour === hourNum;
      });
      
      let cellContent = '';
      slotsStartingHere.forEach(slot => {
        const duration = slot.duration || 60;
        const heightRows = Math.ceil(duration / 60);
        const heightPx = heightRows * 80 - 8;
        
        // Determine status class - ONLY booked slots have different color
        let statusClass = '';
        if (slot.booked) {
          statusClass = 'booked'; // Blue for booked
        }
        // All other slots (published and unpublished) are green (default)
        
        const courseLabel = slot.courseCode || 'Slot';
        // Show "Draft" label ONLY for unpublished slots
        const statusLabel = slot.status === 'unpublished' ? 'Draft' : '';
        
        cellContent += `
          <div class="slot ${statusClass}" 
               onclick="editSlot('${slot.id}')"
               style="height: ${heightPx}px; min-height: ${heightPx}px;">
            <div class="slot-time">${slot.startTime}</div>
            <div class="slot-course">${courseLabel}</div>
            <div class="slot-details">${slot.mode} • ${slot.capacity} student(s)</div>
            ${statusLabel ? `<div class="slot-status">${statusLabel}</div>` : ''}
          </div>
        `;
      });
      
      const hasSlots = slotsStartingHere.length > 0;
      bodyHtml += `<td class="day-cell ${hasSlots ? 'has-slots' : ''}">${cellContent}</td>`;
    });
    bodyHtml += '</tr>';
  });

  els.calendarContainer.innerHTML = `
    <div class="calendar-wrapper">
      <table class="calendar">
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderSlotsTable() {
  const container = els.slotsTableBody || document.querySelector("#slotsTable tbody");
  if (!container) return;

  if (!availabilityData.slots || availabilityData.slots.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 40px; color: #64748b;">
          <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
          <div>No availability slots yet.</div>
          <div style="font-size: 13px; margin-top: 8px;">Click "Add Slots" to create your first slot.</div>
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = availabilityData.slots
    .map((slot) => {
      const statusClass = slot.status === "published" ? "published" : "unpublished";
      const modeClass = slot.mode === "online" ? "online" : "offline";
      const timeDisplay = formatTime(slot.startTime, slot.duration);
      
      const courseDisplay = slot.courseCode 
        ? `<strong>${slot.courseCode}</strong>${slot.courseTitle ? `<br><span style="font-size:11px;color:#64748b;">${slot.courseTitle}</span>` : ''}`
        : '<span style="color:#94a3b8;">Not set</span>';

      return `
        <tr data-slot-id="${slot.id}">
          <td>${courseDisplay}</td>
          <td>${slot.day}</td>
          <td>${timeDisplay}</td>
          <td>${slot.duration} min</td>
          <td><span class="badge ${modeClass}">${slot.mode === "online" ? "Online" : "Offline"}</span></td>
          <td>${slot.location || "-"}</td>
          <td>${slot.capacity}</td>
          <td>${slot.leadTime}h</td>
          <td>${slot.cancelWindow}h</td>
          <td><span class="badge ${statusClass}">${slot.status === "published" ? "Published" : "Unpublished"}</span></td>
          <td class="action-buttons">
            <button class="btn small primary" onclick="editSlot('${slot.id}')">Edit</button>
            <button class="btn small" style="background:#ef4444;color:white;" onclick="deleteSlot('${slot.id}')">Delete</button>
            ${slot.status === "unpublished" ? `<button class="btn small" style="background:#22c55e;color:white;" onclick="publishSlot('${slot.id}')">Publish</button>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderExceptionsTable() {
  if (!els.exceptionsTableBody) return;

  if (!availabilityData.exceptions.length) {
    els.exceptionsTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <div>No exceptions set.</div>
        </td>
      </tr>
    `;
    return;
  }

  els.exceptionsTableBody.innerHTML = availabilityData.exceptions
    .map((exc) => `
      <tr>
        <td>${exc.startDate}</td>
        <td>${exc.endDate}</td>
        <td>${exc.startTime || "All day"} - ${exc.endTime || "All day"}</td>
        <td>${exc.reason || "-"}</td>
        <td>
          <button class="btn small" style="background:#ef4444;color:white;" onclick="deleteException('${exc.id}')">Delete</button>
        </td>
      </tr>
    `)
    .join("");
}

function renderBookingRequests() {
  const container = els.requestsTableBody || document.querySelector("#requestsTable tbody");
  if (!container) return;

  if (!bookingRequests.length) {
    container.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <div>No booking requests yet.</div>
          <div style="font-size: 13px; margin-top: 8px;">When students book your sessions, they'll appear here.</div>
        </td>
      </tr>
    `;
    return;
  }

  const sorted = [...bookingRequests].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  container.innerHTML = sorted
    .map((b) => {
      const statusConfig = {
        pending: { class: "warning", icon: "⏳", label: "Pending" },
        confirmed: { class: "success", icon: "✅", label: "Confirmed" },
        rejected: { class: "error", icon: "❌", label: "Rejected" },
        cancelled: { class: "error", icon: "🚫", label: "Cancelled" },
        completed: { class: "info", icon: "🎓", label: "Completed" },
      };
      
      const status = statusConfig[b.status] || { class: "", icon: "❓", label: b.status };

      let actions = '';
      if (b.status === "pending") {
        actions = `
          <button class="btn small success" onclick="confirmBooking('${b.id}')">✓ Confirm</button>
          <button class="btn small danger" onclick="rejectBooking('${b.id}')">✗ Reject</button>
        `;
      } else if (b.status === "confirmed") {
        actions = `
          <button class="btn small" style="background:#22c55e;color:white;" onclick="completeBooking('${b.id}')">✓ Complete</button>
        `;
      }

      return `
        <tr data-booking-id="${b.id}">
          <td style="font-weight: 600;">${b.studentName || 'Unknown'}</td>
          <td style="font-size: 13px; color: #64748b;">${b.studentEmail || '-'}</td>
          <td>
            <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              ${b.sessionId}
            </code>
          </td>
          <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${b.message || ''}">
            ${b.message || '<span class="muted">No message</span>'}
          </td>
          <td style="font-size: 13px;">${new Date(b.createdAt).toLocaleDateString()}</td>
          <td>
            <span class="badge ${status.class}">
              ${status.icon} ${status.label}
            </span>
          </td>
          <td class="action-buttons">${actions}</td>
        </tr>
      `;
    })
    .join("");
}

function updateWeekUsage() {
  if (els.weekUsage) {
    const policy = availabilityData.policy || { maxSlotsPerWeek: 30 };
    els.weekUsage.textContent = `${availabilityData.weekUsage || availabilityData.slots?.length || 0} / ${policy.maxSlotsPerWeek || 30}`;
  }
}

// ==================== EVENT HANDLERS ====================

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

  // Week navigation
  els.prevWeek?.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    if (els.weekDisplay) {
      els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
    }
    renderCalendar();
  });

  els.nextWeek?.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    if (els.weekDisplay) {
      els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
    }
    renderCalendar();
  });

  // Tab switching
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      
      els.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      
      els.tabContents.forEach((content) => {
        content.classList.remove("active");
      });
      
      const targetContent = document.getElementById(`${tabName}Tab`);
      if (targetContent) {
        targetContent.classList.add("active");
      }
    });
  });

  // Setup recurrence handling
  setupRecurrenceHandling();

  // Add slot button
  els.addSlotBtn?.addEventListener("click", () => {
    editingSlotId = null;
    els.slotForm?.reset();
    
    const recurrenceSelect = document.getElementById("recurrence");
    if (recurrenceSelect) {
      recurrenceSelect.value = "once";
      recurrenceSelect.dispatchEvent(new Event("change"));
    }
    
    const header = document.querySelector("#slotModal .modal-header");
    if (header) header.textContent = "Add Availability Slot";
    
    if (els.slotModal) els.slotModal.classList.add("active");
  });

  // Cancel slot modal
  els.cancelSlotBtn?.addEventListener("click", () => {
    if (els.slotModal) {
      els.slotModal.classList.remove("active");
    }
    editingSlotId = null;
  });

  // Slot form submit
  els.slotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const getValue = (id) => document.getElementById(id)?.value || "";
    
    const courseCode = getValue("courseCode").toUpperCase().trim();
    const courseTitle = getValue("courseTitle").trim();
    const recurrence = getValue("recurrence");
    const slotDate = getValue("slotDate");
    
    // Validation
    if (!courseCode) {
      showAlert("Course Code is required", "error");
      document.getElementById("courseCode")?.focus();
      return;
    }
    
    if (!courseTitle) {
      showAlert("Course Title is required", "error");
      document.getElementById("courseTitle")?.focus();
      return;
    }
    
    if (recurrence === "once" && !slotDate) {
      showAlert("Date is required for one-time slots", "error");
      document.getElementById("slotDate")?.focus();
      return;
    }
    
    let day = getValue("slotDay");
    if (recurrence === "once" && slotDate) {
      const selectedDate = new Date(slotDate);
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      day = dayNames[selectedDate.getDay()];
    }
    
    if (!day) {
      showAlert("Day is required", "error");
      return;
    }
    
    const slotData = {
      courseCode: courseCode,
      courseTitle: courseTitle,
      recurrence: recurrence,
      day: day,
      date: recurrence === "once" ? slotDate : null,
      startTime: getValue("startTime"),
      duration: parseInt(getValue("duration")) || 60,
      mode: getValue("mode"),
      capacity: parseInt(getValue("capacity")) || 1,
      location: getValue("location") || null,
      leadTime: parseInt(getValue("leadTime")) || 24,
      cancelWindow: parseInt(getValue("cancelWindow")) || 12,
    };

    let success;
    if (editingSlotId) {
      success = await updateSlot(editingSlotId, slotData);
    } else {
      success = await addSlot(slotData);
    }

    if (success) {
      els.slotModal?.classList.remove("active");
      els.slotForm?.reset();
      editingSlotId = null;
    }
  });

  // Publish all slots
  els.publishAllBtn?.addEventListener("click", publishAllSlots);

  // Copy last week
  els.copyLastWeek?.addEventListener("click", async () => {
    showAlert("Copy last week feature - coming soon", "warning");
  });

  // Bulk delete unpublished
  els.bulkDeleteUnpublished?.addEventListener("click", bulkDeleteUnpublished);

  // Add exception button
  els.addExceptionBtn?.addEventListener("click", () => {
    if (els.exceptionModal) {
      els.exceptionModal.classList.add("active");
    }
  });

  // Cancel exception modal
  els.cancelExceptionBtn?.addEventListener("click", () => {
    if (els.exceptionModal) {
      els.exceptionModal.classList.remove("active");
    }
  });

  // Exception form submit
  els.exceptionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const getValue = (id) => document.getElementById(id)?.value || "";
    
    const excData = {
      startDate: getValue("exceptionStartDate"),
      endDate: getValue("exceptionEndDate"),
      startTime: getValue("exceptionStartTime") || null,
      endTime: getValue("exceptionEndTime") || null,
      reason: getValue("exceptionReason") || null,
    };

    const success = await addException(excData);

    if (success) {
      els.exceptionModal?.classList.remove("active");
      els.exceptionForm?.reset();
    }
  });

  // Close modals on backdrop click
  els.slotModal?.addEventListener("click", (e) => {
    if (e.target === els.slotModal) {
      els.slotModal.classList.remove("active");
      editingSlotId = null;
    }
  });

  els.exceptionModal?.addEventListener("click", (e) => {
    if (e.target === els.exceptionModal) {
      els.exceptionModal.classList.remove("active");
    }
  });
}

// ==================== INITIALIZE ====================

(async function init() {
  console.log("[tutor] Initializing tutor management page...");
  
  // Check auth first
  try {
    const authRes = await fetch(api("/auth/me"), { credentials: "include" });
    if (!authRes.ok) {
      console.log("[tutor] Not authenticated, redirecting to login");
      window.location.href = "/login.html";
      return;
    }
    const authData = await authRes.json();
    if (authData.user?.role !== "TUTOR") {
      console.log("[tutor] Not a tutor, redirecting");
      window.location.href = "/login.html";
      return;
    }
  } catch (err) {
    console.error("[tutor] Auth check failed:", err);
    window.location.href = "/login.html";
    return;
  }
  
  attachEvents();
  
  // Set initial week display
  if (els.weekDisplay) {
    els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
  }
  
  // Fetch data
  await fetchAvailability();
  await fetchBookingRequests();
  
  // Start polling for booking requests
  startBookingPolling();
  
  console.log("[tutor] Ready!");
})();