let currentUserId = null;

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
}
}

async function saveProfile() {
const city = document.getElementById("city").value;
const modality = document.getElementById("modality").value;
const seniority = document.getElementById("seniority").value;
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
skills
})
});

const data = await res.json();
document.getElementById("profileMsg").innerText = data.message;
}

async function loadJobs() {
const res = await fetch("http://localhost:3001/jobs");
const data = await res.json();

const container = document.getElementById("jobsList");
container.innerHTML = "";

data.forEach((job) => {
container.innerHTML += `
<div class="card">
<h3>${job.title}</h3>
<p><b>Empresa:</b> ${job.company}</p>
<p><b>Ciudad:</b> ${job.city}</p>
<p><b>Modalidad:</b> ${job.modality}</p>
<p><b>Skills:</b> ${job.skills.join(", ")}</p>
<button onclick="saveJob(${job.id})">Guardar</button>
<button onclick="dismissJob(${job.id})">Descartar</button>
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
const container = document.getElementById("recommendations");
container.innerHTML = "";

if (!Array.isArray(data)) {
container.innerHTML = `<p>${data.message}</p>`;
return;
}

data.forEach((job) => {
container.innerHTML += `
<div class="card">
<h3>${job.title}</h3>
<p><b>Empresa:</b> ${job.company}</p>
<p><b>Score:</b> ${job.score}</p>
<p><b>Desglose:</b></p>
<ul>
<li>Skills: ${job.breakdown.skills}/50</li>
<li>Modalidad: ${job.breakdown.modality}/20</li>
<li>Seniority: ${job.breakdown.seniority}/20</li>
<li>Recencia: ${job.breakdown.recency}/10</li>
<li>Historial: ${job.breakdown.historyBonus}</li>
</ul>
<p><b>Razones:</b> ${job.reasons.join(", ")}</p>
<button onclick="applyJob(${job.id})">Postular</button>
</div>
`;
});
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
<div class="card">
<p><b>Vacante guardada:</b> ${item.job.title}</p>
<p><b>Empresa:</b> ${item.job.company}</p>
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
<div class="card">
<p><b>Postulación #${app.id}</b></p>
<p><b>Vacante:</b> ${app.job.title}</p>
<p><b>Empresa:</b> ${app.job.company}</p>
<p><b>Estado:</b> ${app.status}</p>
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
<div class="card">
<p><b>Evento:</b> ${event.type}</p>
<p><b>Vacante ID:</b> ${event.jobId}</p>
<p><b>Usuario ID:</b> ${event.userId}</p>
</div>
`;
});
}