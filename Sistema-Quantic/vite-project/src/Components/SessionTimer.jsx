import { useContext } from 'react';
import { SfpContext } from '../context/authContext';
export default function SessionTimer() {
  const { remaining } = useContext(SfpContext);
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const time = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
  return <div className={`session-timer ${remaining <= 300 ? 'session-warning' : ''}`}>
    <span className="session-dot" aria-hidden="true" /><span>Sesión restante</span>
    <time role="timer" aria-label={`La sesión vence en ${hours} horas, ${minutes} minutos y ${seconds} segundos`}>{time}</time>
  </div>;
}
