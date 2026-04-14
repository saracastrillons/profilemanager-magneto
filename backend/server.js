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
let recommendationsLog = [];

function calculateProfileCompletion(profile) {
if (!profile) return 0;

const fields = [
profile.city,
profile.modality,
profile.seniority,
profile.skills && profile.skills.length > 0 ? "ok" : "",
profile.roleTarget,
profile.availability
];

const completed = fields.filter((field) => field && String(field).trim() !== "").length;
return Math.round((completed / fields.length) * 100);
}

function calculateHistoryAdjustment(userId, job) {
const userSaved = savedJobs.filter((item) => item.userId == userId);
const userApplied = applications.filter((item) => item.userId == userId);
const userDismissed = dismissedJobs.filter((item) => item.userId == userId);

let bonus = 0;
let penalty = 0;
let historyReasons = [];

const savedSameTitle = userSaved.some((item) => item.title === job.title);
if (savedSameTitle) {
bonus += 5;
historyReasons.push("Se bonificó porque has guardado vacantes similares");
}

const appliedSameTitle = userApplied.some((item) => {
const appliedJob = jobs.find((jobItem) => jobItem.id == item.jobId);
return appliedJob && appliedJob.title === job.title;
});

if (appliedSameTitle) {
bonus += 8;
historyReasons.push("Se bonificó porque te has postulado a cargos similares");
}

const dismissedSameModality = userDismissed.filter((item) => {
const dismissedJob = jobs.find((jobItem) => jobItem.id == item.jobId);
return dismissedJob && dismissedJob.modality === job.modality;
}).length;

if (dismissedSameModality >= 2) {
penalty += 5;
historyReasons.push("Se penalizó porque has descartado vacantes de esta modalidad");
}

return { bonus, penalty, historyReasons };
}

app.post("/register", (req, res) => {
const { name, email, password } = req.body;

if (!name || !email || !password) {
return res.status(400).json({ message: "Faltan campos obligatorios" });
}

const existingUser = users.find((user) => user.email === email);
if (existingUser) {
return res.status(400).json({ message: "Ese correo ya está registrado" });
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

const user = users.find(
(item) => item.email === email && item.password === password
);

if (!user) {
return res.status(401).json({ message: "Correo o contraseña incorrectos" });
}

res.json({ message: "Inicio de sesión exitoso", user });
});

app.post("/profile", (req, res) => {
const {
userId,
city,
modality,
seniority,
skills,
roleTarget,
availability
} = req.body;

if (!userId || !city || !modality || !seniority || !skills || skills.length === 0) {
return res.status(400).json({ message: "Faltan datos del perfil" });
}

const profile = {
userId,
city,
modality,
seniority,
skills,
roleTarget: roleTarget || "",
availability: availability || ""
};

const existingIndex = profiles.findIndex((item) => item.userId == userId);

if (existingIndex >= 0) {
profiles[existingIndex] = profile;
return res.json({
message: "Perfil actualizado correctamente",
profile,
completion: calculateProfileCompletion(profile)
});
}

profiles.push(profile);

res.json({
message: "Perfil guardado correctamente",
profile,
completion: calculateProfileCompletion(profile)
});
});

app.get("/profile/:userId", (req, res) => {
const userId = req.params.userId;
const profile = profiles.find((item) => item.userId == userId);

if (!profile) {
return res.status(404).json({ message: "Perfil no encontrado" });
}

res.json({
profile,
completion: calculateProfileCompletion(profile)
});
});

app.get("/jobs", (req, res) => {
res.json(jobs);
});

app.post("/recommend", (req, res) => {
const { userId } = req.body;

const profile = profiles.find((item) => item.userId == userId);

if (!profile) {
return res.status(404).json({ message: "Perfil no encontrado" });
}

const dismissedIds = dismissedJobs
.filter((item) => item.userId == userId)
.map((item) => item.jobId);

const recommendations = jobs
.filter((job) => !dismissedIds.includes(job.id))
.map((job) => {
const profileSkills = profile.skills.map((skill) => skill.trim().toLowerCase());
const jobSkills = job.skills.map((skill) => skill.trim().toLowerCase());

const matches = jobSkills.filter((skill) => profileSkills.includes(skill)).length;
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

let seniorityScore = 0;
if (profile.seniority === "Junior") {
seniorityScore = 20;
} else if (profile.seniority === "Mid") {
seniorityScore = 15;
} else {
seniorityScore = 10;
}

let recencyScore = 2;
if (job.days < 7) {
recencyScore = 10;
} else if (job.days < 15) {
recencyScore = 6;
}

const historyAdjustment = calculateHistoryAdjustment(userId, job);

const total = Math.round(
skillsScore +
modalityScore +
seniorityScore +
recencyScore +
historyAdjustment.bonus -
historyAdjustment.penalty
);

const recommendation = {
...job,
score: total,
breakdown: {
skills: Math.round(skillsScore),
modality: modalityScore,
seniority: seniorityScore,
recency: recencyScore,
historyBonus: historyAdjustment.bonus,
historyPenalty: historyAdjustment.penalty
},
reasons: [
matches > 0
? "Coincide con tus habilidades"
: "Tiene baja coincidencia con tus habilidades",
modalityScore >= 20
? "Cumple con tu modalidad preferida"
: "Cumple parcialmente con tu modalidad preferida",
recencyScore >= 10
? "La vacante fue publicada recientemente"
: "La vacante no es de las más recientes",
...historyAdjustment.historyReasons
]
};

recommendationsLog.push({
id: recommendationsLog.length + 1,
userId,
jobId: job.id,
score: recommendation.score,
breakdown: recommendation.breakdown,
reasons: recommendation.reasons
});

return recommendation;
});

recommendations.sort((a, b) => b.score - a.score);

res.json(recommendations);
});

app.get("/recommendations-log/:userId", (req, res) => {
const userId = req.params.userId;
const logs = recommendationsLog.filter((item) => item.userId == userId);
res.json(logs);
});

app.post("/save-job", (req, res) => {
const { userId, jobId } = req.body;

const job = jobs.find((item) => item.id == jobId);
if (!job) {
return res.status(404).json({ message: "Vacante no encontrada" });
}

const exists = savedJobs.find(
(item) => item.userId == userId && item.jobId == jobId
);

if (exists) {
return res.status(400).json({ message: "La vacante ya estaba guardada" });
}

const saved = {
id: savedJobs.length + 1,
userId,
jobId,
title: job.title
};

savedJobs.push(saved);

events.push({
id: events.length + 1,
userId,
jobId,
type: "SAVE"
});

res.json({ message: "Vacante guardada correctamente", saved });
});

app.post("/dismiss-job", (req, res) => {
const { userId, jobId } = req.body;

const exists = dismissedJobs.find(
(item) => item.userId == userId && item.jobId == jobId
);

if (exists) {
return res.status(400).json({ message: "La vacante ya estaba descartada" });
}

const dismissed = {
id: dismissedJobs.length + 1,
userId,
jobId
};

dismissedJobs.push(dismissed);

events.push({
id: events.length + 1,
userId,
jobId,
type: "DISMISS"
});

res.json({ message: "Vacante descartada correctamente", dismissed });
});

app.post("/apply", (req, res) => {
const { userId, jobId } = req.body;

const exists = applications.find(
(item) => item.userId == userId && item.jobId == jobId
);

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
.filter((item) => item.userId == userId)
.map((item) => {
const job = jobs.find((jobItem) => jobItem.id == item.jobId);
return { ...item, job };
});

res.json(userApplications);
});

app.get("/saved-jobs/:userId", (req, res) => {
const userId = req.params.userId;

const userSaved = savedJobs
.filter((item) => item.userId == userId)
.map((item) => {
const job = jobs.find((jobItem) => jobItem.id == item.jobId);
return { ...item, job };
});

res.json(userSaved);
});

app.get("/events/:userId", (req, res) => {
const userId = req.params.userId;
const userEvents = events.filter((item) => item.userId == userId);
res.json(userEvents);
});

app.listen(3001, () => {
console.log("Servidor corriendo en http://localhost:3001");
});