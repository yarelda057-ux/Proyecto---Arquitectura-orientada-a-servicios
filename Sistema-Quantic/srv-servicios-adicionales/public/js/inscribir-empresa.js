'use strict';
const API_BASE = '/api/v1';
function mostrarToast(message, type) {
  const status = document.getElementById('registrationStatus');
  status.hidden = false;
  status.textContent = message;
  status.style.background = type === 'success' ? '#e0f5eb' : '#fff0ef';
  status.style.color = '#162b3b';
  status.focus();
}
  const formEmpresa = document.getElementById('formRegistroEmpresa');
  formEmpresa.addEventListener('submit', async (e) => {
    e.preventDefault();

    const razon_social = document.getElementById('empRazonSocial').value.trim();
    const ruc = document.getElementById('empRuc').value.trim();
    const email_contacto = document.getElementById('empEmail').value.trim();
    const telefono = document.getElementById('empTelefono').value.trim();
    const ciudad = document.getElementById('empCiudad').value;
    const direccion = document.getElementById('empDireccion').value.trim();
    const sitio_web = document.getElementById('empSitioWeb').value.trim();
    const descripcion = document.getElementById('empDescripcion').value.trim();

                                        
    const srvNombre = document.getElementById('srvNombreIni').value.trim();
    const srvCategoria = document.getElementById('srvCategoriaIni').value;
    const srvTipo = document.getElementById('srvTipoIni').value;
    const srvPrecio = document.getElementById('srvPrecioIni').value.trim();
    const srvDesc = document.getElementById('srvDescIni').value.trim();

    const servicios_iniciales = [];
    if (srvNombre) {
      servicios_iniciales.push({
        nombre: srvNombre,
        categoria: srvCategoria,
        tipo_servicio: srvTipo,
        precio_referencial: srvPrecio || 'A cotizar',
        descripcion: srvDesc || 'Sin descripción detallada'
      });
    }

    const payload = {
      razon_social,
      ruc,
      email_contacto,
      telefono,
      ciudad,
      direccion,
      sitio_web,
      descripcion,
      servicios_iniciales
    };

    const btnSubmit = document.getElementById('btnEnviarEmpresa');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Enviando solicitud...</span>';

    try {
      const res = await fetch(`${API_BASE}/catalogo/empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.status === 201) {
        mostrarToast('¡Solicitud enviada con éxito en estado PENDIENTE!', 'success');
        formEmpresa.reset();
      } else {
        mostrarToast(data.mensaje || 'Error al enviar solicitud', 'error');
      }
    } catch (err) {
      console.error(err);
      mostrarToast('Error de red al conectar con el servidor', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<span>Enviar Solicitud de Registro</span> <span class="btn-arrow">→</span>';
    }
  });

