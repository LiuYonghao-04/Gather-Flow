import { openDatabase } from '../src/db/database';
import { SettlementService } from '../src/services/settlements';
import { HttpError } from '../src/errors';
const [filename, activityId, settlementId, transferId, operation] = process.argv.slice(2);
if (!filename || !activityId || !settlementId || !transferId) throw new Error('Missing arguments');
const db = openDatabase(filename);
process.send?.({ ready: true });
process.once('message', () => {
  try {
    const service = new SettlementService(db);
    if (operation === 'reopen') service.reopen(activityId, 'A', settlementId);
    else service.receive(activityId, 'A', settlementId, transferId);
    process.send?.({ result: 'ok' });
  } catch (error) {
    process.send?.({ result: error instanceof HttpError ? error.code : String(error) });
  } finally {
    db.close();
    process.disconnect();
  }
});
