import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { useContext } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import SfpProvider from './context/GeneralContext';
import { SfpContext } from './context/authContext';
import Nav_P from './Components/Nav_P';
import Login from './Routes/Login';
import Account from './Routes/Account';
import Inventory from './Routes/Inventory';
import Logs from './Routes/Logs';
import SupplierInventory from './Routes/SupplierInventory';
import SupplierUpload from './Routes/SupplierUpload';
import Suppliers from './Routes/Suppliers';
import Notifications from './Routes/Notifications';
import AdditionalServices from './Routes/AdditionalServices';
import Reports from './Routes/Reports';
function Protected() {
  const { user } = useContext(SfpContext);
  return user ? <Outlet /> : <Navigate to="/" replace />;
}
function Shell() {
  const { loading, authError, fetchProfile, user, remaining } = useContext(SfpContext);
  return <><Nav_P />{loading ? <main className="empty-state" role="status">Comprobando sesión…</main> : authError ? <main className="empty-state"><h1>No pudimos comprobar tu sesión</h1><p role="alert">{authError}</p><button className="btn btn-primary" onClick={fetchProfile}>Reintentar</button></main> : <>{user && remaining <= 300 && <div className="session-banner" role="status">Tu sesión vence en menos de 5 minutos. Guarda los cambios antes de volver a iniciar sesión.</div>}<Routes><Route path="/" element={<Login />} /><Route element={<Protected />}><Route path="/Reports" element={user?.role === 'admin' ? <Reports /> : <Navigate to="/Account" replace />} /><Route path="/Logs" element={user?.role === 'admin' ? <Logs /> : <Navigate to="/Account" replace />} /><Route path="/Account" element={<Account />} /><Route path="/Transceivers" element={user?.role !== 'mayorista' ? <Inventory key="sfp" kind="sfp" /> : <Navigate to="/SupplierUpload" replace />} /><Route path="/Devices" element={user?.role !== 'mayorista' ? <Inventory key="device" kind="device" /> : <Navigate to="/SupplierUpload" replace />} /><Route path="/SupplierInventory" element={<SupplierInventory />} /><Route path="/SupplierUpload" element={['admin', 'mayorista'].includes(user?.role) ? <SupplierUpload /> : <Navigate to="/Account" replace />} /><Route path="/Suppliers" element={user?.role === 'admin' ? <Suppliers /> : <Navigate to="/Account" replace />} /><Route path="/AdditionalServices" element={['admin', 'user', 'mayorista'].includes(user?.role) ? <AdditionalServices /> : <Navigate to="/Account" replace />} /><Route path="/Notifications" element={user?.role === 'admin' ? <Notifications /> : <Navigate to="/Account" replace />} /></Route><Route path="*" element={<Navigate to={user ? '/Account' : '/'} replace />} /></Routes></>}<footer className="app-footer">Quantic Technology <span>Gestión de infraestructura</span></footer></>;
}
export default function App() { return <SfpProvider><Shell /></SfpProvider>; }
