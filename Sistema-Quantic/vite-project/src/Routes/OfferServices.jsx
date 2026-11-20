const configuredUrl = import.meta.env.VITE_ADDITIONAL_SERVICES_URL || 'http://localhost:3002';
const portal = new URL(configuredUrl);
const registrationUrl = new URL('/inscribir-empresa.html', portal).href;
export default function OfferServices() {
  return <main className="workspace">
    <span className="eyebrow">MAYORISTAS · CATÁLOGO DE SERVICIOS</span>
    <h1>Ofrecer mis servicios</h1>
    <p className="text-secondary">Postula tu empresa para ofrecer soporte técnico, redes, ciberseguridad o consultoría tecnológica en el directorio de Quantic.</p>
    <section className="panel">
      <h2>¿Cómo formar parte del catálogo?</h2>
      <ol>
        <li>Abre el formulario de inscripción y completa la razón social, RUC de 11 dígitos, correo, teléfono y ciudad de tu empresa.</li>
        <li>Agrega, si lo deseas, la dirección, sitio web y descripción de tu empresa. También puedes presentar un primer servicio con su categoría, modalidad y precio referencial.</li>
        <li>Envía la solicitud. Quedará pendiente de revisión por el administrador del directorio.</li>
        <li>Una vez aprobada, tu empresa podrá aparecer en el directorio. Los servicios presentados también requieren aprobación para publicarse.</li>
      </ol>
      <p>Tu cuenta de mayorista en inventario no inscribe automáticamente a tu empresa en este catálogo. Si ya enviaste una solicitud con el mismo RUC, no debes registrarla otra vez.</p>
      <a className="btn btn-primary" href={registrationUrl} target="_blank" rel="noopener noreferrer">Rellenar formulario de inscripción ↗</a>
      <p className="small text-secondary mt-3">El formulario se abrirá en una nueva pestaña del servicio de servicios adicionales. Podrás conservar abierta tu sesión de inventario.</p>
    </section>
  </main>;
}
