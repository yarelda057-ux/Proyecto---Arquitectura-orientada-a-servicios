import { useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SfpContext } from '../context/authContext';
export default function FormLogin() {
  const { user, fetchLogin, notice } = useContext(SfpContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  if (user) return <Navigate to={user.role === 'mayorista' ? (user.canUploadStock ? '/SupplierUpload' : '/AdditionalServices') : '/Account'} replace />;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await fetchLogin({ email, password }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="login-layout"><section className="login-intro"><span className="eyebrow">CONTROL DE INVENTARIO</span><h1>Tu infraestructura,<br /><em>en orden.</em></h1><p>Gestiona equipos, transceptores y números de serie desde un solo lugar.</p><div className="intro-grid"><div><strong>01</strong><span>Inventario centralizado</span></div><div><strong>02</strong><span>Trazabilidad por serie</span></div><div><strong>03</strong><span>Sesiones con vencimiento</span></div></div></section>
    <section className="login-card"><span className="eyebrow">BIENVENIDO A QUANTIC</span><h2>Inicia sesión</h2><p className="text-secondary">Ingresa con tu cuenta para continuar.</p>
      {notice && <div className="alert alert-info" role="status">{notice}</div>}{error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form onSubmit={submit}><label htmlFor="email">Correo electrónico</label><input id="email" className="form-control" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.com" />
      <label htmlFor="password">Contraseña</label><div className="input-group"><input id="password" className="form-control" type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="btn btn-outline-secondary" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div>
      <button type="submit" className="btn btn-primary w-100 mt-4" disabled={busy}>{busy ? 'Verificando…' : 'Ingresar al inventario →'}</button></form><p className="login-note">¿Necesitas una cuenta? Contacta con tu administrador.</p>
    </section></main>;
}
