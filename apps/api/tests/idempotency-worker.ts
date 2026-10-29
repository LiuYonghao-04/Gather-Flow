import { openDatabase } from '../src/db/database';
import { ActivityService } from '../src/services/activities';
import { IdempotencyService } from '../src/services/idempotency';
const db = openDatabase(process.argv[2]!);
process.send?.({ ready: true });
process.once('message', () => {
  try {
    const activity = new IdempotencyService(db).run(
      'A',
      'POST:/activities',
      'm6_shared_process_key',
      { name: '跨进程重试' },
      () => new ActivityService(db).create('A', { name: '跨进程重试' }),
    );
    process.send?.({ id: activity.id });
  } catch (error) {
    process.send?.({ error: error instanceof Error ? error.message : 'failed' });
  } finally {
    db.close();
    process.disconnect();
  }
});
