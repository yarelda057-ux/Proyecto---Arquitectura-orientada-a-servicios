import Device from '../models/devices.js';
import inventoryRoutes from './inventoryRoutes.js';
export default inventoryRoutes(Device, { all: 'allDevices', add: 'addDevices', edit: 'editDevice', remove: 'deleteDevice' });
