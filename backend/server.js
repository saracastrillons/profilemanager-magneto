const express = require("express");
const cors = require("cors");
const jobs = require("./jobs.json");

const app = express();
app.use(cors());
app.use(express.json());

let users = [];
let profiles = [];
let events = [];
let applications = [];
let savedJobs = [];
let dismissedJobs = [];

app.post("/register", (req, res) => {
const { name, email, password } = req.body;

if (!name || !email || !password) {
return res.status(400).json({ message: "Faltan campos obligatorios" });
}

const exists = users.find((u) => u.email === email);
if (exists) {
return res.status(400).json({ message: "El correo ya está registrado" });
}

const user = {
id: users.length + 1,
name,
email,
password
};

users.push(user);
res.json({ message: "Usuario registrado correctamente", user });
});

app.post("/login", (req, res) => {
const { email, password } = req.body;

const user = users.find((u) => u.email === email && u.password === password);

if (!user) {
return res.status(401).json({ message: "Credenciales inválidas" });
}

res.json({ message: "Inicio de sesión exitoso", user });
});

app.post("/profile", (req, res) => {
const { userId, city, modality, seniority, skills } = req.body;

if (!userId || !city || !modality || !seniority || !skills || skills.length === 0) {
return res.status(400).json({ message: "Faltan datos del perfil" });
}

const existingProfileIndex = profiles.findIndex((p) => p.userId == userId);

const profile = {
userId,
city,
modality,
seniority,
skills
};

if (existingProfileIndex >= 0) {
profiles[existingProfileIndex] = profile;
return res.json({ message: "Perfil actualizado", profile });
}

profiles.push(profile);
res.json({ message: "Perfil guardado", profile });
});

app.get("/jobs", (req, res) => {
res.json(jobs);
});

app.post("/recommend", (req, res) => {
const { userId } = req.body;

const profile = profiles.find((p) => p.userId == userId);

if (!profile) {
return res.status(404).json({ message: "Perfil no encontrado" });
}

const userDismissed = dismissedJobs
.filter((d) => d.userId == userId)
.map((d) => d.jobId);

const recommendations = jobs
.filter((job) => !userDismissed.includes(job.id))
.map((job) => {
const matches = job.skills.filter((s) =>
profile.skills.map((x) => x.trim().toLowerCase()).includes(s.trim().toLowerCase())
).length;

const skillsScore = (matches / job.skills.length) * 50;

let modalityScore = 0;
if (profile.modality === job.modality) {
modalityScore = 20;
} else if (
profile.modality === "Remoto" &&
(job.modality === "Remoto" || job.modality === "Híbrido")
) {
modalityScore = 20;
} else {
modalityScore = 10;
}

let seniorityScore = profile.seniority === "Junior" ? 20 : 10;
let recencyScore = job.days < 7 ? 10 : 6;

const savedSameRole = savedJobs.filter(
(s) => s.userId == userId && s.title === job.title
).length;

const historyBonus = savedSameRole >= 1 ? 5 : 0;

const total = Math.round(
skillsScore + modalityScore + seniorityScore + recencyScore + historyBonus
);

return {
...job,
score: total,
breakdown: {
skills: Math.round(skillsScore),
modality: modalityScore,
seniority: seniorityScore,
recency: recencyScore,
historyBonus: historyBonus
},
reasons: [
"Coincide con tus habilidades",
"Cumple con tu modalidad preferida",
"La vacante fue publicada recientemente",
historyBonus > 0 ? "Se ajustó por tu historial de interacción" : "Sin ajuste por historial"
]
};
});

recommendations.sort((a, b) => b.score - a.score);

res.json(recommendations);
});

app.post("/event", (req, res) => {
const { userId, jobId, type } = req.body;

const event = {
id: events.length + 1,
userId,
jobId,
type
};

events.push(event);
res.json({ message: "Evento guardado", event });
});

app.get("/events/:userId", (req, res) => {
const userId = req.params.userId;
const userEvents = events.filter((e) => e.userId == userId);
res.json(userEvents);
});

app.post("/save-job", (req, res) => {
const { userId, jobId } = req.body;

const job = jobs.find((j) => j.id == jobId);
if (!job) {
return res.status(404).json({ message: "Vacante no encontrada" });
}

const exists = savedJobs.find((s) => s.userId == userId && s.jobId == jobId);
if (exists) {
return res.status(400).json({ message: "La vacante ya estaba guardada" });
}

savedJobs.push({
id: savedJobs.length + 1,
userId,
jobId,
title: job.title
});

events.push({
id: events.length + 1,
userId,
jobId,
type: "SAVE"
});

res.json({ message: "Vacante guardada correctamente" });
});

app.get("/saved-jobs/:userId", (req, res) => {
const userId = req.params.userId;
const userSaved = savedJobs
.filter((s) => s.userId == userId)
.map((s) => {
const job = jobs.find((j) => j.id == s.jobId);
return { ...s, job };
});

res.json(userSaved);
});

app.post("/dismiss-job", (req, res) => {
const { userId, jobId } = req.body;

const exists = dismissedJobs.find((d) => d.userId == userId && d.jobId == jobId);
if (exists) {
return res.status(400).json({ message: "La vacante ya estaba descartada" });
}

dismissedJobs.push({
id: dismissedJobs.length + 1,
userId,
jobId
});

events.push({
id: events.length + 1,
userId,
jobId,
type: "DISMISS"
});

res.json({ message: "Vacante descartada" });
});

app.post("/apply", (req, res) => {
const { userId, jobId } = req.body;

const exists = applications.find((a) => a.userId == userId && a.jobId == jobId);
if (exists) {
return res.status(400).json({ message: "Ya te postulaste a esta vacante" });
}

const application = {
id: applications.length + 1,
userId,
jobId,
status: "En revisión"
};

applications.push(application);

events.push({
id: events.length + 1,
userId,
jobId,
type: "APPLY"
});

res.json({ message: "Postulación registrada", application });
});

app.get("/applications/:userId", (req, res) => {
const userId = req.params.userId;

const userApplications = applications
.filter((a) => a.userId == userId)
.map((a) => {
const job = jobs.find((j) => j.id == a.jobId);
return { ...a, job };
});

res.json(userApplications);
});

app.listen(3001, () => {
console.log("Servidor corriendo en http://localhost:3001");
});