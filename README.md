# Bienvenido/a

Este proyecto fue desarrollado para la asignatura ISY1102 - Calidad y seguridad en el desarrollo de software. En este repositorio se incluye un Frontend y Backend asociados al Caso A de la asignatura llamado "Sistema de Gestión Cuidarte+".

Cuidarte+ permitirá a médicos registrar pacientes y exámenes médicos, a pacientes visualizar su información clínica y a administradores supervisar, auditar y administrar usuarios y datos del sistema, adicionalmente se debe garantizar el cumplimiento de normativa de protección de datos y estándares de seguridad.

Este proyecto está pensando para ser utilizado de las siguientes maneras:
 - Podrás inicializar el backend y frontend por separado y según tu lo requieras
 - Podrás efectuar análisis de código estático para frontend y backend.
 - Podrás efectuar análisis de código dinámico al levantar ambos servicios.
 - Utilizar docker en lugar de levantar manualmente cada servicio ya que se incluye una imagen para el proyecto completo que inicializa y configura cada elemento del software construido.
 

## Estructura

Abre el proyecto mediante terminal o editor de código de preferencia Visual Studio Code. El software tiene la siguiente estructura de carpetas y archivos
 
```
root
	|/BACKEND
	|/FRONTEND
	|.env
	|.gitignore
	|docker-compose.yml
	|package.json
	|README.md
```
En el archivo `.env` se definen las variables de entorno que utilizará docker al momento de crear las imágenes, por lo que puedes modificarlas en el caso de tener otros servicios corriendo en tu equipo que utilicen los mismos puertos.

1. JWT_SECRET: llave utilizada para firmar los tokens de sesión. Su valor se define en el archivo `.env` (ver `.env.example`) y nunca se publica.
2. PORT_POSTGRES: `15443` Puerto expuesto que utilizará tu equipo para permitir acceder a la conexión a la base de datos
3. PORT_BACKEND: `4445` Puerto expuesto que utilizará tu equipo para acceder a la API
4. PORT_FRONTEND: `3334` Puerto expuesto que utilizará tu equipo para acceder al cliente - frontend

## Inicialización con Docker
Abre la terminal y situate en la raíz del proyecto y ejecuta el comando:

1. Ejecuta `docker-compose up -d` para levantar todos los servicios
2. El frontend estará disponible en `http://localhost:3333` (o el puerto configurado en .env)
3. El backend estará disponible en `http://localhost:4445` (o el puerto configurado en .env)
4. La base de datos estará disponible para conectarse mediante:
	4.1 Host: `localhost`
	4.2 Port: `15443 `(o el configurado en .env)
	4.3 Database: `cuidarteplus`
	4.4 Nombre de usuario: `postgres`
	4.5 Contraseña: `postgres`

## Aseguramiento de calidad y seguridad (EP5)

Las pruebas automatizadas cubren los 34 casos de prueba del plan (CP-01 a CP-34) con las herramientas de las cuatro actividades:

| Etapa | Herramienta | Qué verifica | Reporte HTML |
|---|---|---|---|
| Secretos | Gitleaks | Contraseñas y tokens en todo el historial de Git | `reportes/gitleaks/index.html` |
| Contenedores | Hadolint | Buenas prácticas en los Dockerfiles | `reportes/hadolint/index.html` |
| Dependencias | Dependabot | Librerías e imágenes con vulnerabilidades | `reportes/dependabot/index.html` |
| Código | SonarQube (local y Cloud) | Análisis estático, cobertura y Quality Gate | `reportes/sonarqube/*.html` |
| Código | CodeQL | Vulnerabilidades por flujo de datos | `reportes/codeql/index.html` |
| Unitarias, integración y API | Jest + Supertest | CP-04, 05, 11, 13, 14, 23, 24, 29, 30 y 31 | `reportes/jest/index.html` y `reportes/jest/cobertura/` |
| Sistema, aceptación, usabilidad | Playwright + axe-core | CP-01–03, 07–10, 12, 15–22, 25, 26, 28, 32–34 | `reportes/playwright/index.html` |
| Rendimiento | k6 | CP-06 (CRUD) y CP-15 (200 usuarios) | `reportes/k6/*.html` |
| Seguridad dinámica | OWASP ZAP | Sitio web y API (OpenAPI) | `reportes/zap/*.html` |

**Ejecutar todo en local** (requiere Docker, Node.js 20+, Python 3 y la CLI `gh`):

```bash
cp .env.example .env            # completar JWT_SECRET
./sonar.sh up                   # opcional: SonarQube local en http://localhost:9000
./ejecutar-pruebas.sh           # genera reportes/index.html con todos los reportes
```

**Pipeline CI/CD** (`.github/workflows/ci.yml`): en cada push y Pull Request ejecuta Gitleaks y Hadolint → Jest + SonarQube Cloud → ZAP, Playwright y k6 sobre el sistema en Docker → publica las imágenes en GHCR (solo en `main`) y reúne todos los reportes en el artefacto `reportes-html`. La rama `main` está protegida: exige Pull Request y que todos los checks aprueben.

Los defectos conocidos se registran como pruebas de *falla esperada* con su identificador (INC-xx): el pipeline sigue en verde mientras el defecto exista y avisa cuando alguien lo corrige.
