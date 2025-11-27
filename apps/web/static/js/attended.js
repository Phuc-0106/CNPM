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

function qs(k) {
  return new URLSearchParams(window.location.search).get(k);
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

const els = {
  title: document.querySelector("#att-title"),
  tutor: document.querySelector("#att-tutor"),
  tags: document.querySelector("#att-tags"),
  description: document.querySelector("#att-description"),
  code: document.querySelector("#att-code"),
  mode: document.querySelector("#att-mode"),
  time: document.querySelector("#att-time"),
  day: document.querySelector("#att-day"),
  completed: document.querySelector("#att-completed"),
  progressBar: document.querySelector("#att-progress-bar"),
  progressPct: document.querySelector("#att-progress-pct"),
  resources: document.querySelector("#att-resources"),
  logout: document.querySelector("#nav-logout"),
};

function logDownload(item) {
  try {
    const raw = localStorage.getItem("bk_downloads");
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.unshift({
      name: item.name || item.title || "Resource",
      size: item.size || "",
      url: item.url || "",
      date: new Date().toISOString().slice(0, 10),
    });
    localStorage.setItem("bk_downloads", JSON.stringify(next.slice(0, 50)));
  } catch (err) {
    console.error(err);
  }
}

function renderSection(container, items) {
  container.innerHTML = "";
  if (!items || !items.length) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "No items.";
    container.appendChild(div);
    return;
  }
  items.forEach((r) => {
    const card = document.createElement("div");
    card.className = "resource-card";
    card.innerHTML = `
      <div class="resource-title">${r.name}</div>
      <div class="resource-meta">${r.size || ""}</div>
    `;
    if (r.url && r.url !== "#") {
      const link = document.createElement("a");
      link.href = api(r.url);
      link.className = "btn tiny ghost";
      link.style.marginTop = "8px";
      link.textContent = "Download";
      link.download = r.name || "resource.txt";
      link.addEventListener("click", () => logDownload(r));
      card.appendChild(link);
    }
    container.appendChild(card);
  });
}

function renderAttended(data) {
  if (!data) return;
  els.title.textContent = `${data.code} - ${data.title}`;
  els.tutor.textContent = data.tutor ? `Tutor: ${data.tutor}` : "";
  els.description.textContent = data.description || "No description.";
  els.code.textContent = data.code || "-";
  els.mode.textContent = data.mode || "-";
  els.time.textContent = `${data.start || ""}${data.end ? `-${data.end}` : ""}`;
  els.day.textContent = data.dayOfWeek || "-";
  els.completed.textContent = formatDate(data.completedAt);
  const pct = Number.isFinite(data.progress) ? data.progress : 100;
  els.progressPct.textContent = `${pct}%`;
  els.progressBar.style.width = `${pct}%`;

  els.tags.innerHTML = "";
  ["mode", "dayOfWeek"].forEach((k) => {
    if (data[k]) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = data[k];
      els.tags.appendChild(badge);
    }
  });
  if (data.start && data.end) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${data.start}-${data.end}`;
    els.tags.appendChild(badge);
  }

  const library = data.library || {};
  renderSection(document.querySelector("#att-syllabus"), library.syllabus);
  renderSection(document.querySelector("#att-videos"), library.videos);
  renderSection(document.querySelector("#att-tests"), library.tests);
  renderSection(document.querySelector("#att-resources"), library.resources || data.resources);
}

async function fetchAttended() {
  const id = qs("id");
  if (!id) {
    els.title.textContent = "No session selected";
    return;
  }
  try {
    const res = await fetch(api(`/sessions/attended/${id}`), { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      els.title.textContent = "Session not found";
      return;
    }
    const data = await res.json();
    const sessionData = data.attended || data.session || data;

    let library = sessionData.library || {};
    if (sessionData.sessionId) {
      try {
        const libRes = await fetch(api(`/library/resources?sessionId=${sessionData.sessionId}`), { credentials: "include" });
        if (libRes.ok) {
          const libData = await libRes.json();
          library = {
            syllabus: libData.syllabus || [],
            videos: libData.videos || [],
            tests: libData.tests || [],
            resources: libData.resources || [],
          };
        }
      } catch (err) {
        console.error(err);
      }
    }

    renderAttended({ ...sessionData, library });
  } catch (err) {
    console.error(err);
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
}

attachEvents();
fetchAttended();
