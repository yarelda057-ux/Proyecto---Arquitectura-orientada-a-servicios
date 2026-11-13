import { api } from './http';
export const getAllSfps = () => api('/allTransceivers');
export const addSfpT = body => api('/addTransceivers', { method: 'POST', body });
export const editSfpt = (id, body) => api(`/editTransceiver/${id}`, { method: 'PATCH', body });
export const deleteSfpt = id => api(`/deleteTransceiver/${id}`, { method: 'DELETE' });
