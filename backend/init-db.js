require("dotenv").config();
const mysql = require("mysql2/promise");

async function addColumn(connection, table, column, definition) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!rows.length) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  });

  const dbName = process.env.DB_NAME || "profilematch_magneto";
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.query(`USE \`${dbName}\``);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(30) DEFAULT 'candidate',
      cv_filename VARCHAR(255),
      cv_original_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumn(connection, "users", "role", "role VARCHAR(30) DEFAULT 'candidate'");
  await addColumn(connection, "users", "cv_filename", "cv_filename VARCHAR(255)");
  await addColumn(connection, "users", "cv_original_name", "cv_original_name VARCHAR(255)");

  await connection.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      city VARCHAR(100),
      modality VARCHAR(50),
      seniority VARCHAR(50),
      salary_min INT DEFAULT 0,
      role_target VARCHAR(150),
      availability VARCHAR(80),
      phone VARCHAR(50),
      profession VARCHAR(150),
      education VARCHAR(150),
      years_experience INT DEFAULT 0,
      experience TEXT,
      linkedin VARCHAR(255),
      github VARCHAR(255),
      skills TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      website VARCHAR(255),
      city VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      company VARCHAR(160) NOT NULL,
      city VARCHAR(100),
      modality VARCHAR(50),
      seniority VARCHAR(50),
      contract_type VARCHAR(80),
      area VARCHAR(100),
      salary_min INT DEFAULT 0,
      salary_max INT DEFAULT 0,
      skills TEXT,
      description TEXT,
      requirements TEXT,
      benefits TEXT,
      recruiter_email VARCHAR(160),
      company_id INT NULL,
      created_by INT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      deadline DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await addColumn(connection, "jobs", "company_id", "company_id INT NULL");
  await addColumn(connection, "jobs", "created_by", "created_by INT NULL");
  await addColumn(connection, "jobs", "is_active", "is_active BOOLEAN DEFAULT TRUE");
  await addColumn(connection, "jobs", "deadline", "deadline DATE NULL");
  await addColumn(connection, "jobs", "requirements", "requirements TEXT");
  await addColumn(connection, "jobs", "benefits", "benefits TEXT");
  await addColumn(connection, "jobs", "recruiter_email", "recruiter_email VARCHAR(160)");

  await connection.query(`
    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_saved_job (user_id, job_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id INT NOT NULL,
      status VARCHAR(50) DEFAULT 'Postulado',
      cover_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_application (user_id, job_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);

  await addColumn(connection, "applications", "cover_message", "cover_message TEXT");
  await addColumn(connection, "applications", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  await connection.query(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id INT,
      type VARCHAR(80) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const [jobCount] = await connection.query("SELECT COUNT(*) AS total FROM jobs");
  if (jobCount[0].total === 0) {
    await connection.query(`
      INSERT INTO jobs
      (title, company, city, modality, seniority, contract_type, area, salary_min, salary_max, skills, description, requirements, benefits, recruiter_email, is_active)
      VALUES
      ('Desarrolladora Frontend Junior','Magneto Tech','Medellín','Híbrido','Junior','Tiempo completo','Tecnología',2500000,3500000,'HTML,CSS,JavaScript,Git','Construcción de interfaces web modernas y mantenimiento de componentes frontend para productos digitales.','Conocimientos básicos en HTML, CSS, JavaScript, Git y buenas prácticas de desarrollo web.','Modelo híbrido, mentoría técnica, plan de formación y oportunidades de crecimiento.','reclutamiento@magnetotech.com',TRUE),
      ('Analista de Datos Junior','DataLab Colombia','Bogotá','Remoto','Junior','Tiempo completo','Datos',3000000,4500000,'SQL,Excel,Power BI,Python','Apoyo en tableros, análisis de información y generación de reportes para toma de decisiones.','Manejo de SQL, Excel, Power BI y fundamentos de análisis de datos.','Trabajo remoto, formación continua y acompañamiento de líderes de datos.','talento@datalab.co',TRUE),
      ('Backend Developer Node.js','InnovaSoft','Cali','Presencial','Mid','Indefinido','Tecnología',4500000,6500000,'Node,Express,MySQL,API,JavaScript','Desarrollo de APIs REST, integración con bases de datos y mantenimiento de servicios backend.','Experiencia con Node.js, Express, MySQL, autenticación y consumo de APIs.','Contrato indefinido, bonificaciones por desempeño y plan de carrera.','rrhh@innovasoft.com',TRUE),
      ('QA Tester Junior','QualityWorks','Medellín','Híbrido','Junior','Tiempo completo','Calidad',2200000,3200000,'Pruebas,Excel,SQL,Jira','Ejecución de pruebas funcionales, documentación de incidencias y apoyo al equipo de desarrollo.','Conocimientos básicos en pruebas de software, SQL, documentación y herramientas de seguimiento.','Capacitación, ambiente colaborativo y crecimiento hacia automatización.','seleccion@qualityworks.com',TRUE)
    `);
  }

  console.log("Base de datos MySQL lista correctamente con roles, reclutadores y vacantes publicables.");
  await connection.end();
}

main().catch((error) => {
  console.error("No se pudo inicializar la base de datos:", error.message);
  process.exit(1);
});
