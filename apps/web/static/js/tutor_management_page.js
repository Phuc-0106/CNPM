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

// Calendar Rendering - Using TABLE structure to match existing CSS
function renderCalendar() {
  if (!els.calendarContainer) return;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const hours = [];
  for (let h = 7; h <= 21; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
  }

  // Build header row
  let headerHtml = '<tr><th class="time-header">Time</th>';
  days.forEach((day, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    headerHtml += `<th>${day}<br><span style="font-weight:400;font-size:12px;">${formatDateShort(date)}</span></th>`;
  });
  headerHtml += '</tr>';

  // Build body rows
  let bodyHtml = '';
  hours.forEach((hour) => {
    bodyHtml += '<tr>';
    bodyHtml += `<td class="time-cell">${hour}</td>`;
    
    days.forEach((day) => {
      // Find slots for this cell
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
          
          // Calculate height based on duration (60min = 100%)
          const heightPercent = Math.min((slot.duration / 60) * 100, 200);
          
          cellContent += `<div class="${slotClass}" style="height:${heightPercent}%" onclick="editSlot('${slot.id}')">${slotText}</div>`;
        });
      }

      // Check for exceptions on this day
      const cellDate = new Date(currentWeekStart);
      cellDate.setDate(cellDate.getDate() + days.indexOf(day));
      const dateStr = cellDate.toISOString().split('T')[0];
      
      const hasException = availabilityData.exceptions.some((exc) => {
        return exc.startDate <= dateStr && exc.endDate >= dateStr;
      });

      if (hasException && !slotsInCell.length) {
        cellClass += " disabled";
        cellContent = '<div class="slot exception">Unavailable</div>';
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

// Slots Table Rendering
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

// Exceptions Table Rendering
function renderExceptionsTable() {
  if (!els.exceptionsTableBody) return;

  if (!availabilityData.exceptions.length) {
    els.exceptionsTableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 40px; color: #64748b;">
          No exceptions configured.
        </td>
      </tr>
    `;
    return;
  }

  els.exceptionsTableBody.innerHTML = availabilityData.exceptions
    .map((exc) => {
      const dateRange = exc.startDate === exc.endDate 
        ? exc.startDate 
        : `${exc.startDate} to ${exc.endDate}`;
      const timeRange = exc.startTime && exc.endTime 
        ? ` (${exc.startTime} - ${exc.endTime})` 
        : " (All day)";
      
      return `
        <tr>
          <td>${dateRange}${timeRange}</td>
          <td>${exc.reason || "-"}</td>
          <td class="action-buttons">
            <button class="btn small" style="background:#ef4444;color:white;" onclick="deleteException('${exc.id}')">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Update week usage display
function updateWeekUsage() {
  if (els.weekUsage) {
    const policy = availabilityData.policy || { maxSlotsPerWeek: 30 };
    els.weekUsage.textContent = `${availabilityData.weekUsage || availabilityData.slots?.length || 0} / ${policy.maxSlotsPerWeek || 30}`;
  }
}

// API Calls
async function fetchAvailability() {
  console.log("Fetching availability...");
  try {
    const res = await fetch(api("/tutors/availability"), { credentials: "include" });
    
    if (res.status === 401 || res.status === 403) {
      window.location.href = "/login.html";
      return;
    }
    
    if (!res.ok) {
      console.error("Failed to load availability");
      return;
    }
    
    availabilityData = await res.json();
    console.log("Availability data:", availabilityData);
    
    renderCalendar();
    renderSlotsTable();
    renderExceptionsTable();
    updateWeekUsage();
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

async function addSlot(slotData) {
  try {
    const res = await fetch(api("/tutors/availability/slots"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slotData),
    });
    
    if (!res.ok) {
      showAlert("Failed to add slot", "error");
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
    const res = await fetch(api(`/tutors/availability/slots/${slotId}`), {
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
    const res = await fetch(api(`/tutors/availability/slots/${slotId}`), {
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
    const res = await fetch(api(`/tutors/availability/slots/${slotId}/publish`), {
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
    const el = document.querySelector(`#${id}`);
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
    const res = await fetch(api("/tutors/availability/publish-all"), {
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
    const res = await fetch(api("/tutors/availability/bulk-delete-unpublished"), {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!res.ok) {
      showAlert("Failed to delete slots", "error");
      return;
    }
    
    const data = await res.json();
    showAlert(`Deleted ${data.count} unpublished slot(s)!`);
    await fetchAvailability();
  } catch (err) {
    console.error("Bulk delete error:", err);
    showAlert("Failed to delete slots", "error");
  }
}

async function addException(excData) {
  try {
    const res = await fetch(api("/tutors/availability/exceptions"), {
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
    const res = await fetch(api(`/tutors/availability/exceptions/${excId}`), {
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

// Event Handlers
function attachEvents() {
  // Logout
  els.logout?.addEventListener("click", async () => {
    try {
      await fetch(api("/auth/logout"), { method: "POST", credentials: "include" });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.replace("/login.html?logout=1");
    }
  });

  // Week navigation
  els.prevWeek?.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    if (els.weekDisplay) els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
    renderCalendar();
  });

  els.nextWeek?.addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    if (els.weekDisplay) els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
    renderCalendar();
  });

  // Tab switching
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.tabs.forEach((t) => t.classList.remove("active"));
      els.tabContents.forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const tabId = tab.dataset.tab + "Tab";
      document.querySelector(`#${tabId}`)?.classList.add("active");
    });
  });

  // Slot modal
  els.addSlotBtn?.addEventListener("click", () => {
    editingSlotId = null;
    if (els.slotForm) els.slotForm.reset();
    const header = document.querySelector("#slotModal .modal-header");
    if (header) header.textContent = "Add Availability Slot";
    if (els.slotModal) els.slotModal.classList.add("active");
  });

  els.cancelSlotBtn?.addEventListener("click", () => {
    if (els.slotModal) els.slotModal.classList.remove("active");
  });

  els.slotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const getVal = (id) => document.querySelector(`#${id}`)?.value;
    
    const slotData = {
      recurrence: getVal("recurrence"),
      day: getVal("slotDay"),
      date: getVal("slotDate") || null,
      startTime: getVal("startTime"),
      duration: parseInt(getVal("duration"), 10) || 60,
      mode: getVal("mode"),
      capacity: parseInt(getVal("capacity"), 10) || 1,
      location: getVal("location") || null,
      leadTime: parseInt(getVal("leadTime"), 10) || 24,
      cancelWindow: parseInt(getVal("cancelWindow"), 10) || 12,
    };
    
    let success;
    if (editingSlotId) {
      success = await updateSlot(editingSlotId, slotData);
    } else {
      success = await addSlot(slotData);
    }
    
    if (success && els.slotModal) {
      els.slotModal.classList.remove("active");
    }
  });

  // Exception modal
  els.addExceptionBtn?.addEventListener("click", () => {
    if (els.exceptionForm) els.exceptionForm.reset();
    if (els.exceptionModal) els.exceptionModal.classList.add("active");
  });

  els.cancelExceptionBtn?.addEventListener("click", () => {
    if (els.exceptionModal) els.exceptionModal.classList.remove("active");
  });

  els.exceptionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const excData = {
      startDate: document.querySelector("#exceptionStartDate")?.value,
      endDate: document.querySelector("#exceptionEndDate")?.value,
      startTime: document.querySelector("#exceptionStartTime")?.value || null,
      endTime: document.querySelector("#exceptionEndTime")?.value || null,
      reason: document.querySelector("#exceptionReason")?.value,
    };
    
    const success = await addException(excData);
    if (success && els.exceptionModal) {
      els.exceptionModal.classList.remove("active");
    }
  });

  // Bulk actions
  els.publishAllBtn?.addEventListener("click", publishAllSlots);
  els.bulkDeleteUnpublished?.addEventListener("click", bulkDeleteUnpublished);
  
  els.copyLastWeek?.addEventListener("click", () => {
    showAlert("Copy last week feature coming soon!", "warning");
  });

  // Close modals on backdrop click
  els.slotModal?.addEventListener("click", (e) => {
    if (e.target === els.slotModal) {
      els.slotModal.classList.remove("active");
    }
  });

  els.exceptionModal?.addEventListener("click", (e) => {
    if (e.target === els.exceptionModal) {
      els.exceptionModal.classList.remove("active");
    }
  });
}

// Initialize
(async function init() {
  console.log("Initializing tutor management page...");
  
  // Set initial week display
  if (els.weekDisplay) {
    els.weekDisplay.textContent = formatWeekDisplay(currentWeekStart);
  }
  
  attachEvents();
  await fetchAvailability();
})();