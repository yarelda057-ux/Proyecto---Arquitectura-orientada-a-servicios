import { useContext, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { SfpContext } from '../context/authContext';
import SessionTimer from './SessionTimer';
export default function Nav_P() {
  const { user, fetchLogout } = useContext(SfpContext);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError('');
    try { await fetchLogout(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <><header className="topbar"><div className="brand"><span className="brand-mark">Q</span><div>QUANTIC<span className="brand-subtitle">Technology · Inventario</span></div></div>
    {user && <><nav aria-label="Navegación principal">{user.role !== 'mayorista' && <><NavLink to="/Transceivers">Transceptores</NavLink><NavLink to="/Devices">Equipos</NavLink></>}<NavLink to="/SupplierInventory">{user.role === 'mayorista' ? 'Mi inventario' : 'Proveedores'}</NavLink>{user.role === 'mayorista' && <NavLink to="/SupplierUpload">Publicar stock</NavLink>}{user.role === 'admin' && <NavLink to="/Suppliers">Registro</NavLink>}{user.role === 'admin' && <NavLink to="/Notifications">Notificaciones</NavLink>}{user.role === 'admin' && <NavLink to="/Reports">Reportes</NavLink>}{user.role === 'admin' && <NavLink to="/Logs">Auditoría</NavLink>}{user.role === 'mayorista' && <><NavLink to="/AdditionalServices">Servicios adicionales</NavLink><NavLink to="/OfferServices">Ofrecer mis servicios</NavLink></>}<NavLink to="/Account">Mi cuenta</NavLink></nav><div className="nav-session"><SessionTimer /><button className="btn btn-outline-light btn-sm" disabled={busy} onClick={logout}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</button></div></>}
    {!user && <span className="access-label">Portal de inventario</span>}
  </header>{error && <div className="alert alert-danger m-3" role="alert">{error}</div>}</>;
}
