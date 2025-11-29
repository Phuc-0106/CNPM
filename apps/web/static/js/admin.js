// admin.js (excerpt — replace previous mock-fetch parts with these API calls)
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
  return "/api"; // FIX: leading slash
})();

function api(path) {
  if (!path.startsWith("/")) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}
function openModal({ title, html }) {
  const modal = document.getElementById("modal");
  if (!modal) return;
  document.getElementById("modal-title").textContent = title || "Modal";
  document.getElementById("modal-body").innerHTML = html || "";
  modal.classList.add("open");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.querySelectorAll("[data-action='close-modal']").forEach((btn) => {
    btn.onclick = closeModal;
  });
}
function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}
function renderMatchingScreen() {
  const container = document.getElementById("screen-container");
  if (!container) return;
  container.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <h2 class="screen-title">Matching Process</h2>
          <p class="screen-subtitle">Demo placeholder</p>
        </div>
      </div>
      <div class="kpi-card"><div class="kpi-label">Status</div><div class="kpi-value">Ready</div></div>
      <p class="muted">Implement matching UI here.</p>
    </section>
  `;
}

async function apiPatch(path, body) {
  const isAuthenticated = await checkAdminAuth();
  if (!isAuthenticated) return;
  const r = await fetch(api(path), {
    method: "PATCH",
    headers: {"Content-Type":"application/json"},
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (r.status === 403) {
    showError('Bạn không có quyền admin để thực hiện thao tác này');
    return;
  }
  if (!r.ok) throw new Error(`API ${path} failed: ${r.status}`);
  return r.json();
}

const POLICY_META = {
  late_cancellation_window_hours: {
    label: "Late Cancellation Window (hours)",
    desc: "Window before a session that counts as a late cancellation.",
    type: "number",
    min: 0
  },
  late_cancellation_max_count: {
    label: "Max Late Cancellations Before Penalty",
    desc: "Max number of late cancellations allowed before applying penalties.",
    type: "number",
    min: 0
  },
  tutor_response_sla_hours: {
    label: "Tutor Response SLA (hours)",
    desc: "Expected SLA for tutors to respond to requests.",
    type: "number",
    min: 1
  },
  tutor_sla_reminder_enabled: {
    label: "Auto reminders before SLA deadline",
    desc: "Send automatic reminders to tutors before SLA deadline.",
    type: "boolean"
  },
};

async function loadPolicies() {
  const items = await apiGet("/admin/api/policies");
  window.POLICIES = Array.isArray(items) ? items : [];
  renderPoliciesScreen(); // re-render
}

async function togglePolicy(key, enabled) {
  await apiPatch(`/admin/api/policies/${encodeURIComponent(key)}/toggle`, { enabled });
  await loadPolicies();
}

function openEditPolicyModal(policy) {
  const meta = POLICY_META[policy.key] || { label: policy.label || policy.key, type: typeof policy.value };
  const isBool = meta.type === "boolean";
  const isNum = meta.type === "number";

  const control = isBool
    ? `<label class="switch">
         <input type="checkbox" id="policy-value" ${policy.value ? "checked" : ""}>
         <span>Enabled</span>
       </label>`
    : `<input id="policy-value" class="search-input" type="number" min="${meta.min ?? 0}" value="${policy.value}" />`;

  const html = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <div style="font-weight:600">${meta.label || policy.label || policy.key}</div>
        <div class="muted" style="margin-top:4px">${meta.desc || policy.description || ""}</div>
      </div>
      <div>
        <label>Value</label>
        <div style="margin-top:6px">${control}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
        <button type="button" class="btn ghost" id="policy-cancel">Cancel</button>
        <button type="button" class="btn primary" id="policy-save">Save</button>
      </div>
    </div>
  `;
  openModal({ title: "Edit Policy", html });
  document.getElementById("policy-cancel")?.addEventListener("click", () => closeModal());
  document.getElementById("policy-save")?.addEventListener("click", async () => {
    try {
      let value;
      if (isBool) {
        value = document.getElementById("policy-value").checked;
      } else if (isNum) {
        value = parseInt(document.getElementById("policy-value").value, 10);
        if (Number.isNaN(value)) {
          alert("Please enter a valid number.");
          return;
        }
      } else {
        value = String(document.getElementById("policy-value").value || "");
      }
      await apiPost("/admin/api/policies", {
        key: policy.key,
        value,
        enabled: policy.enabled,
        label: meta.label,
        description: meta.desc,
      });
      closeModal();
      await loadPolicies();
    } catch (err) {
      console.error(err);
      alert("Failed to save policy.");
    }
  });
}
function renderPoliciesScreen() {
  const container = document.getElementById("screen-container");
  if (!container) return;

  const items = Array.isArray(window.POLICIES) ? window.POLICIES : [];

  const rows = items.map((p) => {
    const meta = POLICY_META[p.key] || {};
    const label = meta.label || p.label || p.key;
    const desc = meta.desc || p.description || "";
    const valText = typeof p.value === "boolean" ? (p.value ? "ON" : "OFF") : p.value;
    return `
      <tr>
        <td>
          <div class="primary-text">${label}</div>
          <div class="subtext">${desc}</div>
        </td>
        <td>${valText}</td>
        <td>
          <span class="badge ${p.enabled ? "success" : "danger"}">${p.enabled ? "ON" : "OFF"}</span>
        </td>
        <td style="text-align:right;">
          <button class="btn ghost" data-action="toggle" data-key="${p.key}" data-enabled="${!p.enabled}">
            ${p.enabled ? "Disable" : "Enable"}
          </button>
          <button class="btn primary" data-action="edit" data-key="${p.key}">Edit</button>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <h2 class="screen-title">Program Policies</h2>
          <p class="screen-subtitle">Configure rules and toggles without losing values.</p>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Policy</th>
            <th>Value</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" class="empty-cell">No policies</td></tr>'}
        </tbody>
      </table>
    </section>
  `;

  container.querySelectorAll("[data-action='toggle']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-key");
      const enabled = btn.getAttribute("data-enabled") === "true";
      try {
        await togglePolicy(key, enabled);
      } catch (err) {
        console.error(err);
        alert("Failed to toggle policy.");
      }
    });
  });

  container.querySelectorAll("[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      const policy = (window.POLICIES || []).find((x) => x.key === key);
      if (policy) openEditPolicyModal(policy);
    });
  });
}
// hàm kiểm tra authentication
async function checkAdminAuth() {
  try {
    const response = await fetch(api('/auth/me'), { credentials: 'include' });
    if (!response.ok) {
      window.location.href = 'login.html';
      return false;
    }
    const data = await response.json();
    if (data.user?.role !== 'ADMIN') {
      // Không phải admin -> về student
      window.location.href = 'student.html';
      return false;
    }
    return true;
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = 'login.html';
    return false;
  }
}
// Hiển thị lỗi
function showError(message) {
  document.body.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <h1>⛔ Truy cập bị từ chối</h1>
      <p>${message}</p>
      <button onclick="window.location.href='login.html'">Đăng nhập</button>
    </div>
  `;
}

async function apiGet(path) {
    const isAuthenticated = await checkAdminAuth();
    if (!isAuthenticated) return;
    
    const r = await fetch(api(path), {  // ← Sử dụng hàm api() thay vì nối chuỗi
        credentials: 'include'
    });
    
    if (r.status === 403) {
        showError('Bạn không có quyền admin để thực hiện thao tác này');
        return;
    }
    
    if (!r.ok) throw new Error(`API ${path} failed: ${r.status}`);
    return r.json();
}

// Tương tự cho apiPost
async function apiPost(path, body) {
    const isAuthenticated = await checkAdminAuth();
    if (!isAuthenticated) return;
    
    const r = await fetch(api(path), {  // ← Sử dụng hàm api()
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(body),
        credentials: 'include'
    });
    
    if (r.status === 403) {
        showError('Bạn không có quyền admin để thực hiện thao tác này');
        return;
    }
    
    if (!r.ok) throw new Error(`API ${path} failed: ${r.status}`);
    return r.json();
}
async function apiPut(path, body) {
  const isAuthenticated = await checkAdminAuth();
  if (!isAuthenticated) return;
  const r = await fetch(api(path), {
    method: "PUT",
    headers: {"Content-Type":"application/json"},
    credentials: "include",
    body: JSON.stringify(body)
  });
  if (r.status === 403) {
    showError('Bạn không có quyền admin để thực hiện thao tác này');
    return;
  }
  if (!r.ok) throw new Error(`API ${path} failed: ${r.status}`);
  return r.json();
}
async function ensureCurrentUserInAdmin() {
  try {
    // lấy user đang đăng nhập từ Auth
    const meRes = await fetch(api("/auth/me"), { credentials: "include" });
    if (!meRes.ok) return;
    const me = await meRes.json();
    const user = me.user || me.me || null;
    if (!user) return;

    // lấy danh sách hiện có từ admin
    const listRes = await fetch(api("/admin/api/users?limit=1000"), { credentials: "include" });
    const list = listRes.ok ? await listRes.json() : [];
    const exists = Array.isArray(list) && list.some(u => (u.email || "").toLowerCase() === (user.email || "").toLowerCase());

    if (!exists) {
      const roles = user.role ? [user.role] : [];
      await fetch(api("/admin/api/users"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: user.name || user.email, email: user.email, roles }),
      });
    }
  } catch (err) {
    console.error("ensureCurrentUserInAdmin failed:", err);
  }
}

// fetch and render users from backend
async function loadAndRenderUsers() {
  try {
    const users = await apiGet("/admin/api/users");
    window.USERS = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles || [],
      status: u.status || "ACTIVE",
      department: u.department || "",
      lastLogin: u.lastLogin || "",
      activeToday: !!u.activeToday
    }));
    renderUsersScreen();
  } catch (err) {
    console.error("Failed load users:", err);
    alert("Lỗi khi tải danh sách người dùng. Xem console.");
  }
}


function renderUsersScreen() {
  const container = document.getElementById("screen-container");
  if (!container) return;
  const users = Array.isArray(window.USERS) ? window.USERS : [];

  const rows = users.map(u => `
    <tr>
      <td>
        <div class="primary-text">${u.name || u.email || "User"}</div>
        <div class="subtext">${u.email || ""}</div>
      </td>
      <td>${(u.roles || []).map(r => `<span class="badge role-badge">${r}</span>`).join(" ") || "-"}</td>
      <td><span class="badge ${u.activeToday ? 'success' : ''}">${u.status || 'ACTIVE'}</span></td>
      <td>${u.department || "-"}</td>
      <td>${u.lastLogin || "-"}</td>
      <td>
        <button class="btn ghost" type="button" data-action="edit-roles" data-id="${u.id}">Edit roles</button>
      </td>
    </tr>
  `).join("");

  container.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <h2 class="screen-title">Users</h2>
          <p class="screen-subtitle">Manage roles and access</p>
        </div>
        <button class="btn primary" id="add-user-btn" type="button">Add user</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total users</div>
          <div class="kpi-value">${users.length}</div>
        </div>
      </div>

      <div class="search-row">
        <input class="search-input" id="user-search" placeholder="Search by name or email">
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>User</th><th>Roles</th><th>Status</th><th>Department</th><th>Last login</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" class="empty-cell">No users</td></tr>'}
        </tbody>
      </table>
    </section>
  `;

  // wire actions
  container.querySelectorAll('button[data-action="edit-roles"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      editUserRoles(id);
    });
  });

  // simple client-side filter
  const search = container.querySelector("#user-search");
  search?.addEventListener("input", (e) => {
    const q = (e.target.value || "").toLowerCase();
    const filtered = users.filter(u =>
      (u.name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
    window.USERS = filtered;
    renderUsersScreen();
    // restore full list when query cleared
    if (!q) loadAndRenderUsers();
});
  const addBtn = container.querySelector("#add-user-btn");
  addBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    showAddUserModal();
  });
}

// ...existing code...
// override create user to call backend
async function createUserBackend(name, email, roles) {
  const payload = {name, email, roles};
  const u = await apiPost("/admin/api/users", payload);
  return u;
}

// edit role modal submit should call assign/remove endpoints
async function saveRolesToBackend(userId, newRoles) {
  const current = (window.USERS || []).find(u => u.id === userId);
  const currRoles = current ? current.roles : [];
  const toAdd = newRoles.filter(r => !currRoles.includes(r));
  const toRemove = currRoles.filter(r => !newRoles.includes(r));

  for (const r of toAdd) {
    await fetch(api(`/admin/api/users/${userId}/roles`), {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      credentials: "include",
      body: JSON.stringify({role: r, admin: "web-admin"})
    });
  }
  for (const r of toRemove) {
    await fetch(api(`/admin/api/users/${userId}/roles`), {
      method: "DELETE",
      headers: {"Content-Type":"application/json"},
      credentials: "include",
      body: JSON.stringify({role: r, admin: "web-admin"})
    });
  }
}
// update editUserRoles to use backend
function editUserRoles(userId) {
  const user = (window.USERS || []).find(u => u.id === userId);
  if (!user) return;

  const current = user.roles.join(", ");
  const html = `
    <form id="edit-role-form" style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label>User:</label>
        <div style="font-weight:600; margin-top:4px;">${user.name}</div>
      </div>

      <div>
        <label>Roles (comma separated):</label>
        <input
          id="role-input"
          class="search-input"
          type="text"
          value="${user.roles.join(", ")}"
          placeholder="STUDENT, TUTOR, ..."
        />
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
        <button type="button" class="btn ghost" id="cancel-edit-role">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `;

  openModal({title: "Edit User Roles", html, showCancel: false});
  const form = document.getElementById("edit-role-form");
  const cancelBtn = document.getElementById("cancel-edit-role");
  cancelBtn.addEventListener("click", () => closeModal());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = document.getElementById("role-input").value || "";
    const newRoles = raw.split(",").map(s => s.trim()).filter(Boolean);
    try {
      await saveRolesToBackend(userId, newRoles);
      await loadAndRenderUsers(); // refresh list
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi cập nhật roles.");
    }
  }, { once: true });
}

// modify renderUsersScreen's initial loader call to get backend data
// On initial page load, call loadAndRenderUsers instead of using local USERS mock
document.addEventListener("DOMContentLoaded", async () => {
  const isAdmin = await checkAdminAuth();
  const navBtns = document.querySelectorAll(".nav-btn");
  const setActive = (name) => {
    navBtns.forEach(b => b.classList.toggle("active", b.dataset.screen === name));
    if (name === "users") loadAndRenderUsers();
    if (name === "matching") renderMatchingScreen();
    if (name === "policies") loadPolicies();
  };
  navBtns.forEach(btn => btn.addEventListener("click", () => setActive(btn.dataset.screen)));

  if (isAdmin) {
    await ensureCurrentUserInAdmin();
    setActive("users");
  }
});

// update showAddUserModal to use backend create
function showAddUserModal() {
  const html = `
    <form id="add-user-form">
      <div style="display:flex;flex-direction:column;gap:8px">
        <label>Name<input name="name" required class="search-input" /></label>
        <label>Email<input name="email" required class="search-input" /></label>
        <label>Roles<input name="roles" placeholder="STUDENT or TUTOR, comma separated" class="search-input" /></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button type="button" class="btn ghost" id="modal-cancel-btn">Cancel</button>
          <button type="submit" class="btn primary">Add user</button>
        </div>
      </div>
    </form>
  `;
  openModal({ title: "Add user", html, showCancel: false });

  const form = document.getElementById("add-user-form");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const name = (fd.get("name") || "").toString().trim();
    const email = (fd.get("email") || "").toString().trim();
    const roles = (fd.get("roles") || "STUDENT")
      .toString()
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    try {
      await createUserBackend(name, email, roles);
      closeModal();
      await loadAndRenderUsers();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo user");
    }
  }, { once: true });

  // cancel handler
  const cancelBtn = document.getElementById("modal-cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => closeModal());
}
