const form = document.querySelector("#login-form");
const messageBox = document.querySelector("#login-message");

function showMessage(text, type) {
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.style.display = "block";
}

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

async function checkSession() {
  try {
    const res = await fetch(api("/auth/me"), { credentials: "include" });
    if (res.ok) {
      // already logged in -> go to student home
      window.location.href = "/student.html";
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!form) return;

  const data = new FormData(form);
  const email = (data.get("email") || "").toString().trim();
  const password = (data.get("password") || "").toString();

  showMessage("Signing in...", "success");

  try {
    const res = await fetch(api("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = payload.error || "Login failed";
      showMessage(errMsg, "error");
      return;
    }

    showMessage("Logged in. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "/student.html";
    }, 500);
  } catch (err) {
    console.error(err);
    showMessage("Network error. Try again.", "error");
  }
}

if (form) {
  form.addEventListener("submit", handleLogin);
}

checkSession();
