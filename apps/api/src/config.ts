import { resolve } from 'node:path';
import { z } from 'zod';

export interface Settings {
  mode: 'demo' | 'wechat';
  host: string;
  port: number;
  databasePath: string;
  corsOrigin: string;
  wechatAppId?: string;
  wechatAppSecret?: string;
}

export function getSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const mode = z
    .enum(['demo', 'wechat'])
    .parse(env.APP_MODE ?? (env.NODE_ENV === 'production' ? 'wechat' : 'demo'));
  if (env.NODE_ENV === 'production' && mode === 'demo') {
    throw new Error('生产环境禁止启动 demo 身份认证，请设置 APP_MODE=wechat');
  }
  return {
    mode,
    host: env.HOST ?? '127.0.0.1',
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? 3001),
    databasePath: resolve(env.DATABASE_PATH ?? './data/gatherflow.sqlite'),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173',
    wechatAppId: env.WECHAT_APP_ID?.trim() || undefined,
    wechatAppSecret: env.WECHAT_APP_SECRET?.trim() || undefined,
  };
}
