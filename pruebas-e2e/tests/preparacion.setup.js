// Preparación de datos ficticios para las pruebas (se ejecuta antes que todas las demás).
// Es idempotente: si los datos ya existen, no los duplica.
const { test: setup, expect } = require("@playwright/test");
const { USUARIOS, TIPO, CLAVE_QA, nuevaApi, token, auth, crearExamen, subirDocumento } = require("./apoyo");

async function asegurarUsuario(api, tAdmin, nombre, rolId) {
  if (await token(api, nombre, CLAVE_QA)) return;
  const r = await api.post("/usuarios", { headers: auth(tAdmin), data: { nombre_usuario: nombre, contrasena_hash: CLAVE_QA, correo: `${nombre}@correo.cl`, rol_id: rolId } });
  expect(r.status()).toBe(201);
}

async function asegurarExamenes(api, tMedico, pacienteId) {
  const r = await api.get(`/examenes/paciente/${pacienteId}`, { headers: auth(tMedico) });
  const examenes = await r.json();
  const tiene = (tipo) => examenes.find((e) => Number(e.tipo_examen_medico_id) === tipo);
  if (!tiene(TIPO.electrocardiograma)) {
    const ecg = await crearExamen(api, tMedico, pacienteId, TIPO.electrocardiograma, "Ritmo sinusal normal");
    await subirDocumento(api, tMedico, ecg.body.id, pacienteId, "ecg_resultado.pdf");
  }
  if (!tiene(TIPO.glicemia)) await crearExamen(api, tMedico, pacienteId, TIPO.glicemia, "Glicemia en rango normal");
}

setup("Preparar cuentas y exámenes ficticios", async () => {
  const api = await nuevaApi();
  const tAdmin = await token(api, "admin", "admin");
  const tMedico = await token(api, "medico", "medico");
  expect(tAdmin && tMedico).toBeTruthy();

  // Cuentas de los escenarios de aceptación (CP-33 y CP-34)
  await asegurarUsuario(api, tAdmin, USUARIOS.medicoQa.usuario, 2);
  await asegurarUsuario(api, tAdmin, USUARIOS.adminQa.usuario, 1);

  // Paciente semilla (id 1, cuenta paciente): Electrocardiograma con PDF y Glicemia (CP-07, CP-21, CP-22)
  await asegurarExamenes(api, tMedico, 1);

  // Paciente ficticia Rosa Muñoz Tapia, 74 años (CP-32)
  if (!(await token(api, USUARIOS.rosa.usuario, CLAVE_QA))) {
    await api.post("/autenticacion/registro", { data: { nombre_usuario: USUARIOS.rosa.usuario, password: CLAVE_QA, correo: "rosa.munoz@correo.cl", rut: "5.432.178-3" } });
  }
  const rosa = await (await api.get("/pacientes/buscar/rut/5432178-3", { headers: auth(tMedico) })).json();
  await api.put(`/pacientes/${rosa.id}`, { headers: auth(tMedico), data: { primer_nombre: "Rosa", apellido_paterno: "Muñoz", apellido_materno: "Tapia", fecha_nacimiento: "1952-03-15", sexo: "F" } });
  await asegurarExamenes(api, tMedico, rosa.id);

  // CP-33 parte con un paciente que no existe: se elimina si quedó de una ejecución anterior
  const pedro = await api.get("/pacientes/buscar/rut/4876321-9", { headers: auth(tMedico) });
  if (pedro.status() === 200) await api.delete(`/pacientes/${(await pedro.json()).id}`, { headers: auth(tAdmin) });

  // CP-34 crea a camila.reyes: se elimina si quedó de una ejecución anterior
  const usuarios = await (await api.get("/usuarios", { headers: auth(tAdmin) })).json();
  const camila = usuarios.find((u) => u.nombre_usuario === "camila.reyes");
  if (camila) await api.delete(`/usuarios/${camila.id}`, { headers: auth(tAdmin) });
});
