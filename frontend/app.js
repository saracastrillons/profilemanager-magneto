const API = "http://localhost:3001/api";

function getToken() {
  return localStorage.getItem("token");
}

function getUser() {
  return JSON.parse(localStorage.getItem("user") || "null");
}

function setMessage(id, text, ok = false) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = text || "";
    el.className = ok ? "message success" : "message";
  }
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + getToken()
  };
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error("Respuesta no JSON:", text);
    throw new Error("El servidor no respondió JSON. Revisa que el backend esté corriendo.");
  }
}

function requireFrontAuth() {
  if (location.pathname.includes("dashboard.html") && !getToken()) {
    window.location.href = "index.html";
  }
}

async function register() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!name || !email || !password) return setMessage("registerMsg", "Completa todos los campos.");
  try {
    const res = await fetch(`${API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await readJson(res);
    setMessage("registerMsg", data.message, res.ok);
  } catch (error) {
    setMessage("registerMsg", error.message);
  }
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) return setMessage("loginMsg", "Ingresa correo y contraseña.");
  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await readJson(res);

    if (!res.ok) return setMessage("loginMsg", data.message);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    window.location.href = "dashboard.html";
  } catch (error) {
    setMessage("loginMsg", error.message);
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

function showSection(sectionId, button) {
  document.querySelectorAll(".dash-section").forEach((section) => section.classList.remove("active-section"));
  document.getElementById(sectionId)?.classList.add("active-section");

  document.querySelectorAll(".side-btn").forEach((btn) => btn.classList.remove("active"));
  button?.classList.add("active");
}

function loadUserInfo() {
  const user = getUser();
  const title = document.getElementById("welcomeTitle");
  if (title && user) title.innerText = `Hola, ${user.name}`;
}

function profilePayload() {
  return {
    phone: document.getElementById("phone")?.value.trim(),
    city: document.getElementById("city")?.value.trim(),
    profession: document.getElementById("profession")?.value.trim(),
    education: document.getElementById("education")?.value.trim(),
    yearsExperience: document.getElementById("yearsExperience")?.value,
    salaryMin: document.getElementById("salaryMin")?.value,
    modality: document.getElementById("modality")?.value,
    seniority: document.getElementById("seniority")?.value,
    availability: document.getElementById("availability")?.value,
    roleTarget: document.getElementById("roleTarget")?.value.trim(),
    linkedin: document.getElementById("linkedin")?.value.trim(),
    github: document.getElementById("github")?.value.trim(),
    experience: document.getElementById("experience")?.value.trim(),
    skills: document.getElementById("skills")?.value.trim()
  };
}

function updateCompletion(profile, user) {
  const fields = [
    profile?.phone, profile?.city, profile?.profession, profile?.education,
    profile?.years_experience, profile?.salary_min, profile?.modality,
    profile?.seniority, profile?.availability, profile?.role_target,
    profile?.experience, profile?.skills, user?.cv_filename
  ];

  const completed = fields.filter((v) => v !== null && v !== undefined && String(v).trim() !== "" && String(v) !== "0").length;
  const percent = Math.round((completed / fields.length) * 100);

  const text = document.getElementById("completionText");
  const fill = document.getElementById("progressFill");
  if (text) text.innerText = `${percent}%`;
  if (fill) fill.style.width = `${percent}%`;
}

async function loadProfile() {
  if (!location.pathname.includes("dashboard.html")) return;
  try {
    const res = await fetch(`${API}/profile`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);

    if (res.status === 401) return logout();

    const profile = data.profile || {};
    const user = data.user || {};

    ["phone", "city", "profession", "education", "linkedin", "github", "experience", "skills"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = profile[id] || "";
    });

    if (document.getElementById("yearsExperience")) document.getElementById("yearsExperience").value = profile.years_experience || "";
    if (document.getElementById("salaryMin")) document.getElementById("salaryMin").value = profile.salary_min || "";
    if (document.getElementById("roleTarget")) document.getElementById("roleTarget").value = profile.role_target || "";
    if (document.getElementById("modality")) document.getElementById("modality").value = profile.modality || "Remoto";
    if (document.getElementById("seniority")) document.getElementById("seniority").value = profile.seniority || "Junior";
    if (document.getElementById("availability")) document.getElementById("availability").value = profile.availability || "Inmediata";

    const cvLink = document.getElementById("cvLink");
    if (cvLink && user.cv_filename) {
      cvLink.href = `/uploads/${user.cv_filename}`;
      cvLink.innerText = `Ver CV cargado: ${user.cv_original_name || user.cv_filename}`;
      cvLink.classList.remove("hidden");
    }

    updateCompletion(profile, user);
  } catch (error) {
    console.error(error);
  }
}

async function saveProfile() {
  try {
    const res = await fetch(`${API}/profile`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(profilePayload())
    });
    const data = await readJson(res);
    setMessage("profileMsg", data.message, res.ok);
    await loadProfile();
  } catch (error) {
    setMessage("profileMsg", error.message);
  }
}

async function uploadCV() {
  const fileInput = document.getElementById("cvFile");
  if (!fileInput.files.length) return setMessage("cvMsg", "Selecciona un archivo PDF.");

  const formData = new FormData();
  formData.append("cv", fileInput.files[0]);

  try {
    const res = await fetch(`${API}/upload-cv`, {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() },
      body: formData
    });
    const data = await readJson(res);
    setMessage("cvMsg", data.message, res.ok);
    if (res.ok) await loadProfile();
  } catch (error) {
    setMessage("cvMsg", error.message);
  }
}

function money(value) {
  return `$${Number(value || 0).toLocaleString("es-CO")}`;
}

function salaryText(job) {
  if (!job.salary_min && !job.salary_max) return "Salario no especificado";
  return `${money(job.salary_min)} - ${money(job.salary_max)}`;
}

function scoreClass(score) {
  if (score >= 80) return "score-high";
  if (score >= 55) return "score-mid";
  return "score-low";
}

function skillsHtml(skills) {
  return String(skills || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((skill) => `<span>${skill}</span>`)
    .join("");
}

function jobCard(job, explain = false) {
  const score = job.score ?? null;
  return `
    <article class="job-card">
      <div class="job-head">
        <div>
          <span class="tag">${job.modality || "Modalidad"}</span>
          <h3>${job.title}</h3>
          <p>${job.company}</p>
        </div>
        ${score !== null ? `<div class="score ${scoreClass(score)}">${score}%</div>` : ""}
      </div>
      <p>${job.description || ""}</p>
      <div class="tags">
        <span>${job.city || "Ciudad no definida"}</span>
        <span>${salaryText(job)}</span>
        <span>${job.seniority || "Nivel no definido"}</span>
        <span>${job.contract_type || "Contrato"}</span>
      </div>
      <div class="skills">${skillsHtml(job.skills)}</div>
      ${explain ? `<div class="explanation"><strong>${job.level}:</strong> ${job.explanation}</div>` : ""}
      <div class="card-actions">
        <button type="button" onclick="showJobDetail(${job.id})">Ver detalle</button>
        <button type="button" onclick="openApplyModal(${job.id})">Postularme</button>
        <button type="button" class="outline" onclick="saveJob(${job.id})">Guardar</button>
      </div>
    </article>
  `;
}

async function loadRecommendations() {
  const container = document.getElementById("recommendationsList");
  if (!container) return;
  container.innerHTML = "<p>Cargando recomendaciones...</p>";

  try {
    const res = await fetch(`${API}/recommendations`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);
    if (!res.ok) {
      container.innerHTML = `<p class="message">${data.message}</p>`;
      return;
    }
    container.innerHTML = data.map((job) => jobCard(job, true)).join("");
  } catch (error) {
    container.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function loadJobs() {
  const container = document.getElementById("jobsList");
  if (!container) return;

  const params = new URLSearchParams();
  const city = document.getElementById("filterCity")?.value;
  const modality = document.getElementById("filterModality")?.value;
  const seniority = document.getElementById("filterSeniority")?.value;
  const skill = document.getElementById("filterSkill")?.value;
  const minSalary = document.getElementById("filterSalary")?.value;

  if (city) params.append("city", city);
  if (modality) params.append("modality", modality);
  if (seniority) params.append("seniority", seniority);
  if (skill) params.append("skill", skill);
  if (minSalary) params.append("minSalary", minSalary);

  container.innerHTML = "<p>Cargando vacantes...</p>";

  try {
    const res = await fetch(`${API}/jobs?${params.toString()}`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);
    container.innerHTML = data.length ? data.map((job) => jobCard(job)).join("") : "<p>No hay vacantes disponibles.</p>";
  } catch (error) {
    container.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function showJobDetail(jobId) {
  const detail = document.getElementById("recommendationDetail");
  if (!detail) return;
  detail.innerHTML = "<p>Cargando detalle...</p>";

  try {
    const res = await fetch(`${API}/job-detail/${jobId}`, { headers: { Authorization: "Bearer " + getToken() } });
    const job = await readJson(res);

    if (!res.ok) {
      detail.innerHTML = `<p class="message">${job.message}</p>`;
      return;
    }

    detail.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Empresa:</strong> ${job.company}</p>
      <p><strong>Ciudad:</strong> ${job.city}</p>
      <p><strong>Modalidad:</strong> ${job.modality}</p>
      <p><strong>Nivel:</strong> ${job.seniority}</p>
      <p><strong>Contrato:</strong> ${job.contract_type || "No especificado"}</p>
      <p><strong>Salario:</strong> ${salaryText(job)}</p>
      ${job.match ? `<div class="explanation"><strong>${job.match.level} (${job.match.score}%):</strong> ${job.match.explanation}</div>` : ""}
      <hr>
      <h4>Descripción</h4>
      <p>${job.description || "Sin descripción disponible."}</p>
      <h4>Requisitos</h4>
      <p>${job.requirements || "No especificados."}</p>
      <h4>Beneficios</h4>
      <p>${job.benefits || "No especificados."}</p>
      <h4>Habilidades</h4>
      <div class="skills">${skillsHtml(job.skills)}</div>
      <button type="button" onclick="openApplyModal(${job.id})">Postularme</button>
    `;
  } catch (error) {
    detail.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function saveJob(jobId) {
  try {
    const res = await fetch(`${API}/save-job`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ jobId })
    });
    const data = await readJson(res);
    alert(data.message);
  } catch (error) {
    alert(error.message);
  }
}

function openApplyModal(jobId) {
  const message = prompt("Mensaje opcional para la empresa/reclutador:");
  applyJob(jobId, message || "");
}

async function applyJob(jobId, coverMessage = "") {
  try {
    const res = await fetch(`${API}/apply`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ jobId, coverMessage })
    });
    const data = await readJson(res);
    alert(data.message);
    loadApplications();
    loadEvents();
    loadNotifications();
  } catch (error) {
    alert(error.message);
  }
}

async function loadSavedJobs() {
  const container = document.getElementById("savedJobs");
  if (!container) return;
  container.innerHTML = "<p>Cargando guardadas...</p>";

  try {
    const res = await fetch(`${API}/saved-jobs`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);
    container.innerHTML = data.length ? data.map((job) => jobCard(job)).join("") : "<p>No tienes vacantes guardadas.</p>";
  } catch (error) {
    container.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function loadApplications() {
  const container = document.getElementById("applications");
  if (!container) return;
  container.innerHTML = "<p>Cargando postulaciones...</p>";

  try {
    const res = await fetch(`${API}/applications`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);
    container.innerHTML = data.length ? data.map((app) => `
      <article class="job-card">
        <h3>${app.title}</h3>
        <p>${app.company}</p>
        <div class="status status-${String(app.status).toLowerCase().replaceAll(" ", "-")}">${app.status}</div>
        <div class="tags">
          <span>${app.city}</span>
          <span>${app.modality}</span>
          <span>${app.seniority}</span>
          <span>${salaryText(app)}</span>
        </div>
        <p><strong>Fecha:</strong> ${new Date(app.created_at).toLocaleString("es-CO")}</p>
      </article>
    `).join("") : "<p>No tienes postulaciones registradas.</p>";
  } catch (error) {
    container.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function loadEvents() {
  const container = document.getElementById("events");
  if (!container) return;
  container.innerHTML = "<p>Cargando historial...</p>";

  try {
    const res = await fetch(`${API}/events`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);
    container.innerHTML = data.length ? data.map((event) => `
      <div class="timeline-item">
        <strong>${event.type}</strong>
        <p>${event.description || ""}</p>
        ${event.title ? `<p><strong>Vacante:</strong> ${event.title} - ${event.company}</p>` : ""}
        <small>${new Date(event.created_at).toLocaleString("es-CO")}</small>
      </div>
    `).join("") : "<p>No hay historial registrado.</p>";
  } catch (error) {
    container.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function loadNotifications() {
  const container = document.getElementById("notifications");
  if (!container) return;
  container.innerHTML = "<p>Cargando notificaciones...</p>";

  try {
    const res = await fetch(`${API}/notifications`, { headers: { Authorization: "Bearer " + getToken() } });
    const data = await readJson(res);
    container.innerHTML = data.length ? data.map((item) => `
      <div class="timeline-item">
        <strong>${item.message}</strong>
        <small>${new Date(item.created_at).toLocaleString("es-CO")}</small>
      </div>
    `).join("") : "<p>No tienes notificaciones.</p>";
  } catch (error) {
    container.innerHTML = `<p class="message">${error.message}</p>`;
  }
}

async function forgotPassword() {
  const email = document.getElementById("forgotEmail")?.value.trim();
  if (!email) return setMessage("forgotMsg", "Ingresa tu correo.");

  try {
    const res = await fetch(`${API}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await readJson(res);
    setMessage("forgotMsg", data.message, res.ok);
  } catch (error) {
    setMessage("forgotMsg", error.message);
  }
}

async function resetPassword() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const password = document.getElementById("newPassword")?.value.trim();
  if (!password) return setMessage("resetMsg", "Ingresa una nueva contraseña.");

  try {
    const res = await fetch(`${API}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const data = await readJson(res);
    setMessage("resetMsg", data.message, res.ok);
  } catch (error) {
    setMessage("resetMsg", error.message);
  }
}

window.register = register;
window.login = login;
window.logout = logout;
window.showSection = showSection;
window.saveProfile = saveProfile;
window.uploadCV = uploadCV;
window.loadRecommendations = loadRecommendations;
window.loadJobs = loadJobs;
window.showJobDetail = showJobDetail;
window.saveJob = saveJob;
window.openApplyModal = openApplyModal;
window.applyJob = applyJob;
window.loadSavedJobs = loadSavedJobs;
window.loadApplications = loadApplications;
window.loadEvents = loadEvents;
window.loadNotifications = loadNotifications;
window.forgotPassword = forgotPassword;
window.resetPassword = resetPassword;

window.addEventListener("load", () => {
  requireFrontAuth();
  loadUserInfo();
  if (location.pathname.includes("dashboard.html")) {
    loadProfile();
  }
});
