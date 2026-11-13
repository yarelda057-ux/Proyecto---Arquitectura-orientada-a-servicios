import { useCallback, useEffect, useRef, useState } from 'react';
import { SfpContext } from './authContext';
import { getUserProfile, loginUser, logoutUser } from '../services/userAPI';
export default function SfpProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const monotonicDeadline = useRef(0);
  const generation = useRef(0);
  const clear = useCallback((message = '') => {
    generation.current++;
    deadline.current = 0;
    setUser(null); setRemaining(0); setAuthError(''); setNotice(message);
  }, []);
  const accept = useCallback(data => {
    const ttl = Math.max(0, data.expiresAt - data.serverTime);
    if (!Number.isFinite(ttl) || ttl <= 0) { clear('Tu sesión ha vencido. Inicia sesión nuevamente.'); return; }
    deadline.current = Date.now() + ttl;
    monotonicDeadline.current = performance.now() + ttl;
    setRemaining(Math.ceil(ttl / 1000)); setUser(data); setAuthError(''); setNotice('');
  }, [clear]);
  const fetchProfile = useCallback(async () => {
    const version = generation.current;
    try { const data = await getUserProfile(); if (version === generation.current) accept(data); }
    catch (error) { if (version === generation.current && error.status !== 401) setAuthError(error.message); }
    finally { setLoading(false); }
  }, [accept]);
  useEffect(() => {
    const expire = () => { if (deadline.current) clear('Tu sesión ha vencido. Inicia sesión nuevamente.'); else { generation.current++; setUser(null); } };
    const focus = () => { if (deadline.current) fetchProfile(); };
    window.addEventListener('session-expired', expire);
    window.addEventListener('focus', focus);
    fetchProfile();
    return () => { window.removeEventListener('session-expired', expire); window.removeEventListener('focus', focus); };
  }, [clear, fetchProfile]);
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil(Math.min(deadline.current - Date.now(), monotonicDeadline.current - performance.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) clear('Tu sesión ha vencido. Inicia sesión nuevamente.');
    };
    const interval = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [user, clear]);
  useEffect(() => {
    const sync = event => { if (event.key === 'quantic-logout') clear('La sesión se cerró en otra pestaña.'); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [clear]);
  const fetchLogin = async credentials => { generation.current++; const data = await loginUser(credentials); accept(data); };
  const fetchLogout = async () => {
    await logoutUser(); clear();
    try { localStorage.setItem('quantic-logout', String(Date.now())); } catch { /* Almacenamiento bloqueado. */ }
  };
  return <SfpContext.Provider value={{ user, remaining, loading, authError, notice, fetchProfile, fetchLogin, fetchLogout }}>{children}</SfpContext.Provider>;
}
