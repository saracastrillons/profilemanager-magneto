let currentUserId = null;
let currentStep = 1;
window.jobsData = [];

function showStep(step) {
currentStep = step;

document.querySelectorAll(".wizard-step").forEach((item) => {
item.classList.remove("active-step-content");
});

document.querySelectorAll(".step-btn").forEach((item) => {
item.classList.remove("active-step");
});

document.getElementById(`step${step}`).classList.add("active-step-content");
document.getElementById(`stepBtn${step}`).classList.add("active-step");
}

function nextStep() {
if (currentStep < 3) {
showStep(currentStep + 1);
}
}

function previousStep() {
if (currentStep > 1) {
showStep(currentStep - 1);
}
}

function updateCompletionBar(value) {
document.getElementById("completionText").innerText = `${value}%`;
document.getElementById("progressFill").style.width = `${value}%`;
}

async function registerUser() {
const name = document.getElementById("name").value;
const email = document.getElementById("email").value;
const password = document.getElementById("password").value;

const res = await fetch("http://localhost:3001/register", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ name, email, password })
});

const data = await res.json();
document.getElementById("registerMsg").innerText = data.message;

if (data.user) {
currentUserId = data.user.id;
}
}

async function loginUser() {
const email = document.getElementById("loginEmail").value;
const password = document.getElementById("loginPassword").value;

const res = await fetch("http://localhost:3001/login", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email, password })
});

const data = await res.json();
document.getElementById("loginMsg").innerText = data.message;

if (data.user) {
currentUserId = data.user.id;
loadProfileCompletion();
}
}

async function saveProfile() {
const city = document.getElementById("city").value;
const modality = document.getElementById("modality").value;
const seniority = document.getElementById("seniority").value;
const roleTarget = document.getElementById("roleTarget").value;
const availability = document.getElementById("availability").value;
const skills = document.getElementById("skills").value
.split(",")
.map((s) => s.trim())
.filter((s) => s !== "");

const res = await fetch("http://localhost:3001/profile", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
userId: currentUserId,
city,
modality,
seniority,
skills,
roleTarget,
availability
})
});

const data = await res.json();
document.getElementById("profileMsg").innerText = data.message;

if (data.completion !== undefined) {
updateCompletionBar(data.completion);
}
}

async function loadProfileCompletion() {
if (!currentUserId) return;

const res = await fetch(`http://localhost:3001/profile/${currentUserId}`);
const data = await res.json();

if (data.completion !== undefined) {
updateCompletionBar(data.completion);
}
}

async function loadJobs() {
const res = await fetch("http://localhost:3001/jobs");
const data = await res.json();

const container = document.getElementById("jobsListSimple");
container.innerHTML = "";

data.forEach((job) => {
container.innerHTML += `
<div class="job-card-simple">
<div class="job-top">
<div>
<p class="job-days">Hace ${job.days} días</p>
<h4>${job.title}</h4>
<p class="company">${job.company}</p>
</div>
<span class="tag">${job.modality}</span>
</div>

<p><strong>Ciudad:</strong> ${job.city}</p>
<p><strong>Salario:</strong> ${job.salary}</p>
<p><strong>Skills:</strong> ${job.skills.join(", ")}</p>
<p>${job.description}</p>

<div class="card-buttons">
<button onclick="saveJob(${job.id})">Guardar</button>
<button class="secondary-btn" onclick="dismissJob(${job.id})">Descartar</button>
</div>
</div>
`;
});
}

async function getRecommendations() {
const res = await fetch("http://localhost:3001/recommend", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ userId: currentUserId })
});

const data = await res.json();

const list = document.getElementById("jobsList");
const detail = document.getElementById("jobDetail");

list.innerHTML = "";
detail.innerHTML = `
<div class="empty-state">
<h4>Detalle de vacante</h4>
<p>Selecciona una recomendación para ver score, desglose y razones.</p>
</div>
`;

if (!Array.isArray(data)) {
list.innerHTML = `<p>${data.message}</p>`;
return;
}

window.jobsData = data;

data.forEach((job) => {
list.innerHTML += `
<div class="job-card recommendation-card" onclick="showDetail(${job.id})">
<p class="job-days">Hace ${job.days} días</p>
<h4>${job.title}</h4>
<p class="company">${job.company}</p>
<p>${job.city}</p>
<div class="recommendation-footer">
<span class="tag">${job.modality}</span>
<span class="score-pill">${job.score}/100</span>
</div>
</div>
`;
});
}

function showDetail(jobId) {
const job = window.jobsData.find((j) => j.id === jobId);
const detail = document.getElementById("jobDetail");

if (!job) {
detail.innerHTML = "<p>No se encontró la vacante seleccionada.</p>";
return;
}

detail.innerHTML = `
<div class="detail-card">
<p class="job-days">Publicada hace ${job.days} días</p>
<h3>${job.title}</h3>
<p class="company">${job.company}</p>

<div class="detail-meta">
<span class="tag">${job.modality}</span>
<span class="tag">${job.city}</span>
<span class="tag">${job.salary}</span>
</div>

<div class="detail-actions">
<button onclick="applyJob(${job.id})">Postularme</button>
<button onclick="saveJob(${job.id})">Guardar</button>
<button class="secondary-btn" onclick="dismissJob(${job.id})">Descartar</button>
</div>

<h4>Descripción</h4>
<p>${job.description}</p>

<h4>Skills requeridas</h4>
<p>${job.skills.join(", ")}</p>

<h4>Score de compatibilidad: ${job.score}/100</h4>
<ul>
<li>Skills: ${job.breakdown.skills}/50</li>
<li>Modalidad: ${job.breakdown.modality}/20</li>
<li>Seniority: ${job.breakdown.seniority}/20</li>
<li>Recencia: ${job.breakdown.recency}/10</li>
<li>Bonus por historial: ${job.breakdown.historyBonus}</li>
<li>Penalización por historial: ${job.breakdown.historyPenalty}</li>
</ul>

<h4>Razones</h4>
<ul>
${job.reasons.map((reason) => `<li>${reason}</li>`).join("")}
</ul>
</div>
`;
}

async function saveJob(jobId) {
const res = await fetch("http://localhost:3001/save-job", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ userId: currentUserId, jobId })
});

const data = await res.json();
alert(data.message);
}

async function dismissJob(jobId) {
const res = await fetch("http://localhost:3001/dismiss-job", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ userId: currentUserId, jobId })
});

const data = await res.json();
alert(data.message);
}

async function applyJob(jobId) {
const res = await fetch("http://localhost:3001/apply", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ userId: currentUserId, jobId })
});

const data = await res.json();
alert(data.message);
}

async function loadSavedJobs() {
const res = await fetch(`http://localhost:3001/saved-jobs/${currentUserId}`);
const data = await res.json();

const container = document.getElementById("savedJobs");
container.innerHTML = "";

data.forEach((item) => {
container.innerHTML += `
<div class="job-card-simple">
<h4>${item.job.title}</h4>
<p class="company">${item.job.company}</p>
<p><strong>Ciudad:</strong> ${item.job.city}</p>
<p><strong>Modalidad:</strong> ${item.job.modality}</p>
</div>
`;
});
}

async function loadApplications() {
const res = await fetch(`http://localhost:3001/applications/${currentUserId}`);
const data = await res.json();

const container = document.getElementById("applications");
container.innerHTML = "";

data.forEach((app) => {
container.innerHTML += `
<div class="job-card-simple">
<h4>${app.job.title}</h4>
<p class="company">${app.job.company}</p>
<p><strong>Estado:</strong> ${app.status}</p>
</div>
`;
});
}

async function loadEvents() {
const res = await fetch(`http://localhost:3001/events/${currentUserId}`);
const data = await res.json();

const container = document.getElementById("events");
container.innerHTML = "";

data.forEach((event) => {
container.innerHTML += `
<div class="job-card-simple">
<p><strong>Evento:</strong> ${event.type}</p>
<p><strong>Vacante ID:</strong> ${event.jobId}</p>
<p><strong>Usuario ID:</strong> ${event.userId}</p>
</div>
`;
});
}

async function loadRecommendationLogs() {
const res = await fetch(`http://localhost:3001/recommendations-log/${currentUserId}`);
const data = await res.json();

const container = document.getElementById("recommendationLogs");
container.innerHTML = "";

data.forEach((log) => {
container.innerHTML += `
<div class="job-card-simple">
<p><strong>Vacante ID:</strong> ${log.jobId}</p>
<p><strong>Score:</strong> ${log.score}</p>
<p><strong>Skills:</strong> ${log.breakdown.skills}</p>
<p><strong>Modalidad:</strong> ${log.breakdown.modality}</p>
<p><strong>Seniority:</strong> ${log.breakdown.seniority}</p>
</div>
`;
});
}