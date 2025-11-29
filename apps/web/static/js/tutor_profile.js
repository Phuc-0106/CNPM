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

console.log("API_BASE:", API_BASE);

function api(path) {
  if (!path.startsWith("/")) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

// DOM Elements
const els = {
  logout: document.querySelector("#logoutBtn"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileName: document.querySelector("#profile-name"),
  profileEmail: document.querySelector("#profile-email"),
  profileId: document.querySelector("#profile-id"),
  profileMajor: document.querySelector("#profile-major"),
  profileBio: document.querySelector("#profile-bio"),
  previewInperson: document.querySelector("#preview-inperson"),
  previewOnline: document.querySelector("#preview-online"),
  previewLanguages: document.querySelector("#preview-languages"),
  previewSkills: document.querySelector("#preview-skills"),
  previewCourses: document.querySelector("#preview-courses"),
  avatarPreview: document.querySelector("#avatar-preview"),
  avatarInput: document.querySelector("#avatar-input"),
  avatarClear: document.querySelector("#avatar-clear"),
  bioInput: document.querySelector("#bio-input"),
  bioCount: document.querySelector("#bio-count"),
  languageInput: document.querySelector("#language-input"),
  skillInput: document.querySelector("#skill-input"),
  courseInput: document.querySelector("#course-input"),
  languagesList: document.querySelector("#languages-list"),
  skillsList: document.querySelector("#skills-list"),
  coursesList: document.querySelector("#courses-list"),
  saveBtn: document.querySelector("#save-profile"),
  previewBtn: document.querySelector("#preview-card"),
};

let profileData = null;

function renderProfile(data) {
  console.log("Rendering profile:", data);
  const me = data?.tutor || {};

  // Avatar
  if (me.avatarUrl) {
    if (els.profileAvatar) els.profileAvatar.src = me.avatarUrl;
    if (els.avatarPreview) els.avatarPreview.src = me.avatarUrl;
  } else {
    const defaultAvatar = "/static/images/perfect_cell.jpg";
    if (els.profileAvatar) els.profileAvatar.src = defaultAvatar;
    if (els.avatarPreview) els.avatarPreview.src = defaultAvatar;
  }

  // Basic info
  if (els.profileName) els.profileName.textContent = me.fullName || "Tutor";
  if (els.profileEmail) els.profileEmail.textContent = me.email || "-";
  if (els.profileId) els.profileId.textContent = me.tutorId || me.id || "-";
  if (els.profileMajor) els.profileMajor.textContent = me.major || "-";

  // Bio
  if (els.profileBio) els.profileBio.textContent = me.bio || "No bio yet.";
  if (els.bioInput) {
    els.bioInput.value = me.bio || "";
    updateBioCount();
  }

  // Teaching modes
  const modes = me.teachingModes || [];
  if (els.previewInperson) {
    els.previewInperson.style.display = modes.includes("in-person") ? "inline-block" : "none";
  }
  if (els.previewOnline) {
    els.previewOnline.style.display = modes.includes("online") ? "inline-block" : "none";
  }

  // Update mode buttons
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    const mode = btn.dataset.mode;
    if (modes.includes(mode)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Languages
  renderChipList(els.previewLanguages, me.languages || [], "skill-tag");
  renderEditableChips(els.languagesList, me.languages || []);

  // Skills
  renderChipList(els.previewSkills, me.skills || [], "skill-tag");
  renderEditableChips(els.skillsList, me.skills || []);

  // Courses
  renderCoursesList(els.previewCourses, me.courses || []);
  renderEditableChips(els.coursesList, me.courses || []);
}

function renderChipList(container, items, className) {
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = '<span class="muted">None added yet.</span>';
    return;
  }
  items.forEach((item) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = item;
    container.appendChild(span);
  });
}

function renderCoursesList(container, items) {
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = '<div class="muted">None added yet.</div>';
    return;
  }
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "profile-item";
    div.textContent = item;
    container.appendChild(div);
  });
}

function renderEditableChips(container, items) {
  if (!container) return;
  container.innerHTML = "";
  items.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `${item}<span class="remove-chip">&times;</span>`;
    chip.querySelector(".remove-chip").addEventListener("click", () => {
      chip.remove();
      updatePreview();
    });
    container.appendChild(chip);
  });
}

function getChipsFromList(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(".chip")).map((chip) => {
    return chip.textContent.replace("×", "").trim();
  });
}

function getSelectedModes() {
  const modes = [];
  document.querySelectorAll(".mode-btn.active").forEach((btn) => {
    modes.push(btn.dataset.mode);
  });
  return modes;
}

function updateBioCount() {
  if (els.bioInput && els.bioCount) {
    els.bioCount.textContent = `${els.bioInput.value.length}/500`;
  }
}

function updatePreview() {
  const bio = els.bioInput?.value || "";
  if (els.profileBio) els.profileBio.textContent = bio || "No bio yet.";

  const modes = getSelectedModes();
  if (els.previewInperson) {
    els.previewInperson.style.display = modes.includes("in-person") ? "inline-block" : "none";
  }
  if (els.previewOnline) {
    els.previewOnline.style.display = modes.includes("online") ? "inline-block" : "none";
  }

  const languages = getChipsFromList(els.languagesList);
  renderChipList(els.previewLanguages, languages, "skill-tag");

  const skills = getChipsFromList(els.skillsList);
  renderChipList(els.previewSkills, skills, "skill-tag");

  const courses = getChipsFromList(els.coursesList);
  renderCoursesList(els.previewCourses, courses);
}

function addChip(inputEl, listEl) {
  if (!inputEl || !listEl) return;
  const value = inputEl.value.trim();
  if (!value) return;

  const existing = getChipsFromList(listEl);
  if (existing.includes(value)) {
    inputEl.value = "";
    return;
  }

  const chip = document.createElement("div");
  chip.className = "chip";
  chip.innerHTML = `${value}<span class="remove-chip">&times;</span>`;
  chip.querySelector(".remove-chip").addEventListener("click", () => {
    chip.remove();
    updatePreview();
  });
  listEl.appendChild(chip);
  inputEl.value = "";
  updatePreview();
}

window.addLanguage = function () {
  addChip(els.languageInput, els.languagesList);
};

window.addSkill = function () {
  addChip(els.skillInput, els.skillsList);
};

window.addCourse = function () {
  addChip(els.courseInput, els.coursesList);
};

window.updatePreview = updatePreview;

async function fetchProfile() {
  const url = api("/tutors/profile");
  console.log("Fetching profile from:", url);
  
  try {
    const res = await fetch(url, { credentials: "include" });
    console.log("Response status:", res.status);
    
    if (res.status === 401 || res.status === 403) {
      console.log("Unauthorized, redirecting to login");
      window.location.href = "/login.html";
      return;
    }
    
    if (!res.ok) {
      const text = await res.text();
      console.error("API error:", res.status, text);
      if (els.profileName) els.profileName.textContent = "Error loading profile";
      return;
    }
    
    profileData = await res.json();
    console.log("Profile data:", profileData);
    renderProfile(profileData);
  } catch (err) {
    console.error("Network error:", err);
    if (els.profileName) els.profileName.textContent = "Network error";
  }
}

async function saveProfile() {
  console.log("Saving profile...");
  
  try {
    const body = {
      bio: els.bioInput?.value?.trim() || "",
      languages: getChipsFromList(els.languagesList),
      skills: getChipsFromList(els.skillsList),
      courses: getChipsFromList(els.coursesList),
      teachingModes: getSelectedModes(),
    };
    
    console.log("Save payload:", body);

    const res = await fetch(api("/tutors/profile"), {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    console.log("Save response status:", res.status);

    if (res.status === 401 || res.status === 403) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("Save error:", text);
      alert("Failed to save profile.");
      return;
    }

    // Upload avatar if changed
    const avatarFile = els.avatarInput?.files?.[0];
    if (avatarFile) {
      console.log("Uploading avatar...");
      const formData = new FormData();
      formData.append("file", avatarFile);
      const avatarRes = await fetch(api("/tutors/profile/avatar"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      console.log("Avatar upload status:", avatarRes.status);
    }

    alert("Profile saved successfully!");
    await fetchProfile();
  } catch (err) {
    console.error("Save error:", err);
    alert("Failed to save profile.");
  }
}

async function clearAvatar() {
  try {
    await fetch(api("/tutors/profile/avatar"), {
      method: "DELETE",
      credentials: "include",
    });
    const defaultAvatar = "/static/images/perfect_cell.jpg";
    if (els.profileAvatar) els.profileAvatar.src = defaultAvatar;
    if (els.avatarPreview) els.avatarPreview.src = defaultAvatar;
    if (els.avatarInput) els.avatarInput.value = "";
  } catch (err) {
    console.error("Clear avatar error:", err);
  }
}

function attachEvents() {
  els.logout?.addEventListener("click", async () => {
    try {
      await fetch(api("/auth/logout"), { method: "POST", credentials: "include" });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.replace("/login.html?logout=1");
    }
  });

  els.bioInput?.addEventListener("input", () => {
    updateBioCount();
    updatePreview();
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      updatePreview();
    });
  });

  els.avatarInput?.addEventListener("change", () => {
    const file = els.avatarInput.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("File size must be less than 2MB.");
      els.avatarInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        if (els.profileAvatar) els.profileAvatar.src = reader.result;
        if (els.avatarPreview) els.avatarPreview.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  });

  els.avatarClear?.addEventListener("click", clearAvatar);

  els.languageInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(els.languageInput, els.languagesList);
    }
  });

  els.skillInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(els.skillInput, els.skillsList);
    }
  });

  els.courseInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(els.courseInput, els.coursesList);
    }
  });

  els.saveBtn?.addEventListener("click", saveProfile);

  els.previewBtn?.addEventListener("click", () => {
    alert("Public card preview would open here.");
  });
}

// Initialize
(async function init() {
  console.log("Initializing tutor profile page...");
  attachEvents();
  await fetchProfile();
})();