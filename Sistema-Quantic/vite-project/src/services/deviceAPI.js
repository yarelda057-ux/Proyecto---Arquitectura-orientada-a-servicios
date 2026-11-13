import { api } from './http';
export const getAllDevices = () => api('/devices/allDevices');
export const addDevices = body => api('/devices/addDevices', { method: 'POST', body });
export const editDevices = (id, body) => api(`/devices/editDevice/${id}`, { method: 'PATCH', body });
export const deleteDevices = id => api(`/devices/deleteDevice/${id}`, { method: 'DELETE' });