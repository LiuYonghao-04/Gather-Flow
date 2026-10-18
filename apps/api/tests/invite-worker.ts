import { openDatabase } from '../src/db/database';
import { InviteService } from '../src/services/invites';

const [filename, token, userId] = process.argv.slice(2);
if (!filename || !token || !userId) throw new Error('Missing worker arguments');
const db = openDatabase(filename);
process.send?.({ ready: true });
process.once('message', () => {
  try {
    process.send?.({ result: new InviteService(db).join(token, userId) });
  } catch (error) {
    process.send?.({ error: String(error) });
  } finally {
    db.close();
    process.disconnect();
  }
});
