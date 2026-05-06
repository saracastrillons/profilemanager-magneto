require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 8080;
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(uploadDir));

const db = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER || "root",
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || "profilematch_magneto",
  waitForConnections: true,
  connectionLimit: 10
});

function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("Faltan EMAIL_USER o EMAIL_PASS");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safeOriginal = file.originalname
      .replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]/g, "")
      .replace(/\s+/g, "_");
    cb(null, `cv_user_${req.user.id}_${Date.now()}_${safeOriginal}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Solo se permiten archivos PDF."));
    }
    cb(null, true);
  }
});

function appUrl() {
  return process.env.APP_URL || `http://localhost:${PORT}`;
}

async function sendEmail({ to, subject, html, attachments = [] }) {
  if (!process.env.RESEND_API_KEY) {
    console.error("Falta RESEND_API_KEY en Railway.");
    throw new Error("Falta RESEND_API_KEY.");
  }

  if (!to) {
    console.error("No hay destinatario para el correo.");
    throw new Error("No hay destinatario.");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const emailData = {
      from: process.env.EMAIL_FROM || "ProfileMatch Magneto <onboarding@resend.dev>",
      to,
      subject,
      html
    };

    if (attachments && attachments.length > 0) {
      emailData.attachments = attachments
        .filter((file) => file.path && fs.existsSync(file.path))
        .map((file) => ({
          filename: file.filename,
          content: fs.readFileSync(file.path).toString("base64")
        }));
    }

    const result = await resend.emails.send(emailData);

    console.log("Correo enviado con Resend:", result);
    return result;
  } catch (error) {
    console.error("ERROR RESEND:", error);
    throw error;
  }
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "candidate"
    },
    process.env.JWT_SECRET || "profilematch_secret",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No autorizado. Inicia sesión." });

  const token = authHeader.replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "profilematch_secret");
    next();
  } catch {
    res.status(401).json({ message: "Sesión inválida o vencida." });
  }
}

function requireRecruiter(req, res, next) {
  if (req.user.role !== "recruiter") {
    return res.status(403).json({ message: "Esta acción solo está disponible para reclutadores." });
  }
  next();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function splitSkills(value) {
  return String(value || "")
    .split(",")
    .map((s) => normalizeText(s))
    .filter(Boolean);
}

function calculateMatch(profile, job) {
  const profileSkills = splitSkills(profile.skills);
  const jobSkills = splitSkills(job.skills);

  const matchedSkills = jobSkills.filter((skill) => profileSkills.includes(skill));
  const missingSkills = jobSkills.filter((skill) => !profileSkills.includes(skill));

  const skillsScore = jobSkills.length ? Math.round((matchedSkills.length / jobSkills.length) * 45) : 0;

  const profileModality = normalizeText(profile.modality);
  const jobModality = normalizeText(job.modality);
  let modalityScore = 0;
  if (profileModality && jobModality) {
    if (profileModality === jobModality) modalityScore = 20;
    else if (profileModality === "remoto" || jobModality === "remoto") modalityScore = 10;
  }

  const profileCity = normalizeText(profile.city);
  const jobCity = normalizeText(job.city);
  let cityScore = 0;
  if (profileCity && jobCity) {
    if (profileCity === jobCity) cityScore = 10;
    else if (jobModality === "remoto") cityScore = 8;
  }

  const profileSeniority = normalizeText(profile.seniority);
  const jobSeniority = normalizeText(job.seniority);
  let seniorityScore = 0;
  if (profileSeniority && jobSeniority) {
    if (profileSeniority === jobSeniority) seniorityScore = 15;
    else seniorityScore = 7;
  }

  const expectedSalary = Number(profile.salary_min || 0);
  const salaryMax = Number(job.salary_max || 0);
  let salaryScore = 0;
  if (!expectedSalary || !salaryMax) salaryScore = 5;
  else if (salaryMax >= expectedSalary) salaryScore = 10;

  const score = Math.max(0, Math.min(100, skillsScore + modalityScore + cityScore + seniorityScore + salaryScore));

  let level = "Coincidencia baja";
  if (score >= 80) level = "Coincidencia alta";
  else if (score >= 55) level = "Coincidencia media";

  const reasons = [];
  if (matchedSkills.length) reasons.push(`Coincide en habilidades: ${matchedSkills.join(", ")}.`);
  if (missingSkills.length) reasons.push(`Podría fortalecer: ${missingSkills.join(", ")}.`);
  if (modalityScore >= 20) reasons.push("La modalidad coincide con su preferencia.");
  if (cityScore >= 10) reasons.push("La ciudad coincide con su perfil.");
  if (jobModality === "remoto" && cityScore >= 8) reasons.push("La vacante remota reduce la restricción de ciudad.");
  if (seniorityScore >= 15) reasons.push("El nivel de experiencia coincide.");
  if (salaryScore >= 10) reasons.push("El salario ofrecido cubre su aspiración mínima.");
  if (!reasons.length) reasons.push("La vacante se muestra porque está activa en la plataforma.");

  return {
    score,
    level,
    explanation: reasons.join(" "),
    reasons,
    breakdown: {
      skills: skillsScore,
      modality: modalityScore,
      city: cityScore,
      seniority: seniorityScore,
      salary: salaryScore
    },
    matchedSkills,
    missingSkills
  };
}

async function addEvent(userId, jobId, type, description) {
  await db.query(
    "INSERT INTO events (user_id, job_id, type, description) VALUES (?, ?, ?, ?)",
    [userId, jobId || null, type, description]
  );
}

async function addNotification(userId, message) {
  await db.query("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [userId, message]);
}

async function getUserById(id) {
  const [rows] = await db.query("SELECT id, name, email, role, cv_filename, cv_original_name FROM users WHERE id = ?", [id]);
  return rows[0] || null;
}

async function getProfileByUserId(userId) {
  const [rows] = await db.query("SELECT * FROM profiles WHERE user_id = ?", [userId]);
  return rows[0] || null;
}

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, message: "Servidor y base de datos MySQL funcionando correctamente." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "No hay conexión con MySQL.", error: error.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Completa todos los campos." });
    if (password.length < 6) return res.status(400).json({ message: "La contraseña debe tener mínimo 6 caracteres." });

    const selectedRole = role === "recruiter" ? "recruiter" : "candidate";
    const [exists] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (exists.length) return res.status(400).json({ message: "Ya existe una cuenta con ese correo." });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, selectedRole]
    );

    if (selectedRole === "candidate") {
      await db.query("INSERT INTO profiles (user_id) VALUES (?)", [result.insertId]);
    }

    const user = { id: result.insertId, name, email, role: selectedRole };
    await addNotification(result.insertId, `Bienvenido a Profile Manager Magneto como ${selectedRole === "recruiter" ? "reclutador" : "candidato"}.`);

    res.json({ message: "Cuenta creada correctamente.", token: generateToken(user), user });
  } catch (error) {
    console.error("Error register:", error);
    res.status(500).json({ message: "Error al registrar usuario." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!users.length) return res.status(401).json({ message: "Correo o contraseña incorrectos." });

    const user = users[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Correo o contraseña incorrectos." });

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role || "candidate" };
    res.json({ message: "Inicio de sesión correcto.", token: generateToken(safeUser), user: safeUser });
  } catch (error) {
    console.error("Error login:", error);
    res.status(500).json({ message: "Error al iniciar sesión." });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const profile = await getProfileByUserId(req.user.id);
    res.json({ user, profile: profile || {} });
  } catch (error) {
    console.error("Error profile get:", error);
    res.status(500).json({ message: "Error al cargar perfil." });
  }
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    const {
      phone,
      city,
      profession,
      education,
      yearsExperience,
      salaryMin,
      modality,
      seniority,
      availability,
      roleTarget,
      linkedin,
      github,
      experience,
      skills
    } = req.body;

    await db.query(
      `
      INSERT INTO profiles
      (user_id, phone, city, profession, education, years_experience, salary_min, modality, seniority, availability, role_target, linkedin, github, experience, skills)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      phone = VALUES(phone),
      city = VALUES(city),
      profession = VALUES(profession),
      education = VALUES(education),
      years_experience = VALUES(years_experience),
      salary_min = VALUES(salary_min),
      modality = VALUES(modality),
      seniority = VALUES(seniority),
      availability = VALUES(availability),
      role_target = VALUES(role_target),
      linkedin = VALUES(linkedin),
      github = VALUES(github),
      experience = VALUES(experience),
      skills = VALUES(skills)
      `,
      [
        req.user.id,
        phone || "",
        city || "",
        profession || "",
        education || "",
        Number(yearsExperience || 0),
        Number(salaryMin || 0),
        modality || "",
        seniority || "",
        availability || "",
        roleTarget || "",
        linkedin || "",
        github || "",
        experience || "",
        skills || ""
      ]
    );

    await addEvent(req.user.id, null, "PROFILE_UPDATED", "Actualizó su perfil profesional.");
    res.json({ message: "Perfil guardado correctamente." });
  } catch (error) {
    console.error("Error profile save:", error);
    res.status(500).json({ message: "Error al guardar perfil." });
  }
});

app.post("/api/upload-cv", requireAuth, upload.single("cv"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Selecciona un archivo PDF." });

    await db.query("UPDATE users SET cv_filename = ?, cv_original_name = ? WHERE id = ?", [
      req.file.filename,
      req.file.originalname,
      req.user.id
    ]);

    await addEvent(req.user.id, null, "CV_UPLOADED", "Subió o reemplazó su hoja de vida.");
    await addNotification(req.user.id, "Tu hoja de vida fue cargada correctamente.");
    res.json({ message: "CV subido correctamente." });
  } catch (error) {
    console.error("Error upload cv:", error);
    res.status(500).json({ message: "No se pudo subir el CV." });
  }
});

app.get("/api/jobs", requireAuth, async (req, res) => {
  try {
    const { city, modality, seniority, skill, minSalary, search } = req.query;
    let sql = "SELECT * FROM jobs WHERE is_active = TRUE";
    const params = [];

    if (search && search.trim()) {
      sql += " AND (LOWER(title) LIKE LOWER(?) OR LOWER(company) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR LOWER(skills) LIKE LOWER(?))";
      const value = `%${search.trim()}%`;
      params.push(value, value, value, value);
    }
    if (city && city.trim()) {
      sql += " AND LOWER(city) LIKE LOWER(?)";
      params.push(`%${city.trim()}%`);
    }
    if (modality && modality.trim()) {
      sql += " AND LOWER(modality) = LOWER(?)";
      params.push(modality.trim());
    }
    if (seniority && seniority.trim()) {
      sql += " AND LOWER(seniority) = LOWER(?)";
      params.push(seniority.trim());
    }
    if (skill && skill.trim()) {
      sql += " AND LOWER(skills) LIKE LOWER(?)";
      params.push(`%${skill.trim()}%`);
    }
    if (minSalary && Number(minSalary) > 0) {
      sql += " AND salary_max >= ?";
      params.push(Number(minSalary));
    }

    sql += " ORDER BY created_at DESC";
    const [jobs] = await db.query(sql, params);
    res.json(jobs);
  } catch (error) {
    console.error("Error jobs:", error);
    res.status(500).json({ message: "Error al cargar vacantes." });
  }
});

app.get("/api/recommendations", requireAuth, async (req, res) => {
  try {
    const profile = await getProfileByUserId(req.user.id);
    if (!profile) return res.status(400).json({ message: "Primero completa tu perfil para generar recomendaciones." });

    const [jobs] = await db.query("SELECT * FROM jobs WHERE is_active = TRUE ORDER BY created_at DESC");
    const recommendations = jobs.map((job) => ({ ...job, ...calculateMatch(profile, job) })).sort((a, b) => b.score - a.score);
    res.json(recommendations);
  } catch (error) {
    console.error("Error recommendations:", error);
    res.status(500).json({ message: "Error al generar recomendaciones." });
  }
});

app.get("/api/job-detail/:id", requireAuth, async (req, res) => {
  try {
    const profile = await getProfileByUserId(req.user.id);
    const [jobs] = await db.query(
      `
      SELECT jobs.*, companies.description AS company_description, companies.website AS company_website
      FROM jobs
      LEFT JOIN companies ON jobs.company_id = companies.id
      WHERE jobs.id = ?
      `,
      [req.params.id]
    );

    if (!jobs.length) return res.status(404).json({ message: "Vacante no encontrada." });
    const match = profile ? calculateMatch(profile, jobs[0]) : null;
    await addEvent(req.user.id, req.params.id, "VIEW", "Consultó el detalle de una vacante.");
    res.json({ ...jobs[0], match });
  } catch (error) {
    console.error("Error job detail:", error);
    res.status(500).json({ message: "Error al cargar detalle de vacante." });
  }
});

app.post("/api/save-job", requireAuth, async (req, res) => {
  try {
    const { jobId } = req.body;
    await db.query("INSERT IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)", [req.user.id, jobId]);
    await addEvent(req.user.id, jobId, "SAVE", "Guardó una vacante.");
    await addNotification(req.user.id, "Guardaste una vacante para revisarla después.");
    res.json({ message: "Vacante guardada correctamente." });
  } catch (error) {
    console.error("Error save job:", error);
    res.status(500).json({ message: "Error al guardar vacante." });
  }
});

app.get("/api/saved-jobs", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT jobs.*
      FROM saved_jobs
      INNER JOIN jobs ON saved_jobs.job_id = jobs.id
      WHERE saved_jobs.user_id = ?
      ORDER BY saved_jobs.created_at DESC
      `,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error saved jobs:", error);
    res.status(500).json({ message: "Error al cargar vacantes guardadas." });
  }
});

app.post("/api/apply", requireAuth, async (req, res) => {
  try {
    const { jobId, coverMessage = "" } = req.body;
    const [jobs] = await db.query("SELECT * FROM jobs WHERE id = ?", [jobId]);
    if (!jobs.length) return res.status(404).json({ message: "Vacante no encontrada." });
    const job = jobs[0];

    const [existing] = await db.query("SELECT id FROM applications WHERE user_id = ? AND job_id = ?", [req.user.id, jobId]);
    if (existing.length) return res.status(400).json({ message: "Ya te postulaste a esta vacante." });

    await db.query(
      "INSERT INTO applications (user_id, job_id, status, cover_message) VALUES (?, ?, ?, ?)",
      [req.user.id, jobId, "Postulado", coverMessage]
    );

    const [users] = await db.query("SELECT name, email, cv_filename, cv_original_name FROM users WHERE id = ?", [req.user.id]);
    const candidate = users[0];
    const profile = await getProfileByUserId(req.user.id);

    await addEvent(req.user.id, jobId, "APPLY", "Se postuló a una vacante.");
    await addNotification(req.user.id, `Tu postulación a ${job.title} fue enviada correctamente.`);

    if (job.created_by) {
      await addNotification(job.created_by, `${candidate.name} se postuló a la vacante ${job.title}.`);
    }

    const attachments = [];
    if (candidate.cv_filename) {
      attachments.push({
        filename: candidate.cv_original_name || candidate.cv_filename,
        path: path.join(uploadDir, candidate.cv_filename)
      });
    }

    await sendEmail({
      to: candidate.email,
      subject: `Postulación enviada - ${job.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2 style="color:#4f46e5">Postulación enviada correctamente</h2>
          <p>Hola ${candidate.name},</p>
          <p>Tu postulación a <strong>${job.title}</strong> en <strong>${job.company}</strong> fue registrada exitosamente.</p>
          <p><strong>Estado inicial:</strong> Postulado</p>
          <p><strong>Ciudad:</strong> ${job.city || "No especificada"}</p>
          <p><strong>Modalidad:</strong> ${job.modality || "No especificada"}</p>
          <p>${candidate.cv_filename ? "Adjuntamos la hoja de vida que cargaste en la plataforma." : "Aún no tienes hoja de vida cargada. Puedes subirla desde tu perfil."}</p>
          <hr>
          <p style="font-size:13px;color:#6b7280">Profile Manager Magneto</p>
        </div>
      `,
      attachments
    });

    const companyEmail = job.recruiter_email || process.env.COMPANY_EMAIL;
    if (companyEmail) {
      await sendEmail({
        to: companyEmail,
        subject: `Nueva postulación - ${job.title}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
            <h2>Nueva postulación recibida</h2>
            <p><strong>Candidato:</strong> ${candidate.name}</p>
            <p><strong>Correo:</strong> ${candidate.email}</p>
            <p><strong>Vacante:</strong> ${job.title}</p>
            <p><strong>Empresa:</strong> ${job.company}</p>
            <p><strong>Ciudad candidato:</strong> ${profile?.city || "No registrada"}</p>
            <p><strong>Skills:</strong> ${profile?.skills || "No registradas"}</p>
            <p><strong>Mensaje del candidato:</strong> ${coverMessage || "Sin mensaje adicional."}</p>
          </div>
        `,
        attachments
      });
    }

    res.json({ message: `Tu postulación fue enviada correctamente a ${job.company}.` });
  } catch (error) {
    console.error("Error apply:", error);
    res.status(500).json({ message: "No se pudo completar la postulación. Revisa SMTP y base de datos." });
  }
});

app.get("/api/applications", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT applications.*, jobs.title, jobs.company, jobs.city, jobs.modality, jobs.seniority, jobs.salary_min, jobs.salary_max
      FROM applications
      INNER JOIN jobs ON applications.job_id = jobs.id
      WHERE applications.user_id = ?
      ORDER BY applications.created_at DESC
      `,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error applications:", error);
    res.status(500).json({ message: "Error al cargar postulaciones." });
  }
});

app.get("/api/events", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT events.*, jobs.title, jobs.company
      FROM events
      LEFT JOIN jobs ON events.job_id = jobs.id
      WHERE events.user_id = ?
      ORDER BY events.created_at DESC
      `,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error events:", error);
    res.status(500).json({ message: "Error al cargar historial." });
  }
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json(rows);
  } catch (error) {
    console.error("Error notifications:", error);
    res.status(500).json({ message: "Error al cargar notificaciones." });
  }
});

app.get("/api/company", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM companies WHERE user_id = ?", [req.user.id]);
    res.json(rows[0] || null);
  } catch (error) {
    console.error("Error company get:", error);
    res.status(500).json({ message: "Error al cargar empresa." });
  }
});

app.post("/api/company", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const { name, city, website, description } = req.body;
    if (!name) return res.status(400).json({ message: "El nombre de la empresa es obligatorio." });

    await db.query(
      `
      INSERT INTO companies (user_id, name, city, website, description)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      name = VALUES(name), city = VALUES(city), website = VALUES(website), description = VALUES(description)
      `,
      [req.user.id, name, city || "", website || "", description || ""]
    );

    await addEvent(req.user.id, null, "COMPANY_UPDATED", "Actualizó el perfil de empresa.");
    res.json({ message: "Perfil de empresa guardado correctamente." });
  } catch (error) {
    console.error("Error company save:", error);
    res.status(500).json({ message: "Error al guardar empresa." });
  }
});

app.post("/api/recruiter/jobs", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const {
      title,
      company,
      city,
      modality,
      seniority,
      contractType,
      area,
      salaryMin,
      salaryMax,
      skills,
      description,
      requirements,
      benefits,
      recruiterEmail,
      deadline
    } = req.body;

    if (!title || !company || !description) {
      return res.status(400).json({ message: "Título, empresa y descripción son obligatorios." });
    }

    const [companyRows] = await db.query("SELECT id FROM companies WHERE user_id = ?", [req.user.id]);
    const companyId = companyRows.length ? companyRows[0].id : null;

    const [result] = await db.query(
      `
      INSERT INTO jobs
      (title, company, city, modality, seniority, contract_type, area, salary_min, salary_max, skills, description, requirements, benefits, recruiter_email, company_id, created_by, is_active, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
      `,
      [
        title,
        company,
        city || "",
        modality || "",
        seniority || "",
        contractType || "",
        area || "",
        Number(salaryMin || 0),
        Number(salaryMax || 0),
        skills || "",
        description || "",
        requirements || "",
        benefits || "",
        recruiterEmail || req.user.email,
        companyId,
        req.user.id,
        deadline || null
      ]
    );

    await addEvent(req.user.id, result.insertId, "JOB_CREATED", "Publicó una nueva vacante.");
    await addNotification(req.user.id, `Publicaste la vacante ${title}.`);
    res.json({ message: "Vacante publicada correctamente. Ya puede aparecer en recomendaciones." });
  } catch (error) {
    console.error("Error recruiter job create:", error);
    res.status(500).json({ message: "Error al publicar vacante." });
  }
});

app.get("/api/recruiter/jobs", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT jobs.*, COUNT(applications.id) AS applications_count
      FROM jobs
      LEFT JOIN applications ON jobs.id = applications.job_id
      WHERE jobs.created_by = ?
      GROUP BY jobs.id
      ORDER BY jobs.created_at DESC
      `,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error recruiter jobs:", error);
    res.status(500).json({ message: "Error al cargar vacantes del reclutador." });
  }
});

app.patch("/api/recruiter/jobs/:id/status", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const { isActive } = req.body;
    await db.query("UPDATE jobs SET is_active = ? WHERE id = ? AND created_by = ?", [Boolean(isActive), req.params.id, req.user.id]);
    res.json({ message: "Estado de vacante actualizado correctamente." });
  } catch (error) {
    console.error("Error recruiter job status:", error);
    res.status(500).json({ message: "Error al cambiar estado de vacante." });
  }
});

app.get("/api/recruiter/jobs/:id/applications", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        applications.id AS application_id,
        applications.status,
        applications.cover_message,
        applications.created_at,
        users.id AS candidate_id,
        users.name AS candidate_name,
        users.email AS candidate_email,
        users.cv_filename,
        users.cv_original_name,
        profiles.city,
        profiles.modality,
        profiles.seniority,
        profiles.salary_min,
        profiles.profession,
        profiles.education,
        profiles.years_experience,
        profiles.skills,
        profiles.linkedin,
        profiles.github
      FROM applications
      INNER JOIN users ON applications.user_id = users.id
      LEFT JOIN profiles ON users.id = profiles.user_id
      INNER JOIN jobs ON applications.job_id = jobs.id
      WHERE applications.job_id = ? AND jobs.created_by = ?
      ORDER BY applications.created_at DESC
      `,
      [req.params.id, req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error recruiter candidates:", error);
    res.status(500).json({ message: "Error al cargar candidatos." });
  }
});

app.patch("/api/recruiter/applications/:id/status", requireAuth, requireRecruiter, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["Postulado", "En revisión", "Entrevista", "Seleccionado", "Descartado"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Estado no válido." });

    const [rows] = await db.query(
      `
      SELECT applications.id, applications.user_id, jobs.title, users.name, users.email
      FROM applications
      INNER JOIN jobs ON applications.job_id = jobs.id
      INNER JOIN users ON applications.user_id = users.id
      WHERE applications.id = ? AND jobs.created_by = ?
      `,
      [req.params.id, req.user.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Postulación no encontrada." });
    const application = rows[0];

    await db.query("UPDATE applications SET status = ? WHERE id = ?", [status, req.params.id]);
    await addNotification(application.user_id, `El estado de tu postulación a ${application.title} cambió a: ${status}.`);

    await sendEmail({
      to: application.email,
      subject: `Actualización de postulación - ${application.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2>Actualización de postulación</h2>
          <p>Hola ${application.name},</p>
          <p>El estado de tu postulación a <strong>${application.title}</strong> cambió a:</p>
          <h3 style="color:#4f46e5">${status}</h3>
          <p>Gracias por usar Profile Manager Magneto.</p>
        </div>
      `
    });

    res.json({ message: "Estado actualizado y candidato notificado correctamente." });
  } catch (error) {
    console.error("Error application status:", error);
    res.status(500).json({ message: "Error al actualizar estado." });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!users.length) return res.status(404).json({ message: "No existe un usuario registrado con ese correo." });

    const user = users[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

    await db.query("DELETE FROM password_resets WHERE user_id = ?", [user.id]);
    await db.query("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)", [user.id, token, expiresAt]);

    const resetLink = `${appUrl()}/reset-password.html?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: "Recuperación de contraseña - Profile Manager Magneto",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2 style="color:#4f46e5">Recuperación de contraseña</h2>
          <p>Hola ${user.name},</p>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p><a href="${resetLink}" style="background:#4f46e5;color:white;padding:12px 18px;border-radius:10px;text-decoration:none">Crear nueva contraseña</a></p>
          <p>Este enlace vence en 15 minutos.</p>
        </div>
      `
    });

    res.json({ message: "Se envió un enlace de recuperación a tu correo." });
  } catch (error) {
    console.error("Error forgot password:", error);
    res.status(500).json({ message: "No se pudo enviar el correo. Revisa la configuración SMTP." });
  }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    const [rows] = await db.query("SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()", [token]);
    if (!rows.length) return res.status(400).json({ message: "El enlace no es válido o ya venció." });

    const hash = await bcrypt.hash(password, 10);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hash, rows[0].user_id]);
    await db.query("DELETE FROM password_resets WHERE token = ?", [token]);

    await addEvent(rows[0].user_id, null, "PASSWORD_UPDATED", "Actualizó su contraseña.");
    await addNotification(rows[0].user_id, "Tu contraseña fue actualizada correctamente.");
    res.json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
  } catch (error) {
    console.error("Error reset password:", error);
    res.status(500).json({ message: "Error al actualizar contraseña." });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ message: "El archivo supera el límite permitido." });
  if (error.message === "Solo se permiten archivos PDF.") return res.status(400).json({ message: error.message });
  console.error("Error general:", error);
  res.status(500).json({ message: "Error interno del servidor." });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, async () => {
  console.log('Servidor listo en http://localhost:${PORT}')
  try {
    await db.query("SELECT 1");
    console.log("Base de datos MySQL conectada  correctamente. ");
  } catch (error) {
    console.log("No se pudo conectar a MySQL:", error.message);
  }

});
