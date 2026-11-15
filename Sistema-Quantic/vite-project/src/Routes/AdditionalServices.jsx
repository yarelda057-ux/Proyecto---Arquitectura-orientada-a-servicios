import { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SfpContext } from '../context/authContext';
import { api } from '../services/http';
import './AdditionalServices.css';

function portalAddress() {
  const configured = import.meta.env.VITE_ADDITIONAL_SERVICES_URL?.trim();
  try {
    const url = configured ? new URL(configured) : new URL(window.location.origin);
    if (!configured) { url.port = '3002'; url.pathname = '/'; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.search = ''; url.hash = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  } catch { return null; }
}

// The provider owns its HTML, styles, scripts and API. Do not copy its UI into React.
const portalUrl = portalAddress();

export default function AdditionalServices() {
  const frame = useRef(null);
  const navigate = useNavigate();
  const { user } = useContext(SfpContext);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const [persistent, setPersistent] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    if (status !== 'ready' || !portalUrl) return;
    const origin = new URL(portalUrl).origin;
    let active = true, busy = false;
    async function sendSession() {
      if (busy) return;
      busy = true;
      try {
        const { token } = await api('/additional-services/portal-session', { method: 'POST' });
        if (active) { frame.current?.contentWindow?.postMessage({ type: 'quantic-company-session', token }, origin); setSessionError(''); }
      } catch (err) { if (active) setSessionError(err.message); }
      finally { busy = false; }
    }
    function receive(event) {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'quantic-company-ready') void sendSession();
      if (event.data?.type === 'quantic-company-stock' && user?.canUploadStock) navigate('/SupplierUpload');
    }
    window.addEventListener('message', receive);
    void sendSession();
    const timer = setInterval(sendSession, 30000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('message', receive); };
  }, [status, attempt, navigate, user?.canUploadStock]);

  useEffect(() => {
    if (!portalUrl) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let active = true;
    async function checkPortal() {
      try {
        const response = await fetch(new URL('api/v1/salud', portalUrl), {
          signal: controller.signal, credentials: 'omit', cache: 'no-store',
        });
        if (!response.ok) throw new Error('Service unavailable');
        const data = await response.json();
        if (data.identificador !== 'SRV-G5202605') throw new Error('Unexpected service');
        if (active) {
          setPersistent(data.base_de_datos?.estado === 'CONECTADO');
          setStatus('ready');
        }
      } catch {
        if (active) setStatus('error');
      } finally { clearTimeout(timeout); }
    }
    void checkPortal();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  function reload() { setStatus('loading'); setAttempt(value => value + 1); }

  return <main className="additional-portal">
    {sessionError && <div className="alert alert-warning" role="alert">{sessionError}</div>}
    <div className="additional-portal-toolbar">
      <h1>Servicios adicionales</h1>
      <div className="additional-portal-actions">
        {portalUrl && <a className="btn btn-outline-primary btn-sm" href={portalUrl} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>}
        <button className="btn btn-outline-secondary btn-sm" disabled={!portalUrl || status === 'loading'} onClick={reload}>Recargar portal</button>
      </div>
    </div>
    {!portalUrl ? <div className="alert alert-warning" role="alert">La dirección del portal no está configurada correctamente. Contacta al administrador.</div>
      : status === 'loading' ? <div className="empty-state" role="status">Cargando el portal de servicios adicionales…</div>
      : status === 'error' ? <div className="alert alert-warning" role="alert">
        <h2 className="h5">No se pudo conectar con Servicios adicionales</h2>
        <p>Comprueba que el servicio esté iniciado. Puedes reintentar o abrir el portal en otra pestaña.</p>
        <button className="btn btn-outline-dark btn-sm" onClick={reload}>Reintentar</button>
      </div>
      : <>
        {!persistent && <div className="alert alert-warning" role="status">El portal está en modo de demostración: los cambios no se guardarán en MySQL.</div>}
        <iframe
          ref={frame}
          key={attempt}
          className="additional-portal-frame"
          src={portalUrl}
          title="Directorio comercial: catálogo, proveedores, registro, portal de empresa y panel de demostración"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
        />
      </>}
  </main>;
}
