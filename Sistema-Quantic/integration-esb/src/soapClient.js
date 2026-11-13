const NS = 'urn:quantic:notifications:v1';
const escapeXml = value => String(value ?? '').replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));
const readTag = (xml, name) => { const m = xml.match(new RegExp(`<[^>]*:?${name}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${name}\\s*>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'") : undefined; };
export function createSoapClient({ url, key, timeoutMs, consumerSystem = 'esb', fetchImpl = fetch }) {
  return async function invoke(operation, fields, correlationId) {
    const elements = Object.entries({ ...fields, ConsumerSystem: consumerSystem }).map(([name, value]) => `<${name}>${escapeXml(value)}</${name}>`).join('');
    const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${NS}"><soap:Header/><soap:Body><tns:${operation}Request xmlns="${NS}">${elements}</tns:${operation}Request></soap:Body></soap:Envelope>`;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref?.();
    try {
      const response = await fetchImpl(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${NS}#${operation}"`, Authorization: `Bearer ${key}`, 'X-Correlation-ID': correlationId }, body });
      const xml = await response.text();
      if (!response.ok) { const err = new Error(`Proveedor SOAP respondió HTTP ${response.status}.`); err.status = response.status; throw err; }
      if (/<(?:\w+:)?Fault\b/i.test(xml)) { const err = new Error('El proveedor SOAP devolvió un SOAP Fault.'); err.status = 502; throw err; }
      const result = { Success: readTag(xml, 'Success')?.toLowerCase() === 'true', Code: readTag(xml, 'Code'), Message: readTag(xml, 'Message') };
      for (const name of ['SupplierId','SupplierName','ContactEmail','AdditionalMessage','UpdatePeriodDays','LastCatalogUpdate','UpdatedAt','NextDueAt','ReminderAt','ReminderAt3Days','ReminderAtLastDay','Active','LastReminderFor']) { const value = readTag(xml, name); if (value !== undefined) result[name] = value; }
      if (!result.Code) { const err = new Error('Respuesta SOAP no reconocida.'); err.status = 502; throw err; }
      return result;
    } catch (err) { if (err.name === 'AbortError') { const timeout = new Error('Tiempo de espera agotado al contactar el servicio SOAP.'); timeout.status = 504; throw timeout; } throw err; }
    finally { clearTimeout(timer); }
  };
}

