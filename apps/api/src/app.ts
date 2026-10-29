import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import {
  applySchema,
  createActivitySchema,
  createInviteSchema,
  demoLoginSchema,
  inviteTokenSchema,
  reviewSchema,
  profileSchema,
  type User,
} from '@gatherflow/shared';
import type { Db } from './db/database';
import type { Settings } from './config';
import { authenticate, demoLogin } from './auth';
import { HttpError, ensure } from './errors';
import { ActivityService } from './services/activities';
import { InviteService } from './services/invites';
import { collaborationRoutes } from './collaboration-routes';
import { settlementRoutes } from './settlement-routes';
import { MulterError } from 'multer';
import { WechatAuthService } from './wechat-auth';
import { IdempotencyService } from './services/idempotency';

export function createApp(
  db: Db,
  settings: Pick<Settings, 'mode' | 'corsOrigin' | 'wechatAppId' | 'wechatAppSecret'>,
  dependencies: { wechatFetch?: typeof fetch } = {},
) {
  const app = express();
  const activities = new ActivityService(db);
  const invites = new InviteService(db);
  const idempotency = new IdempotencyService(db);
  const wechat = new WechatAuthService(db, settings, dependencies.wechatFetch);
  const loginAttempts = new Map<string, { count: number; until: number }>();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: settings.corsOrigin.split(',').map((origin) => origin.trim()),
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', mode: settings.mode, milestone: 'M5' }),
  );
  app.use('/auth', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/auth/demo-users', (_req, res) => {
    ensure(settings.mode === 'demo', 404, 'DEMO_DISABLED', '演示入口未启用');
    res.json(
      db
        .prepare("SELECT id, name, color, tagline FROM users WHERE auth_kind = 'demo' ORDER BY id")
        .all(),
    );
  });
  app.post('/auth/demo-login', (req, res) => {
    ensure(settings.mode === 'demo', 404, 'DEMO_DISABLED', '演示登录未启用');
    res.json(demoLogin(db, demoLoginSchema.parse(req.body).userId));
  });
  app.post('/auth/wechat-login', async (req, res) => {
    ensure(settings.mode === 'wechat', 404, 'WECHAT_DISABLED', '当前为演示环境，请选择演示身份');
    const { code } = z
      .object({ code: z.string().trim().min(1).max(256) })
      .strict()
      .parse(req.body);
    const now = Date.now();
    for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
    const ip = req.ip ?? 'unknown';
    const attempts = loginAttempts.get(ip) ?? { count: 0, until: now + 60000 };
    ensure(
      loginAttempts.has(ip) || loginAttempts.size < 1000,
      429,
      'LOGIN_RATE_LIMITED',
      '登录繁忙，请稍后重试',
    );
    loginAttempts.set(ip, attempts);
    attempts.count++;
    ensure(attempts.count <= 20, 429, 'LOGIN_RATE_LIMITED', '登录过于频繁，请一分钟后重试');
    res.json(await wechat.login(code));
  });
  app.get('/invites/:token', (req, res) => {
    res.json(
      invites.preview(
        inviteTokenSchema.parse(req.params.token),
        authenticate(db, req, settings.mode, true, settings.wechatAppId),
      ),
    );
  });
  app.use((req, res, next) => {
    res.locals.userId = authenticate(db, req, settings.mode, false, settings.wechatAppId);
    next();
  });
  const actor = (locals: Record<string, unknown>): string => z.string().parse(locals.userId);
  const param = (value: unknown): string => z.string().min(1).max(128).parse(value);
  const profile = (userId: string): User => {
    const user = db.prepare('SELECT id,name,color,tagline FROM users WHERE id=?').get(userId) as
      | User
      | undefined;
    ensure(user, 401, 'SESSION_EXPIRED', '请重新登录');
    return user;
  };
  app.get('/me', (_req, res) =>
    res.set('Cache-Control', 'private, no-store').json(profile(actor(res.locals))),
  );
  app.post('/me/profile', (req, res) => {
    ensure(
      settings.mode === 'wechat',
      403,
      'DEMO_PROFILE_READ_ONLY',
      '演示身份的名字保持不变，请返回微信身份修改昵称',
    );
    const { name } = profileSchema.parse(req.body);
    db.prepare("UPDATE users SET name=? WHERE id=? AND auth_kind='wechat'").run(
      name,
      actor(res.locals),
    );
    res.set('Cache-Control', 'private, no-store').json(profile(actor(res.locals)));
  });
  app.get('/activities', (_req, res) => res.json(activities.list(actor(res.locals))));
  app.post('/activities', (req, res) => {
    const input = createActivitySchema.parse(req.body);
    res
      .status(201)
      .json(
        idempotency.run(
          actor(res.locals),
          'POST:/activities',
          req.get('Idempotency-Key'),
          input,
          () => activities.create(actor(res.locals), input),
        ),
      );
  });
  app.get('/activities/:id', (req, res) =>
    res.json(activities.detail(param(req.params.id), actor(res.locals))),
  );
  app.get('/activities/:id/audit', (req, res) => {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(req.query.offset ?? 0);
    res.json(activities.history(param(req.params.id), actor(res.locals), offset));
  });
  app.post('/activities/:id/invites', (req, res) => {
    res
      .status(201)
      .json(
        invites.create(
          param(req.params.id),
          actor(res.locals),
          createInviteSchema.parse(req.body).kind,
        ),
      );
  });
  app.post('/invites/:token/join', (req, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    res.json(invites.join(inviteTokenSchema.parse(req.params.token), actor(res.locals)));
  });
  app.post('/invites/:token/applications', (req, res) => {
    res.json(
      invites.apply(
        inviteTokenSchema.parse(req.params.token),
        actor(res.locals),
        applySchema.parse(req.body).message,
      ),
    );
  });
  app.get('/activities/:id/applications', (req, res) =>
    res.json(invites.applications(param(req.params.id), actor(res.locals))),
  );
  app.post('/activities/:id/applications/:applicationId/review', (req, res) => {
    invites.review(
      param(req.params.id),
      param(req.params.applicationId),
      actor(res.locals),
      reviewSchema.parse(req.body).decision,
    );
    res.json({ ok: true });
  });
  app.use('/activities/:activityId', collaborationRoutes(db));
  app.use('/activities/:activityId', settlementRoutes(db));
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', '接口不存在')));
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? '输入内容有误' },
      });
    } else if (error instanceof MulterError) {
      res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: {
          code: error.code,
          message:
            error.code === 'LIMIT_FILE_SIZE'
              ? '单张图片不能超过 5 MB'
              : '请每次上传一张图片，检查附件与说明',
        },
      });
    } else if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
    } else if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求格式有误' } });
    } else if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: '提交内容过长' } });
    } else {
      // Do not log request bodies, authorization headers or invitation tokens.
      console.error('API failure:', error instanceof Error ? error.message : 'Unknown error');
      res
        .status(500)
        .json({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' } });
    }
  };
  app.use(errorHandler);
  return app;
}
