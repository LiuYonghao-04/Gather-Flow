import { createApp } from './app';
import { getSettings } from './config';
import { openDatabase } from './db/database';
import { seedDatabase } from './db/seed';

const settings = getSettings();
const db = openDatabase(settings.databasePath);
if (settings.mode === 'demo') seedDatabase(db);
const server = createApp(db, settings).listen(settings.port, settings.host, () => {
  console.log(`GatherFlow API: http://${settings.host}:${settings.port} (${settings.mode})`);
});
server.on('error', (error) => {
  console.error(error.message);
  db.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
}
