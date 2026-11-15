// Deterministic, local classification: no external AI service or product data transfer.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const rules = [
  ['Software y licencias', /\b(licencias?|licenses?|licensing|subscriptions?|suscripcion|renewals?|renovacion|forticare|fortiguard|software|saas)\b/],
  ['Accesorios', /\b(cables?|adaptadores?|adapters?|transceivers?|sfp\+?|qsfp|mounting|rackmount|brackets?|teclados?|keyboards?|mouse|mouses|mice)\b/],
  ['Seguridad de red', /\b(firewalls?|fortigate|fortiweb|fortimail|palo alto|checkpoint|check point)\b/],
  ['Redes', /\b(switch(?:es)?|routers?|fortiswitch|fortiap|access points?|puntos? de acceso|wireless|wi-?fi)\b/],
  ['Computadoras', /\b(laptops?|notebooks?|portatiles?|desktops?|computadoras?|ordenadores?|workstations?|thinkpads?|macbooks?)\b/],
  ['Servidores', /\b(servers?|servidores?|poweredge|proliant)\b/],
  ['Almacenamiento', /\b(ssd|hdd|nas|storage|almacenamiento|discos? duros?|hard drives?)\b/],
  ['Energía', /\b(ups|sai|pdu|baterias?|batteries|battery|fuentes? de poder|power supply)\b/],
  ['Impresión', /\b(impresoras?|printers?|toner|cartuchos?|scanners?|escaneres?)\b/],
  ['Videovigilancia', /\b(camaras?|cameras?|cctv|nvr|dvr|videovigilancia)\b/],
];
export function inferCategory(description) {
  const value = normalize(description);
  // Ordered specific rules prevent calling a firewall licence or cable a firewall.
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || null;
}
export function classifyCategory({ explicit, section, description }) {
  const value = typeof explicit === 'string' ? explicit.trim() : '';
  if (value && normalize(value) !== 'sin categoria') return { categoria: value, categoriaOrigen: 'EXPLICITA' };
  if (section) return { categoria: section, categoriaOrigen: 'SECCION' };
  const inferred = inferCategory(description);
  return { categoria: inferred || 'Sin categoría', categoriaOrigen: inferred ? 'DESCRIPCION' : 'SIN_CLASIFICAR' };
}
export function productCategory(product) {
  const classified = classifyCategory({ explicit: product.categoria, description: product.descripcion });
  return { ...classified, ...(classified.categoriaOrigen === 'EXPLICITA' && product.categoriaOrigen ? { categoriaOrigen: product.categoriaOrigen } : {}) };
}
