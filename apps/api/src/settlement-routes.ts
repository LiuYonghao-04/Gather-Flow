import { Router } from 'express';
import { z } from 'zod';
import { closeActivitySchema, freezeSettlementSchema } from '@gatherflow/shared';
import type { Db } from './db/database';
import { SettlementService } from './services/settlements';

export function settlementRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const service = new SettlementService(db);
  const id = (value: unknown) => z.string().min(1).max(128).parse(value);
  router.use((req, res, next) => {
    res.locals.activityId = id(req.params.activityId);
    service.requireMember(id(res.locals.activityId), id(res.locals.userId));
    next();
  });
  router.get('/settlement', (_req, res) =>
    res.json(service.settlement(id(res.locals.activityId), id(res.locals.userId))),
  );
  router.post('/settlement', (req, res) =>
    res
      .status(201)
      .json(
        service.freeze(
          id(res.locals.activityId),
          id(res.locals.userId),
          freezeSettlementSchema.parse(req.body).expectedFinanceVersion,
        ),
      ),
  );
  router.post('/settlements/:settlementId/reopen', (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(
      service.reopen(id(res.locals.activityId), id(res.locals.userId), id(req.params.settlementId)),
    );
  });
  router.post('/settlements/:settlementId/transfers/:transferId/receipt', (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(
      service.receive(
        id(res.locals.activityId),
        id(res.locals.userId),
        id(req.params.settlementId),
        id(req.params.transferId),
      ),
    );
  });
  router.post('/close', (req, res) => {
    const input = closeActivitySchema.parse(req.body);
    res.json(
      service.close(
        id(res.locals.activityId),
        id(res.locals.userId),
        input.expectedFinanceVersion,
        input.expectedSettlementId,
      ),
    );
  });
  router.get('/archive', (_req, res) =>
    res.json(service.archive(id(res.locals.activityId), id(res.locals.userId))),
  );
  return router;
}
