// Shared company identity. Tokens stay in memory and are accepted only from the configured portal.
(() => {
  const originalFetch = window.fetch.bind(window);
  const allowedOrigins = window.COMPANY_PORTAL_ORIGINS || [];
  let token = '', parentOrigin = '', expirationTimer, identity = null;
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (token && url.origin === location.origin && url.pathname.startsWith('/api/v1/')) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', 'Bearer ' + token);
      return originalFetch(input, { ...init, headers });
    }
    return originalFetch(input, init);
  };
  async function api(path, method = 'GET', body) {
    const res = await fetch('/api/v1/' + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || data.message || 'No se pudo completar la operacion.');
    return data;
  }
  function showMessage(message, error = false) {
    const node = document.getElementById('companyMessage');
    if (node) { node.textContent = message; node.style.color = error ? '#b91c1c' : '#166534'; }
  }
  function applyIdentity() {
    const role = identity?.role;
    const company = identity?.datos;
    const canAdmin = role === 'admin';
    window.QUANTIC_COMPANY_ID = company?.id || null;
    window.QUANTIC_COMPANY_ROLE = role || null;
    document.querySelectorAll('[data-tab="panel-admin-demo"]').forEach(el => { el.hidden = !canAdmin; });
    document.querySelectorAll('[data-tab="portal-empresa"]').forEach(el => { el.hidden = !canAdmin && !company; });
    document.querySelectorAll('[data-tab="registro-servicio"]').forEach(el => { el.hidden = !canAdmin && !company?.ofrece_servicios; });
    const notice = document.getElementById('companySessionNotice');
    if (notice) notice.textContent = identity ? (canAdmin ? 'Sesion de administrador: gestiona aqui las empresas y sus accesos.' : company ? 'Empresa: ' + company.razon_social + (company.provee_equipos ? ' · Puede publicar stock.' : ' · Ofrece servicios.') : 'Sesion de consulta del directorio.') : 'Para gestionar empresas o publicar ofertas, inicia sesion en el inventario y abre Servicios adicionales.';
    const stock = document.getElementById('companyStockLink');
    if (stock) stock.hidden = !company?.provee_equipos;
    const form = document.getElementById('formAccesoPortal');
    if (form) form.hidden = !canAdmin;
    const changeCompany = document.getElementById('btnCerrarSesionPortal');
    if (changeCompany) changeCompany.hidden = !canAdmin;
    const newService = document.getElementById('btnNuevoServicioDesdePortal');
    if (newService) newService.hidden = !canAdmin && !company?.ofrece_servicios;
    const servicesGrid = document.getElementById('portalServiciosGrid');
    if (servicesGrid) servicesGrid.hidden = Boolean(company && !company.ofrece_servicios);
    const chips = document.getElementById('quickPortalSelectChips');
    if (chips) chips.hidden = !canAdmin;
    if (!identity) {
      if (typeof state !== 'undefined') state.empresaAutenticada = null;
      document.getElementById('portalEmpresaDashboard')?.style.setProperty('display', 'none');
      if (typeof switchTab === 'function') switchTab('catalogo-servicios');
    }
  }
  async function loadAdminCompanies() {
    if (identity?.role !== 'admin') return;
    const select = document.getElementById('companyManageSelect');
    const prior = select.value;
    const { datos } = await api('demo-admin/solicitudes');
    select.replaceChildren();
    for (const company of datos) {
      const option = new Option(company.razon_social + ' · ' + company.ruc + ' · ' + company.estado_verificacion, company.id);
      option.company = company;
      select.append(option);
    }
    if ([...select.options].some(o => o.value === prior)) select.value = prior;
    select.dispatchEvent(new Event('change'));
  }
  window.addEventListener('message', async event => {
    if (event.source !== parent || parent === window || !allowedOrigins.includes(event.origin) || event.data?.type !== 'quantic-company-session' || typeof event.data.token !== 'string') return;
    token = event.data.token; parentOrigin = event.origin;
    clearTimeout(expirationTimer);
    expirationTimer = setTimeout(() => { token = ''; identity = null; applyIdentity(); }, 60000);
    try {
      const previousRole = identity?.role;
      const previousCompany = identity?.datos?.id;
      identity = await api('mi-empresa');
      applyIdentity();
      if (identity.role === 'admin' && previousRole !== 'admin') await loadAdminCompanies();
      if (identity.datos && identity.datos.id !== previousCompany && typeof ingresarAlPortal === 'function') await ingresarAlPortal(identity.datos.ruc);
      if (identity.datos && identity.datos.id !== previousCompany && typeof cargarSelectEmpresasParaServicio === 'function') await cargarSelectEmpresasParaServicio();
    } catch { token = ''; identity = null; applyIdentity(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.createElement('p'); notice.id = 'companySessionNotice'; notice.className = 'company-session-notice';
    document.querySelector('.main-wrapper').prepend(notice);
    const registration = document.getElementById('formRegistroEmpresa');
    const activities = document.createElement('fieldset'); activities.className = 'company-activities';
    activities.innerHTML = '<legend>Actividades de la empresa</legend><label><input type="checkbox" id="empOfreceServicios" checked> Ofrece servicios tecnologicos</label><label><input type="checkbox" id="empProveeEquipos"> Provee equipos y publicara stock en Excel</label><p>Selecciona una o ambas. El administrador revisara la solicitud antes de habilitar el acceso.</p>';
    registration.prepend(activities);
    const panel = document.createElement('section'); panel.className = 'company-management';
    panel.innerHTML = '<h3>Empresas y accesos</h3><p>Un registro por RUC. Revisa las solicitudes mas abajo y aprueba la empresa antes de crear su acceso.</p><label for="companyManageSelect">Empresa</label><select id="companyManageSelect"></select><div class="company-activities"><label><input type="checkbox" id="companyServices"> Ofrece servicios</label><label><input type="checkbox" id="companyEquipment"> Provee equipos / carga Excel</label></div><div class="company-buttons"><button type="button" id="companySaveActivities" class="btn-elegant-primary">Guardar actividades</button><button type="button" id="companyReload" class="btn-elegant-ghost">Actualizar empresas</button><button type="button" id="companyImport" class="btn-elegant-ghost">Importar proveedores existentes</button></div><form id="companyAccessForm"><label for="companyAccountEmail">Correo de acceso</label><input id="companyAccountEmail" type="email" autocomplete="off" required><label for="companyAccountPassword">Contrasena (minimo 15 caracteres)</label><input id="companyAccountPassword" type="password" minlength="15" maxlength="72" autocomplete="new-password" required><label for="companyAccountAction">Operacion</label><select id="companyAccountAction"><option value="crear">Crear acceso</option><option value="password">Cambiar contrasena del acceso existente</option></select><button class="btn-elegant-primary" type="submit">Guardar acceso</button></form><p id="companyMessage" role="status"></p>';
    document.getElementById('tab-panel-admin-demo').prepend(panel);
    const legacy = document.createElement('form'); legacy.className = 'company-activities';
    legacy.innerHTML = '<label for="companyLegacyId">Vincular un proveedor existente sin RUC (conserva su historial)</label><input id="companyLegacyId" placeholder="MAY-..." pattern="MAY-[A-Z0-9-]{4,58}" required><button class="btn-elegant-ghost" type="submit">Vincular a la empresa seleccionada</button>';
    panel.append(legacy);
    legacy.addEventListener('submit', event => {
      event.preventDefault();
      void run(event.submitter, async () => {
        if (!select.value) throw new Error('Selecciona una empresa aprobada.');
        const result = await api('integracion/empresas/' + select.value + '/vincular', 'POST', { idMayorista: document.getElementById('companyLegacyId').value.trim() });
        showMessage(result.mensaje);
      });
    });
    const select = document.getElementById('companyManageSelect');
    select.addEventListener('change', () => {
      const c = select.selectedOptions[0]?.company;
      document.getElementById('companyServices').checked = Boolean(c?.ofrece_servicios);
      document.getElementById('companyEquipment').checked = Boolean(c?.provee_equipos);
      document.getElementById('companyAccountEmail').value = c?.email_contacto || '';
      document.getElementById('companyAccountPassword').value = '';
    });
    async function run(button, fn) {
      button.disabled = true;
      try { await fn(); } catch (err) { showMessage(err.message, true); } finally { button.disabled = false; }
    }
    document.getElementById('companyReload').onclick = event => run(event.target, loadAdminCompanies);
    document.getElementById('companySaveActivities').onclick = event => run(event.target, async () => {
      if (!select.value) throw new Error('Selecciona una empresa.');
      const result = await api('integracion/empresas/' + select.value + '/actividades', 'PATCH', { ofrece_servicios: document.getElementById('companyServices').checked, provee_equipos: document.getElementById('companyEquipment').checked });
      showMessage(result.mensaje); await loadAdminCompanies();
    });
    document.getElementById('companyImport').onclick = event => run(event.target, async () => {
      const result = await api('integracion/importar-proveedores', 'POST', {});
      const d = result.datos;
      showMessage(result.mensaje + ' Nuevas: ' + d.creadas + '. Existentes: ' + d.existentes + '. Requieren revision de RUC: ' + d.pendientes.map(p => p.idMayorista).join(', '));
      await loadAdminCompanies();
      if (typeof cargarSolicitudesAdmin === 'function') await cargarSolicitudesAdmin();
    });
    document.getElementById('companyAccessForm').addEventListener('submit', event => {
      event.preventDefault();
      void run(event.submitter, async () => {
        if (!select.value) throw new Error('Selecciona una empresa.');
        const passwordInput = document.getElementById('companyAccountPassword');
        try {
          const result = await api('integracion/empresas/' + select.value + '/acceso', 'POST', { email: document.getElementById('companyAccountEmail').value, password: passwordInput.value, accion: document.getElementById('companyAccountAction').value });
          showMessage(result.mensaje);
        } finally { passwordInput.value = ''; }
      });
    });
    const stock = document.createElement('button'); stock.type = 'button'; stock.id = 'companyStockLink'; stock.className = 'btn-elegant-primary'; stock.textContent = 'Subir Excel de stock';
    stock.onclick = () => { if (parentOrigin) parent.postMessage({ type: 'quantic-company-stock' }, parentOrigin); };
    document.getElementById('tab-portal-empresa').prepend(stock);
    applyIdentity();
    if (parent !== window) for (const origin of allowedOrigins) parent.postMessage({ type: 'quantic-company-ready' }, origin);
  });
})();
