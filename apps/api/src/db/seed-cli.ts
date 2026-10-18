import { getSettings } from '../config';
import { openDatabase } from './database';
import { seedDatabase } from './seed';
const settings = getSettings();
if (settings.mode !== 'demo') throw new Error('仅 demo 模式允许填充演示数据');
const db = openDatabase(settings.databasePath);
seedDatabase(db);
console.log('演示数据已准备：A/B/C/D/E，初始活动仅 A 加入；重复运行不会清空数据。');
db.close();
