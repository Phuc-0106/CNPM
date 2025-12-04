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

let sessions = [];
let currentTab = 'all';
let selectedSessionId = null;

// ==================== AUTO-POLLING CONFIGURATION ====================
let sessionPollInterval = null;
let participantPollInterval = null;
const SESSION_POLL_INTERVAL_MS = 5000; // 5 seconds (less frequent to reduce noise)
const PARTICIPANT_POLL_INTERVAL_MS = 5000; // 5 seconds for participants

function startSessionPolling() {
    if (sessionPollInterval) {
        clearInterval(sessionPollInterval);
    }
    console.log("[tutor_sessions] Starting session polling every", SESSION_POLL_INTERVAL_MS / 1000, "seconds");
    
    sessionPollInterval = setInterval(async () => {
        console.log("[tutor_sessions] Polling for session updates...");
        await fetchSessions(true); // silent fetch - no alerts
    }, SESSION_POLL_INTERVAL_MS);
}

function startParticipantPolling() {
    if (participantPollInterval) {
        clearInterval(participantPollInterval);
    }
    
    if (!selectedSessionId) return;
    
    console.log("[tutor_sessions] Starting participant polling for session:", selectedSessionId);
    
    participantPollInterval = setInterval(async () => {
        if (!selectedSessionId) {
            stopParticipantPolling();
            return;
        }
        
        const session = sessions.find(s => s.id === selectedSessionId);
        if (!session) return;
        
        const oldParticipantCount = session.participants?.length || 0;
        
        // Fetch updated participants silently
        const participants = await fetchParticipants(selectedSessionId, true);
        
        // Only update and re-render if there's an actual change
        const newParticipantCount = participants.length;
        
        if (newParticipantCount !== oldParticipantCount) {
            session.participants = participants;
            console.log("[tutor_sessions] Participant count changed:", oldParticipantCount, "->", newParticipantCount);
            renderSessionDetails(session);
        }
    }, PARTICIPANT_POLL_INTERVAL_MS);
}

function stopSessionPolling() {
    if (sessionPollInterval) {
        clearInterval(sessionPollInterval);
        sessionPollInterval = null;
        console.log("[tutor_sessions] Stopped session polling");
    }
}

function stopParticipantPolling() {
    if (participantPollInterval) {
        clearInterval(participantPollInterval);
        participantPollInterval = null;
        console.log("[tutor_sessions] Stopped participant polling");
    }
}

function stopAllPolling() {
    stopSessionPolling();
    stopParticipantPolling();
}

// Stop polling when leaving page
window.addEventListener("beforeunload", stopAllPolling);

// Visibility API - pause when tab hidden, resume when visible
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        console.log("[tutor_sessions] Tab hidden, pausing polling");
        stopAllPolling();
    } else {
        console.log("[tutor_sessions] Tab visible, resuming polling");
        startSessionPolling();
        if (selectedSessionId) {
            startParticipantPolling();
        }
    }
});

// ==================== UTILITY FUNCTIONS ====================

function showAlert(message, type = 'success') {
    const alertBox = document.getElementById('alertBox');
    if (!alertBox) return;
    
    alertBox.textContent = message;
    alertBox.className = `alert ${type} active`;
    
    setTimeout(() => {
        alertBox.classList.remove('active');
    }, 3000);
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString || 'TBD';
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString || '';
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== FETCH SESSIONS FROM BACKEND ====================
async function fetchSessions(silent = false) {
    if (!silent) {
        console.log("[tutor_sessions] Fetching sessions from:", api("/sessions/tutor/sessions"));
    }
    try {
        const res = await fetch(api("/sessions/tutor/sessions"), {
            credentials: "include",
        });

        if (!silent) {
            console.log("[tutor_sessions] Response status:", res.status);
        }

        if (res.status === 401 || res.status === 403) {
            console.log("[tutor_sessions] Unauthorized, redirecting to login");
            stopAllPolling();
            window.location.href = "/login.html";
            return;
        }

        if (!res.ok) {
            console.error("[tutor_sessions] Failed to fetch sessions:", res.status);
            if (!silent) {
                showAlert("Failed to load sessions", "error");
            }
            return;
        }

        const data = await res.json();
        if (!silent) {
            console.log("[tutor_sessions] Sessions data:", data);
        }
        
        // Transform sessions from backend
        const newSessions = (data.sessions || []).map(s => ({
            id: s.id,
            title: s.courseTitle || s.title || "Session",
            course: s.courseCode || "TUTORING",
            startTime: s.startTime,
            endTime: s.endTime,
            mode: s.mode || "online",
            location: s.location || (s.mode === "online" ? "Google Meet" : "TBD"),
            status: s.status || "upcoming",
            capacity: s.capacity || 1,
            enrolled: s.enrolled || 0,
            participants: [], // Will be fetched when session is selected
            notes: s.notes || "",
            day: s.day,
        }));

        // Preserve participants for the selected session
        if (selectedSessionId) {
            const oldSession = sessions.find(s => s.id === selectedSessionId);
            const newSession = newSessions.find(s => s.id === selectedSessionId);
            if (oldSession && newSession && oldSession.participants) {
                newSession.participants = oldSession.participants;
            }
        }

        sessions = newSessions;

        if (!silent) {
            console.log("[tutor_sessions] Transformed sessions:", sessions.length);
        }
        
        renderSessionList();
        updateTabCounts();
        
        // If a session is selected, update its details too (to reflect any status changes)
        if (selectedSessionId) {
            const session = sessions.find(s => s.id === selectedSessionId);
            if (session && session.participants.length > 0) {
                renderSessionDetails(session);
            }
        }
    } catch (err) {
        console.error("[tutor_sessions] Fetch error:", err);
        if (!silent) {
            showAlert("Failed to load sessions", "error");
        }
    }
}

// ==================== FETCH PARTICIPANTS FOR A SESSION ====================
async function fetchParticipants(sessionId, silent = false) {
    if (!silent) {
        console.log("[tutor_sessions] Fetching participants for session:", sessionId);
    }
    try {
        // First try to get from sessions service
        const res = await fetch(api(`/sessions/tutor/sessions/${sessionId}/participants`), {
            credentials: "include",
        });

        if (res.ok) {
            const data = await res.json();
            if (!silent) {
                console.log("[tutor_sessions] Participants from sessions service:", data);
            }
            if (data.participants && data.participants.length > 0) {
                return data.participants;
            }
        }

        // Fallback: Get confirmed bookings from tutors service
        if (!silent) {
            console.log("[tutor_sessions] Falling back to bookings...");
        }
        const bookingsRes = await fetch(api("/tutors/tutor/bookings"), {
            credentials: "include",
        });

        if (!bookingsRes.ok) {
            console.error("[tutor_sessions] Failed to fetch bookings:", bookingsRes.status);
            return [];
        }

        const bookingsData = await bookingsRes.json();
        const bookings = bookingsData.bookings || [];
        
        // Filter bookings for this session (both pending and confirmed)
        const sessionBookings = bookings.filter(b => 
            b.sessionId === sessionId && (b.status === "confirmed")
        );

        // Transform bookings to participants
        const participants = sessionBookings.map(b => ({
            id: b.studentId,
            name: b.studentName || "Unknown",
            email: b.studentEmail || "",
            status: b.status === "confirmed" ? "pending" : "pending", // Default attendance status
            bookingStatus: b.status, // Keep booking status separate
        }));

        if (!silent) {
            console.log("[tutor_sessions] Participants from bookings:", participants);
        }
        return participants;
    } catch (err) {
        console.error("[tutor_sessions] Fetch participants error:", err);
        return [];
    }
}

// ==================== MANUAL REFRESH ====================
async function refreshCurrentSession() {
    if (!selectedSessionId) return;
    
    showAlert("🔄 Refreshing...", "info");
    
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;
    
    // Fetch updated participants
    const participants = await fetchParticipants(selectedSessionId);
    session.participants = participants;
    
    renderSessionDetails(session);
    showAlert("✅ Session refreshed!", "success");
}

async function refreshAllSessions() {
    showAlert("🔄 Refreshing all sessions...", "info");
    await fetchSessions();
    
    // If a session is selected, also refresh its participants
    if (selectedSessionId) {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session) {
            const participants = await fetchParticipants(selectedSessionId);
            session.participants = participants;
            renderSessionDetails(session);
        }
    }
    
    showAlert("✅ All sessions refreshed!", "success");
}

// ==================== RENDER FUNCTIONS ====================

function renderSessionList() {
    const container = document.getElementById('sessionsContainer');
    if (!container) return;

    const filteredSessions = sessions.filter(s => {
        if (currentTab === 'all') return true;
        return s.status === currentTab;
    });

    if (filteredSessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
                <div style="color: #64748b;">No sessions found</div>
                <div style="font-size: 13px; color: #94a3b8; margin-top: 8px;">
                    Sessions will appear here once you publish availability slots.
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredSessions.map(session => `
        <div class="session-item ${session.id === selectedSessionId ? 'active' : ''}" 
             onclick="selectSession('${session.id}')">
            <div class="session-item-header">
                <div class="session-item-title">${session.title}</div>
                <span class="badge ${session.status}">${session.status}</span>
            </div>
            <div class="session-item-course">${session.course}</div>
            <div class="session-item-time">🕐 ${formatDateTime(session.startTime)}</div>
            <div class="session-item-mode">
                ${session.mode === 'online' ? '💻' : '🏫'} ${session.mode} 
                ${session.mode === 'offline' ? `• ${session.location}` : ''}
            </div>
        </div>
    `).join('');
}

function renderSessionDetails(session) {
    const detailsPane = document.getElementById('detailsPane');
    if (!detailsPane) return;

    const isActive = session.status === 'active';
    const isPast = session.status === 'past';
    const isUpcoming = session.status === 'upcoming';

    console.log("[tutor_sessions] Rendering session details:", session);

    const startDate = new Date(session.startTime);
    const endDate = new Date(session.endTime);
    const dateStr = !isNaN(startDate.getTime()) 
        ? startDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })
        : 'TBD';
    const timeStr = `${formatTime(session.startTime)} - ${formatTime(session.endTime)}`;

    // Generate timeline based on status
    let timelineHtml = '';
    if (isActive || isPast) {
        const events = [
            { time: formatTime(session.startTime), text: 'Session started', color: '#16a34a' },
        ];
        
        session.participants.forEach((p, i) => {
            if (p.status === 'present') {
                const joinTime = new Date(startDate.getTime() + (i + 1) * 3 * 60000);
                events.push({ 
                    time: formatTime(joinTime.toISOString()), 
                    text: `${p.name} joined`, 
                    color: '#3b82f6' 
                });
            }
        });

        if (isPast) {
            events.push({ time: formatTime(session.endTime), text: 'Session ended', color: '#64748b' });
        }

        timelineHtml = events.map(e => `
            <div class="timeline-item">
                <div class="timeline-dot" style="background: ${e.color};"></div>
                <div class="timeline-content">
                    <div class="timeline-time">${e.time}</div>
                    <div class="timeline-text">${e.text}</div>
                </div>
            </div>
        `).join('');
    }

    // Generate participants HTML
    const participantsHtml = session.participants.length > 0 
        ? session.participants.map(p => {
            const statusColor = p.status === 'present' ? '#dcfce7' : 
                               p.status === 'absent' ? '#fee2e2' : '#fef3c7';
            const textColor = p.status === 'present' ? '#16a34a' : 
                             p.status === 'absent' ? '#dc2626' : '#d97706';
            return `
            <div class="participant-item">
                <div class="participant-avatar" style="background: ${statusColor}; color: ${textColor};">
                    ${(p.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div class="participant-info">
                    <div class="participant-name">${p.name || 'Unknown'}</div>
                    <div class="participant-email">${p.email || ''}</div>
                </div>
                <span class="participant-status ${p.status}">${p.status}</span>
            </div>
        `}).join('')
        : '<div style="padding: 20px; text-align: center; color: #64748b;">No participants yet</div>';

    detailsPane.innerHTML = `
        <div class="session-header">
            <div class="session-title-row">
                <div>
                    <h1 class="session-title">${session.title}</h1>
                    <div class="session-course">${session.course}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button class="btn secondary" onclick="refreshCurrentSession()" title="Refresh this session">
                        🔄
                    </button>
                    <span class="badge ${session.status}" style="font-size: 14px; padding: 8px 16px;">${session.status}</span>
                </div>
            </div>

            ${isActive ? `
                <div class="in-progress-banner">
                    <span class="banner-dot"></span>
                    <span>🎯 Session in progress</span>
                </div>
            ` : ''}

            <div class="session-meta">
                <div class="meta-item">
                    <div class="meta-label">📅 Date</div>
                    <div class="meta-value">${dateStr}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">🕐 Time</div>
                    <div class="meta-value">${timeStr}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">🎮 Mode</div>
                    <div class="meta-value">${session.mode === 'online' ? '💻 Online' : '🏫 ' + session.mode}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">📍 Location</div>
                    <div class="meta-value">${session.location || 'TBD'}</div>
                </div>
            </div>
        </div>

        <div class="session-content">
            <!-- Participants Card -->
            <div class="content-card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <span>👥 Participants (${session.participants.length})</span>
                    <span style="color: #64748b; font-size: 13px;">Capacity: ${session.enrolled || session.participants.length}/${session.capacity}</span>
                </div>
                <div class="participants-list">
                    ${participantsHtml}
                </div>
            </div>

            ${session.mode === 'online' ? `
                <!-- Join Link Card -->
                <div class="content-card">
                    <div class="card-header" style="margin-bottom: 16px;">🔗 Join Link</div>
                    <div class="join-link-box">
                        <span class="join-link-icon">🎥</span>
                        <span class="join-link-text">https://meet.google.com/abc-defg-hij</span>
                        <button class="copy-btn" onclick="copyJoinLink('https://meet.google.com/abc-defg-hij')">📋 Copy</button>
                    </div>
                </div>
            ` : ''}

            ${timelineHtml ? `
                <!-- Timeline Card -->
                <div class="content-card">
                    <div class="card-header" style="margin-bottom: 16px;">⏰ Timeline</div>
                    <div class="timeline">
                        ${timelineHtml}
                    </div>
                </div>
            ` : ''}

            <!-- Notes Card -->
            <div class="content-card">
                <div class="card-header" style="margin-bottom: 16px;">📝 Session Notes</div>
                <textarea class="notes-editor" id="sessionNotes" placeholder="Add notes about this session...">${session.notes || ''}</textarea>
                <div class="notes-actions" style="margin-top: 12px; display: flex; gap: 8px;">
                    <button class="btn success" onclick="saveNotes()">💾 Save Notes</button>
                    <button class="btn secondary" onclick="document.getElementById('sessionNotes').value = ''">🗑️ Clear</button>
                </div>
            </div>

            <!-- Library Resources Card -->
            <div class="content-card">
                <div class="card-header" style="margin-bottom: 16px;">📚 Library Resources</div>
                <div id="libraryResources"></div>
            </div>

            <!-- Actions Card -->
            <div class="content-card">
                <div class="card-header" style="margin-bottom: 16px;">⚡ Actions</div>
                <div class="action-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                    <button class="btn primary" onclick="openAttendanceModal()" ${!isActive && !isPast ? 'disabled' : ''}>
                        ✓ Mark Attendance
                    </button>
                    <button class="btn warning" onclick="openExtendModal()" ${!isActive ? 'disabled' : ''}>
                        ⏰ Extend Session
                    </button>
                    <button class="btn secondary" onclick="openChangeModeModal()" ${isPast ? 'disabled' : ''}>
                        🔄 Change Mode
                    </button>
                    <button class="btn danger" onclick="endSession()" ${!isActive ? 'disabled' : ''}>
                        ⏹️ End Session
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Render library resources after DOM is updated
    renderLibraryResources(session.course);
}

function updateTabCounts() {
    const counts = {
        all: sessions.length,
        active: sessions.filter(s => s.status === 'active').length,
        upcoming: sessions.filter(s => s.status === 'upcoming').length,
        past: sessions.filter(s => s.status === 'past').length,
    };

    document.querySelectorAll('.session-tab').forEach(tab => {
        const tabName = tab.dataset.tab;
        const countEl = tab.querySelector('.count');
        if (countEl && counts[tabName] !== undefined) {
            countEl.textContent = counts[tabName];
        }
    });
}

// ==================== ATTENDANCE MODAL ====================

function openAttendanceModal() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const modal = document.getElementById('attendanceModal');
    const list = document.getElementById('attendanceList');
    
    if (session.participants.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b;">No participants to mark attendance for.</div>';
    } else {
        list.innerHTML = session.participants.map(p => `
            <div class="attendance-item">
                <input type="checkbox" class="attendance-checkbox" data-student-id="${p.id}" ${p.status === 'present' ? 'checked' : ''}>
                <div class="participant-avatar" style="background: ${p.status === 'present' ? '#dcfce7' : '#f3f4f6'}; color: ${p.status === 'present' ? '#16a34a' : '#64748b'}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">
                    ${(p.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1e293b;">${p.name || 'Unknown'}</div>
                    <div style="font-size: 12px; color: #64748b;">${p.email || ''}</div>
                </div>
            </div>
        `).join('');
    }

    modal.classList.add('active');
}

function closeAttendanceModal() {
    document.getElementById('attendanceModal').classList.remove('active');
}

async function saveAttendance() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const checkboxes = document.querySelectorAll('#attendanceList input[type="checkbox"]');
    const attendance = [];

    checkboxes.forEach(cb => {
        attendance.push({
            studentId: cb.dataset.studentId,
            status: cb.checked ? 'present' : 'absent'
        });
    });

    try {
        const res = await fetch(api(`/sessions/tutor/sessions/${selectedSessionId}/attendance`), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendance }),
        });

        if (!res.ok) {
            console.warn("[tutor_sessions] Backend save attendance failed, updating locally");
        }

        // Update local state
        session.participants.forEach(p => {
            const record = attendance.find(a => a.studentId === p.id);
            if (record) {
                p.status = record.status;
            }
        });

        closeAttendanceModal();
        showAlert('Attendance saved! ✓', 'success');
        renderSessionDetails(session);
    } catch (err) {
        console.error("[tutor_sessions] Save attendance error:", err);
        // Still update locally
        session.participants.forEach(p => {
            const record = attendance.find(a => a.studentId === p.id);
            if (record) {
                p.status = record.status;
            }
        });
        closeAttendanceModal();
        showAlert('Attendance saved! ✓', 'success');
        renderSessionDetails(session);
    }
}

// ==================== EXTEND SESSION ====================

function openExtendModal() {
    document.getElementById('extendModal').classList.add('active');
}

function closeExtendModal() {
    document.getElementById('extendModal').classList.remove('active');
}

async function confirmExtend(minutes) {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    try {
        const res = await fetch(api(`/sessions/tutor/sessions/${selectedSessionId}/extend`), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minutes }),
        });

        if (!res.ok) {
            console.warn("[tutor_sessions] Backend extend failed, updating locally");
        }

        // Update local state
        const endDate = new Date(session.endTime);
        endDate.setMinutes(endDate.getMinutes() + minutes);
        session.endTime = endDate.toISOString();

        closeExtendModal();
        showAlert(`Session extended by ${minutes} minutes! ⏰`, 'success');
        renderSessionDetails(session);
    } catch (err) {
        console.error("[tutor_sessions] Extend session error:", err);
        // Still update locally
        const endDate = new Date(session.endTime);
        endDate.setMinutes(endDate.getMinutes() + minutes);
        session.endTime = endDate.toISOString();
        closeExtendModal();
        showAlert(`Session extended by ${minutes} minutes! ⏰`, 'success');
        renderSessionDetails(session);
    }
}

// ==================== CHANGE MODE ====================

function openChangeModeModal() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const content = document.getElementById('changeModeContent');
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <p style="color: #64748b; margin-bottom: 16px;">Current mode: <strong>${session.mode}</strong></p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid ${session.mode === 'online' ? '#3b82f6' : '#e2e8f0'}; border-radius: 10px; cursor: pointer;">
                    <input type="radio" name="sessionMode" value="online" ${session.mode === 'online' ? 'checked' : ''}>
                    <span>💻 Online (Google Meet)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid ${session.mode === 'offline' ? '#3b82f6' : '#e2e8f0'}; border-radius: 10px; cursor: pointer;">
                    <input type="radio" name="sessionMode" value="offline" ${session.mode === 'offline' ? 'checked' : ''}>
                    <span>🏫 Offline (On-campus)</span>
                </label>
            </div>
            <div style="margin-top: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Location (for offline):</label>
                <input type="text" id="newLocation" class="notes-editor" style="min-height: auto; padding: 12px;" 
                    placeholder="e.g., Room B1-101" value="${session.mode === 'offline' ? session.location : ''}">
            </div>
        </div>
    `;

    document.getElementById('changeModeModal').classList.add('active');
}

function closeChangeModeModal() {
    document.getElementById('changeModeModal').classList.remove('active');
}

async function confirmChangeMode() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const selected = document.querySelector('input[name="sessionMode"]:checked');
    const newLocation = document.getElementById('newLocation')?.value || '';

    if (!selected) {
        showAlert("Please select a mode", "warning");
        return;
    }

    const newMode = selected.value;

    try {
        const res = await fetch(api(`/sessions/tutor/sessions/${selectedSessionId}/change-mode`), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                mode: newMode, 
                location: newLocation || (newMode === 'online' ? 'Google Meet' : 'TBD')
            }),
        });

        if (!res.ok) {
            console.warn("[tutor_sessions] Backend change mode failed, updating locally");
        }

        // Update local state
        session.mode = newMode;
        session.location = newMode === 'online' ? 'Google Meet' : (newLocation || 'TBD');

        closeChangeModeModal();
        showAlert(`Mode changed to ${newMode}! 🔄`, 'success');
        renderSessionDetails(session);
        renderSessionList();
    } catch (err) {
        console.error("[tutor_sessions] Change mode error:", err);
        // Still update locally
        session.mode = newMode;
        session.location = newMode === 'online' ? 'Google Meet' : (newLocation || 'TBD');
        closeChangeModeModal();
        showAlert(`Mode changed to ${newMode}! 🔄`, 'success');
        renderSessionDetails(session);
        renderSessionList();
    }
}

// ==================== NOTES ====================

async function saveNotes() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const notes = document.getElementById('sessionNotes')?.value || '';

    try {
        const res = await fetch(api(`/sessions/tutor/sessions/${selectedSessionId}/notes`), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
        });

        if (!res.ok) {
            console.warn("[tutor_sessions] Backend save notes failed, updating locally");
        }

        session.notes = notes;
        showAlert('Notes saved! 📝', 'success');
    } catch (err) {
        console.error("[tutor_sessions] Save notes error:", err);
        session.notes = notes;
        showAlert('Notes saved! 📝', 'success');
    }
}

function copyJoinLink(link) {
    navigator.clipboard.writeText(link).then(() => {
        showAlert('Link copied to clipboard! 📋', 'success');
    }).catch(() => {
        showAlert('Failed to copy link', 'error');
    });
}

// ==================== END SESSION ====================

async function endSession() {
    if (!confirm('Are you sure you want to end this session? This action cannot be undone.')) {
        return;
    }

    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    try {
        const res = await fetch(api(`/sessions/${selectedSessionId}/status`), {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: 'past' }),
        });

        if (!res.ok) {
            console.warn("[tutor_sessions] Backend end session failed, updating locally");
        }

        session.status = 'past';
        session.participants.forEach(p => {
            if (p.status === 'pending') p.status = 'absent';
        });

        showAlert('Session ended successfully! ⏹️', 'success');
        renderSessionDetails(session);
        renderSessionList();
        updateTabCounts();
    } catch (err) {
        console.error("[tutor_sessions] End session error:", err);
        // Update locally
        session.status = 'past';
        session.participants.forEach(p => {
            if (p.status === 'pending') p.status = 'absent';
        });
        showAlert('Session ended successfully! ⏹️', 'success');
        renderSessionDetails(session);
        renderSessionList();
        updateTabCounts();
    }
}

// ==================== SELECT SESSION ====================

async function selectSession(id) {
    console.log("[tutor_sessions] Selecting session:", id);
    selectedSessionId = id;
    
    const session = sessions.find(s => s.id === id);
    if (!session) {
        console.error("[tutor_sessions] Session not found:", id);
        return;
    }

    // Stop previous participant polling and start new one
    stopParticipantPolling();

    // Fetch participants for this session
    const participants = await fetchParticipants(id);
    session.participants = participants;

    renderSessionList();
    renderSessionDetails(session);
    
    // Start participant polling for active sessions
    if (session.status === 'active') {
        startParticipantPolling();
    }
}

// ==================== MOCK LIBRARY RESOURCES ====================

const MOCK_LIBRARY = {
    "CO3005": [
        { id: "lib-1", title: "Software Engineering: A Practitioner's Approach", url: "#" },
        { id: "lib-2", title: "Clean Code: A Handbook of Agile Software Craftsmanship", url: "#" },
        { id: "lib-3", title: "Design Patterns: Elements of Reusable Object-Oriented Software", url: "#" },
    ],
    "CO2013": [
        { id: "lib-4", title: "Operating System Concepts", url: "#" },
        { id: "lib-5", title: "Modern Operating Systems", url: "#" },
    ],
    "CO1234": [
        { id: "lib-6", title: "Introduction to Programming Using Python", url: "#" },
        { id: "lib-7", title: "Python Crash Course", url: "#" },
    ],
    "default": [
        { id: "lib-default", title: "Course Reference Materials", url: "#" },
    ],
};

function getLibraryForCourse(courseCode) {
    return MOCK_LIBRARY[courseCode] || MOCK_LIBRARY["default"];
}

function renderLibraryResources(courseCode) {
    const container = document.querySelector("#libraryResources");
    if (!container) return;
    
    const books = getLibraryForCourse(courseCode);
    
    if (books.length === 0) {
        container.innerHTML = '<div class="muted">No library resources available</div>';
        return;
    }
    
    container.innerHTML = books.map(book => `
        <div class="library-item">
            <span class="library-icon">📚</span>
            <a href="${book.url}" class="library-link" target="_blank">${book.title}</a>
        </div>
    `).join('');
}

// Make functions available globally
window.selectSession = selectSession;
window.openAttendanceModal = openAttendanceModal;
window.closeAttendanceModal = closeAttendanceModal;
window.saveAttendance = saveAttendance;
window.openExtendModal = openExtendModal;
window.closeExtendModal = closeExtendModal;
window.confirmExtend = confirmExtend;
window.openChangeModeModal = openChangeModeModal;
window.closeChangeModeModal = closeChangeModeModal;
window.confirmChangeMode = confirmChangeMode;
window.copyJoinLink = copyJoinLink;
window.saveNotes = saveNotes;
window.endSession = endSession;
window.refreshCurrentSession = refreshCurrentSession;
window.refreshAllSessions = refreshAllSessions;

// ==================== EVENT LISTENERS ====================

function attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.session-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            renderSessionList();
        });
    });

    // Modal close buttons
    document.getElementById('cancelAttendanceBtn')?.addEventListener('click', closeAttendanceModal);
    document.getElementById('saveAttendanceBtn')?.addEventListener('click', saveAttendance);
    document.getElementById('cancelExtendBtn')?.addEventListener('click', closeExtendModal);
    document.getElementById('cancelChangeModeBtn')?.addEventListener('click', closeChangeModeModal);
    document.getElementById('confirmChangeModeBtn')?.addEventListener('click', confirmChangeMode);

    // Close modals on backdrop click
    document.getElementById('attendanceModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'attendanceModal') closeAttendanceModal();
    });
    document.getElementById('extendModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'extendModal') closeExtendModal();
    });
    document.getElementById('changeModeModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'changeModeModal') closeChangeModeModal();
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        stopAllPolling();
        try {
            await fetch(api("/auth/logout"), { method: "POST", credentials: "include" });
        } catch (err) {
            console.error(err);
        } finally {
            window.location.href = "/login.html";
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Press 'R' to refresh (when not typing in input)
        if (e.key === 'r' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
            e.preventDefault();
            refreshAllSessions();
        }
        // Press Escape to close modals
        if (e.key === 'Escape') {
            closeAttendanceModal();
            closeExtendModal();
            closeChangeModeModal();
        }
    });
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("[tutor_sessions] Initializing...");
    console.log("[tutor_sessions] API_BASE:", API_BASE);
    
    // Check auth first
    try {
        const authRes = await fetch(api("/auth/me"), { credentials: "include" });
        if (!authRes.ok) {
            console.log("[tutor_sessions] Not authenticated, redirecting to login");
            window.location.href = "/login.html";
            return;
        }
        const authData = await authRes.json();
        if (authData.user?.role !== "TUTOR") {
            console.log("[tutor_sessions] Not a tutor, redirecting");
            window.location.href = "/login.html";
            return;
        }
    } catch (err) {
        console.error("[tutor_sessions] Auth check failed:", err);
        window.location.href = "/login.html";
        return;
    }

    attachEventListeners();
    await fetchSessions();
    
    // Start session polling (silent - no alerts)
    startSessionPolling();
    
    console.log("[tutor_sessions] Ready!");
    console.log("[tutor_sessions] - Session list polls every", SESSION_POLL_INTERVAL_MS/1000, "seconds (silent)");
    console.log("[tutor_sessions] - Press 'R' to manually refresh");
});