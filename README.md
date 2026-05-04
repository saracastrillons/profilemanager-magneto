# Profile Manager Magneto

Portal web profesional de empleos con recomendaciones explicables.

## Funcionalidades

- Registro e inicio de sesión.
- Recuperación de contraseña por correo.
- Perfil profesional completo.
- Subida de hoja de vida PDF.
- Recomendaciones con porcentaje y explicación.
- Filtros de vacantes.
- Detalle completo de vacante.
- Guardar vacantes.
- Postulación profesional con correo al candidato y a la empresa.
- Historial de actividad.
- Notificaciones dentro de la app.
- Base de datos MySQL.

## Instalación

```bash
cd backend
npm install
cp .env.example .env
npm run init-db
npm start
```

Abrir:

```txt
http://localhost:3001
```

## MySQL

Entrar desde terminal:

```bash
/usr/local/mysql/bin/mysql -u profileuser -p
```

Contraseña sugerida:

```txt
Profile12345
```

## Importante

El archivo `.env` no debe subirse a GitHub.
Configura una contraseña de aplicación de Gmail para que funcionen los correos.
