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
const BOOKING_POLL_INTERVAL_MS = 5000; // 5 seconds

function startBookingPolling() {
  if (bookingPollInterval) {
    clearInterval(bookingPollInterval);
  }
  console.log("[tutor] Starting booking request polling every", BOOKING_POLL_INTERVAL_MS / 1000, "seconds");
  
  bookingPollInterval = setInterval(async () => {
    console.log("[tutor] Polling for new booking requests...");
    const oldCount = bookingRequests.filter(b => b.status === "pending").length;
    
    await fetchBookingRequests();
    
    const newCount = bookingRequests.filter(b => b.status === "pending").length;
    
    // Show notification if new pending requests
    if (newCount > oldCount) {
      const diff = newCount - oldCount;
      showAlert(`🔔 ${diff} new booking request(s)!`, "success");
      
      // Update tab badge
      updateRequestsTabBadge(newCount);
    }
  }, BOOKING_POLL_INTERVAL_MS);
}

function stopBookingPolling() {
  if (bookingPollInterval) {
    clearInterval(bookingPollInterval);
    bookingPollInterval = null;
    console.log("[tutor] Stopped booking polling");
  }
}

function updateRequestsTabBadge(pendingCount) {
  const requestsTab = document.querySelector('.tab[data-tab="requests"]');
  if (requestsTab) {
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
        animation: pulse 2s infinite;
      `;
      badge.textContent = pendingCount;
      requestsTab.appendChild(badge);
    }
  }
}

// Stop polling when leaving page
window.addEventListener("beforeunload", () => {
  stopBookingPolling();
});

// Visibility API - pause when tab hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopBookingPolling();
  } else {
    fetchBookingRequests();
    startBookingPolling();
  }
});

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

// Helpers
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

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
    // Changed from /tutors/availability to /sessions/availability
    const res = await fetch(api("/sessions/availability"), { credentials: "include" });
    
    if (res.status === 401 || res.status === 403) {
      window.location.href = "/login.html";
      return;
    }
    
    if (!res.ok) {
      console.error("Failed to load availability:", res.status);
      showAlert("Failed to load availability", "error");
      return;
    }
    
    const data = await res.json();
    availabilityData = {
      slots: data.slots || [],
      exceptions: data.exceptions || [],
      policy: data.policy || {},
      weekUsage: data.weekUsage || 0,
    };
    console.log("Availability data:", availabilityData);
    
    renderCalendar();
    renderSlotsTable();
    renderExceptionsTable();
    updateWeekUsage();
  } catch (err) {
    console.error("Fetch availability error:", err);
    showAlert("Failed to load availability", "error");
  }
}

async function addSlot(slotData) {
  try {
    // Changed from /tutors/availability/slots to /sessions/availability/slots
    const res = await fetch(api("/sessions/availability/slots"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slotData),
    });
    
    if (!res.ok) {
      const data = await res.json();
      showAlert(data.detail || "Failed to add slot", "error");
      return false;
    }
    
    showAlert("Slot added successfully!");
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
      showAlert("Failed to update slot", "error");
      return false;
    }
    
    showAlert("Slot updated successfully!");
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
      const data = await res.json();
      showAlert(data.detail || "Failed to delete slot", "error");
      return;
    }
    
    showAlert("Slot deleted!");
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
    
    showAlert("Slot published!");
    await fetchAvailability();
  } catch (err) {
    console.error("Publish slot error:", err);
    showAlert("Failed to publish slot", "error");
  }
};

window.editSlot = function(slotId) {
  const slot = availabilityData.slots.find((s) => s.id === slotId);
  if (!slot) return;
  
  editingSlotId = slotId;
  
  // Populate form
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };
  
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
  
  // Update modal title
  const header = document.querySelector("#slotModal .modal-header");
  if (header) header.textContent = "Edit Availability Slot";
  
  if (els.slotModal) els.slotModal.classList.add("active");
};

async function publishAllSlots() {
  try {
    const res = await fetch(api("/sessions/availability/publish-all"), {
      method: "POST",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to publish slots", "error");
      return;
    }
    
    const data = await res.json();
    showAlert(`Published ${data.count} slot(s)!`);
    await fetchAvailability();
  } catch (err) {
    console.error("Publish all error:", err);
    showAlert("Failed to publish slots", "error");
  }
}

async function bulkDeleteUnpublished() {
  if (!confirm("Are you sure you want to delete all unpublished slots?")) return;
  
  try {
    const res = await fetch(api("/sessions/availability/bulk-delete-unpublished"), {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to delete slots", "error");
      return;
    }
    
    const data = await res.json();
    showAlert(`Deleted ${data.deletedCount} slot(s)`);
    await fetchAvailability();
  } catch (err) {
    console.error("Bulk delete error:", err);
    showAlert("Failed to delete slots", "error");
  }
}

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
    
    showAlert("Exception added!");
    await fetchAvailability();
    return true;
  } catch (err) {
    console.error("Add exception error:", err);
    showAlert("Failed to add exception", "error");
    return false;
  }
}

window.deleteException = async function(excId) {
  if (!confirm("Delete this exception?")) return;
  
  try {
    const res = await fetch(api(`/sessions/availability/exceptions/${excId}`), {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to delete exception", "error");
      return;
    }
    
    showAlert("Exception deleted!");
    await fetchAvailability();
  } catch (err) {
    console.error("Delete exception error:", err);
    showAlert("Failed to delete exception", "error");
  }
};

// ==================== BOOKING REQUESTS (from Tutors service) ====================

async function fetchBookingRequests() {
  try {
    const res = await fetch(api("/tutors/tutor/bookings"), { credentials: "include" });

    if (res.status === 401 || res.status === 403) {
      return;
    }

    if (!res.ok) {
      console.error("Failed to load booking requests");
      return;
    }

    const data = await res.json();
    bookingRequests = data.bookings || [];
    renderBookingRequests();
  } catch (err) {
    console.error("Fetch booking requests error:", err);
  }
}

async function confirmBooking(bookingId) {
  try {
    const res = await fetch(api(`/tutors/tutor/bookings/${bookingId}/confirm`), {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json();
      showAlert(data.detail || "Failed to confirm booking", "error");
      return;
    }

    showAlert("Booking confirmed!");
    await fetchBookingRequests();
  } catch (err) {
    console.error("Confirm booking error:", err);
    showAlert("Failed to confirm booking", "error");
  }
}

async function rejectBooking(bookingId) {
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

    showAlert("Booking rejected");
    await fetchBookingRequests();
  } catch (err) {
    console.error("Reject booking error:", err);
    showAlert("Failed to reject booking", "error");
  }
}

async function completeBooking(bookingId) {
  try {
    const res = await fetch(api(`/tutors/tutor/bookings/${bookingId}/complete`), {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      showAlert("Failed to complete booking", "error");
      return;
    }

    showAlert("Session marked as completed!");
    await fetchBookingRequests();
  } catch (err) {
    console.error("Complete booking error:", err);
    showAlert("Failed to complete booking", "error");
  }
}

window.confirmBooking = confirmBooking;
window.rejectBooking = rejectBooking;
window.completeBooking = completeBooking;

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
    headerHtml += `<th>${day}<br><span style="font-weight:400;font-size:12px;">${formatDateShort(date)}</span></th>`;
  });
  headerHtml += '</tr>';

  let bodyHtml = '';
  hours.forEach((hour) => {
    bodyHtml += '<tr>';
    bodyHtml += `<td class="time-cell">${hour}</td>`;
    
    days.forEach((day) => {
      const slotsInCell = availabilityData.slots.filter((s) => {
        if (s.day !== day) return false;
        const slotHour = parseInt(s.startTime.split(":")[0], 10);
        const cellHour = parseInt(hour.split(":")[0], 10);
        return slotHour === cellHour;
      });

      let cellClass = "day-cell";
      let cellContent = "";

      if (slotsInCell.length > 0) {
        cellClass += " has-slots";
        slotsInCell.forEach((slot) => {
          let slotClass = "slot";
          let slotText = `${slot.startTime}<br>${slot.duration}min · ${slot.mode}<br>${slot.capacity} student${slot.capacity > 1 ? 's' : ''}`;
          
          if (slot.booked) {
            slotClass += " booked";
            slotText = `${slot.startTime}<br>Booked`;
          } else if (slot.status === "unpublished") {
            slotText = `${slot.startTime}<br>Draft`;
          }
          
          const heightPercent = Math.min((slot.duration / 60) * 100, 200);
          
          cellContent += `<div class="${slotClass}" style="height:${heightPercent}%" onclick="editSlot('${slot.id}')">${slotText}</div>`;
        });
      }

      const cellDate = new Date(currentWeekStart);
      cellDate.setDate(cellDate.getDate() + days.indexOf(day));
      const dateStr = cellDate.toISOString().split('T')[0];
      
      const hasException = availabilityData.exceptions.some((exc) => {
        return exc.startDate <= dateStr && exc.endDate >= dateStr;
      });
      
      if (hasException) {
        cellClass += " has-exception";
        cellContent = `<div class="slot exception">Unavailable</div>`;
      }

      bodyHtml += `<td class="${cellClass}">${cellContent}</td>`;
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
  if (!els.slotsTableBody) return;

  if (!availabilityData.slots.length) {
    els.slotsTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 40px; color: #64748b;">
          No availability slots configured. Click "+ Add Slots" to create one.
        </td>
      </tr>
    `;
    return;
  }

  els.slotsTableBody.innerHTML = availabilityData.slots
    .map((slot) => {
      const statusClass = slot.status === "published" ? "published" : "unpublished";
      const modeClass = slot.mode === "online" ? "online" : "offline";
      
      return `
        <tr>
          <td>${slot.day}</td>
          <td>${formatTime(slot.startTime, slot.duration)}</td>
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
        <td colspan="3" style="text-align: center; padding: 40px; color: #64748b;">
          No exceptions configured
        </td>
      </tr>
    `;
    return;
  }

  els.exceptionsTableBody.innerHTML = availabilityData.exceptions
    .map((exc) => {
      const dateRange = exc.startDate === exc.endDate 
        ? exc.startDate 
        : `${exc.startDate} - ${exc.endDate}`;
      const timeRange = exc.startTime && exc.endTime 
        ? `${exc.startTime} - ${exc.endTime}` 
        : "All day";
      
      return `
        <tr>
          <td>${dateRange}</td>
          <td>${timeRange}</td>
          <td>${exc.reason || "-"}</td>
          <td class="action-buttons">
            <button class="btn small" style="background:#ef4444;color:white;" onclick="deleteException('${exc.id}')">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderBookingRequests() {
  const container = els.requestsTableBody;
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

  // Sort: pending first, then by date
  const sorted = [...bookingRequests].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  container.innerHTML = sorted
    .map((b) => {
      // Status badge styling
      const statusConfig = {
        pending: { class: "warning", icon: "⏳", label: "Pending" },
        confirmed: { class: "success", icon: "✅", label: "Confirmed" },
        rejected: { class: "error", icon: "❌", label: "Rejected" },
        cancelled: { class: "error", icon: "🚫", label: "Cancelled" },
        completed: { class: "info", icon: "🎓", label: "Completed" },
      };
      
      const status = statusConfig[b.status] || { class: "", icon: "❓", label: b.status };

      // Action buttons based on status
      let actions = '';
      if (b.status === "pending") {
        actions = `
          <button class="btn small success" onclick="confirmBooking('${b.id}')">✓ Confirm</button>
          <button class="btn small danger" onclick="rejectBooking('${b.id}')">✗ Reject</button>
        `;
      } else if (b.status === "confirmed") {
        actions = `
          <button class="btn small primary" onclick="completeBooking('${b.id}')">🎓 Complete</button>
        `;
      } else {
        actions = `<span class="muted">-</span>`;
      }

      // Check if this is a new request (less than 1 minute old)
      const isNew = b.status === "pending" && 
                    (Date.now() - new Date(b.createdAt).getTime()) < 60000;

      return `
        <tr class="${isNew ? 'booking-new' : ''}">
          <td>
            <div style="font-weight: 600;">${b.studentName || 'Unknown'}</div>
          </td>
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

      const targetContent = document.querySelector(`#${tabName}Tab`);
      if (targetContent) {
        targetContent.classList.add("active");
      }

      if (tabName === "requests") {
        fetchBookingRequests();
      }
    });
  });

  // Add slot button
  els.addSlotBtn?.addEventListener("click", () => {
    editingSlotId = null;
    const header = document.querySelector("#slotModal .modal-header");
    if (header) header.textContent = "Add Availability Slot";
    
    els.slotForm?.reset();
    
    if (els.slotModal) {
      els.slotModal.classList.add("active");
    }
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
    
    const slotData = {
      recurrence: getValue("recurrence"),
      day: getValue("slotDay"),
      date: getValue("slotDate") || null,
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
  console.log("Initializing tutor management page...");

  if (els.weekDisplay) {
    els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
  }

  attachEvents();
  
  // Fetch initial data
  await Promise.all([
    fetchAvailability(),
    fetchBookingRequests(),
  ]);
  
  // Update badge on load
  const pendingCount = bookingRequests.filter(b => b.status === "pending").length;
  updateRequestsTabBadge(pendingCount);
  
  // Start auto-polling for new booking requests
  startBookingPolling();
  
  console.log("Tutor management page initialized with auto-polling");
})();