// 1. CONFIGURACIÓN DE BASE DE DATOS LOCAL (DEXIE)
const db = new Dexie("SarahuaroQR_DB");
db.version(3).stores({
    ninos: "id, nombres, apellidos, escuela, grado, edad, peso, estatura",
    asistencias: "++id, ninoId, fecha"
});

// 2. CONFIGURACIÓN DE NUBE (SUPABASE) - AQUÍ VA EL PASO 3
const SUPABASE_URL = 'https://qbfzyfmogwwdnqseahqq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiZnp5Zm1vZ3d3ZG5xc2VhaHFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MzcyNjIsImV4cCI6MjA5MzUxMzI2Mn0.RarigShwC5zBEQMdDbrMS3sONAvfOqiNGmV62jZOTZ4';

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

supabaseClient
    .from('ninos')
    .select('*')
    .limit(1)
    .then(res => console.log("Prueba conexión:", res))
    .catch(err => console.log("Falló:", err));

// 3. VARIABLES GLOBALES EXISTENTES
let alumnoEnEdicion = null;
let chartInstance = null;
const COSTO_RACION = 35.00;

// LOGIN
function verificarAcceso() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;

    if (user === "admin" && pass === "tesh") {
        document.getElementById('pantalla-login').style.display = "none";
        sessionStorage.setItem("auth", "true");
        render(); // Inicia la app
    } else {
        alert("Credenciales incorrectas");
    }
}

// RENDER PRINCIPAL
async function render(search = "") {
    const grid = document.getElementById("lista-ninos");
    if (!grid) return;

    const hoy = new Date().toISOString().split('T')[0];
    grid.innerHTML = "";

    const ninos = await db.ninos.toArray();
    const asistenciasHoy = await db.asistencias.where("fecha").equals(hoy).toArray();
    const idsAsistidos = asistenciasHoy.map(a => a.ninoId);

    const filtrados = ninos.filter(n =>
        `${n.nombres} ${n.apellidos}`.toLowerCase().includes(search.toLowerCase())
    );

    if (filtrados.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-magnifying-glass" style="font-size:2rem; margin-bottom:12px;"></i>
                <p>No se encontraron alumnos.</p>
            </div>
        `;
        return;
    }

    filtrados.forEach(n => {
        const yaRecibio = idsAsistidos.includes(n.id);

        const card = document.createElement("div");
        card.className = `card-premium ${yaRecibio ? "asistido" : ""}`;

        card.innerHTML = `
            <div class="card-header-alumno">
                <div class="avatar-alumno">
                    <i class="fa-solid fa-user-graduate"></i>
                </div>

                <div class="info-alumno">
                    <h3>${n.nombres} ${n.apellidos}</h3>
                    <p>${n.grado || "Sin grado"} · ${n.escuela || "Sin escuela"}</p>
                </div>

                <button onclick="verPerfil('${n.id}')" class="btn-ver-perfil">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>

            <button onclick="pasarAsistencia('${n.id}')" 
                    class="btn-asistencia ${yaRecibio ? "registrada" : ""}">
                <i class="fa-solid ${yaRecibio ? "fa-check-circle" : "fa-hand-holding-heart"}"></i>
                ${yaRecibio ? "Asistencia Registrada" : "Registrar Apoyo"}
            </button>
        `;

        grid.appendChild(card);
    });
}


// ASISTENCIA SIN SUBIR EL SCROLL
async function pasarAsistencia(id) {
    const hoy = new Date().toISOString().split('T')[0];

    const existe = await db.asistencias
        .where({ ninoId: id, fecha: hoy })
        .first();

    if (existe) {
        mostrarToast("La asistencia de hoy ya estaba registrada.", "info");
        return;
    }

    const scrollPos = window.scrollY;

    try {
        const nuevaAsistencia = {
            ninoId: id,
            fecha: hoy
        };

        const idLocal = await db.asistencias.add(nuevaAsistencia);

        const asistenciaNube = {
            id: Number(idLocal),
            ninoid: String(id),
            fecha: hoy,
            unique_key: `${id}-${hoy}`
        };

        const { error } = await supabaseClient
            .from("asistencias")
            .upsert([asistenciaNube], { onConflict: "unique_key" });

        if (error) throw error;

        await render(document.getElementById('buscador')?.value || "");
        window.scrollTo(0, scrollPos);

        if (document.getElementById("seccion-metricas")?.style.display !== "none") {
            actualizarMetricas();
        }

        mostrarToast("Asistencia registrada y sincronizada.", "success");

    } catch (err) {
        console.error("Error registrando asistencia:", err);

        await render(document.getElementById('buscador')?.value || "");
        window.scrollTo(0, scrollPos);

        mostrarToast("Se guardó localmente, pero no se sincronizó.", "error");
    }
}

// MODALES
function abrirModal(id) { document.getElementById(id).style.display = "flex"; }
function cerrarModal() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        if (m.id !== 'pantalla-login') m.style.display = 'none';
    });
    alumnoEnEdicion = null;
}

function prepararRegistro() {
    alumnoEnEdicion = null;
    document.getElementById('modal-titulo').innerText = "Registrar Alumno";
    document.querySelectorAll('#modal-agregar input').forEach(i => i.value = "");
    abrirModal('modal-agregar');
}

async function prepararEdicion(id) {
    const n = await db.ninos.get(id);
    alumnoEnEdicion = id;
    document.getElementById('modal-titulo').innerText = "Editar Alumno";
    document.getElementById('reg-nombres').value = n.nombres;
    document.getElementById('reg-apellidos').value = n.apellidos;
    document.getElementById('reg-escuela').value = n.escuela;
    document.getElementById('reg-grado').value = n.grado;
    document.getElementById('reg-edad').value = n.edad;
    document.getElementById('reg-peso').value = n.peso || "";
    document.getElementById('reg-estatura').value = n.estatura || "";
    abrirModal('modal-agregar');
}

async function guardarNuevoAlumno() {
    const nombres = document.getElementById('reg-nombres').value.trim();
    const apellidos = document.getElementById('reg-apellidos').value.trim();
    const escuela = document.getElementById('reg-escuela').value.trim();
    const grado = document.getElementById('reg-grado').value.trim();

    const edadInput = document.getElementById('reg-edad').value;
    const pesoInput = document.getElementById('reg-peso').value;
    const estaturaInput = document.getElementById('reg-estatura').value;

    const edad = parseInt(edadInput);
    const peso = parseFloat(pesoInput);
    const estatura = parseFloat(estaturaInput);

    if (!nombres || !apellidos || !escuela || !grado) {
        mostrarToast("Completa todos los campos obligatorios.", "error");
        return;
    }

    if (!edadInput || edad < 1 || edad > 18) {
        alert("La edad debe estar entre 1 y 18 años.");
        return;
    }

    if (pesoInput !== "" && (peso <= 0 || peso > 150)) {
        alert("El peso debe ser mayor a 0 y menor o igual a 150 kg.");
        return;
    }

    if (estaturaInput !== "" && (estatura <= 30 || estatura > 250)) {
        alert("La estatura debe ser mayor a 30 cm y menor o igual a 250 cm.");
        return;
    }

    const datos = {
        nombres,
        apellidos,
        escuela,
        grado,
        edad,
        peso: pesoInput === "" ? null : peso,
        estatura: estaturaInput === "" ? null : estatura
    };

    if (alumnoEnEdicion) {
        await db.ninos.update(alumnoEnEdicion, datos);
    } else {
        await db.ninos.add({
            id: "SAR-" + Date.now(),
            ...datos
        });
    }

    mostrarToast(
        alumnoEnEdicion ? "Alumno actualizado correctamente." : "Alumno registrado correctamente.",
        "success"
    );
    cerrarModal();
    render();
}

// PESTAÑAS
function cambiarPestana(target) {
    const secciones = ['inicio', 'metricas', 'pro'];

    secciones.forEach(s => {
        const el = document.getElementById('seccion-' + s);

        if (el) {
            el.style.display = s === target ? 'block' : 'none';
            el.style.opacity = s === target ? '1' : '0';
        }
    });

    // Sidebar activo
    document.querySelectorAll('.side-item').forEach(btn => {
        btn.classList.remove('active');
    });

    if (target === 'inicio') {
        document.getElementById('nav-inicio')?.classList.add('active');
    }

    if (target === 'metricas') {
        document.getElementById('nav-metricas')?.classList.add('active');
        setTimeout(actualizarMetricas, 100);
    }

    if (target === 'pro') {
        document.getElementById('nav-pro')?.classList.add('active');
        renderSaludPRO();
    }

    if (target === 'inicio') {
        render();
    }
}

// SALUD PRO
async function renderSaludPRO() {
    const container = document.getElementById('lista-salud-alumnos');
    if (!container) return; // Seguridad por si el elemento no existe

    const ninos = await db.ninos.toArray();

    // Creamos la estructura de filtros
    container.innerHTML = `
        <div style="margin-bottom: 25px; display: flex; gap: 12px; overflow-x: auto; padding: 5px 0;">
            <button class="badge-tech" style="background: var(--primary); color: white;" onclick="filtrarSalud('Todos')">Todos</button>
            <button class="badge-tech" style="background: #ef4444; color: white;" onclick="filtrarSalud('Sobrepeso')">
                <i class="fa-solid fa-heart-pulse"></i> Prioridad Cardio
            </button>
            <button class="badge-tech" style="background: #3b82f6; color: white;" onclick="filtrarSalud('Bajo Peso')">
                <i class="fa-solid fa-dumbbell"></i> Prioridad Fuerza
            </button>
        </div>
        <div id="contenedor-tarjetas-salud"></div>
    `;

    // ESTA ES LA LÍNEA CLAVE: Dibuja los datos de inmediato
    dibujarTarjetasSalud(ninos);

}
function analizarSalud(peso, estatura) {
    if (!peso || !estatura) return { estado: "Sin Datos", color: "#94a3b8", sugerencia: "Registrar peso y talla" };
    const imc = peso / ((estatura / 100) ** 2);
    if (imc < 18.5) return { estado: "Bajo Peso", color: "#3b82f6", sugerencia: "Prioridad Fuerza" };
    if (imc < 25) return { estado: "Saludable", color: "#10b981", sugerencia: "Mantener actividad" };
    if (imc < 30) return { estado: "Sobrepeso", color: "#f59e0b", sugerencia: "Prioridad Cardio" };
    return { estado: "Obesidad", color: "#ef4444", sugerencia: "Control médico y cardio" };
}

// También agrega esta para evitar el error de "verPerfil"
async function verPerfil(id) {
    const n = await db.ninos.get(id);
    if (!n) return;

    const historial = await db.asistencias.where("ninoId").equals(id).toArray();
    const analisis = analizarSalud(n.peso, n.estatura);

    const contenido = document.getElementById('contenido-perfil');
    if (contenido) {
        contenido.innerHTML = `

<div class="perfil-top">

<div class="perfil-avatar">
<i class="fa-solid fa-user-graduate"></i>
</div>

<h2>${n.nombres} ${n.apellidos}</h2>

<span class="estado-health"
style="background:${analisis.color}">
${analisis.estado}
</span>

</div>


<div class="stats-grid">

<div class="stat-card">
<small>Peso</small>
<strong>${n.peso || '--'} kg</strong>
</div>

<div class="stat-card">
<small>Estatura</small>
<strong>${n.estatura || '--'} cm</strong>
</div>

</div>


<div class="resume-box">

<div class="resume-title">
<i class="fa-solid fa-chart-line"></i>
<span>Resumen del Alumno</span>
</div>

<div class="resume-row">
<span>Escuela</span>
<strong>${n.escuela || "--"}</strong>
</div>

<div class="resume-row">
<span>Grado</span>
<strong>${n.grado || "--"}</strong>
</div>

<div class="resume-row">
<span>Raciones entregadas</span>
<strong>${historial.length}</strong>
</div>

<div class="resume-row">
<span>Inversión total</span>
<strong>$${(historial.length * COSTO_RACION).toFixed(2)}</strong>
</div>

</div>


<div class="qr-premium">

<div id="qrcode"></div>

<button onclick="descargarQR()"
class="btn-primary-glow">

<i class="fa-solid fa-download"></i>
Descargar QR

</button>

</div>


<button
onclick="eliminarAlumno('${n.id}')"
class="action-danger">

<i class="fa-solid fa-trash-can"></i>
Eliminar registro

</button>

`;
    }


    // Generar el QR
    const qrDiv = document.getElementById("qrcode");
    qrDiv.innerHTML = ""; // Limpiar QR anterior
    new QRCode(qrDiv, {
        text: id.toString(), // El QR contiene el ID único del alumno para pasar asistencia
        width: 128,
        height: 128,
        colorDark: "#1e293b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // Guardar el nombre para el archivo de descarga
    window.nombreAlumnoActual = `${n.nombres}_${n.apellidos}`.replace(/\s+/g, '_');



    abrirModal('modal-perfil');
}

function dibujarTarjetasSalud(lista) {
    const cont = document.getElementById('contenedor-tarjetas-salud');
    if (!cont) return;
    cont.innerHTML = "";

    if (lista.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay alumnos registrados con estos criterios.</div>`;
        return;
    }

    lista.forEach(n => {
        const analisis = analizarSalud(n.peso, n.estatura);
        const div = document.createElement("div");

        // Estilo de tarjeta profesional
        div.style.cssText = `
            background: white; 
            border-radius: 25px; 
            padding: 22px; 
            margin-bottom: 18px; 
            border-left: 8px solid ${analisis.color};
            box-shadow: 0 10px 25px rgba(0,0,0,0.03);
        `;

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                <div>
                    <h4 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: var(--primary);">${n.nombres} ${n.apellidos}</h4>
                    <span style="font-size: 0.7rem; font-weight: 800; color: ${analisis.color}; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${analisis.estado}
                    </span>
                </div>
                <div style="background: #f1f5f9; padding: 5px 12px; border-radius: 12px; text-align: center;">
                    <small style="display: block; font-size: 0.6rem; color: var(--text-muted); font-weight: 700;">IMC</small>
                    <span style="font-weight: 800; color: var(--primary);">${n.peso ? (n.peso / ((n.estatura / 100) ** 2)).toFixed(1) : '--'}</span>
                </div>
            </div>

            <div style="background: #f8fafc; padding: 15px; border-radius: 18px; border: 1px dashed #cbd5e1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--primary);">
                    <i class="fa-solid fa-clipboard-check" style="color: ${analisis.color}"></i>
                    <strong style="font-size: 0.85rem;">Plan de Educación Física</strong>
                </div>
                <p style="margin: 0 0 10px; font-size: 0.8rem; color: #475569; line-height: 1.4;">${analisis.sugerencia}</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 0.75rem; color: #64748b;">
                    ${obtenerEjerciciosDetallados(analisis.estado)}
                </ul>
            </div>
        `;
        cont.appendChild(div);
    });
}
// Esta función toma lo que hay en tu PC y lo sube a la nube
async function subirDatosANube() {
    const btn = document.getElementById("sync-text-up");

    try {
        if (btn) btn.innerText = "SUBIENDO...";

        const ninos = await db.ninos.toArray();
        const asistencias = await db.asistencias.toArray();

        const ninosLimpios = ninos.map(n => ({
            id: String(n.id),
            nombres: n.nombres || "",
            apellidos: n.apellidos || "",
            escuela: n.escuela || "",
            grado: n.grado || "",
            edad: Number(n.edad) || 0,
            peso: n.peso ? Number(n.peso) : null,
            estatura: n.estatura ? Number(n.estatura) : null
        }));

        const asistenciasLimpias = asistencias.map(a => ({
            id: Number(a.id),
            ninoid: String(a.ninoId),
            fecha: a.fecha,
            unique_key: `${a.ninoId}-${a.fecha}`
        }));

        const { error: errorNinos } = await supabaseClient
            .from("ninos")
            .upsert(ninosLimpios, { onConflict: "id" });

        if (errorNinos) throw errorNinos;

        const { error: errorAsistencias } = await supabaseClient
            .from("asistencias")
            .upsert(asistenciasLimpias, { onConflict: "unique_key" });

        if (errorAsistencias) throw errorAsistencias;

        if (btn) {
            btn.innerText = "¡LISTO!";
            setTimeout(() => btn.innerText = "Respaldar datos", 2500);
        }

        mostrarToast("Alumnos y asistencias respaldados correctamente.", "success");

    } catch (err) {
        console.error("Error al subir:", err);

        if (btn) {
            btn.innerText = "ERROR";
            setTimeout(() => btn.innerText = "Respaldar datos", 2500);
        }

        mostrarToast("Error al subir datos a Supabase.", "error");
    }
}
async function descargarDatosDeNube() {
    const btnText = document.getElementById('sync-text-down');

    try {
        if (btnText) btnText.innerText = "BAJANDO...";

        const { data: ninosNube, error: errorNinos } = await supabaseClient
            .from('ninos')
            .select('id, nombres, apellidos, escuela, grado, edad, peso, estatura');

        if (errorNinos) throw errorNinos;

        const { data: asistenciasNube, error: errorAsistencias } = await supabaseClient
            .from('asistencias')
            .select('id, ninoid, fecha, unique_key');

        if (errorAsistencias) throw errorAsistencias;

        const ninosLimpios = (ninosNube || []).map(n => ({
            id: String(n.id),
            nombres: n.nombres || "",
            apellidos: n.apellidos || "",
            escuela: n.escuela || "",
            grado: n.grado || "",
            edad: n.edad ? Number(n.edad) : 0,
            peso: n.peso ? Number(n.peso) : null,
            estatura: n.estatura ? Number(n.estatura) : null
        }));

        const asistenciasLimpias = (asistenciasNube || []).map(a => ({
            id: Number(a.id),
            ninoId: String(a.ninoid),
            fecha: a.fecha
        }));

        await db.transaction('rw', db.ninos, db.asistencias, async () => {
            await db.ninos.clear();
            await db.asistencias.clear();

            await db.ninos.bulkPut(ninosLimpios);
            await db.asistencias.bulkPut(asistenciasLimpias);
        });

        await render(document.getElementById("buscador")?.value || "");

        if (document.getElementById("seccion-metricas")?.style.display !== "none") {
            actualizarMetricas();
        }

        if (document.getElementById("seccion-pro")?.style.display !== "none") {
            renderSaludPRO();
        }

        if (btnText) {
            btnText.innerText = "¡LISTO!";
            setTimeout(() => btnText.innerText = "Sincronizar nube", 2500);
        }

        mostrarToast("Datos actualizados desde Supabase.", "success");

    } catch (err) {
        console.error("Error al descargar:", err);

        if (btnText) {
            btnText.innerText = "ERROR";
            setTimeout(() => btnText.innerText = "Sincronizar nube", 2500);
        }

        mostrarToast("Error al descargar datos de Supabase.", "error");
    }
}
// --- FUNCIONES DE ADMINISTRACIÓN CRÍTICA ---

function abrirConfiguracion() {
    document.getElementById('modal-admin').style.display = "flex";
    document.getElementById('opciones-criticas').style.display = "none";
    document.getElementById('pass-admin').value = "";
}

function cerrarModalAdmin() {
    document.getElementById('modal-admin').style.display = "none";
}

function validarAdmin() {
    const pass = document.getElementById('pass-admin').value;

    // Puedes usar la misma de tu login o una nueva
    if (pass === "tesh2026") {
        document.getElementById('opciones-criticas').style.display = "block";
        alert("Acceso concedido. Ten cuidado con las acciones críticas.");
    } else {
        alert("Contraseña administrativa incorrecta.");
    }
}

async function limpiarBaseDatos() {

    const confirmar = confirm(
        "¿ESTÁS SEGURO?\n\nEsto eliminará TODOS los alumnos y asistencias tanto localmente como en Supabase."
    );

    if (!confirmar) return;

    try {

        // BORRAR ASISTENCIAS EN SUPABASE
        const { error: errorAsistencias } = await supabaseClient
            .from("asistencias")
            .delete()
            .neq("id", 0);

        if (errorAsistencias) throw errorAsistencias;

        // BORRAR ALUMNOS EN SUPABASE
        const { error: errorNinos } = await supabaseClient
            .from("ninos")
            .delete()
            .neq("id", "0");

        if (errorNinos) throw errorNinos;

        // BORRAR LOCAL
        await db.ninos.clear();
        await db.asistencias.clear();

        alert("Sistema reiniciado correctamente.");

        location.reload();

    } catch (err) {

        console.error(err);

        alert("Error al limpiar la base de datos.");
    }
}

// NUEVA FUNCIÓN: Borrar un alumno individual
async function eliminarAlumno(id) {
    const confirmar = confirm("¿Estás seguro de que deseas eliminar este alumno? Esta acción no se puede deshacer.");

    if (confirmar) {
        try {
            // 1. Borramos al niño de la tabla 'ninos'
            await db.ninos.delete(id);

            // 2. Opcional: Borramos también sus asistencias para no dejar basura en la BD
            await db.asistencias.where("ninoId").equals(id).delete();

            alert("Alumno eliminado correctamente.");
            cerrarModal(); // Cerramos el perfil
            render();      // Actualizamos la lista principal
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("Hubo un error al intentar eliminar el registro.");
        }
    }
}

// Función para borrar un alumno individual (puedes llamarla desde el modal de edición)
async function borrarAlumno(id) {
    if (confirm("¿Borrar permanentemente a este alumno?")) {
        await db.ninos.delete(id);
        // También borramos sus asistencias para no dejar basura
        await db.asistencias.where("ninoId").equals(id).delete();
        cerrarModal();
        render();
        alert("Alumno eliminado exitosamente.");
    }
}

function obtenerEjerciciosDetallados(estado) {
    const rutinas = {
        "Bajo Peso": "<li>3 series de 10 sentadillas</li><li>Juegos de empuje</li><li>Carreras de relevos cortas</li>",
        "Saludable": "<li>Salto de cuerda (2 min)</li><li>Burpees adaptados</li><li>Circuito de obstáculos</li>",
        "Sobrepeso": "<li>Caminata activa (5 min)</li><li>Juego de 'Las traes'</li><li>Movilidad articular</li>",
        "Obesidad": "<li>Estiramientos dinámicos</li><li>Lanzamiento de pelota</li><li>Caminata rítmica</li>"
    };
    return rutinas[estado] || "<li>Registrar datos para ver rutina</li>";
}
// Función para que los botones de colores filtren a los alumnos
async function filtrarSalud(categoria) {
    const ninos = await db.ninos.toArray();
    let filtrados;

    if (categoria === 'Todos') {
        filtrados = ninos;
    } else {
        filtrados = ninos.filter(n => {
            const analisis = analizarSalud(n.peso, n.estatura);
            // Comparamos si el estado de salud coincide con la prioridad
            if (categoria === 'Sobrepeso') return analisis.estado === 'Sobrepeso' || analisis.estado === 'Obesidad';
            if (categoria === 'Bajo Peso') return analisis.estado === 'Bajo Peso';
            return true;
        });
    }

    // Volvemos a dibujar solo los que cumplen el filtro
    dibujarTarjetasSalud(filtrados);
}

// EVENTOS INICIALES
document.getElementById("buscador").addEventListener("input", e => render(e.target.value));

async function actualizarMetricas() {
    const asistencias = await db.asistencias.toArray();
    const ninos = await db.ninos.toArray();

    const hoy = new Date().toISOString().split('T')[0];
    const fechaActual = new Date();
    const mesActual = fechaActual.getMonth();
    const añoActual = fechaActual.getFullYear();

    const asistenciasHoy = asistencias.filter(a => a.fecha === hoy).length;
    const gastoHoy = asistenciasHoy * COSTO_RACION;

    const asistenciasMes = asistencias.filter(a => {
        const d = new Date(a.fecha);
        return d.getMonth() === mesActual &&
            d.getFullYear() === añoActual;
    });

    const primerDiaMes = new Date(añoActual, mesActual, 1);
    const ultimoDiaMes = new Date(añoActual, mesActual + 1, 0);

    const diasLaborablesPasados =
        contarDiasLaborables(primerDiaMes, fechaActual);

    const diasLaborablesTotales =
        contarDiasLaborables(primerDiaMes, ultimoDiaMes);

    const promedioNinosDiarios =
        diasLaborablesPasados > 0
            ? Math.ceil(asistenciasMes.length / diasLaborablesPasados)
            : 0;

    const proyeccionFinal =
        promedioNinosDiarios *
        diasLaborablesTotales *
        COSTO_RACION;

    const diasRestantesLab =
        Math.max(
            diasLaborablesTotales - diasLaborablesPasados,
            0
        );

    const racionesTotales = asistencias.length;
    const inversionTotal =
        racionesTotales * COSTO_RACION;

    const fechasUnicas =
        [...new Set(asistencias.map(a => a.fecha))].length;

    const promedioDiario =
        fechasUnicas > 0
            ? (racionesTotales / fechasUnicas).toFixed(1)
            : "0";


    // MÉTRICAS
    document.getElementById('gasto-hoy').innerText =
        `$${gastoHoy.toFixed(2)}`;

    document.getElementById('proyeccion-mes').innerText =
        `$${proyeccionFinal.toFixed(2)}`;

    document.getElementById('dias-restantes').innerText =
        `${diasRestantesLab} días escolares restantes`;

    document.getElementById('atendidos-hoy').innerText =
        asistenciasHoy;

    document.getElementById('total-alumnos').innerText =
        ninos.length;

    document.getElementById('raciones-totales').innerText =
        racionesTotales;

    document.getElementById('inversion-total').innerText =
        `$${inversionTotal.toFixed(2)}`;

    document.getElementById('promedio-diario').innerText =
        promedioDiario;



    // DATOS ÚLTIMOS 7 DÍAS
    const ultimos7Dias = [];

    let fecha = new Date();

    while (ultimos7Dias.length < 5) {

        const dia = fecha.getDay();

        // Excluir sábado (6) y domingo (0)
        if (dia !== 0 && dia !== 6) {

            ultimos7Dias.unshift(
                fecha.toISOString().split('T')[0]
            );

        }

        fecha.setDate(
            fecha.getDate() - 1
        );
    }

    const datosGrafica = ultimos7Dias.map(fecha => {
        return asistencias.filter(
            a => a.fecha === fecha
        ).length;
    });


    // KPIs NUEVOS
    const total7Dias =
        datosGrafica.reduce(
            (acc, n) => acc + n,
            0
        );

    const promedio7Dias =
        total7Dias > 0
            ? Math.round(total7Dias / 5)
            : 0;

    const mejorValor =
        Math.max(...datosGrafica);

    const indiceMejor =
        datosGrafica.indexOf(mejorValor);

    const mejorDia =
        ultimos7Dias[indiceMejor]
            ?.split("-")
            .slice(1)
            .reverse()
            .join("/") || "--";

    const ultimoValor =
        datosGrafica[
        datosGrafica.length - 1
        ];

    const diferencia =
        ultimoValor -
        promedio7Dias;


    // SI EXISTEN LOS ELEMENTOS
    if (document.getElementById("kpi-total-7"))
        document.getElementById(
            "kpi-total-7"
        ).innerText = total7Dias;

    if (document.getElementById("kpi-promedio-7"))
        document.getElementById(
            "kpi-promedio-7"
        ).innerText =
            promedio7Dias.toFixed(1);

    if (document.getElementById("kpi-mejor-dia"))
        document.getElementById(
            "kpi-mejor-dia"
        ).innerText =
            mejorDia;

    if (document.getElementById("kpi-mejor-dia-total"))
        document.getElementById(
            "kpi-mejor-dia-total"
        ).innerText =
            `${mejorValor} alumnos`;

    if (document.getElementById("kpi-diferencia"))
        document.getElementById(
            "kpi-diferencia"
        ).innerText =
            `${diferencia >= 0 ? "+" : ""}${diferencia.toFixed(1)}`;


    // GRAFICA
    const ctx =
        document.getElementById(
            'graficaAsistencias'
        );

    if (!ctx) return;

    if (chartInstance)
        chartInstance.destroy();

    const esOscuro =
        document.body.classList.contains(
            "dark-mode"
        );

    const colorTexto =
        esOscuro
            ? "#e2e8f0"
            : "#5f6f68";

    const colorGrid =
        esOscuro
            ? "rgba(255,255,255,.08)"
            : "rgba(219,231,223,.9)";

    const promedioLinea =
        datosGrafica.map(
            () => promedio7Dias
        );

    chartInstance =
        new Chart(
            ctx.getContext('2d'),
            {

                data: {
                    labels:
                        ultimos7Dias.map(
                            f => {

                                const [
                                    y, m, d
                                ] = f.split("-");

                                return `${d}/${m}`;

                            }
                        ),

                    datasets: [

                        {
                            type: "bar",

                            label:
                                "Alumnos atendidos",

                            data:
                                datosGrafica,

                            backgroundColor:
                                esOscuro
                                    ?
                                    'rgba(34,197,94,.75)'
                                    :
                                    'rgba(22,163,74,.9)',

                            borderColor:
                                '#15803d',

                            borderRadius:
                                14,

                            borderSkipped:
                                false,

                            barThickness:
                                42

                        },

                        {
                            type: "line",

                            label:
                                "Promedio semanal",

                            data:
                                promedioLinea,

                            borderColor:
                                '#d6a84f',

                            borderDash:
                                [8, 5],

                            borderWidth:
                                3,

                            pointRadius:
                                6,

                            pointBackgroundColor:
                                '#d6a84f',

                            tension:
                                0

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    plugins: {

                        legend: {

                            position: "bottom",

                            labels: {
                                color:
                                    colorTexto,

                                font: {
                                    weight: '800'
                                }
                            }

                        },

                        tooltip: {

                            backgroundColor:
                                '#10231f',

                            padding: 14,

                            cornerRadius: 14

                        }

                    },

                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {

                                stepSize: 1,

                                color:
                                    colorTexto

                            },

                            grid: {
                                color:
                                    colorGrid
                            }

                        },

                        x: {

                            ticks: {
                                color:
                                    colorTexto
                            },

                            grid: {
                                display: false
                            }

                        }

                    }

                }

            });
}
// EXPORTAR A EXCEL
async function exportarExcel() {
    const ninos = await db.ninos.toArray();
    const asistencias = await db.asistencias.toArray();

    // Obtenemos el total de fechas únicas en las que se pasó lista
    const fechasUnicas = [...new Set(asistencias.map(a => a.fecha))].length;

    const dataReporte = ninos.map(n => {
        const misAsistencias = asistencias.filter(a => a.ninoId === n.id).length;

        return {
            ID: n.id,
            Nombre: `${n.nombres} ${n.apellidos}`,
            Escuela: n.escuela,
            'Asistencias Totales': misAsistencias,
            'Días Operativos': fechasUnicas,
            'Porcentaje': fechasUnicas > 0 ? ((misAsistencias / fechasUnicas) * 100).toFixed(0) + '%' : '0%',
            'Estado Salud': analizarSalud(n.peso, n.estatura).estado
        };
    });

    const ws = XLSX.utils.json_to_sheet(dataReporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte_General");
    XLSX.writeFile(wb, "Reporte_Sarahuaro_Completo.xlsx");
}

// EXPORTAR A PDF (PROFESIONAL)
async function exportarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const ninos = await db.ninos.toArray();
    const asistencias = await db.asistencias.toArray();

    const fechaActual = new Date().toLocaleDateString("es-MX");

    const fechasUnicas = [...new Set(asistencias.map(a => a.fecha))].length;
    const totalAlumnos = ninos.length;
    const totalAsistencias = asistencias.length;
    const promedioDiario = fechasUnicas > 0
        ? (totalAsistencias / fechasUnicas).toFixed(1)
        : 0;

    const alumnosConApoyo = [...new Set(asistencias.map(a => a.ninoId))].length;

    /* ==========================
       PORTADA
    ========================== */

    doc.setFillColor(11, 107, 75);
    doc.rect(0, 0, 210, 297, "F");

    doc.setTextColor(255, 255, 255);

    doc.setFontSize(28);
    doc.setFont(undefined, "bold");
    doc.text("Fundación Sarahuaro", 105, 60, { align: "center" });

    doc.setFontSize(20);
    doc.text("Reporte Ejecutivo", 105, 80, { align: "center" });

    doc.setFontSize(13);
    doc.setFont(undefined, "normal");
    doc.text("Sistema Sarahuaro Intelligence PRO", 105, 95, { align: "center" });

    doc.setFontSize(11);
    doc.text(`Generado el ${fechaActual}`, 105, 108, { align: "center" });

    /* ==========================
       KPIs PORTADA
    ========================== */

    doc.setFillColor(255, 255, 255);
    doc.circle(55, 155, 18, "F");

    doc.setFillColor(255, 255, 255);
    doc.circle(105, 155, 18, "F");

    doc.setFillColor(255, 255, 255);
    doc.circle(155, 155, 18, "F");

    doc.setTextColor(11, 107, 75);

    doc.setFontSize(18);
    doc.setFont(undefined, "bold");

    doc.text(String(totalAlumnos), 55, 153, { align: "center" });
    doc.text(String(totalAsistencias), 105, 153, { align: "center" });
    doc.text(String(promedioDiario), 155, 153, { align: "center" });

    doc.setFontSize(8);

    doc.text("Beneficiarios", 55, 165, { align: "center" });
    doc.text("Asistencias", 105, 165, { align: "center" });
    doc.text("Promedio diario", 155, 165, { align: "center" });

    /* ==========================
       MENSAJE INSTITUCIONAL
    ========================== */

    doc.setTextColor(255, 255, 255);

    doc.setFontSize(14);

    doc.text(
        "Comprometidos con el bienestar nutricional\ny el desarrollo integral de nuestros niños.",
        105,
        205,
        { align: "center" }
    );

    /* ==========================
       SEGUNDA PÁGINA
    ========================== */

    doc.addPage();

    doc.setTextColor(20, 20, 20);

    doc.setFontSize(22);
    doc.setFont(undefined, "bold");
    doc.text("Resumen Ejecutivo", 14, 20);

    doc.setFontSize(11);
    doc.setFont(undefined, "normal");

    // Tarjeta 1
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(14, 35, 85, 32, 5, 5, "F");

    doc.setFont(undefined, "bold");
    doc.text("Alumnos registrados", 20, 47);
    doc.setFontSize(20);
    doc.text(String(totalAlumnos), 20, 60);

    // Tarjeta 2
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(111, 35, 85, 32, 5, 5, "F");

    doc.setFontSize(11);
    doc.text("Asistencias registradas", 117, 47);

    doc.setFontSize(20);
    doc.text(String(totalAsistencias), 117, 60);

    // Tarjeta 3
    doc.setFillColor(254, 249, 195);
    doc.roundedRect(14, 78, 85, 32, 5, 5, "F");

    doc.setFontSize(11);
    doc.text("Beneficiarios activos", 20, 90);

    doc.setFontSize(20);
    doc.text(String(alumnosConApoyo), 20, 103);

    // Tarjeta 4
    doc.setFillColor(243, 232, 255);
    doc.roundedRect(111, 78, 85, 32, 5, 5, "F");

    doc.setFontSize(11);
    doc.text("Promedio diario", 117, 90);

    doc.setFontSize(20);
    doc.text(String(promedioDiario), 117, 103);

    /* ==========================
       ANÁLISIS
    ========================== */

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("Hallazgos del período", 14, 135);

    doc.setFontSize(11);
    doc.setFont(undefined, "normal");

    const hallazgos = [
        `• Se registraron ${totalAsistencias} asistencias durante el periodo analizado.`,
        `• El sistema cuenta con ${totalAlumnos} alumnos registrados.`,
        `• El promedio operativo fue de ${promedioDiario} alumnos por día.`,
        `• ${alumnosConApoyo} beneficiarios recibieron apoyo alimentario registrado.`
    ];

    let y = 150;

    hallazgos.forEach(texto => {
        doc.text(texto, 18, y);
        y += 10;
    });

    /* ==========================
       TABLA DE ALUMNOS
    ========================== */

    doc.addPage();

    doc.setFontSize(20);
    doc.setFont(undefined, "bold");
    doc.text("Listado General de Beneficiarios", 14, 20);

    const filas = ninos.map(n => {

        const numAsistencias =
            asistencias.filter(a => a.ninoId === n.id).length;

        return [
            `${n.nombres} ${n.apellidos}`,
            n.escuela || "-",
            `${numAsistencias}/${fechasUnicas}`,
            analizarSalud(n.peso, n.estatura).estado
        ];
    });

    doc.autoTable({
        startY: 30,
        head: [[
            'Alumno',
            'Escuela',
            'Asistencias',
            'Estado de Salud'
        ]],
        body: filas,

        theme: "grid",

        headStyles: {
            fillColor: [11, 107, 75],
            textColor: 255,
            fontStyle: 'bold'
        },

        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },

        styles: {
            fontSize: 9,
            cellPadding: 4
        }
    });

    /* ==========================
       PIE DE PÁGINA
    ========================== */


    /* ==========================
   GRÁFICA DE ASISTENCIAS
========================== */

    try {

        const canvas = document.getElementById("graficaAsistencias");

        if (canvas) {

            doc.addPage();

            doc.setFontSize(20);
            doc.setFont(undefined, "bold");
            doc.text("Análisis de Asistencias", 14, 20);

            doc.setFontSize(11);
            doc.setFont(undefined, "normal");

            doc.text(
                "Comportamiento de asistencia registrado en el sistema.",
                14,
                30
            );

            const imagenGrafica = canvas.toDataURL("image/png", 1.0);

            doc.addImage(
                imagenGrafica,
                "PNG",
                15,
                40,
                180,
                90
            );

            doc.setFontSize(14);
            doc.setFont(undefined, "bold");

            doc.text("Interpretación", 14, 150);

            doc.setFontSize(11);
            doc.setFont(undefined, "normal");

            doc.text(
                [
                    `• Total de asistencias registradas: ${totalAsistencias}`,
                    `• Promedio diario: ${promedioDiario}`,
                    `• Beneficiarios atendidos: ${alumnosConApoyo}`,
                    `• Días con actividad registrados: ${fechasUnicas}`
                ],
                18,
                165
            );
        }

    } catch (error) {

        console.error(
            "No se pudo insertar la gráfica en el PDF",
            error
        );

    }
    const paginas = doc.internal.getNumberOfPages();

    for (let i = 1; i <= paginas; i++) {

        doc.setPage(i);

        doc.setFontSize(8);
        doc.setTextColor(120);

        doc.text(
            `Fundación Sarahuaro | Sistema Sarahuaro Intelligence PRO | Página ${i} de ${paginas}`,
            105,
            290,
            { align: "center" }
        );
    }

    doc.save(`Reporte_Sarahuaro_${fechaActual}.pdf`);
}
// CONFIGURACIÓN DE SYNC
const INTERVALO_SYNC = 30000; // 30 segundos

// Función para exportar todo a un objeto JSON (para la nube)
async function obtenerPaqueteDatos() {
    const ninos = await db.ninos.toArray();
    const asistencias = await db.asistencias.toArray();
    return {
        ninos,
        asistencias,
        ultimaModificacion: new Date().toISOString()
    };
}

async function sincronizarAhora() {
    const btnText = document.getElementById('sync-text-up');

    if (btnText) btnText.innerText = "SYNC...";

    try {
        const datos = await obtenerPaqueteDatos();
        localStorage.setItem('backup_sarahuaro', JSON.stringify(datos));

        if (btnText) {
            btnText.innerText = "Listo";
            setTimeout(() => btnText.innerText = "Respaldar", 2000);
        }
    } catch (e) {
        if (btnText) btnText.innerText = "Error";
        console.error(e);
    }
}

// SINCRONIZACIÓN AUTOMÁTICA
setInterval(sincronizarAhora, INTERVALO_SYNC);

async function cargarDatosDesdeNube() {
    const backup = localStorage.getItem('backup_sarahuaro');
    if (backup) {
        const data = JSON.parse(backup);

        // Limpiamos y recargamos la BD local con lo que viene de la "nube"
        await db.ninos.clear();
        await db.asistencias.clear();

        await db.ninos.bulkAdd(data.ninos);
        await db.asistencias.bulkAdd(data.asistencias);

        render();
        console.log("Datos sincronizados desde el respaldo.");
    }
}
function descargarQR() {
    const qrCanvas = document.querySelector('#qrcode canvas');
    if (!qrCanvas) {
        alert("No se pudo generar el QR");
        return;
    }

    const link = document.createElement('a');
    link.download = `QR_${window.nombreAlumnoActual || 'alumno'}.png`;
    link.href = qrCanvas.toDataURL("image/png");
    link.click();
}
function contarDiasLaborables(inicio, fin) {
    let conteo = 0;
    let fechaAux = new Date(inicio);
    while (fechaAux <= fin) {
        const diaSemana = fechaAux.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) conteo++; // 0 es Domingo, 6 es Sábado
        fechaAux.setDate(fechaAux.getDate() + 1);
    }
    return conteo;
}

// Ejecutar al cargar la página si es necesario
// window.onload = () => { ... cargarDatosDesdeNube(); ... }

window.onload = () => {
    if (sessionStorage.getItem("auth") === "true") {
        document.getElementById('pantalla-login').style.display = "none";
        render();
    }


};
document.addEventListener("click", function (e) {
    const modalesCerrables = [
        "modal-perfil",
        "modal-agregar",
        "modal-admin"
    ];

    modalesCerrables.forEach(id => {
        const modal = document.getElementById(id);

        if (!modal) return;

        const estaAbierto = modal.style.display === "flex";

        if (estaAbierto && e.target === modal) {
            if (id === "modal-admin") {
                cerrarModalAdmin();
            } else {
                cerrarModal();
            }
        }
    });
});

function aplicarTemaGuardado() {
    const tema = localStorage.getItem("tema-sarahuaro") || "light";
    const btn = document.getElementById("theme-toggle");

    if (tema === "dark") {
        document.body.classList.add("dark-mode");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-sun"></i><span>Modo claro</span>';
    } else {
        document.body.classList.remove("dark-mode");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-moon"></i><span>Modo oscuro</span>';
    }

    setTimeout(() => {
        if (document.getElementById("seccion-metricas")?.style.display !== "none") {
            actualizarMetricas();
        }
    }, 100);
}

function toggleTheme() {
    const esOscuro = document.body.classList.toggle("dark-mode");
    const btn = document.getElementById("theme-toggle");

    localStorage.setItem("tema-sarahuaro", esOscuro ? "dark" : "light");

    if (btn) {
        btn.innerHTML = esOscuro
            ? '<i class="fa-solid fa-sun"></i><span>Modo claro</span>'
            : '<i class="fa-solid fa-moon"></i><span>Modo oscuro</span>';
    }

    if (document.getElementById("seccion-metricas")?.style.display !== "none") {
        setTimeout(actualizarMetricas, 100);
    }

    if (document.getElementById("seccion-pro")?.style.display !== "none") {
        setTimeout(renderSaludPRO, 100);
    }
}

aplicarTemaGuardado();
// Función para abrir/cerrar el menú desplegable en móvil
function toggleMenuMobile() {
    const sidebar = document.querySelector('.sidebar-dashboard');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

// Modificamos ligeramente la función existente cambiarPestana para que cierre el menú automáticamente tras elegir una opción
const cambiarPestanaOriginal = cambiarPestana;
cambiarPestana = function(target) {
    // Ejecuta la lógica original que ya tenías
    cambiarPestanaOriginal(target);
    
    // Si estamos en móvil, cierra el menú desplegable
    const sidebar = document.querySelector('.sidebar-dashboard');
    if (sidebar && window.innerWidth <= 640) {
        sidebar.classList.remove('active');
    }
}

// Cerrar el menú si el usuario da clic fuera de él
document.addEventListener("click", function(e) {
    const sidebar = document.querySelector('.sidebar-dashboard');
    const btnHam = document.querySelector('.btn-hamburger');
    
    if (sidebar && sidebar.classList.contains('active')) {
        // Si el clic no fue dentro del menú ni en el botón de hamburguesa, lo cerramos
        if (!sidebar.contains(e.target) && !btnHam.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    }
});
function toggleHelp() {

    const modal = document.getElementById("helpModal");

    if(modal.style.display === "flex"){
        modal.style.display = "none";
    }else{
        modal.style.display = "flex";
    }

}
let pasoTour = 0;

const pasos = [

{
    elemento:"tour-alumno",
    titulo:"Registrar alumnos",
    texto:"Desde aquí puedes registrar un nuevo alumno en el sistema."
},

{
    elemento:"tour-metricas",
    titulo:"Consultar métricas",
    texto:"Aquí encontrarás estadísticas de asistencia, salud e impacto."
},

{
    elemento:"tour-reportes",
    titulo:"Descargar reportes",
    texto:"Puedes generar reportes PDF y Excel para presentar resultados."
},

{
    elemento:"tour-perfil",
    titulo:"Perfil del alumno",
    texto:"Consulta información completa, historial y código QR."
}

];

function iniciarTour(){

    document.getElementById("tourOverlay").style.display = "block";

    mostrarPaso();

}

function mostrarPaso(){

    document
    .querySelectorAll(".tour-highlight")
    .forEach(el => el.classList.remove("tour-highlight"));

    const paso = pasos[pasoTour];

    const elemento =
    document.getElementById(paso.elemento);

    if(elemento){

        elemento.classList.add("tour-highlight");

        elemento.scrollIntoView({
            behavior:"smooth",
            block:"center"
        });

    }

    document.getElementById("tourNumero")
    .textContent = pasoTour + 1;

    document.getElementById("tourTitulo")
    .textContent = paso.titulo;

    document.getElementById("tourTexto")
    .textContent = paso.texto;
}

function siguienteTour(){

    pasoTour++;

    if(pasoTour >= pasos.length){

        cerrarTour();
        return;
    }

    mostrarPaso();
}

function cerrarTour(){

    document.getElementById("tourOverlay").style.display = "none";

    document
    .querySelectorAll(".tour-highlight")
    .forEach(el => el.classList.remove("tour-highlight"));

    localStorage.setItem(
        "tourSarahuaroCompletado",
        "true"
    );
}
async function buscarAlumnoAdmin() {

    const texto = document
        .getElementById('buscar-alumno-admin')
        .value
        .toLowerCase()
        .trim();

    const contenedor = document.getElementById('resultados-admin');

    if (!texto) {
        contenedor.innerHTML = "";
        return;
    }

    const alumnos = await db.ninos.toArray();

    const resultados = alumnos.filter(a =>
        (`${a.nombres} ${a.apellidos}`)
            .toLowerCase()
            .includes(texto)
    );

    contenedor.innerHTML = resultados.map(alumno => `
        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:10px;
            margin-bottom:8px;
            background:white;
            border-radius:10px;
            border:1px solid #e2e8f0;
        ">
            <div>
                <strong>${alumno.nombres} ${alumno.apellidos}</strong>
                <br>
                <small>${alumno.id}</small>
            </div>

            <button
                onclick="eliminarAlumnoAdmin('${alumno.id}')"
                style="
                    background:#fee2e2;
                    color:#b91c1c;
                    border:none;
                    padding:8px 12px;
                    border-radius:10px;
                    cursor:pointer;
                    font-weight:bold;
                ">
                Eliminar
            </button>
        </div>
    `).join('');
}
async function eliminarAlumnoAdmin(idAlumno) {

    const alumno = await db.ninos.get(idAlumno);

    if (!alumno) {
        mostrarToast("Alumno no encontrado.", "error");
        return;
    }

    const confirmar = confirm(
        `¿Eliminar a ${alumno.nombres} ${alumno.apellidos}?\n\nTambién se eliminarán todas sus asistencias.`
    );

    if (!confirmar) return;

    try {

        // LOCAL
        await db.ninos.delete(idAlumno);

        await db.asistencias
            .where("ninoId")
            .equals(idAlumno)
            .delete();

        // SUPABASE
        await supabaseClient
            .from("ninos")
            .delete()
            .eq("id", idAlumno);

        await supabaseClient
            .from("asistencias")
            .delete()
            .eq("ninoid", idAlumno);

        mostrarToast(
            "Alumno eliminado correctamente.",
            "success"
        );

        buscarAlumnoAdmin();

        render();

        if (
            document.getElementById("seccion-metricas")?.style.display !== "none"
        ) {
            actualizarMetricas();
        }

    } catch (err) {

        console.error(err);

        mostrarToast(
            "Error al eliminar alumno.",
            "error"
        );
    }
}

function mostrarToast(mensaje, tipo = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const iconos = {
        success: "fa-circle-check",
        error: "fa-circle-xmark",
        info: "fa-circle-info"
    };

    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;

    toast.innerHTML = `
        <i class="fa-solid ${iconos[tipo] || iconos.info}"></i>
        <span>${mensaje}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3600);
}
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('PWA lista');
        } catch (error) {
            console.error('Error SW:', error);
        }
    });
}