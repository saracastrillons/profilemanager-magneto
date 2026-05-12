# ProfileMatch Magneto

ProfileMatch Magneto es una plataforma web de empleabilidad que conecta candidatos y reclutadores mediante un sistema de recomendaciones explicable basado en reglas.

La aplicación permite a los candidatos completar su perfil profesional, cargar su hoja de vida, recibir recomendaciones personalizadas de vacantes y realizar postulaciones. Los reclutadores pueden registrar su empresa, publicar vacantes, visualizar candidatos y gestionar el estado de las postulaciones.

## Demo en producción

https://profilematch-magneto-production.up.railway.app

## Funcionalidades principales

### Autenticación y seguridad
- Registro de candidatos y reclutadores.
- Inicio de sesión con JWT.
- Recuperación de contraseña por correo electrónico.
- Contraseñas cifradas con bcrypt.

### Perfil profesional
- Información personal y profesional.
- Habilidades técnicas.
- Ciudad, modalidad y nivel de experiencia.
- Aspiración salarial.
- Carga de hoja de vida (CV).

### Recomendador explicable
- Cálculo de porcentaje de compatibilidad.
- Clasificación en compatibilidad alta, media o baja.
- Explicación detallada de la recomendación.
- Habilidades que el usuario ya cumple.
- Habilidades por fortalecer.

### Gestión de vacantes
- Publicación de vacantes por reclutadores.
- Filtros por ciudad, modalidad, salario y habilidades.
- Visualización de detalle de vacantes.
- Guardado de vacantes favoritas.

### Postulaciones
- Envío de postulaciones con mensaje personalizado.
- Seguimiento del estado del proceso.
- Estados: Postulado, En revisión, Entrevista, Seleccionado y Descartado.

### Notificaciones internas
- Notificaciones profesionales con iconos y colores.
- Marcado como leídas.
- Eliminación de notificaciones.
- Navegación al detalle relacionado.

### Historial de actividad
- Registro de vistas, guardados, postulaciones y actualizaciones.

### Correos electrónicos
- Recuperación de contraseña.
- Confirmación de postulaciones.
- Notificación al reclutador.
- Adjuntar hoja de vida al correo del reclutador.

## Arquitectura del sistema

El proyecto implementa una arquitectura cliente-servidor con separación entre frontend, backend y base de datos.

### Frontend
- HTML5
- CSS3
- JavaScript Vanilla

### Backend
- Node.js
- Express.js

### Base de datos
- MySQL

### Servicios y librerías
- JWT
- bcryptjs
- multer
- dotenv
- cors
- Resend

### Despliegue
- Railway

## Patrones y principios aplicados
- MVC (Model-View-Controller)
- Repository Pattern
- Strategy Pattern
- Observer Pattern
- Programación Orientada a Objetos
- Principios SOLID

## Estructura del proyecto

```text
backend/
├── server.js
├── init-db.js
├── package.json
├── uploads/

frontend/
├── index.html
├── dashboard.html
├── reset-password.html
├── app.js
├── style.css
├── assets/

README.md
```

## Instalación local

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

Abrir `frontend/index.html` o acceder al backend si sirve los archivos estáticos.

## Variables de entorno

```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=profilematch_magneto

JWT_SECRET=tu_jwt_secret

RESEND_API_KEY=tu_api_key
EMAIL_FROM=ProfileMatch Magneto <onboarding@resend.dev>

APP_URL=https://profilematch-magneto-production.up.railway.app
```

## Sistema de recomendación

El algoritmo de recomendación evalúa:

- Coincidencia de habilidades.
- Modalidad de trabajo.
- Ciudad.
- Seniority.
- Aspiración salarial.

El sistema genera:

- Score de compatibilidad (0 a 100).
- Nivel de compatibilidad.
- Razones explicativas.
- Habilidades faltantes.

## Autores

- Sara Castrillón Sánchez
- Alejandro Cadavid

## Observaciones

El sistema fue desarrollado con un enfoque académico y profesional, priorizando la explicabilidad, la experiencia de usuario y una arquitectura modular alineada con buenas prácticas de ingeniería de software.