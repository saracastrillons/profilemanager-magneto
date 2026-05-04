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

const app = express();
const PORT = Number(process.env.PORT || 3001);
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(uploadDir));

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT || 465),
  secure: String(process.env.EMAIL_SECURE) === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safeOriginal = file.originalname.replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]/g, "").replace(/\s+/g, "_");
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
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"Profile Manager Magneto" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments
  });
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || "candidate" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No autorizado. Inicia sesión." });

  const token = authHeader.replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Sesión inválida o vencida." });
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeList(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function calculateMatch(profile, job) {
  const profileSkills = normalizeList(profile.skills);
  const jobSkills = normalizeList(job.skills);

  const matchedSkills = jobSkills.filter((skill) =>
    profileSkills.some((userSkill) => userSkill.includes(skill) || skill.includes(userSkill))
  );

  const skillScore = jobSkills.length ? (matchedSkills.length / jobSkills.length) * 45 : 0;

  const profileModality = normalizeText(profile.modality);
  const jobModality = normalizeText(job.modality);
  let modalityScore = 0;
  if (profileModality === jobModality) modalityScore = 20;
  else if (
    (profileModality === "remoto" && jobModality === "hibrido") ||
    (profileModality === "hibrido" && jobModality === "remoto")
  ) modalityScore = 12;

  const profileCity = normalizeText(profile.city);
  const jobCity = normalizeText(job.city);
  let cityScore = 0;
  if (jobModality === "remoto") cityScore = 15;
  else if (profileCity && profileCity === jobCity) cityScore = 15;

  const profileSeniority = normalizeText(profile.seniority);
  const jobSeniority = normalizeText(job.seniority);
  let seniorityScore = 0;
  if (profileSeniority === jobSeniority) seniorityScore = 15;
  else if (
    (profileSeniority === "practicante" && jobSeniority === "junior") ||
    (profileSeniority === "junior" && jobSeniority === "practicante") ||
    (profileSeniority === "junior" && jobSeniority === "mid")
  ) seniorityScore = 8;

  const expectedSalary = Number(profile.salary_min || 0);
  const jobMaxSalary = Number(job.salary_max || 0);
  const salaryScore = !expectedSalary || !jobMaxSalary || expectedSalary <= jobMaxSalary ? 5 : 0;

  const score = Math.max(0, Math.min(100, Math.round(skillScore + modalityScore + cityScore + seniorityScore + salaryScore)));

  let level = "Baja coincidencia";
  if (score >= 80) level = "Alta coincidencia";
  else if (score >= 55) level = "Coincidencia media";

  const reasonParts = [];
  if (matchedSkills.length) {
    reasonParts.push(`Tienes coincidencia en habilidades clave: ${matchedSkills.join(", ")}.`);
  } else {
    reasonParts.push("Tus habilidades registradas todavía no coinciden de forma fuerte con las habilidades solicitadas.");
  }

  reasonParts.push(modalityScore > 0 ? "La modalidad es compatible con tu preferencia." : "La modalidad no coincide completamente con tu preferencia.");
  reasonParts.push(cityScore > 0 ? "La ubicación es compatible con tu perfil." : "La ubicación puede no ser la más conveniente según tu ciudad registrada.");
  reasonParts.push(seniorityScore > 0 ? "El nivel de experiencia es compatible con tu perfil." : "El nivel de experiencia solicitado puede estar por fuera de tu perfil actual.");
  reasonParts.push(salaryScore > 0 ? "Tu aspiración salarial está dentro del rango ofrecido." : "Tu aspiración salarial supera el rango ofrecido.");

  return {
    score,
    level,
    matchedSkills,
    explanation: reasonParts.join(" ")
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

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));
app.get("/dashboard.html", (_req, res) => res.sendFile(path.join(__dirname, "../frontend/dashboard.html")));
app.get("/forgot-password.html", (_req, res) => res.sendFile(path.join(__dirname, "../frontend/forgot-password.html")));
app.get("/reset-password.html", (_req, res) => res.sendFile(path.join(__dirname, "../frontend/reset-password.html")));

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, message: "Servidor y base de datos MySQL funcionando." });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Debes completar todos los campos." });
    if (password.length < 6) return res.status(400).json({ message: "La contraseña debe tener mínimo 6 caracteres." });

    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) return res.status(400).json({ message: "Ese correo ya está registrado." });

    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", [name, email, hash, "candidate"]);
    res.json({ message: "Usuario creado correctamente. Ahora puedes iniciar sesión." });
  } catch (error) {
    console.error("Error register:", error);
    res.status(500).json({ message: "Error al registrar usuario." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length) return res.status(401).json({ message: "Correo o contraseña incorrectos." });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Correo o contraseña incorrectos." });

    res.json({
      token: generateToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        cv_filename: user.cv_filename,
        cv_original_name: user.cv_original_name
      }
    });
  } catch (error) {
    console.error("Error login:", error);
    res.status(500).json({ message: "Error al iniciar sesión." });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  const [profileRows] = await db.query("SELECT * FROM profiles WHERE user_id = ?", [req.user.id]);
  const [userRows] = await db.query("SELECT id, name, email, cv_filename, cv_original_name FROM users WHERE id = ?", [req.user.id]);
  res.json({ profile: profileRows[0] || null, user: userRows[0] || null });
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    const {
      city, modality, seniority, salaryMin, roleTarget, availability,
      phone, profession, education, yearsExperience, experience, linkedin, github, skills
    } = req.body;

    await db.query(`
      INSERT INTO profiles
      (user_id, city, modality, seniority, salary_min, role_target, availability, phone, profession, education, years_experience, experience, linkedin, github, skills)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      city=VALUES(city),
      modality=VALUES(modality),
      seniority=VALUES(seniority),
      salary_min=VALUES(salary_min),
      role_target=VALUES(role_target),
      availability=VALUES(availability),
      phone=VALUES(phone),
      profession=VALUES(profession),
      education=VALUES(education),
      years_experience=VALUES(years_experience),
      experience=VALUES(experience),
      linkedin=VALUES(linkedin),
      github=VALUES(github),
      skills=VALUES(skills)
    `, [
      req.user.id, city, modality, seniority, Number(salaryMin || 0), roleTarget, availability,
      phone, profession, education, Number(yearsExperience || 0), experience, linkedin, github, skills
    ]);

    await addEvent(req.user.id, null, "PROFILE_UPDATED", "Actualizó su perfil profesional.");
    await addNotification(req.user.id, "Tu perfil fue actualizado correctamente.");
    res.json({ message: "Perfil guardado correctamente." });
  } catch (error) {
    console.error("Error profile:", error);
    res.status(500).json({ message: "Error al guardar perfil. Revisa que la base de datos tenga todas las columnas." });
  }
});

app.post("/api/upload-cv", requireAuth, upload.single("cv"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Debes seleccionar un archivo PDF." });

    const [oldRows] = await db.query("SELECT cv_filename FROM users WHERE id = ?", [req.user.id]);
    if (oldRows[0]?.cv_filename) {
      const oldPath = path.join(uploadDir, oldRows[0].cv_filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await db.query(
      "UPDATE users SET cv_filename = ?, cv_original_name = ? WHERE id = ?",
      [req.file.filename, req.file.originalname, req.user.id]
    );

    await addEvent(req.user.id, null, "CV_UPLOADED", "Subió o reemplazó su hoja de vida.");
    await addNotification(req.user.id, "Tu hoja de vida fue cargada correctamente.");

    res.json({
      message: "Hoja de vida cargada correctamente.",
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/uploads/${req.file.filename}`
    });
  } catch (error) {
    console.error("Error upload cv:", error);
    res.status(500).json({ message: "Error al subir hoja de vida." });
  }
});

app.get("/api/jobs", requireAuth, async (req, res) => {
  const { city, modality, seniority, skill, minSalary } = req.query;
  let sql = "SELECT * FROM jobs WHERE 1=1";
  const params = [];

  if (city) { sql += " AND city LIKE ?"; params.push(`%${city}%`); }
  if (modality) { sql += " AND modality = ?"; params.push(modality); }
  if (seniority) { sql += " AND seniority = ?"; params.push(seniority); }
  if (skill) { sql += " AND skills LIKE ?"; params.push(`%${skill}%`); }
  if (minSalary) { sql += " AND salary_max >= ?"; params.push(Number(minSalary)); }

  sql += " ORDER BY created_at DESC";
  const [jobs] = await db.query(sql, params);
  res.json(jobs);
});

app.get("/api/recommendations", requireAuth, async (req, res) => {
  try {
    const [profiles] = await db.query("SELECT * FROM profiles WHERE user_id = ?", [req.user.id]);
    if (!profiles.length) return res.status(400).json({ message: "Primero completa tu perfil para generar recomendaciones." });

    const [jobs] = await db.query("SELECT * FROM jobs ORDER BY created_at DESC");
    const recommendations = jobs
      .map((job) => ({ ...job, ...calculateMatch(profiles[0], job) }))
      .sort((a, b) => b.score - a.score);

    res.json(recommendations);
  } catch (error) {
    console.error("Error recommendations:", error);
    res.status(500).json({ message: "Error al generar recomendaciones." });
  }
});

app.get("/api/job-detail/:id", requireAuth, async (req, res) => {
  try {
    const [profiles] = await db.query("SELECT * FROM profiles WHERE user_id = ?", [req.user.id]);
    const [jobs] = await db.query("SELECT * FROM jobs WHERE id = ?", [req.params.id]);
    if (!jobs.length) return res.status(404).json({ message: "Vacante no encontrada." });

    const match = profiles.length ? calculateMatch(profiles[0], jobs[0]) : null;
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
  const [rows] = await db.query(`
    SELECT jobs.*
    FROM saved_jobs
    INNER JOIN jobs ON saved_jobs.job_id = jobs.id
    WHERE saved_jobs.user_id = ?
    ORDER BY saved_jobs.created_at DESC
  `, [req.user.id]);
  res.json(rows);
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
    const user = users[0];

    await addEvent(req.user.id, jobId, "APPLY", "Se postuló a una vacante.");
    await addNotification(req.user.id, `Tu postulación a ${job.title} fue enviada correctamente.`);

    const attachments = [];
    if (user.cv_filename) {
      attachments.push({
        filename: user.cv_original_name || user.cv_filename,
        path: path.join(uploadDir, user.cv_filename)
      });
    }

    const candidateHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h2 style="color:#4f46e5">Postulación enviada correctamente</h2>
        <p>Hola ${user.name},</p>
        <p>Tu postulación a la vacante <strong>${job.title}</strong> en <strong>${job.company}</strong> fue registrada exitosamente.</p>
        <p><strong>Estado inicial:</strong> Postulado</p>
        <p><strong>Ciudad:</strong> ${job.city}</p>
        <p><strong>Modalidad:</strong> ${job.modality}</p>
        <p>${user.cv_filename ? "Adjuntamos la hoja de vida que cargaste en la plataforma." : "Aún no tienes hoja de vida cargada. Puedes subirla desde tu perfil."}</p>
        <hr>
        <p style="font-size:13px;color:#6b7280">Profile Manager Magneto</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: `Postulación enviada - ${job.title}`,
      html: candidateHtml,
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
            <p><strong>Candidato:</strong> ${user.name}</p>
            <p><strong>Correo:</strong> ${user.email}</p>
            <p><strong>Vacante:</strong> ${job.title}</p>
            <p><strong>Empresa:</strong> ${job.company}</p>
            <p><strong>Mensaje del candidato:</strong> ${coverMessage || "Sin mensaje adicional."}</p>
          </div>
        `,
        attachments
      });
    }

    res.json({ message: `Tu postulación fue enviada correctamente a ${job.company}. Revisa tu correo.` });
  } catch (error) {
    console.error("Error apply:", error);
    res.status(500).json({ message: "No se pudo completar la postulación. Revisa SMTP y base de datos." });
  }
});

app.get("/api/applications", requireAuth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT applications.*, jobs.title, jobs.company, jobs.city, jobs.modality, jobs.seniority, jobs.salary_min, jobs.salary_max
    FROM applications
    INNER JOIN jobs ON applications.job_id = jobs.id
    WHERE applications.user_id = ?
    ORDER BY applications.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

app.get("/api/events", requireAuth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT events.*, jobs.title, jobs.company
    FROM events
    LEFT JOIN jobs ON events.job_id = jobs.id
    WHERE events.user_id = ?
    ORDER BY events.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  const [rows] = await db.query("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json(rows);
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
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: "El archivo supera el límite permitido." });
  }
  if (error.message === "Solo se permiten archivos PDF.") {
    return res.status(400).json({ message: error.message });
  }
  console.error("Error general:", error);
  res.status(500).json({ message: "Error interno del servidor." });
});

app.listen(PORT, async () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  try {
    await db.query("SELECT 1");
    console.log("Base de datos MySQL conectada correctamente.");
  } catch (error) {
    console.log("No se pudo conectar a MySQL:", error.message);
  }
});
