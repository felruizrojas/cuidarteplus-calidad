#!/usr/bin/env python3
"""Genera los reportes HTML de las herramientas que no producen HTML por sí mismas.

  gitleaks   <reporte.json> <salida.html>
  hadolint   <salida.html> <Dockerfile=reporte.json> [...]
  sonarqube  <salida.html> --url URL --proyecto CLAVE [--usuario U --clave C] [--titulo T]
  codeql     <salida.html> --repo dueño/repo
  dependabot <salida.html> --repo dueño/repo
  indice     <carpeta_reportes>

Las consultas a GitHub usan la CLI `gh` si está disponible o la variable GITHUB_TOKEN.
"""
import base64, datetime, html, json, os, shutil, subprocess, sys, urllib.parse, urllib.request
from collections import Counter

AHORA = datetime.datetime.now().strftime("%d-%m-%Y %H:%M")
CSS = """
:root{--fondo:#f6f8fa;--borde:#d0d7de;--texto:#1f2328;--suave:#59636e;--azul:#1f5f8b;--rojo:#b42318;--naranja:#b54708;
--amarillo:#8a6100;--verde:#1a7f37;--gris:#57606a}
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:var(--fondo);color:var(--texto)}
header{background:var(--azul);color:#fff;padding:18px 28px}header h1{margin:0;font-size:22px}header p{margin:4px 0 0;opacity:.9;font-size:13px}
main{max-width:1200px;margin:0 auto;padding:20px 28px}
.tarjetas{display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 18px}.tarjeta{background:#fff;border:1px solid var(--borde);border-radius:8px;padding:10px 16px;min-width:130px}
.tarjeta b{display:block;font-size:24px}.tarjeta span{font-size:12px;color:var(--suave)}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--borde);font-size:13px}
th,td{border-bottom:1px solid var(--borde);padding:7px 9px;text-align:left;vertical-align:top}th{background:#eef3f8}
code{font-size:12px;background:#eef1f4;padding:1px 4px;border-radius:4px}
.sev{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:bold;color:#fff}
.critical,.CRITICAL,.error,.BLOCKER,.High,.high{background:var(--rojo)}.MAJOR,.Medium,.medium,.warning,.MEDIUM{background:var(--naranja)}
.MINOR,.Low,.low,.LOW,.info{background:var(--amarillo)}.INFO,.style,.Informational,.note{background:var(--gris)}
.ok{color:var(--verde);font-weight:bold}.mal{color:var(--rojo);font-weight:bold}
.caja{background:#fff;border:1px solid var(--borde);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;line-height:1.5}
footer{color:var(--suave);font-size:12px;padding:10px 28px 30px;max-width:1200px;margin:0 auto}
a{color:var(--azul)}
"""


def pagina(titulo, subtitulo, cuerpo, archivo):
    os.makedirs(os.path.dirname(os.path.abspath(archivo)), exist_ok=True)
    with open(archivo, "w", encoding="utf-8") as f:
        f.write(f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(titulo)}</title><style>{CSS}</style></head><body>
<header><h1>{html.escape(titulo)}</h1><p>{subtitulo} · generado el {AHORA}</p></header><main>{cuerpo}</main>
<footer>Cuidarte+ · ISY1102 · Reporte generado por scripts/reportes/generar_html.py a partir de la salida de la herramienta.</footer></body></html>""")
    print("reporte:", archivo)


def tarjetas(pares):
    return '<div class="tarjetas">' + "".join(f'<div class="tarjeta"><b>{v}</b><span>{html.escape(str(k))}</span></div>' for k, v in pares) + "</div>"


def tabla(columnas, filas):
    cab = "".join(f"<th>{html.escape(c)}</th>" for c in columnas)
    cuerpo = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in f) + "</tr>" for f in filas)
    return f"<table><thead><tr>{cab}</tr></thead><tbody>{cuerpo or '<tr><td colspan=99>Sin hallazgos</td></tr>'}</tbody></table>"


def sev(valor):
    v = html.escape(str(valor))
    return f'<span class="sev {v}">{v}</span>'


def guardar_json(salida_html, nombre, datos):
    ruta = os.path.join(os.path.dirname(os.path.abspath(salida_html)), nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)


# ------------------------------------------------------------------ GitHub API
def gh_api(ruta):
    if shutil.which("gh") and not os.environ.get("GITHUB_ACTIONS"):
        salida = subprocess.run(["gh", "api", "--paginate", ruta], capture_output=True, text=True)
        if salida.returncode != 0:
            raise RuntimeError(salida.stderr.strip())
        texto = salida.stdout.replace("][", ",")
        return json.loads(texto or "[]")
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("No hay gh ni GITHUB_TOKEN disponible")
    req = urllib.request.Request(f"https://api.github.com/{ruta}", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# ------------------------------------------------------------------ Gitleaks
def gitleaks(entrada, salida):
    datos = json.load(open(entrada, encoding="utf-8")) if os.path.getsize(entrada) else []
    filas = [[html.escape(h.get("RuleID", "")), f"<code>{html.escape(h.get('File', ''))}:{h.get('StartLine', '')}</code>",
              html.escape(h.get("Commit", "")[:7] or "-"), html.escape(h.get("Author", "") or "-"), html.escape(h.get("Match", "")[:90])] for h in datos]
    estado = '<span class="ok">✓ no leaks found</span>' if not datos else f'<span class="mal">✗ leaks found: {len(datos)}</span>'
    cuerpo = tarjetas([("secretos encontrados", len(datos)), ("reglas distintas", len({h.get('RuleID') for h in datos}))])
    cuerpo += f'<div class="caja"><b>Resultado:</b> {estado}<br>Comando: <code>gitleaks git . --redact -v --report-format json</code><br>'
    cuerpo += "Gitleaks revisa todo el historial de Git en busca de contraseñas, tokens y llaves (OWASP A07, ISO/IEC 27001 A.8.24). "
    cuerpo += "Los falsos positivos revisados por el equipo se registran en <code>.gitleaksignore</code>.</div>"
    cuerpo += tabla(["Regla", "Archivo:línea", "Commit", "Autor", "Coincidencia (con secreto oculto)"], filas)
    pagina("Gitleaks · Secretos en el historial de Git", "Actividad 1 · Etapa 1 del pipeline", cuerpo, salida)


# ------------------------------------------------------------------ Hadolint
def hadolint(salida, pares):
    filas, total = [], Counter()
    resumen = []
    for par in pares:
        nombre, archivo = par.split("=", 1)
        datos = json.load(open(archivo, encoding="utf-8")) if os.path.exists(archivo) and os.path.getsize(archivo) else []
        resumen.append((nombre, len(datos)))
        for h in datos:
            total[h["level"]] += 1
            filas.append([f"<code>{html.escape(nombre)}:{h['line']}</code>", html.escape(h["code"]), sev(h["level"]), html.escape(h["message"])])
    cuerpo = tarjetas([(f"advertencias en {n}", c) for n, c in resumen] + [("total", sum(c for _, c in resumen))])
    estado = '<span class="ok">✓ Dockerfiles aprobados (sin advertencias)</span>' if not filas else '<span class="mal">✗ Hay advertencias</span>'
    cuerpo += f'<div class="caja"><b>Resultado:</b> {estado}<br>Comando: <code>hadolint --format json Dockerfile</code> (imagen hadolint/hadolint:v2.12.0)<br>'
    cuerpo += "Hadolint revisa las buenas prácticas de los Dockerfiles: versiones fijas, usuario sin privilegios y comandos de shell seguros (OWASP A05, CIS Docker Benchmark).</div>"
    cuerpo += tabla(["Archivo:línea", "Regla", "Nivel", "Mensaje"], filas)
    pagina("Hadolint · Revisión de Dockerfiles", "Actividad 1 · Etapa 1 del pipeline", cuerpo, salida)


# ------------------------------------------------------------------ SonarQube
def sonarqube(salida, url, proyecto, usuario=None, clave=None, titulo=None):
    def api(ruta):
        req = urllib.request.Request(f"{url.rstrip('/')}/api/{ruta}")
        if usuario:
            req.add_header("Authorization", "Basic " + base64.b64encode(f"{usuario}:{clave or ''}".encode()).decode())
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    q = urllib.parse.quote
    gate = api(f"qualitygates/project_status?projectKey={q(proyecto)}")["projectStatus"]
    metricas = "alert_status,bugs,vulnerabilities,security_hotspots,code_smells,coverage,duplicated_lines_density,ncloc,security_rating,reliability_rating,sqale_rating"
    medidas = {m["metric"]: m.get("value", "-") for m in api(f"measures/component?component={q(proyecto)}&metricKeys={metricas}")["component"]["measures"]}
    letra = {"1.0": "A", "2.0": "B", "3.0": "C", "4.0": "D", "5.0": "E"}
    issues = api(f"issues/search?componentKeys={q(proyecto)}&ps=500&issueStatuses=OPEN,CONFIRMED,ACCEPTED")["issues"]
    filas = []
    for i in sorted(issues, key=lambda x: (x.get("issueStatus", ""), x.get("type", ""), x["component"])):
        imp = ", ".join(f"{p['softwareQuality'].title()}: {p['severity']}" for p in i.get("impacts", [])) or i.get("severity", "")
        filas.append([html.escape(i.get("type", "")), sev(i.get("severity", "")), f"<code>{html.escape(i['component'].split(':', 1)[-1])}:{i.get('line', '-')}</code>",
                      html.escape(i["rule"]), html.escape(i["message"]), html.escape(imp), html.escape(i.get("issueStatus", ""))])
    estado = f'<span class="{"ok" if gate["status"] == "OK" else "mal"}">{"✓ Quality Gate aprobada" if gate["status"] == "OK" else "✗ Quality Gate no aprobada"}</span>'
    cond = tabla(["Condición", "Estado", "Valor", "Umbral"], [[html.escape(c["metricKey"]), html.escape(c["status"]), html.escape(str(c.get("actualValue", "-"))), html.escape(str(c.get("errorThreshold", "-")))] for c in gate.get("conditions", [])])
    cuerpo = tarjetas([("Quality Gate", gate["status"]), ("Bugs", medidas.get("bugs")), ("Vulnerabilidades", medidas.get("vulnerabilities")),
                       ("Code smells", medidas.get("code_smells")), ("Cobertura %", medidas.get("coverage", "-")), ("Duplicación %", medidas.get("duplicated_lines_density")),
                       ("Seguridad", letra.get(medidas.get("security_rating"), "-")), ("Fiabilidad", letra.get(medidas.get("reliability_rating"), "-")),
                       ("Mantenibilidad", letra.get(medidas.get("sqale_rating"), "-")), ("Líneas de código", medidas.get("ncloc"))])
    cuerpo += f'<div class="caja"><b>Resultado:</b> {estado} · Servidor: <a href="{html.escape(url)}/dashboard?id={html.escape(proyecto)}">{html.escape(url)}</a> · Proyecto <code>{html.escape(proyecto)}</code><br>'
    cuerpo += "SonarQube analiza el código sin ejecutarlo (SAST) y clasifica los hallazgos por fiabilidad, seguridad y mantenibilidad (ISO/IEC 25010, OWASP Top 10, CWE).</div>"
    cuerpo += "<h3>Condiciones de la Quality Gate</h3>" + cond + f"<h3>Hallazgos ({len(issues)})</h3>"
    cuerpo += tabla(["Tipo", "Severidad", "Archivo:línea", "Regla", "Mensaje", "Impacto", "Estado"], filas)
    pagina(titulo or f"SonarQube · {proyecto}", "Actividades 2 y 4 · Análisis estático y Quality Gate", cuerpo, salida)


# ------------------------------------------------------------------ CodeQL
def codeql(salida, repo):
    alertas = gh_api(f"repos/{repo}/code-scanning/alerts?state=open&per_page=100")
    guardar_json(salida, "alertas.json", alertas)
    analisis = gh_api(f"repos/{repo}/code-scanning/analyses?per_page=5")
    por_regla = Counter((a["rule"]["id"], a["rule"].get("security_severity_level") or a["rule"]["severity"], a["rule"]["description"]) for a in alertas)
    sev_cont = Counter(a["rule"].get("security_severity_level") or a["rule"]["severity"] for a in alertas)
    filas = [[f"#{a['number']}", sev(a['rule'].get('security_severity_level') or a['rule']['severity']), html.escape(a["rule"]["id"]),
              f"<code>{html.escape(a['most_recent_instance']['location']['path'])}:{a['most_recent_instance']['location']['start_line']}</code>",
              html.escape(", ".join(t.replace("external/cwe/", "").upper() for t in a["rule"].get("tags", []) if "cwe" in t))] for a in alertas]
    ult = analisis[0] if analisis else {}
    cuerpo = tarjetas([("alertas abiertas", len(alertas))] + [(f"severidad {k}", v) for k, v in sev_cont.items()])
    cuerpo += f'<div class="caja">Último análisis: <code>{html.escape(ult.get("tool", {}).get("name", ""))} {html.escape(ult.get("tool", {}).get("version", ""))}</code> · commit <code>{html.escape(ult.get("commit_sha", "")[:7])}</code> · {html.escape(ult.get("created_at", ""))}<br>'
    cuerpo += "CodeQL (configuración Default de GitHub) sigue el flujo de los datos desde la entrada del usuario hasta operaciones sensibles. Se ejecuta en cada push, en cada Pull Request y semanalmente.</div>"
    cuerpo += "<h3>Alertas por regla</h3>" + tabla(["Regla", "Severidad", "Descripción", "Cantidad"], [[html.escape(r), sev(s), html.escape(d), n] for (r, s, d), n in por_regla.most_common()])
    cuerpo += "<h3>Detalle</h3>" + tabla(["#", "Severidad", "Regla", "Ubicación", "CWE"], filas)
    pagina("GitHub CodeQL · Code scanning", f"Actividad 2 · Repositorio {repo}", cuerpo, salida)


# ------------------------------------------------------------------ Dependabot
def dependabot(salida, repo):
    alertas = gh_api(f"repos/{repo}/dependabot/alerts?state=open&per_page=100")
    # Se guarda solo lo necesario: las descripciones de los avisos incluyen ejemplos de credenciales ficticias
    guardar_json(salida, "alertas.json", [{
        "number": a["number"], "state": a["state"],
        "dependency": {"package": {"name": a["dependency"]["package"]["name"]}, "manifest_path": a["dependency"]["manifest_path"]},
        "security_advisory": {k: a["security_advisory"].get(k) for k in ("severity", "cve_id", "ghsa_id", "summary")},
        "security_vulnerability": {"first_patched_version": (a.get("security_vulnerability") or {}).get("first_patched_version")},
    } for a in alertas])
    prs = gh_api(f"repos/{repo}/pulls?state=open&per_page=100")
    prs = [p for p in prs if p["user"]["login"].startswith("dependabot")]
    orden = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    sev_cont = Counter(a["security_advisory"]["severity"] for a in alertas)
    filas = [[sev(a["security_advisory"]["severity"]), html.escape(a["dependency"]["package"]["name"]), f"<code>{html.escape(a['dependency']['manifest_path'])}</code>",
              html.escape(a["security_advisory"].get("cve_id") or a["security_advisory"]["ghsa_id"]), html.escape(a["security_advisory"]["summary"]),
              html.escape((a.get("security_vulnerability", {}).get("first_patched_version") or {}).get("identifier", "-"))]
             for a in sorted(alertas, key=lambda x: orden.get(x["security_advisory"]["severity"], 9))]
    cuerpo = tarjetas([("alertas abiertas", len(alertas))] + [(k, sev_cont.get(k, 0)) for k in ["critical", "high", "medium", "low"]] + [("Pull Requests de Dependabot", len(prs))])
    cuerpo += '<div class="caja">Dependabot compara las dependencias npm, las imágenes base de Docker y las acciones del pipeline con las bases de datos públicas de vulnerabilidades (OWASP A06, ISO/IEC 27001 A.8.8) y propone actualizaciones mediante Pull Requests que pasan por todo el pipeline antes de aceptarse.</div>'
    cuerpo += "<h3>Alertas</h3>" + tabla(["Severidad", "Paquete", "Manifiesto", "CVE / GHSA", "Resumen", "Versión corregida"], filas)
    cuerpo += "<h3>Pull Requests abiertos</h3>" + tabla(["#", "Título"], [[f"#{p['number']}", f'<a href="{html.escape(p["html_url"])}">{html.escape(p["title"])}</a>'] for p in prs])
    pagina("Dependabot · Dependencias vulnerables", f"Actividad 1 · Repositorio {repo}", cuerpo, salida)



# ------------------------------------------------------------------ Resumen por caso de prueba
CASOS = [
    ("CP-01", "Autenticación de usuario", "Funcional – Sistema", "Playwright"),
    ("CP-02", "Registrar paciente", "Funcional – Sistema", "Playwright"),
    ("CP-03", "Adjuntar documento en formato permitido", "Funcional – Sistema", "Playwright"),
    ("CP-04", "Storage interno con referencia en BD", "Funcional – Integración", "Jest + Supertest"),
    ("CP-05", "Sesión JWT, logout y revocación", "No funcional – Seguridad", "Jest + Supertest"),
    ("CP-06", "Tiempo de respuesta CRUD < 300 ms", "No funcional – Rendimiento", "k6"),
    ("CP-07", "Evaluación heurística del flujo del paciente", "No funcional – Usabilidad", "Playwright + heurísticas de Nielsen"),
    ("CP-08", "Legibilidad, contraste y controles (WCAG 2.1 AA)", "No funcional – Usabilidad", "Playwright + axe-core"),
    ("CP-09", "Mensajes de error y recuperación", "No funcional – Usabilidad", "Playwright"),
    ("CP-10", "Protección contra XSS, SQLi, CSRF y validación", "No funcional – Seguridad", "OWASP ZAP + Playwright"),
    ("CP-11", "Control de acceso por rol en el backend", "No funcional – Seguridad", "Jest + Supertest"),
    ("CP-12", "TLS y cifrado de datos en reposo", "No funcional – Seguridad", "Playwright + Docker CLI"),
    ("CP-13", "Política de contraseñas y hashing", "No funcional – Seguridad", "Jest + Supertest"),
    ("CP-14", "Auditoría de acciones críticas", "Funcional – Integración", "Jest + Supertest"),
    ("CP-15", "Carga móvil < 2 s y 200 usuarios concurrentes", "No funcional – Rendimiento", "k6 + Playwright"),
    ("CP-16", "Autorregistro con rol paciente", "Funcional – Sistema", "Playwright"),
    ("CP-17", "Editar y visualizar paciente", "Funcional – Sistema", "Playwright"),
    ("CP-18", "Administración de usuarios y roles", "Funcional – Sistema", "Playwright"),
    ("CP-19", "Registrar examen médico", "Funcional – Sistema", "Playwright"),
    ("CP-20", "Editar y eliminar examen o documento", "Funcional – Sistema", "Playwright"),
    ("CP-21", "Paciente visualiza y descarga en ≤ 10 s", "Funcional – Sistema", "Playwright"),
    ("CP-22", "Flujo de acceso paciente → exámenes", "No funcional – Usabilidad", "Playwright"),
    ("CP-23", "Gestión segura de logs y errores", "No funcional – Seguridad", "Jest + Supertest"),
    ("CP-24", "Respaldo, restauración y migración", "No funcional – Seguridad", "Jest + pg_dump/pg_restore"),
    ("CP-25", "Checklist normativa de protección de datos", "No funcional – Seguridad", "Playwright + checklist"),
    ("CP-26", "Compatibilidad con navegadores modernos", "No funcional – Usabilidad", "Playwright (Chrome, Edge, Firefox, WebKit)"),
    ("CP-27", "Análisis estático (SAST) y de dependencias", "No funcional – Seguridad", "SonarQube + CodeQL + Dependabot + Gitleaks + Hadolint"),
    ("CP-28", "Recuperación tras reinicio del backend", "No funcional – Rendimiento", "Playwright + Docker CLI"),
    ("CP-29", "Unitarias: validación de datos del paciente", "Funcional – Unitaria", "Jest"),
    ("CP-30", "Unitarias: registro y política de contraseñas", "Funcional – Unitaria", "Jest"),
    ("CP-31", "Unitarias: exámenes y middleware de validación", "Funcional – Unitaria", "Jest"),
    ("CP-32", "Aceptación: paciente consulta y descarga", "Funcional – Aceptación", "Playwright"),
    ("CP-33", "Aceptación: médico registra paciente, examen y documento", "Funcional – Aceptación", "Playwright"),
    ("CP-34", "Aceptación: administrador gestiona usuarios y auditoría", "Funcional – Aceptación", "Playwright"),
]


def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def resumen_casos(carpeta):
    """Devuelve {CP: {"total", "aprobadas", "no_aprobadas", "sin_ejecutar", "incidencias"}} a partir de los resultados."""
    import re
    r = {c[0]: {"total": 0, "aprobadas": 0, "no_aprobadas": 0, "sin_ejecutar": 0, "incidencias": set()} for c in CASOS}

    def anotar(titulo, aprobada, ejecutada=True):
        m = re.search(r"CP-\d{2}", titulo)
        if not m or m.group(0) not in r:
            return
        d = r[m.group(0)]
        d["total"] += 1
        if not ejecutada:
            d["sin_ejecutar"] += 1
        elif aprobada:
            d["aprobadas"] += 1
        else:
            d["no_aprobadas"] += 1
            d["incidencias"].update(re.findall(r"INC-\d{2}", titulo))

    jest = _leer(os.path.join(carpeta, "jest", "resultados.json"))
    for suite in (jest or {}).get("testResults", []):
        for t in suite.get("assertionResults", []):
            esperado_falla = "(INC-" in t["title"]
            anotar(t["title"], t["status"] == "passed" and not esperado_falla)

    pw = _leer(os.path.join(carpeta, "playwright-resultados.json"))
    def recorrer(suite):
        for spec in suite.get("specs", []):
            for t in spec.get("tests", []):
                if t.get("projectName") == "preparacion":
                    continue
                res = t["results"][-1] if t.get("results") else {}
                estado = res.get("status", "skipped")
                titulo = spec["title"]
                if "CP-26" in titulo:
                    titulo = f"{titulo} [{t.get('projectName')}]"
                if estado == "skipped":
                    anotar(titulo, False, ejecutada=False)
                else:
                    anotar(titulo, t.get("expectedStatus") == "passed" and estado == "passed")
        for s2 in suite.get("suites", []):
            recorrer(s2)
    for suite in (pw or {}).get("suites", []):
        recorrer(suite)

    k6a = _leer(os.path.join(carpeta, "k6", "cp06-crud-resumen.json"))
    if k6a:
        for op in ["listar_pacientes", "crear_examen", "leer_examen", "actualizar_examen", "eliminar_examen"]:
            m = k6a["metrics"].get(f"http_req_duration{{op:{op},medida:si}}", {})
            anotar(f"CP-06 {op}", all(t.get("ok") for t in m.get("thresholds", {}).values()) if m.get("thresholds") else False)
    k6b = _leer(os.path.join(carpeta, "k6", "cp15-concurrencia-resumen.json"))
    if k6b:
        for clave, nombre in [("http_req_failed{esc:api}", "API sin errores"), ("http_req_failed{esc:web}", "frontend sin errores"), ("http_req_duration{esc:api}", "p95 API < 300 ms (INC-40)")]:
            m = k6b["metrics"].get(clave, {})
            anotar(f"CP-15 {nombre}", all(t.get("ok") for t in m.get("thresholds", {}).values()) if m.get("thresholds") else False)

    dep = _leer(os.path.join(carpeta, "dependabot", "alertas.json"))
    cq = _leer(os.path.join(carpeta, "codeql", "alertas.json"))
    if dep is not None:
        for parte in ["BACKEND", "FRONTEND"]:
            graves = [a for a in dep if a["dependency"]["manifest_path"].startswith(parte) and a["security_advisory"]["severity"] in ("critical", "high")]
            anotar(f"CP-27 Dependabot {parte} sin críticas ni altas (INC-37)", not graves)
    if cq is not None:
        altas = [a for a in cq if (a["rule"].get("security_severity_level") or "") in ("critical", "high")]
        anotar("CP-27 SonarQube y CodeQL sin hallazgos de severidad alta (INC-31)", not altas)
    for d in r.values():
        d["incidencias"] = sorted(d["incidencias"])
    return r


def tabla_casos(carpeta):
    r = resumen_casos(carpeta)
    with open(os.path.join(carpeta, "resumen-casos.json"), "w", encoding="utf-8") as f:
        json.dump({"generado": AHORA, "casos": r}, f, ensure_ascii=False, indent=1)
    filas, tot = [], Counter()
    for cp, nombre, tipo, herr in CASOS:
        d = r[cp]
        for k in ("total", "aprobadas", "no_aprobadas", "sin_ejecutar"):
            tot[k] += d[k]
        if d["total"] == 0:
            estado = '<span class="mal">sin resultados</span>'
        elif d["no_aprobadas"] == 0:
            estado = '<span class="ok">Aprobado</span>' + (" con observación" if d["sin_ejecutar"] else "")
        else:
            estado = '<span class="mal">No aprobado</span>'
            tot["casos_no"] += 1
        if d["total"] and d["no_aprobadas"] == 0:
            tot["casos_ok"] += 1
        sin = f" ({d['sin_ejecutar']} sin ejecutar)" if d["sin_ejecutar"] else ""
        filas.append([cp, html.escape(nombre), html.escape(tipo), html.escape(herr), f"{d['aprobadas']} de {d['total']}{sin}", estado, ", ".join(d["incidencias"]) or "—"])
    cab = tarjetas([("casos de prueba", len(CASOS)), ("casos aprobados", tot["casos_ok"]), ("casos no aprobados", tot["casos_no"]),
                    ("verificaciones", tot["total"]), ("verificaciones aprobadas", tot["aprobadas"]), ("no aprobadas (defectos)", tot["no_aprobadas"])])
    return cab + tabla(["Caso", "Nombre", "Tipo", "Herramienta", "Verificaciones aprobadas", "Resultado", "Incidencias"], filas)

# ------------------------------------------------------------------ Índice
def indice(carpeta):
    def existe(r):
        return os.path.exists(os.path.join(carpeta, r))
    entradas = [
        ("Actividad 1", "Gitleaks", "Secretos en el historial de Git", "gitleaks/index.html"),
        ("Actividad 1", "Hadolint", "Buenas prácticas en Dockerfiles", "hadolint/index.html"),
        ("Actividad 1", "Dependabot", "Dependencias e imágenes vulnerables", "dependabot/index.html"),
        ("Actividad 2", "SonarQube (local)", "Análisis estático, cobertura y Quality Gate", "sonarqube/local.html"),
        ("Actividad 4", "SonarQube Cloud", "Quality Gate del pipeline", "sonarqube/cloud.html"),
        ("Actividad 2", "CodeQL", "Análisis de seguridad por flujo de datos", "codeql/index.html"),
        ("Actividad 2", "Jest + Supertest", "Pruebas unitarias, de integración y de seguridad de la API", "jest/index.html"),
        ("Actividad 2", "Jest · cobertura", "Cobertura de código del backend (Istanbul)", "jest/cobertura/index.html"),
        ("Actividad 3", "Playwright + axe-core", "Sistema, aceptación, seguridad, usabilidad, accesibilidad y resiliencia", "playwright/index.html"),
        ("Actividad 3", "k6 · CP-06", "Tiempo de respuesta CRUD con carga normal", "k6/cp06-crud.html"),
        ("Actividad 3", "k6 · CP-15", "200 usuarios concurrentes", "k6/cp15-concurrencia.html"),
        ("Actividad 3", "OWASP ZAP · sitio web", "Seguridad dinámica (DAST) del frontend", "zap/zap-web.html"),
        ("Actividad 3", "OWASP ZAP · API", "Seguridad dinámica (DAST) de la API (OpenAPI)", "zap/zap-api.html"),
    ]
    filas = []
    for act, nombre, desc, ruta in entradas:
        ok = existe(ruta)
        enlace = f'<a href="{ruta}">{html.escape(nombre)}</a>' if ok else html.escape(nombre)
        filas.append([act, enlace, html.escape(desc), '<span class="ok">✓ generado</span>' if ok else '<span class="mal">— no generado en esta ejecución</span>'])
    cuerpo = '<div class="caja">Cada herramienta de calidad y seguridad genera su propio reporte HTML al ejecutar las pruebas '
    cuerpo += "(<code>./ejecutar-pruebas.sh</code> en local o el pipeline <code>.github/workflows/ci.yml</code> en GitHub Actions). "
    cuerpo += "Esta página reúne los enlaces a todos los reportes de la última ejecución.</div>"
    cuerpo += tabla(["Actividad", "Herramienta", "Qué evalúa", "Estado"], filas)
    cuerpo += "<h3>Resultado por caso de prueba (CP-01 a CP-34)</h3>"
    cuerpo += '<div class="caja">Cada caso se compone de varias verificaciones (una por resultado esperado de su ficha). Un caso se aprueba solo si se cumplen todas. Las verificaciones no aprobadas corresponden a defectos registrados (INC-xx); en las pruebas se marcan como <i>falla esperada</i> para que el pipeline detecte cuando se corrijan.</div>'
    cuerpo += tabla_casos(carpeta)
    pagina("Cuidarte+ · Reportes de calidad y seguridad", "Índice de reportes HTML", cuerpo, os.path.join(carpeta, "index.html"))


def main(a):
    if not a:
        print(__doc__); sys.exit(1)
    cmd, resto = a[0], a[1:]
    opts = {}
    pos = []
    i = 0
    while i < len(resto):
        if resto[i].startswith("--"):
            opts[resto[i][2:]] = resto[i + 1]; i += 2
        else:
            pos.append(resto[i]); i += 1
    if cmd == "gitleaks": gitleaks(pos[0], pos[1])
    elif cmd == "hadolint": hadolint(pos[0], pos[1:])
    elif cmd == "sonarqube": sonarqube(pos[0], opts["url"], opts["proyecto"], opts.get("usuario"), opts.get("clave"), opts.get("titulo"))
    elif cmd == "codeql": codeql(pos[0], opts["repo"])
    elif cmd == "dependabot": dependabot(pos[0], opts["repo"])
    elif cmd == "indice": indice(pos[0])
    else: print(__doc__); sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
