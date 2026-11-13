import Sfp from '../models/sfp.js';
import inventoryRoutes from './inventoryRoutes.js';
export default inventoryRoutes(Sfp, { all: 'allTransceivers', add: 'addTransceivers', edit: 'editTransceiver', remove: 'deleteTransceiver' });
