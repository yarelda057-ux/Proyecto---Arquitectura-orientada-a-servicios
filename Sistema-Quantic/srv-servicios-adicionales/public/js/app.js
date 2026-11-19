function companyName(value) { return String(value || '').replace(/\s*\[DEMO[^\]]*\]/gi, ''); }
// =============================================================================
// LÓGICA FRONTEND - DIRECTORIO COMERCIAL
// Quantic Technology S.A.C. - Directorio de Servicios Adicionales
// =============================================================================

const API_BASE = '/api/v1';

// Estado de la aplicación
const state = {
  currentTab: 'catalogo-servicios',
  services: [],
  empresas: [],
  solicitudesAdmin: [],
  adminFilterEstado: '',
  empresaAutenticada: null,
  filters: {
    q: '',
    categoria: '',
    ciudad: '',
    tipo_servicio: ''
  }
};

// =============================================================================
// INICIALIZACIÓN AL CARGAR EL DOM
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSearchAndFilters();
  initForms();
  initAdminPanel();
  initPortalEmpresa();

  // Cargar datos iniciales
  cargarCatalogoServicios();
  cargarEmpresas();
  cargarSelectEmpresasParaServicio();
});

// =============================================================================
// 1. NAVEGACIÓN ENTRE PESTAÑAS
// =============================================================================
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  if (tabId === 'panel-admin-demo' && window.QUANTIC_COMPANY_ROLE !== 'admin') return;
  state.currentTab = tabId;

  // Actualizar botones de navegación
  document.querySelectorAll('.nav-btn').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
  });

  // Alternar paneles de vista
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`tab-${tabId}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  // Refrescar datos según la pestaña activa
  if (tabId === 'catalogo-servicios') {
    cargarCatalogoServicios();
  } else if (tabId === 'empresas-directorio') {
    cargarEmpresas();
  } else if (tabId === 'registro-servicio') {
    cargarSelectEmpresasParaServicio();
  } else if (tabId === 'panel-admin-demo') {
    cargarSolicitudesAdmin();
  } else if (tabId === 'portal-empresa') {
    cargarPortalEmpresaChips();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================================
// 2. DIAGNÓSTICO Y CONEXIÓN DE BASE DE DATOS
// =============================================================================


// =============================================================================
// 3. CÁPSULA DE BÚSQUEDA Y FILTRADO
// =============================================================================
function initSearchAndFilters() {
  const searchInput = document.getElementById('searchQuery');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const selCategoria = document.getElementById('filterCategoria');
  const selCiudad = document.getElementById('filterCiudad');
  const selTipo = document.getElementById('filterTipoServicio');
  const btnExecute = document.getElementById('btnExecuteSearch');
  const btnReset = document.getElementById('btnResetFilters');

  // Búsqueda en vivo fluida
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    btnClearSearch.style.display = val.length > 0 ? 'block' : 'none';

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.filters.q = val;
      cargarCatalogoServicios();
    }, 280);
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.style.display = 'none';
    state.filters.q = '';
    cargarCatalogoServicios();
  });

  selCategoria.addEventListener('change', (e) => {
    state.filters.categoria = e.target.value;
    actualizarCardsCategorias(e.target.value);
    cargarCatalogoServicios();
  });

  selCiudad.addEventListener('change', (e) => {
    state.filters.ciudad = e.target.value;
    cargarCatalogoServicios();
  });

  selTipo.addEventListener('change', (e) => {
    state.filters.tipo_servicio = e.target.value;
    cargarCatalogoServicios();
  });

  if (btnExecute) {
    btnExecute.addEventListener('click', () => {
      cargarCatalogoServicios();
    });
  }

  btnReset.addEventListener('click', resetCatalogFilters);

  // Tarjetas de categoría rápida (Estilo ClassiAds)
  document.querySelectorAll('.cat-pill-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.getAttribute('data-cat');
      state.filters.categoria = cat;
      selCategoria.value = cat;
      actualizarCardsCategorias(cat);
      cargarCatalogoServicios();
    });
  });
}

function actualizarCardsCategorias(categoriaSeleccionada) {
  document.querySelectorAll('.cat-pill-card').forEach(card => {
    const cardCat = card.getAttribute('data-cat');
    card.classList.toggle('active', cardCat === categoriaSeleccionada);
  });
}

function resetCatalogFilters() {
  state.filters = { q: '', categoria: '', ciudad: '', tipo_servicio: '' };
  document.getElementById('searchQuery').value = '';
  document.getElementById('btnClearSearch').style.display = 'none';
  document.getElementById('filterCategoria').value = '';
  document.getElementById('filterCiudad').value = '';
  document.getElementById('filterTipoServicio').value = '';
  actualizarCardsCategorias('');
  cargarCatalogoServicios();
}

async function cargarCatalogoServicios() {
  const grid = document.getElementById('servicesGrid');
  const emptyState = document.getElementById('emptyServicesState');
  const countEl = document.getElementById('servicesCount');

  const params = new URLSearchParams();
  if (state.filters.categoria) params.append('categoria', state.filters.categoria);
  if (state.filters.q) params.append('q', state.filters.q);
  if (state.filters.ciudad) params.append('ciudad', state.filters.ciudad);
  if (state.filters.tipo_servicio) params.append('tipo_servicio', state.filters.tipo_servicio);

  try {
    const url = `${API_BASE}/catalogo/servicios${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url);
    const data = await res.json();

    state.services = data.datos || [];
    countEl.textContent = state.services.length;

    if (state.services.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    renderizarServicios(state.services);
  } catch (error) {
    console.error('Error al cargar servicios:', error);
    grid.innerHTML = `<div class="empty-glass-state"><p>Error al conectar con la API de servicios.</p></div>`;
  }
}

function getTagClass(cat) {
  if (cat.includes('Redes')) return 'tag-redes';
  if (cat.includes('Ciberseguridad')) return 'tag-seguridad';
  if (cat.includes('Consultoría')) return 'tag-consultoria';
  return 'tag-soporte';
}

function renderizarServicios(servicios) {
  const grid = document.getElementById('servicesGrid');

  grid.innerHTML = servicios.map(s => {
    const tagClass = getTagClass(s.categoria);
    const telLimpio = (s.empresa_telefono || '').replace(/\D/g, '');
    const numPeru = telLimpio.startsWith('51') ? telLimpio : '51' + telLimpio;
    const msgWs = encodeURIComponent(`Hola, me comunico tras ver su servicio "${s.nombre}" en el Directorio Tecnológico de Quantic Technology. Deseo solicitar una cotización.`);
    const wsLink = telLimpio ? `https://wa.me/${numPeru}?text=${msgWs}` : '#';

    return `
      <article class="card-item">
        <div>
          <div class="card-top-bar">
            <span class="card-tag ${tagClass}">${escapeHtml(s.categoria)}</span>
            
          </div>

          <h3 class="card-service-title">${escapeHtml(s.nombre)}</h3>
          <p class="card-service-desc">${escapeHtml(s.descripcion)}</p>

          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.8rem;">
            
            
          </div>
        </div>

        <div>
          <div class="card-divider"></div>

          <div class="card-company-box">
            <div class="company-main">
              <div class="company-avatar">🏢</div>
              <div>
                <span class="company-name">${escapeHtml(companyName(s.empresa_razon_social))}</span>
              </div>
            </div>
            <span class="city-pill">📍 ${escapeHtml(s.empresa_ciudad || 'Perú')}</span>
          </div>

          <div class="card-price-row">
            <div>
              <span style="font-size: 0.72rem; color: var(--navy-muted); display: block;">PRECIO ESTIMADO (S/ PEN)</span>
              <span class="price-text">${escapeHtml(s.precio_referencial || 'A cotizar')}</span>
            </div>
            <span class="modality-text">💻 ${escapeHtml(s.tipo_servicio || 'Presencial/Remoto')}</span>
          </div>

          <div class="card-actions-row">
            ${s.empresa_telefono ? `
              <a href="tel:${escapeHtml(s.empresa_telefono)}" class="btn-card-primary" title="Llamar directamente">
                📞 Llamar
              </a>
            ` : ''}

            ${telLimpio ? `
              <a href="${wsLink}" target="_blank" rel="noopener noreferrer" class="btn-card-ghost" title="Escribir por WhatsApp con mensaje comercial">
                💬 WhatsApp
              </a>
            ` : ''}

            <button class="btn-card-ghost" onclick="verDetalleEmpresa(${s.empresa_id})">
              Ver Ficha ↗
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// =============================================================================
// 4. DIRECTORIO DE EMPRESAS VERIFICADAS
// =============================================================================
async function cargarEmpresas() {
  const grid = document.getElementById('empresasGrid');
  const emptyState = document.getElementById('emptyEmpresasState');

  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas`);
    const data = await res.json();
    state.empresas = data.datos || [];

    if (state.empresas.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    grid.innerHTML = state.empresas.map(e => `
      <article class="card-item">
        <div>
          <div class="card-top-bar">
            <span class="card-tag tag-soporte">RUC: ${escapeHtml(e.ruc)}</span>
            
          </div>

          <h3 class="card-service-title">${escapeHtml(companyName(e.razon_social))}</h3>
          <p class="card-service-desc">${escapeHtml(e.descripcion || 'Proveedor tecnológico autorizado en Quantic Technology.')}</p>

          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.8rem;">
            
            
          </div>
        </div>

        <div>
          <div class="card-divider"></div>

          <div style="display: grid; gap: 0.5rem; font-size: 0.86rem; margin-bottom: 1.2rem;">
            <div><strong>📍 Sede:</strong> ${escapeHtml(e.ciudad)} ${e.direccion ? `&bull; <small style="color: var(--navy-muted);">${escapeHtml(e.direccion)}</small>` : ''}</div>
            <div><strong>✉️ Correo:</strong> ${escapeHtml(e.email_contacto)}</div>
            <div><strong>📞 Teléfono / WhatsApp:</strong> ${escapeHtml(e.telefono)}</div>
            ${e.sitio_web ? `
              <div><strong>🌐 Web:</strong> <a href="${safeWebsite(e.sitio_web)}" target="_blank" rel="noopener noreferrer" style="color: var(--cyan-primary); font-weight: 600;">${escapeHtml(e.sitio_web)} ↗</a></div>
            ` : ''}
          </div>

          <button class="btn-elegant-primary" style="width: 100%; justify-content: center;" data-company-name="${escapeHtml(companyName(e.razon_social))}" onclick="filtrarPorEmpresaEnCatalogo(this.dataset.companyName)">
            Explorar Sus Servicios en Catálogo →
          </button>
        </div>
      </article>
    `).join('');
  } catch (error) {
    console.error('Error al cargar empresas:', error);
  }
}

function filtrarPorEmpresaEnCatalogo(nombreEmpresa) {
  resetCatalogFilters();
  document.getElementById('searchQuery').value = nombreEmpresa;
  document.getElementById('btnClearSearch').style.display = 'block';
  state.filters.q = nombreEmpresa;
  switchTab('catalogo-servicios');
}

async function cargarSelectEmpresasParaServicio() {
  const select = document.getElementById('srvEmpresaSelect');
  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas`);
    const data = await res.json();
    const empresas = (data.datos || []).filter(e => e.ofrece_servicios && (!window.QUANTIC_COMPANY_ID || String(e.id) === String(window.QUANTIC_COMPANY_ID)));

    if (empresas.length === 0) {
      select.innerHTML = '<option value="">No hay empresas verificadas disponibles</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Seleccione una empresa verificada --</option>' +
      empresas.map(e => `<option value="${e.id}">${escapeHtml(companyName(e.razon_social))} (${escapeHtml(e.ciudad)}) - RUC: ${e.ruc}</option>`).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Error al cargar empresas</option>';
  }
}

// =============================================================================
// 5. FORMULARIOS DE REGISTRO
// =============================================================================
function initForms() {
  // 1. Registro de Empresa
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

    // Servicio inicial adjunto opcional
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
        region: document.getElementById('empRegion').value.trim(), sede: document.getElementById('empSede').value.trim(),
        ofrece_servicios: true,
        provee_equipos: false,
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

        setTimeout(() => {
          if (confirm('La solicitud está registrada en estado PENDIENTE. ¿Deseas ir al Panel de Aprobación (Demo) para simular su aprobación?')) {
            switchTab('panel-admin-demo');
          }
        }, 500);
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

  // 2. Registro de Servicio Adicional
  const formServicio = document.getElementById('formRegistroServicio');
  formServicio.addEventListener('submit', async (e) => {
    e.preventDefault();

    const empresa_id = document.getElementById('srvEmpresaSelect').value;
    const nombre = document.getElementById('srvNombre').value.trim();
    const categoria = document.getElementById('srvCategoria').value;
    const tipo_servicio = document.getElementById('srvTipo').value;
    const precio_referencial = document.getElementById('srvPrecio').value.trim();
    const descripcion = document.getElementById('srvDescripcion').value.trim();

    if (!empresa_id) {
      mostrarToast('Seleccione una empresa proveedora', 'error');
      return;
    }

    const payload = {
      empresa_id,
      nombre,
      categoria,
      tipo_servicio,
      precio_referencial,
      descripcion
    };

    const btnSubmit = document.getElementById('btnEnviarServicio');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Guardando...</span>';

    try {
      const res = await fetch(`${API_BASE}/catalogo/servicios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.status === 201) {
        mostrarToast('Servicio registrado en estado PENDIENTE', 'success');
        formServicio.reset();
      } else {
        mostrarToast(data.mensaje || 'Error al guardar servicio', 'error');
      }
    } catch (err) {
      console.error(err);
      mostrarToast('Error de conexión', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<span>Guardar Servicio</span> <span class="btn-arrow">→</span>';
    }
  });
}

// =============================================================================
// 6. PANEL DE DEMOSTRACIÓN ADMINISTRATIVA
// =============================================================================
function initAdminPanel() {
  document.querySelectorAll('.admin-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.adminFilterEstado = btn.getAttribute('data-estado');
      cargarSolicitudesAdmin();
    });
  });
}

async function cargarSolicitudesAdmin() {
  const container = document.getElementById('solicitudesContainer');
  const url = `${API_BASE}/demo-admin/solicitudes${state.adminFilterEstado ? '?estado=' + state.adminFilterEstado : ''}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    state.solicitudesAdmin = data.datos || [];

    if (state.solicitudesAdmin.length === 0) {
      container.innerHTML = `
        <div class="empty-glass-state">
          <div class="empty-graphic">📭</div>
          <h3>Sin solicitudes para este filtro</h3>
          <p>Puede postular una empresa desde la pestaña de registro para evaluarla aquí.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.solicitudesAdmin.map(sol => {
      const isPendiente = sol.estado_verificacion === 'PENDIENTE';
      const isAprobado = sol.estado_verificacion === 'APROBADO';
      const isInactivo = sol.estado_verificacion === 'INACTIVO';
      const isRechazado = sol.estado_verificacion === 'RECHAZADO';

      const statusBadge = isAprobado 
        ? '<span class="status-pill-badge" style="background: #dcfce7; color: #166534;">HABILITADO / ACTIVO ✓</span>'
        : isInactivo
          ? '<span class="status-pill-badge status-inactivo">INHABILITADO / PAUSADO ⏸</span>'
          : isRechazado
            ? '<span class="status-pill-badge" style="background: #fee2e2; color: #991b1b;">RECHAZADO ✗</span>'
            : '<span class="status-pill-badge pill-pending">PENDIENTE ⏳</span>';

      return `
        <div class="solicitud-box">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.9rem; flex-wrap: wrap; gap: 0.8rem;">
            <div>
              <h3 style="font-family: var(--font-heading); font-size: 1.28rem; color: var(--navy-title);">${escapeHtml(companyName(sol.razon_social))}</h3>
              <div style="font-size: 0.82rem; color: var(--navy-muted); margin-top: 0.2rem;">
                RUC: <strong>${escapeHtml(sol.ruc)}</strong> &bull; Sede: <strong>${escapeHtml(sol.ciudad)}</strong> &bull; Fecha: ${new Date(sol.created_at).toLocaleString('es-PE')}
              </div>
            </div>
            ${statusBadge}
          </div>

          <div style="background: var(--silver-soft); padding: 1rem; border-radius: 14px; font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.6rem; margin-bottom: 1rem;">
            <div><strong>Contacto:</strong> ${escapeHtml(sol.email_contacto)}</div>
            <div><strong>Teléfono:</strong> ${escapeHtml(sol.telefono)}</div>
            <div><strong>Dirección:</strong> ${escapeHtml(sol.direccion || 'No especificada')}</div>
            <div><strong>Web:</strong> ${sol.sitio_web ? `<a href="${safeWebsite(sol.sitio_web)}" target="_blank" rel="noopener noreferrer" style="color: var(--cyan-primary);">${escapeHtml(sol.sitio_web)}</a>` : 'No registrada'}</div>
          </div>

          <!-- Servicios vinculados con control individual -->
          <div style="border-top: 1px solid var(--silver-border); padding-top: 0.8rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
              <span style="font-size: 0.86rem; font-weight: 700; color: var(--navy-title);">
                Servicios Vinculados (${sol.servicios ? sol.servicios.length : 0}):
              </span>
              <small style="color: var(--navy-muted); font-size: 0.76rem;">Control individual por servicio</small>
            </div>

            ${sol.servicios && sol.servicios.length > 0 ? sol.servicios.map(s => {
              const srvAprobado = s.estado === 'APROBADO';
              const srvInactivo = s.estado === 'INACTIVO';
              const srvPendiente = s.estado === 'PENDIENTE';
              const srvRechazado = s.estado === 'RECHAZADO';

              const badgeServicio = srvAprobado 
                ? '<span class="status-pill-badge" style="font-size: 0.68rem; background: #dcfce7; color: #166534;">ACTIVO ✓</span>'
                : srvInactivo
                  ? '<span class="status-pill-badge status-inactivo" style="font-size: 0.68rem;">INHABILITADO ⏸</span>'
                  : srvRechazado
                    ? '<span class="status-pill-badge" style="font-size: 0.68rem; background: #fee2e2; color: #991b1b;">RECHAZADO ✗</span>'
                    : '<span class="status-pill-badge pill-pending" style="font-size: 0.68rem;">PENDIENTE ⏳</span>';

              return `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid var(--silver-border); padding: 0.65rem 0.95rem; border-radius: 12px; margin-bottom: 0.5rem; font-size: 0.86rem; flex-wrap: wrap; gap: 0.5rem;">
                  <div style="flex: 1; min-width: 220px;">
                    <strong>${escapeHtml(s.nombre)}</strong>
                    <span style="font-size: 0.76rem; color: var(--navy-muted); margin-left: 0.4rem;">
                      (${escapeHtml(s.categoria)} &bull; ${escapeHtml(s.tipo_servicio)} &bull; ${escapeHtml(s.precio_referencial)})
                    </span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${badgeServicio}
                    
                    ${srvAprobado ? `
                      <button class="btn-srv-toggle btn-srv-disable" onclick="cambiarEstadoServicio(${s.id}, 'INACTIVO')" title="Inhabilitar este servicio específico">
                        ⏸ Inhabilitar
                      </button>
                    ` : ''}

                    ${srvInactivo ? `
                      <button class="btn-srv-toggle btn-srv-enable" onclick="cambiarEstadoServicio(${s.id}, 'PENDIENTE')" title="Habilitar este servicio para publicarlo">
                        ▶ Habilitar
                      </button>
                    ` : ''}

                    ${srvPendiente ? `
                      <button class="btn-srv-toggle btn-srv-enable" onclick="cambiarEstadoServicio(${s.id}, 'PENDIENTE')">
                        ✓ Aprobar
                      </button>
                      <button class="btn-srv-toggle btn-srv-reject" onclick="cambiarEstadoServicio(${s.id}, 'RECHAZADO')">
                        ✗ Rechazar
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('') : '<small style="color: var(--navy-muted);">Sin servicios registrados.</small>'}
          </div>

          <!-- Botones de Acción Proveedor Total -->
          <div style="display: flex; gap: 0.7rem; justify-content: flex-end; align-items: center; flex-wrap: wrap; border-top: 1px solid var(--silver-border); padding-top: 1rem;">
            <small style="margin-right: auto; color: var(--navy-muted);">
              ${sol.fecha_revision ? `Última revisión: ${new Date(sol.fecha_revision).toLocaleString('es-PE')}` : 'Aún sin revisión'}
            </small>

            ${isAprobado ? `
              <button class="btn-card-ghost" style="color: #b45309; border-color: #f59e0b; background: #fffbeb;" onclick="cambiarEstadoEmpresa(${sol.id}, 'INACTIVO')" title="Inhabilita la empresa y oculta todos sus servicios del catálogo público">
                ⏸ Inhabilitar Proveedor Total
              </button>
            ` : ''}

            ${isInactivo ? `
              <button class="btn-card-primary" style="background: #10b981;" onclick="cambiarEstadoEmpresa(${sol.id}, 'APROBADO')" title="Habilita nuevamente la empresa en el directorio">
                ▶ Reactivar / Habilitar Proveedor
              </button>
            ` : ''}

            ${isPendiente ? `
              <button class="btn-card-primary" style="background: #10b981; max-width: 240px;" onclick="cambiarEstadoEmpresa(${sol.id}, 'APROBADO')">
                ✓ Aprobar Empresa y Servicios
              </button>
              <button class="btn-card-ghost" style="color: #dc2626; max-width: 150px;" onclick="cambiarEstadoEmpresa(${sol.id}, 'RECHAZADO')">
                ✗ Rechazar
              </button>
            ` : ''}

            ${isRechazado ? `
              <button class="btn-card-ghost" style="max-width: 180px;" onclick="cambiarEstadoEmpresa(${sol.id}, 'PENDIENTE')">
                ↺ Reabrir a Pendiente
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error al cargar administración:', error);
  }
}

async function cambiarEstadoEmpresa(id, nuevoEstado) {
  try {
    const res = await fetch(`${API_BASE}/demo-admin/empresas/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: nuevoEstado,
        notas: `Actualizado desde el panel de revisión (${nuevoEstado})`,
        aprobar_servicios: nuevoEstado === 'APROBADO' ? true : false
      })
    });

    const data = await res.json();
    if (res.ok) {
      mostrarToast(data.mensaje || `Empresa actualizada a estado: ${nuevoEstado}`, 'success');
      cargarSolicitudesAdmin();
      cargarEmpresas();
      cargarCatalogoServicios();
      cargarSelectEmpresasParaServicio();
    } else {
      mostrarToast(data.mensaje || 'Error al actualizar', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarToast('Error de red', 'error');
  }
}

async function cambiarEstadoServicio(id, nuevoEstado) {
  if (window.QUANTIC_COMPANY_ROLE !== 'admin' && nuevoEstado === 'APROBADO') nuevoEstado = 'PENDIENTE';

  try {
    const res = await fetch(`${API_BASE}/${window.QUANTIC_COMPANY_ROLE === 'admin' ? 'demo-admin' : 'catalogo'}/servicios/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });

    const data = await res.json();
    if (res.ok) {
      mostrarToast(data.mensaje || `Servicio actualizado a ${nuevoEstado}`, 'success');
      cargarSolicitudesAdmin();
      cargarCatalogoServicios();
      if (state.empresaAutenticada) {
        refrescarPortalActual();
      }
    } else {
      mostrarToast(data.mensaje || 'Error al actualizar servicio', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarToast('Error de red al actualizar servicio', 'error');
  }
}

// =============================================================================
// 6.5. PORTAL DE EMPRESAS PROVEEDORAS (AUTOGESTIÓN COMERCIAL)
// =============================================================================
function initPortalEmpresa() {
  const formAcceso = document.getElementById('formAccesoPortal');
  if (formAcceso) {
    formAcceso.addEventListener('submit', (e) => {
      e.preventDefault();
      const ruc = document.getElementById('portalRucInput').value.trim();
      if (!/^\d{11}$/.test(ruc)) {
        mostrarToast('El RUC debe tener exactamente 11 dígitos numéricos', 'error');
        return;
      }
      ingresarAlPortal(ruc);
    });
  }

  const btnCerrar = document.getElementById('btnCerrarSesionPortal');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', () => {
      state.empresaAutenticada = null;
      document.getElementById('portalEmpresaDashboard').style.display = 'none';
      document.getElementById('portalEmpresaLogin').style.display = 'block';
      document.getElementById('portalRucInput').value = '';
      mostrarToast('Sesión de empresa finalizada', 'info');
    });
  }

  const btnEditarEmp = document.getElementById('btnEditarMiEmpresa');
  if (btnEditarEmp) {
    btnEditarEmp.addEventListener('click', abrirModalEditarEmpresa);
  }

  const btnNuevoSrv = document.getElementById('btnNuevoServicioDesdePortal');
  if (btnNuevoSrv) {
    btnNuevoSrv.addEventListener('click', () => {
      switchTab('registro-servicio');
      if (state.empresaAutenticada) {
        setTimeout(() => {
          const select = document.getElementById('srvEmpresaSelect');
          if (select) select.value = state.empresaAutenticada.id;
        }, 150);
      }
    });
  }

  const formModalEmp = document.getElementById('formModalEditarEmpresa');
  if (formModalEmp) {
    formModalEmp.addEventListener('submit', guardarCambiosEmpresa);
  }

  const formModalSrv = document.getElementById('formModalEditarServicio');
  if (formModalSrv) {
    formModalSrv.addEventListener('submit', guardarCambiosServicio);
  }

  window.addEventListener('click', (e) => {
    const modalEmp = document.getElementById('modalEditarEmpresa');
    const modalSrv = document.getElementById('modalEditarServicio');
    if (e.target === modalEmp) cerrarModalEditarEmpresa();
    if (e.target === modalSrv) cerrarModalEditarServicio();
  });
}

async function cargarPortalEmpresaChips() {
  const container = document.getElementById('quickPortalSelectChips');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas`);
    const data = await res.json();
    const emps = data.datos || [];

    if (emps.length === 0) {
      container.innerHTML = `<span style="font-size:0.8rem; color:var(--navy-muted);">No hay empresas disponibles aún. Envíe una solicitud primero.</span>`;
      return;
    }

    container.innerHTML = emps.map(emp => `
      <button type="button" class="admin-pill-btn" onclick="ingresarAlPortal('${escapeHtml(emp.ruc)}')">
        🏢 ${escapeHtml(companyName(emp.razon_social))} (${escapeHtml(emp.ruc)})
      </button>
    `).join('');
  } catch (err) {
    console.error('Error al cargar chips del portal:', err);
  }
}

async function ingresarAlPortal(ruc) {
  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas/perfil/ruc/${encodeURIComponent(ruc)}`);
    const data = await res.json();

    if (!res.ok || !data.datos) {
      mostrarToast(data.mensaje || 'No se encontró empresa registrada con ese RUC', 'error');
      return;
    }

    state.empresaAutenticada = data.datos;
    renderizarPortalEmpresa();
    document.getElementById('portalEmpresaLogin').style.display = 'none';
    document.getElementById('portalEmpresaDashboard').style.display = 'block';
    mostrarToast(`¡Bienvenido! Sesión activa: ${state.empresaAutenticada.razon_social}`, 'success');
  } catch (err) {
    console.error('Error al ingresar al portal:', err);
    mostrarToast('Error de comunicación con el servidor', 'error');
  }
}

async function refrescarPortalActual() {
  if (!state.empresaAutenticada || !state.empresaAutenticada.ruc) return;
  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas/perfil/ruc/${encodeURIComponent(state.empresaAutenticada.ruc)}`);
    const data = await res.json();
    if (res.ok && data.datos) {
      state.empresaAutenticada = data.datos;
      renderizarPortalEmpresa();
    }
  } catch (err) {
    console.error('Error refrescando datos del portal:', err);
  }
}

function renderizarPortalEmpresa() {
  const emp = state.empresaAutenticada;
  if (!emp) return;

  document.getElementById('portalNombreEmpresa').textContent = companyName(emp.razon_social);
  document.getElementById('portalRucText').textContent = emp.ruc;
  document.getElementById('portalCiudadText').textContent = emp.ciudad;
  document.getElementById('portalTelefonoText').textContent = emp.telefono;
  document.getElementById('portalEmailText').textContent = emp.email_contacto;
  document.getElementById('portalDireccionText').textContent = emp.direccion || 'Sin dirección física registrada';
  
  const webEl = document.getElementById('portalWebText');
  if (emp.sitio_web) {
    webEl.innerHTML = `<a href="${safeWebsite(emp.sitio_web)}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan-primary); text-decoration:underline;">${escapeHtml(emp.sitio_web)} ↗</a>`;
  } else {
    webEl.textContent = 'Sin sitio web';
  }

  document.getElementById('portalDescText').textContent = emp.descripcion || 'Sin descripción corporativa registrada.';

  const badgeEstado = document.getElementById('portalBadgeEstado');
  if (emp.estado_verificacion === 'APROBADO') {
    badgeEstado.className = 'status-pill-badge status-aprobado';
    badgeEstado.style.background = '#dcfce7';
    badgeEstado.style.color = '#166534';
    badgeEstado.textContent = 'HABILITADO EN CATÁLOGO ✓';
  } else if (emp.estado_verificacion === 'INACTIVO') {
    badgeEstado.className = 'status-pill-badge status-inactivo';
    badgeEstado.style.background = '#fef3c7';
    badgeEstado.style.color = '#92400e';
    badgeEstado.textContent = 'PROVEEDOR PAUSADO / INHABILITADO ⏸';
  } else if (emp.estado_verificacion === 'RECHAZADO') {
    badgeEstado.className = 'status-pill-badge status-rechazado';
    badgeEstado.style.background = '#fee2e2';
    badgeEstado.style.color = '#991b1b';
    badgeEstado.textContent = 'NO HABILITADO ✗';
  } else {
    badgeEstado.className = 'status-pill-badge status-pendiente';
    badgeEstado.style.background = '#e0f2fe';
    badgeEstado.style.color = '#0369a1';
    badgeEstado.textContent = 'EN REVISIÓN INICIAL ⏳';
  }

  const grid = document.getElementById('portalServiciosGrid');
  const servicios = emp.servicios || [];

  if (servicios.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--white-card); border-radius: 20px; border: 1.5px dashed var(--silver-border);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📦</div>
        <h3 style="color: var(--navy-title);">No tiene servicios registrados aún</h3>
        <p style="color: var(--navy-muted); margin-bottom: 1.2rem;">Agregue su primer servicio tecnológico para publicarlo en el directorio.</p>
        <button class="btn-elegant-primary" onclick="switchTab('registro-servicio')">➕ Publicar Primer Servicio</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = servicios.map(s => {
    const isActivo = s.estado === 'APROBADO';
    const isInactivo = s.estado === 'INACTIVO';

    let badgeHtml = '';
    if (isActivo) {
      badgeHtml = `<span class="service-chip" style="background:#dcfce7; color:#166534; font-weight:700;">PUBLICADO Y ACTIVO ✓</span>`;
    } else if (isInactivo) {
      badgeHtml = `<span class="service-chip" style="background:#fef3c7; color:#92400e; font-weight:700;">PAUSADO / INACTIVO ⏸</span>`;
    } else {
      badgeHtml = `<span class="service-chip" style="background:#e0f2fe; color:#0369a1; font-weight:700;">EN EVALUACIÓN ⏳</span>`;
    }

    return `
      <article class="service-card" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem; gap:0.5rem;">
            ${badgeHtml}
            <span style="font-size:0.75rem; color:var(--navy-muted); font-weight:600;">ID #${s.id}</span>
          </div>

          <h3 class="service-title" style="font-size:1.15rem; margin-bottom:0.4rem;">${escapeHtml(s.nombre)}</h3>
          
          <div style="font-size:0.82rem; color:var(--cyan-primary); font-weight:700; margin-bottom:0.7rem;">
            📂 ${escapeHtml(s.categoria)} &bull; 💻 Modalidad: ${escapeHtml(s.tipo_servicio || 'Presencial')}
          </div>

          <div style="background:var(--silver-soft); border-radius:12px; padding:0.6rem 0.8rem; margin-bottom:0.8rem; display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:0.82rem; color:var(--navy-body); font-weight:600;">Precio Referencial:</span>
            <span style="font-size:0.95rem; color:var(--navy-title); font-weight:800;">${escapeHtml(s.precio_referencial || 'A cotizar')}</span>
          </div>

          <p class="service-desc" style="font-size:0.88rem; line-height:1.5;">${escapeHtml(s.descripcion)}</p>
        </div>

        <div style="margin-top:1.2rem; pt-3; border-top:1px solid var(--silver-border); display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button class="btn-card-primary" onclick="abrirModalEditarServicio(${s.id})" style="flex:1; justify-content:center; padding:0.6rem;">
            ✏️ Editar Oferta
          </button>
          
          ${isActivo ? `
            <button class="btn-card-ghost" onclick="cambiarEstadoServicio(${s.id}, 'INACTIVO')" title="Pausar temporalmente este servicio" style="color:#b45309; border-color:#f59e0b; padding:0.6rem;">
              ⏸ Pausar
            </button>
          ` : ''}

          ${isInactivo ? `
            <button class="btn-card-ghost" onclick="cambiarEstadoServicio(${s.id}, 'PENDIENTE')" title="Reactivar y mostrar en el catálogo" style="color:#10b981; border-color:#10b981; padding:0.6rem;">
              ▶ Reactivar
            </button>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function abrirModalEditarEmpresa() {
  const emp = state.empresaAutenticada;
  if (!emp) return;

  document.getElementById('editEmpresaId').value = emp.id;
  document.getElementById('editEmpRegion').value = emp.region || '';
  document.getElementById('editEmpSede').value = emp.sede || '';
  document.getElementById('modalEditEmpresaTitulo').textContent = `Editar: ${emp.razon_social}`;
  document.getElementById('editEmpTelefono').value = emp.telefono || '';
  document.getElementById('editEmpCiudad').value = emp.ciudad || 'Lima';
  document.getElementById('editEmpDireccion').value = emp.direccion || '';
  document.getElementById('editEmpSitioWeb').value = emp.sitio_web || '';
  document.getElementById('editEmpDescripcion').value = emp.descripcion || '';

  document.getElementById('modalEditarEmpresa').style.display = 'flex';
}

function cerrarModalEditarEmpresa() {
  document.getElementById('modalEditarEmpresa').style.display = 'none';
}

async function guardarCambiosEmpresa(e) {
  e.preventDefault();
  const empId = document.getElementById('editEmpresaId').value;
  if (!empId) return;

  const payload = {
    region: document.getElementById('editEmpRegion').value.trim(), sede: document.getElementById('editEmpSede').value.trim(),
    telefono: document.getElementById('editEmpTelefono').value.trim(),
    ciudad: document.getElementById('editEmpCiudad').value,
    direccion: document.getElementById('editEmpDireccion').value.trim(),
    sitio_web: document.getElementById('editEmpSitioWeb').value.trim(),
    descripcion: document.getElementById('editEmpDescripcion').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas/${empId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      mostrarToast('Datos comerciales de la empresa actualizados con éxito', 'success');
      cerrarModalEditarEmpresa();
      await refrescarPortalActual();
      cargarEmpresas();
      cargarCatalogoServicios();
    } else {
      mostrarToast(data.mensaje || 'Error al actualizar empresa', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarToast('Error de red al actualizar la empresa', 'error');
  }
}

function abrirModalEditarServicio(servicioId) {
  if (!state.empresaAutenticada || !state.empresaAutenticada.servicios) return;
  const srv = state.empresaAutenticada.servicios.find(s => s.id === servicioId);
  if (!srv) {
    mostrarToast('No se encontró el servicio solicitado', 'error');
    return;
  }

  document.getElementById('editServicioId').value = srv.id;
  document.getElementById('modalEditServicioTitulo').textContent = `Editar: ${srv.nombre}`;
  document.getElementById('editSrvNombre').value = srv.nombre || '';
  document.getElementById('editSrvCategoria').value = srv.categoria || 'Soporte técnico';
  document.getElementById('editSrvTipo').value = srv.tipo_servicio || 'Presencial';
  document.getElementById('editSrvPrecio').value = srv.precio_referencial || '';
  document.getElementById('editSrvDescripcion').value = srv.descripcion || '';

  document.getElementById('modalEditarServicio').style.display = 'flex';
}

function cerrarModalEditarServicio() {
  document.getElementById('modalEditarServicio').style.display = 'none';
}

async function guardarCambiosServicio(e) {
  e.preventDefault();
  const srvId = document.getElementById('editServicioId').value;
  if (!srvId) return;

  const payload = {
    nombre: document.getElementById('editSrvNombre').value.trim(),
    categoria: document.getElementById('editSrvCategoria').value,
    tipo_servicio: document.getElementById('editSrvTipo').value,
    precio_referencial: document.getElementById('editSrvPrecio').value.trim(),
    descripcion: document.getElementById('editSrvDescripcion').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/catalogo/servicios/${srvId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      mostrarToast('Servicio y precio referencial actualizados con éxito', 'success');
      cerrarModalEditarServicio();
      await refrescarPortalActual();
      cargarCatalogoServicios();
    } else {
      mostrarToast(data.mensaje || 'Error al actualizar servicio', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarToast('Error de red al actualizar servicio', 'error');
  }
}

// =============================================================================
// 7. MODAL DETALLE DE EMPRESA
// =============================================================================
async function verDetalleEmpresa(empresaId) {
  try {
    const res = await fetch(`${API_BASE}/catalogo/empresas/${empresaId}`);
    if (!res.ok) {
      mostrarToast('No se pudo cargar la empresa', 'error');
      return;
    }

    const data = await res.json();
    const e = data.datos;

    document.getElementById('modalEmpresaNombre').textContent = companyName(e.razon_social);
    const body = document.getElementById('modalEmpresaBody');

    body.innerHTML = `
      <div style="display: grid; gap: 0.6rem; font-size: 0.92rem; background: var(--silver-soft); padding: 1.2rem; border-radius: 16px;">
        <div><strong>📋 RUC:</strong> ${escapeHtml(e.ruc)}</div>
        <div><strong>📍 Ciudad:</strong> ${escapeHtml(e.ciudad)}</div>
        ${e.direccion ? `<div><strong>📌 Dirección:</strong> ${escapeHtml(e.direccion)}</div>` : ''}
        <div><strong>✉️ Correo:</strong> <a href="mailto:${escapeHtml(e.email_contacto)}" style="color: var(--cyan-primary); font-weight: 600;">${escapeHtml(e.email_contacto)}</a></div>
        <div><strong>📞 Teléfono:</strong> <a href="tel:${escapeHtml(e.telefono)}" style="color: var(--cyan-primary); font-weight: 600;">${escapeHtml(e.telefono)}</a></div>
        ${e.sitio_web ? `<div><strong>🌐 Sitio Web:</strong> <a href="${safeWebsite(e.sitio_web)}" target="_blank" rel="noopener noreferrer" style="color: var(--cyan-primary); text-decoration: underline;">${escapeHtml(e.sitio_web)} ↗</a></div>` : ''}
      </div>

      ${e.descripcion ? `
        <div style="background: #fff; border: 1px solid var(--silver-border); padding: 1.1rem; border-radius: 16px; font-size: 0.9rem;">
          <strong style="color: var(--navy-title);">Acerca de la empresa:</strong>
          <p style="margin-top: 0.35rem; color: var(--navy-body); line-height: 1.6;">${escapeHtml(e.descripcion)}</p>
        </div>
      ` : ''}

      <div>
        <h4 style="font-family: var(--font-heading); font-size: 1.15rem; color: var(--navy-title); margin-bottom: 0.6rem;">
          Servicios Autorizados en Catálogo (${e.servicios ? e.servicios.length : 0})
        </h4>
        ${e.servicios && e.servicios.length > 0 ? e.servicios.map(s => `
          <div style="background: #fff; border: 1px solid var(--silver-border); padding: 0.9rem; border-radius: 14px; margin-bottom: 0.6rem;">
            <div style="font-weight: 700; color: var(--navy-title); font-size: 0.98rem;">${escapeHtml(s.nombre)}</div>
            <div style="font-size: 0.78rem; color: var(--cyan-primary); font-weight: 600; margin: 0.2rem 0;">
              ${escapeHtml(s.categoria)} &bull; ${escapeHtml(s.tipo_servicio)} &bull; ${escapeHtml(s.precio_referencial)}
            </div>
            <p style="font-size: 0.86rem; color: var(--navy-body); margin-top: 0.25rem;">${escapeHtml(s.descripcion)}</p>
          </div>
        `).join('') : '<p style="color: var(--navy-muted); font-size: 0.88rem;">No posee servicios autorizados en este momento.</p>'}
      </div>
    `;

    document.getElementById('empresaModal').style.display = 'flex';
  } catch (err) {
    console.error(err);
    mostrarToast('Error al consultar empresa', 'error');
  }
}

function cerrarModal() {
  document.getElementById('empresaModal').style.display = 'none';
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('empresaModal');
  if (e.target === modal) {
    cerrarModal();
  }
});

// =============================================================================
// 8. NOTIFICACIONES TOAST
// =============================================================================
function mostrarToast(mensaje, tipo = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;

  const icon = tipo === 'success' ? '✅' : tipo === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(mensaje)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeWebsite(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#'; } catch { return '#'; } }
