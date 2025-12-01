// Demo data
const sessions = [
    {
        id: 1,
        title: 'Calculus II - Derivatives Review',
        course: 'MATH201',
        startTime: '2025-11-27T10:00:00',
        endTime: '2025-11-27T11:30:00',
        mode: 'online',
        location: 'Google Meet',
        status: 'past',
        participants: [
            { id: 6, name: 'Vo Thi F', email: 'vothif@hcmut.edu.vn', status: 'present' },
            { id: 7, name: 'Dang Van G', email: 'dangvang@hcmut.edu.vn', status: 'absent' }
        ],
        timeline: [
            { time: '10:00', icon: '▶️', text: 'Session started' },
            { time: '10:03', icon: '👤', text: 'Vo Thi F joined' },
            { time: '11:30', icon: '⏹️', text: 'Session ended' }
        ],
        notes: 'Reviewed projectile motion. Student F needs more practice with angle calculations.'
    },
    {
        id: 4,
        title: 'English Communication - IELTS Writing',
        course: 'ENG301',
        startTime: '2025-11-29T16:00:00',
        endTime: '2025-11-29T17:30:00',
        mode: 'online',
        location: 'Zoom Meeting',
        status: 'upcoming',
        participants: [
            { id: 8, name: 'Bui Van H', email: 'buivanh@hcmut.edu.vn', status: 'pending' }
        ],
        timeline: [],
        notes: ''
    },
    {
        id: 5,
        title: 'Chemistry - Organic Reactions',
        course: 'CHEM201',
        startTime: '2025-11-26T13:00:00',
        endTime: '2025-11-26T14:30:00',
        mode: 'offline',
        location: 'Lab A2-201',
        status: 'past',
        participants: [
            { id: 9, name: 'Ngo Thi I', email: 'ngothii@hcmut.edu.vn', status: 'present' },
            { id: 10, name: 'Truong Van J', email: 'truongvanj@hcmut.edu.vn', status: 'present' }
        ],
        timeline: [
            { time: '13:00', icon: '▶️', text: 'Session started' },
            { time: '13:02', icon: '👤', text: 'Ngo Thi I arrived' },
            { time: '13:05', icon: '👤', text: 'Truong Van J arrived' },
            { time: '14:30', icon: '⏹️', text: 'Session ended' }
        ],
        notes: 'Conducted substitution and elimination reactions lab. All experiments successful.'
    }
];

let currentTab = 'all';
let selectedSessionId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderSessionList();
    attachEventListeners();

    // Auto-select first active session or first session
    const activeSession = sessions.find(s => s.status === 'active');
    if (activeSession) {
        selectSession(activeSession.id);
    } else if (sessions.length > 0) {
        selectSession(sessions[0].id);
    }
});

// Event Listeners
function attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.session-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.tab;
            document.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderSessionList();
        });
    });

    // Modal controls
    document.getElementById('cancelAttendanceBtn').addEventListener('click', closeAttendanceModal);
    document.getElementById('saveAttendanceBtn').addEventListener('click', saveAttendance);
    document.getElementById('cancelExtendBtn').addEventListener('click', closeExtendModal);
    document.getElementById('cancelChangeModeBtn').addEventListener('click', closeChangeModeModal);
    document.getElementById('confirmChangeModeBtn').addEventListener('click', saveChangeMode);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        window.location.href = '/login.html';
    });
}

// Render session list
function renderSessionList() {
    const container = document.getElementById('sessionsContainer');

    // Filter sessions
    let filtered = sessions;
    if (currentTab !== 'all') {
        filtered = sessions.filter(s => s.status === currentTab);
    }

    // Update counts
    updateTabCounts();

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">No sessions found</div></div>';
        return;
    }

    container.innerHTML = filtered.map(session => {
        const startDate = new Date(session.startTime);
        const timeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return `
                    <div class="session-item ${selectedSessionId === session.id ? 'active' : ''}" onclick="selectSession(${session.id})">
                        <div class="session-item-header">
                            <div class="session-item-title">${session.title}</div>
                            <span class="badge ${session.status}">${session.status}</span>
                        </div>
                        <div class="session-item-course">${session.course}</div>
                        <div class="session-item-time">
                            <span>🕐</span>
                            <span>${timeStr} • ${dateStr}</span>
                        </div>
                        <div class="session-item-mode">
                            <span>${session.mode === 'online' ? '🌐' : '🏫'}</span>
                            <span>${session.location}</span>
                        </div>
                    </div>
                `;
    }).join('');
}

// Update tab counts
function updateTabCounts() {
    const counts = {
        all: sessions.length,
        active: sessions.filter(s => s.status === 'active').length,
        upcoming: sessions.filter(s => s.status === 'upcoming').length,
        past: sessions.filter(s => s.status === 'past').length
    };

    document.querySelectorAll('.session-tab').forEach(tab => {
        const count = counts[tab.dataset.tab];
        const countEl = tab.querySelector('.count');
        if (countEl) {
            countEl.textContent = count;
        }
    });
}

// Select session
function selectSession(id) {
    selectedSessionId = id;
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    renderSessionList();
    renderSessionDetails(session);
}

// Render session details
function renderSessionDetails(session) {
    const detailsPane = document.getElementById('detailsPane');
    const startDate = new Date(session.startTime);
    const endDate = new Date(session.endTime);
    const timeStr = `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const inProgressBanner = session.status === 'active' ? `
                <div class="in-progress-banner">
                    <div class="banner-dot"></div>
                    <strong style="font-size: 15px;">🎯 Session In Progress</strong>
                    <span style="opacity: 0.9;">Started at ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            ` : '';

    const joinLinkSection = session.mode === 'online' && session.joinLink ? `
                <div class="content-card">
                    <div class="card-header">🔗 Join Link</div>
                    <div class="join-link-box">
                        <div class="join-link-icon">🔗</div>
                        <div class="join-link-text">${session.joinLink}</div>
                        <button class="copy-btn" onclick="copyJoinLink('${session.joinLink}')">
                            📋 Copy
                        </button>
                    </div>
                </div>
            ` : '';

    const timelineSection = session.timeline && session.timeline.length > 0 ? `
                <div class="content-card">
                    <div class="card-header">⏱️ Timeline</div>
                    <div class="timeline">
                        ${session.timeline.map(item => `
                            <div class="timeline-item">
                                <div class="timeline-dot">${item.icon}</div>
                                <div class="timeline-content">
                                    <div class="timeline-time">${item.time}</div>
                                    <div class="timeline-text">${item.text}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';

    detailsPane.innerHTML = `
                <div class="session-header">
                    <div class="session-title-row">
                        <div>
                            <div class="session-title">${session.title}</div>
                            <div class="session-course">${session.course}</div>
                        </div>
                        <span class="badge ${session.status}" style="font-size: 13px; padding: 6px 14px;">${session.status}</span>
                    </div>
                    ${inProgressBanner}
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
                            <div class="meta-label">📍 Mode</div>
                            <div class="meta-value">${session.mode === 'online' ? '🌐 Online' : '🏫 Offline'}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">📌 Location</div>
                            <div class="meta-value">${session.location}</div>
                        </div>
                    </div>
                </div>

                <div class="session-content">
                    <div class="content-card">
                        <div class="card-header">👥 Participants (${session.participants.length})</div>
                        <div class="participants-list">
                            ${session.participants.map(p => `
                                <div class="participant-item">
                                    <div class="participant-avatar">${p.name.charAt(0)}</div>
                                    <div class="participant-info">
                                        <div class="participant-name">${p.name}</div>
                                        <div class="participant-email">${p.email}</div>
                                    </div>
                                    <span class="participant-status ${p.status}">${p.status}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    ${joinLinkSection}
                    ${timelineSection}

                    <div class="content-card">
                        <div class="card-header">📝 Session Notes</div>
                        <textarea class="notes-editor" id="sessionNotes" placeholder="Add notes about this session, key topics covered, student progress, homework assigned, etc.">${session.notes}</textarea>
                        <div class="notes-actions">
                            <button class="btn success" onclick="saveNotes()">
                                💾 Save Notes
                            </button>
                            <button class="btn secondary" onclick="clearNotes()">
                                🗑️ Clear
                            </button>
                        </div>
                    </div>

                    <div class="content-card">
                        <div class="card-header">⚡ Actions</div>
                        <div class="action-grid">
                            <button class="action-btn primary" onclick="openAttendanceModal()" ${session.status !== 'active' && session.status !== 'past' ? 'disabled' : ''}>
                                ✓ Mark Attendance
                            </button>
                            <button class="action-btn warning" onclick="openExtendModal()" ${session.status !== 'active' ? 'disabled' : ''}>
                                ⏰ Extend Session
                            </button>
                            <button class="action-btn primary" onclick="openChangeModeModal()" ${session.status === 'past' ? 'disabled' : ''}>
                                🔄 Change Mode
                            </button>
                            <button class="action-btn danger" onclick="endSession()" ${session.status !== 'active' ? 'disabled' : ''}>
                                ⏹️ End Session
                            </button>
                        </div>
                    </div>
                </div>
            `;
}

// Action functions
function copyJoinLink(link) {
    navigator.clipboard.writeText(link).then(() => {
        showAlert('Join link copied to clipboard! 📋', 'success');
    }).catch(() => {
        showAlert('Failed to copy link', 'error');
    });
}

function saveNotes() {
    const notes = document.getElementById('sessionNotes').value;
    const session = sessions.find(s => s.id === selectedSessionId);
    if (session) {
        session.notes = notes;
        showAlert('Session notes saved successfully! 💾', 'success');

        // Add to timeline
        if (session.timeline && session.status === 'active') {
            const now = new Date();
            session.timeline.push({
                time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                icon: '📝',
                text: 'Notes updated'
            });
        }
    }
}

function clearNotes() {
    if (confirm('Are you sure you want to clear all notes for this session?')) {
        document.getElementById('sessionNotes').value = '';
        showAlert('Notes cleared', 'warning');
    }
}

// Attendance Modal
function openAttendanceModal() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const attendanceList = document.getElementById('attendanceList');
    attendanceList.innerHTML = session.participants.map(p => `
                <div class="attendance-item">
                    <input type="checkbox" class="attendance-checkbox" data-participant-id="${p.id}" 
                           ${p.status === 'present' ? 'checked' : ''}>
                    <div class="participant-avatar">${p.name.charAt(0)}</div>
                    <div class="participant-info">
                        <div class="participant-name">${p.name}</div>
                        <div class="participant-email">${p.email}</div>
                    </div>
                </div>
            `).join('');

    document.getElementById('attendanceModal').classList.add('active');
}

function closeAttendanceModal() {
    document.getElementById('attendanceModal').classList.remove('active');
}

function saveAttendance() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const checkboxes = document.querySelectorAll('.attendance-checkbox');
    let changedCount = 0;

    checkboxes.forEach(checkbox => {
        const participantId = parseInt(checkbox.dataset.participantId);
        const participant = session.participants.find(p => p.id === participantId);
        if (participant) {
            const newStatus = checkbox.checked ? 'present' : 'absent';
            if (participant.status !== newStatus) {
                participant.status = newStatus;
                changedCount++;
            }
        }
    });

    closeAttendanceModal();

    if (changedCount > 0 && session.timeline) {
        const now = new Date();
        session.timeline.push({
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            icon: '✓',
            text: `Attendance updated for ${changedCount} student(s)`
        });
    }

    showAlert(`Attendance saved! ${changedCount} changes recorded. ✓`, 'success');
    renderSessionDetails(session);
}

// Extend Modal
function openExtendModal() {
    document.getElementById('extendModal').classList.add('active');
}

function closeExtendModal() {
    document.getElementById('extendModal').classList.remove('active');
}

function confirmExtend(minutes) {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    closeExtendModal();

    // Update end time
    const endDate = new Date(session.endTime);
    endDate.setMinutes(endDate.getMinutes() + minutes);
    session.endTime = endDate.toISOString();

    // Add to timeline
    if (session.timeline) {
        const now = new Date();
        session.timeline.push({
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            icon: '⏰',
            text: `Session extended by ${minutes} minutes`
        });
    }

    showAlert(`Session extended by ${minutes} minutes! ⏰`, 'success');
    renderSessionDetails(session);
}

// Change Mode Modal
function openChangeModeModal() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const newMode = session.mode === 'online' ? 'offline' : 'online';
    const content = document.getElementById('changeModeContent');

    content.innerHTML = `
                <p style="margin-bottom: 16px; color: #64748b; line-height: 1.6;">
                    Change session mode from <strong>${session.mode}</strong> to <strong>${newMode}</strong>?
                </p>
                <div style="padding: 16px; background: #fef3c7; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #f59e0b;">
                    <strong style="color: #92400e;">⚠️ Important:</strong>
                    <p style="color: #92400e; margin-top: 8px; font-size: 14px;">
                        ${newMode === 'online'
            ? 'Participants will be notified about the new online meeting link.'
            : 'Participants will be notified about the physical location change.'}
                    </p>
                </div>
                ${newMode === 'offline' ? `
                    <div style="margin-top: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e293b;">New Location:</label>
                        <input type="text" id="newLocation" value="${session.location}" 
                               style="width: 100%; padding: 12px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 14px;">
                    </div>
                ` : ''}
            `;

    document.getElementById('changeModeModal').classList.add('active');
}

function closeChangeModeModal() {
    document.getElementById('changeModeModal').classList.remove('active');
}

function saveChangeMode() {
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const newMode = session.mode === 'online' ? 'offline' : 'online';
    const oldMode = session.mode;

    session.mode = newMode;

    if (newMode === 'offline') {
        const newLocation = document.getElementById('newLocation')?.value;
        if (newLocation) {
            session.location = newLocation;
        } else {
            session.location = 'Room B1-101';
        }
    } else {
        session.location = 'Zoom Meeting';
        if (!session.joinLink) {
            session.joinLink = 'https://zoom.us/j/9876543210?pwd=xyz9876';
        }
    }

    // Add to timeline
    if (session.timeline) {
        const now = new Date();
        session.timeline.push({
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            icon: '🔄',
            text: `Mode changed from ${oldMode} to ${newMode}`
        });
    }

    closeChangeModeModal();
    showAlert(`Session mode changed to ${newMode}! Participants will be notified. 🔄`, 'success');
    renderSessionDetails(session);
    renderSessionList();
}

// End Session
function endSession() {
    if (!confirm('Are you sure you want to end this session? This action cannot be undone.')) {
        return;
    }

    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    session.status = 'past';

    // Update all pending participants to absent
    session.participants.forEach(p => {
        if (p.status === 'pending') {
            p.status = 'absent';
        }
    });

    // Add to timeline
    if (session.timeline) {
        const now = new Date();
        session.timeline.push({
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            icon: '⏹️',
            text: 'Session ended by tutor'
        });
    }

    showAlert('Session ended successfully! ⏹️', 'success');
    renderSessionDetails(session);
    renderSessionList();
    updateTabCounts();
}

// Show Alert
function showAlert(message, type) {
    const alertBox = document.getElementById('alertBox');
    alertBox.textContent = message;
    alertBox.className = `alert ${type} active`;

    setTimeout(() => {
        alertBox.classList.remove('active');
    }, 5000);
}