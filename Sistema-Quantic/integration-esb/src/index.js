import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp(config);
const server = app.listen(config.port, config.host, () => console.info(`Mediador ESB disponible en http://${config.host}:${config.port}`));
function stop() { server.close(() => process.exit(0)); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
export { app };
