import { api } from './http';
export const loginUser = body => api('/users/login', { method: 'POST', body });
export const logoutUser = () => api('/users/logout', { method: 'POST' });
export const getUserProfile = () => api('/users/profile');
