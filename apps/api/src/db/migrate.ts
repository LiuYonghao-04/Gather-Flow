import { getSettings } from '../config';
import { openDatabase } from './database';
const settings = getSettings();
const db = openDatabase(settings.databasePath);
console.log(`数据库迁移完成：${settings.databasePath}`);
db.close();
