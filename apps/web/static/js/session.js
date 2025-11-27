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

const els = {
  title: document.querySelector("#sess-title"),
  tutor: document.querySelector("#sess-tutor"),
  mode: document.querySelector("#sess-mode"),
  time: document.querySelector("#sess-time"),
  day: document.querySelector("#sess-day"),
  scheduled: document.querySelector("#sess-scheduled"),
  cancelForm: document.querySelector("#cancel-form"),
  reschedForm: document.querySelector("#resched-form"),
  cancelMsg: document.querySelector("#cancel-msg"),
  reschedMsg: document.querySelector("#resched-msg"),
  card: document.querySelector("#session-card"),
  reschedSelect: document.querySelector("#resched-new-session"),
  home: document.querySelector("#nav-home"),
  profile: document.querySelector("#nav-profile"),
  logout: document.querySelector("#nav-logout"),
};

let currentSessionId = null;

function setMsg(el, text, error = false) {
  if (!el) return;
  el.textContent = text || "";
  el.style.color = error ? "#fca5a5" : "#9ca3af";
}

async function fetchSession(id) {
  const res = await fetch(api(`/students/session/${id}`), { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/login.html";
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

async function mutate(path, body) {
  const res = await fetch(api(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login.html";
    return null;
  }
  return res.json();
}

function renderSession(data) {
  if (!data) return;
  const s = data.session || data;
  els.title.textContent = `${s.code} - ${s.title}`;
  const scheduled = s.scheduledAt ? new Date(s.scheduledAt) : null;
  const scheduledText =
    scheduled && !Number.isNaN(scheduled)
      ? `${String(scheduled.getMonth() + 1).padStart(2, "0")}/${String(scheduled.getDate()).padStart(2, "0")}/${String(
          scheduled.getFullYear(),
        ).slice(-2)}`
      : "TBD";
  els.mode.textContent = s.mode;
  els.time.textContent = `${s.start}-${s.end}`;
  els.day.textContent = s.dayOfWeek;
  if (els.tutor) els.tutor.textContent = `Tutor: ${s.tutor || "TBD"}`;
  if (els.scheduled) els.scheduled.textContent = scheduledText;
}

function labelForSession(sess) {
  return `${sess.code} - ${sess.title} (${sess.dayOfWeek} ${sess.start}-${sess.end}, ${sess.mode}, Tutor: ${sess.tutor || "TBD"})`;
}

function populateRescheduleSelect(matches) {
  if (!els.reschedSelect) return;
  els.reschedSelect.innerHTML = "";
  const keep = document.createElement("option");
  keep.value = "";
  keep.textContent = "Keep current session";
  els.reschedSelect.appendChild(keep);

  matches.slice(0, 20).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = labelForSession(m);
    els.reschedSelect.appendChild(opt);
  });
}

async function loadReplacements(code, excludeId) {
  try {
    const res = await fetch(api("/sessions/browse"), { credentials: "include" });
    if (!res.ok) return;
    const payload = await res.json();
    const list = payload.sessions || [];
    let matches = list.filter((x) => x.code === code && x.id !== excludeId);
    if (!matches.length) {
      matches = list.filter((x) => x.id !== excludeId).slice(0, 30);
    }
    populateRescheduleSelect(matches);
  } catch (err) {
    console.error(err);
  }
}

async function init() {
  const id = qs("id");
  if (!id) {
    if (els.card) els.card.innerHTML = "<p class='muted'>No session selected.</p>";
    return;
  }
  currentSessionId = id;
  const data = await fetchSession(currentSessionId);
  const sessionData = data?.session || data;
  renderSession(data);
  loadReplacements(sessionData?.code, currentSessionId);

  els.cancelForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg(els.cancelMsg, "Submitting...");
    const reason = document.querySelector("#cancel-reason").value;
    const notes = document.querySelector("#cancel-notes").value;
    const res = await mutate(`/students/session/${currentSessionId}/cancel`, { reason, notes });
    if (res?.ok) setMsg(els.cancelMsg, "Cancelled.");
    else setMsg(els.cancelMsg, "Failed to cancel.", true);
  });

  els.reschedForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg(els.reschedMsg, "Submitting...");
    const reason = document.querySelector("#resched-reason").value;
    const notes = document.querySelector("#resched-notes").value;
    const newSessionId = els.reschedSelect?.value || "";
    const res = await mutate(`/students/session/${currentSessionId}/reschedule`, { reason, notes, newSessionId });
    if (res?.ok) {
      setMsg(els.reschedMsg, newSessionId ? "Rescheduled to a new session." : "Reschedule submitted.");
      if (newSessionId) {
        currentSessionId = newSessionId;
        const nextSession = await fetchSession(newSessionId);
        renderSession(nextSession || res.booking);
        const nextCode = (nextSession?.session || nextSession || res.booking)?.code;
        loadReplacements(nextCode, newSessionId);
      }
    } else {
      setMsg(els.reschedMsg, "Failed to reschedule.", true);
    }
  });

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

init();
