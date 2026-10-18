import type { Db } from './database';
import { ActivityService } from '../services/activities';

export const demoUsers = [
  { id: 'A', name: '林间', color: '#537461', tagline: '想把大家聚在一起' },
  { id: 'B', name: '陈屿', color: '#9A745C', tagline: '本地向导，随时待命' },
  { id: 'C', name: '许知夏', color: '#758273', tagline: '偏爱慢一点的旅行' },
  { id: 'D', name: '周予安', color: '#78889B', tagline: '带上相机和好心情' },
  { id: 'E', name: '沈念', color: '#A1787A', tagline: '负责发现好吃的' },
];

export function seedDatabase(db: Db): void {
  db.transaction(() => {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO users (id, name, color, tagline, auth_kind) VALUES (@id, @name, @color, @tagline, 'demo')",
    );
    for (const user of demoUsers) insert.run(user);
    if (!db.prepare('SELECT id FROM activities WHERE id = ?').get('demo-weekend')) {
      new ActivityService(db).create(
        'A',
        {
          name: '把周末留给山野',
          type: 'TRIP',
          description: '找个不赶路的地方，走走、聊聊。具体去哪、什么时候出发，等大家一起决定。',
        },
        'demo-weekend',
      );
    }
  }).immediate();
}
