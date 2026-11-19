// Supplier accounts belong to this service; only administrators use federation.
(() => {
  const originalFetch = window.fetch.bind(window);
  let token = '', identity = null, expiration;
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
    if (!res.ok) throw new Error(data.mensaje || 'No se pudo completar la operacion.');
    return data;
  }
  function apply() {
    const admin = identity?.role === 'admin', company = identity?.datos;
    window.QUANTIC_COMPANY_ROLE = identity?.role || null;
    window.QUANTIC_COMPANY_ID = company?.id || null;
    document.querySelectorAll('[data-tab="panel-admin-demo"]').forEach(el => { el.hidden = !admin; });
    document.querySelectorAll('[data-tab="registro-servicio"]').forEach(el => { el.hidden = !admin && company?.estado_verificacion !== 'APROBADO'; });
    document.getElementById('formAccesoPortal').hidden = !admin;
    document.getElementById('btnCerrarSesionPortal').hidden = !admin;
    document.getElementById('quickPortalSelectChips').parentElement.hidden = !admin;
    document.getElementById('localCompanyLogin').hidden = Boolean(identity);
    document.getElementById('localCompanyLogout').hidden = !company;
    document.getElementById('companyAdminAccounts').hidden = !admin;
    document.getElementById('companySessionNotice').textContent = admin ? 'Administracion de Servicios adicionales' : company ? company.razon_social + ' · ' + company.estado_verificacion : 'Accede con tu cuenta de Servicios adicionales. Mayoristas utiliza una cuenta independiente.';
    if (!identity) {
      state.empresaAutenticada = null;
      document.getElementById('portalEmpresaDashboard').style.display = 'none';
      document.getElementById('portalEmpresaLogin').style.display = 'block';
      if (state.currentTab === 'panel-admin-demo' || state.currentTab === 'registro-servicio') switchTab('catalogo-servicios');
    }
  }
  async function accept(value, seconds) {
    token = value;
    try {
      identity = await api('mi-empresa');
      clearTimeout(expiration);
      expiration = setTimeout(() => { token = ''; identity = null; apply(); }, seconds * 1000);
      apply();
      if (identity.datos) await ingresarAlPortal(identity.datos.ruc);
      if (identity.role === 'admin') await loadCompanies();
    } catch (err) { token = ''; identity = null; apply(); throw err; }
  }
  async function loadCompanies() {
    const select = document.getElementById('companyManageSelect'), prior = select.value;
    const data = await api('demo-admin/solicitudes');
    select.replaceChildren(...data.datos.map(c => new Option(companyName(c.razon_social) + ' · ' + c.estado_verificacion, c.id)));
    if ([...select.options].some(o => o.value === prior)) select.value = prior;
  }
  window.addEventListener('message', async event => {
    if (event.source !== parent || parent === window || !(window.COMPANY_PORTAL_ORIGINS || []).includes(event.origin) || event.data?.type !== 'quantic-company-session' || typeof event.data.token !== 'string' || identity?.role === 'empresa') return;
    try { await accept(event.data.token, 60); } catch { /* Remain signed out. */ }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const section = document.createElement('section'); section.className = 'company-management';
    section.innerHTML = '<p id="companySessionNotice" role="status"></p><form id="localCompanyLogin"><h3>Ingresar a Servicios adicionales</h3><label>Correo de acceso<input type="email" name="email" autocomplete="username" required></label><label>Contrasena<input type="password" name="password" autocomplete="current-password" required maxlength="128"></label><button class="btn-elegant-primary">Ingresar</button><p>Si aun no tienes cuenta, envia la solicitud de registro. Quantic revisa la solicitud y entrega el acceso por un canal acordado. Tu perfil se completa con los datos registrados aqui.</p></form><button id="localCompanyLogout" class="btn-elegant-ghost" hidden>Cerrar sesion de empresa</button>';
    document.getElementById('tab-portal-empresa').prepend(section);
    section.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.target, button = event.submitter; button.disabled = true;
      try { const data = await api('cuentas/login', 'POST', { email: form.email.value, password: form.password.value }); await accept(data.token, data.expires_in); }
      catch (err) { mostrarToast(err.message, 'error'); }
      finally { form.password.value = ''; button.disabled = false; }
    };
    document.getElementById('localCompanyLogout').onclick = async () => {
      try { await api('cuentas/logout', 'POST', {}); } finally { clearTimeout(expiration); token = ''; identity = null; apply(); }
    };
    const admin = document.createElement('section'); admin.id = 'companyAdminAccounts'; admin.className = 'company-management'; admin.hidden = true;
    admin.innerHTML = '<h3>Accesos de empresas de servicios</h3><p>Estas cuentas pertenecen solo a Servicios adicionales. La aprobacion de publicaciones es una revision manual de Quantic.</p><form id="companyAccessForm"><label>Empresa<select name="company" id="companyManageSelect" required></select></label><button type="button" id="companyReload" class="btn-elegant-ghost">Actualizar empresas</button><label>Correo de acceso<input type="email" name="email" required></label><label>Contrasena nueva<input type="password" name="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><button class="btn-elegant-primary">Crear o renovar acceso</button></form>';
    document.getElementById('tab-panel-admin-demo').prepend(admin);
    document.getElementById('companyReload').onclick = () => loadCompanies().catch(err => mostrarToast(err.message, 'error'));
    admin.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.target, button = event.submitter; button.disabled = true;
      try { const data = await api('cuentas/empresas/' + form.company.value, 'POST', { email: form.email.value, password: form.password.value }); mostrarToast(data.mensaje, 'success'); }
      catch (err) { mostrarToast(err.message, 'error'); }
      finally { form.password.value = ''; button.disabled = false; }
    };
    for (const [formId,prefix] of [['formRegistroEmpresa','emp'],['formModalEditarEmpresa','editEmp']]) {
      const fields=document.createElement('div'); fields.className='form-grid';
      fields.innerHTML='<label>Region<input id="'+prefix+'Region" maxlength="160"></label><label>Sede<input id="'+prefix+'Sede" maxlength="160" placeholder="Sede principal, sucursal..."></label>';
      document.getElementById(formId).prepend(fields);
    }
    apply();
    if (parent !== window) for (const origin of window.COMPANY_PORTAL_ORIGINS || []) parent.postMessage({ type: 'quantic-company-ready' }, origin);
  });
})();
