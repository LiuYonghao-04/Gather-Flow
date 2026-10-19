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
} from '@gatherflow/shared';
import type { Db } from './db/database';
import type { Settings } from './config';
import { authenticate, demoLogin } from './auth';
import { HttpError, ensure } from './errors';
import { ActivityService } from './services/activities';
import { InviteService } from './services/invites';
import { collaborationRoutes } from './collaboration-routes';
import { MulterError } from 'multer';

export function createApp(db: Db, settings: Pick<Settings, 'mode' | 'corsOrigin'>) {
  const app = express();
  const activities = new ActivityService(db);
  const invites = new InviteService(db);
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
    res.json({ status: 'ok', mode: settings.mode, milestone: 'M3' }),
  );
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
  app.post('/auth/wechat-login', (req, _res) => {
    z.object({ code: z.string().min(1).max(256) })
      .strict()
      .parse(req.body);
    throw new HttpError(
      501,
      'WECHAT_NOT_CONFIGURED',
      '微信登录接入层尚未实现，当前请使用本地演示环境',
    );
  });
  app.get('/invites/:token', (req, res) => {
    res.json(
      invites.preview(
        inviteTokenSchema.parse(req.params.token),
        authenticate(db, req, settings.mode, true),
      ),
    );
  });
  app.use((req, res, next) => {
    res.locals.userId = authenticate(db, req, settings.mode);
    next();
  });
  const actor = (locals: Record<string, unknown>): string => z.string().parse(locals.userId);
  const param = (value: unknown): string => z.string().min(1).max(128).parse(value);
  app.get('/activities', (_req, res) => res.json(activities.list(actor(res.locals))));
  app.post('/activities', (req, res) => {
    res
      .status(201)
      .json(activities.create(actor(res.locals), createActivitySchema.parse(req.body)));
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
