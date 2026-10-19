import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  taskCreateSchema,
  assigneeSchema,
  taskEditSchema,
  taskCompleteSchema,
  suggestionSchema,
  suggestionReviewSchema,
  handoverSchema,
  proposalCreateSchema,
  proposalReviseSchema,
  responseSchema,
  preferenceSchema,
  commentSchema,
  expenseInputSchema,
  expenseReviseSchema,
  expenseConfirmSchema,
  expenseDisputeSchema,
} from '@gatherflow/shared';
import type { Db } from './db/database';
import { ExpenseService } from './services/expenses';
import { evidenceInputSchema } from './services/evidence';

export function collaborationRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const service = new ExpenseService(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, fieldSize: 2000, parts: 5 },
  });
  const id = (value: unknown) => z.string().min(1).max(128).parse(value);
  router.use((req, res, next) => {
    res.locals.activityId = id(req.params.activityId);
    service.requireMember(id(res.locals.activityId), id(res.locals.userId));
    next();
  });
  router.get('/workspace', (req, res) =>
    res.json(service.workspace(id(res.locals.activityId), id(res.locals.userId))),
  );
  router.post('/tasks', (req, res) =>
    res
      .status(201)
      .json(
        service.createTask(
          id(res.locals.activityId),
          id(res.locals.userId),
          taskCreateSchema.parse(req.body),
        ),
      ),
  );
  router.get('/tasks/:taskId', (req, res) =>
    res.json(service.task(id(res.locals.activityId), id(req.params.taskId), id(res.locals.userId))),
  );
  router.post('/tasks/:taskId/assignees', (req, res) =>
    res.json(
      service.assign(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        assigneeSchema.parse(req.body).userId,
      ),
    ),
  );
  router.post('/tasks/:taskId/content', (req, res) => {
    const input = taskEditSchema.parse(req.body);
    res.json(
      service.editTask(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        input.expectedRevision,
        input.content,
      ),
    );
  });
  router.post('/tasks/:taskId/progress', (req, res) => {
    const input = taskCompleteSchema.parse(req.body);
    res.json(
      service.completeTask(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        input.expectedRevision,
        input.completed,
      ),
    );
  });
  router.post('/tasks/:taskId/suggestions', (req, res) =>
    res.json(
      service.suggest(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        suggestionSchema.parse(req.body).body,
      ),
    ),
  );
  router.post('/tasks/:taskId/suggestions/:suggestionId/review', (req, res) => {
    const input = suggestionReviewSchema.parse(req.body);
    res.json(
      service.reviewSuggestion(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        id(req.params.suggestionId),
        input.decision,
        input.note,
      ),
    );
  });
  router.post('/tasks/:taskId/handovers', (req, res) => {
    const input = handoverSchema.parse(req.body);
    res.json(
      service.handover(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        input.toUserId,
        input.note,
      ),
    );
  });
  router.post('/tasks/:taskId/handovers/:handoverId/resolve', (req, res) => {
    const input = z.object({ accept: z.boolean() }).strict().parse(req.body);
    res.json(
      service.resolveHandover(
        id(res.locals.activityId),
        id(req.params.taskId),
        id(res.locals.userId),
        id(req.params.handoverId),
        input.accept,
      ),
    );
  });
  router.post('/proposals', (req, res) =>
    res
      .status(201)
      .json(
        service.createProposal(
          id(res.locals.activityId),
          id(res.locals.userId),
          proposalCreateSchema.parse(req.body),
        ),
      ),
  );
  router.get('/proposals/:proposalId', (req, res) =>
    res.json(
      service.proposal(id(res.locals.activityId), id(req.params.proposalId), id(res.locals.userId)),
    ),
  );
  router.post('/proposals/:proposalId/revisions', (req, res) => {
    const input = proposalReviseSchema.parse(req.body);
    res.json(
      service.reviseProposal(
        id(res.locals.activityId),
        id(req.params.proposalId),
        id(res.locals.userId),
        input.expectedVersion,
        input.content,
        input.taskId,
      ),
    );
  });
  router.post('/proposals/:proposalId/responses', (req, res) =>
    res.json(
      service.respond(
        id(res.locals.activityId),
        id(req.params.proposalId),
        id(res.locals.userId),
        responseSchema.parse(req.body),
      ),
    ),
  );
  router.post('/proposals/:proposalId/preferences', (req, res) =>
    res.json(
      service.preference(
        id(res.locals.activityId),
        id(req.params.proposalId),
        id(res.locals.userId),
        preferenceSchema.parse(req.body),
      ),
    ),
  );
  router.post('/proposals/:proposalId/comments', (req, res) =>
    res.json(
      service.comment(
        id(res.locals.activityId),
        id(req.params.proposalId),
        id(res.locals.userId),
        commentSchema.parse(req.body),
      ),
    ),
  );
  router.post('/proposals/:proposalId/execution', (req, res) => {
    const input = z
      .object({
        expectedVersion: z.number().int().positive(),
        execution: z.enum(['BOOKED', 'DONE']),
      })
      .strict()
      .parse(req.body);
    res.json(
      service.execute(
        id(res.locals.activityId),
        id(req.params.proposalId),
        id(res.locals.userId),
        input.expectedVersion,
        input.execution,
      ),
    );
  });
  router.get('/evidence', (req, res) =>
    res.json(service.listEvidence(id(res.locals.activityId), id(res.locals.userId))),
  );
  router.post(
    '/evidence',
    (req, res, next) => {
      service.requireActive(id(res.locals.activityId), id(res.locals.userId));
      next();
    },
    upload.single('image'),
    async (req, res) =>
      res
        .status(201)
        .json(
          await service.upload(
            id(res.locals.activityId),
            id(res.locals.userId),
            evidenceInputSchema.parse(req.body),
            req.file,
          ),
        ),
  );
  router.get('/evidence/:evidenceId/image', (req, res) => {
    const file = service.image(
      id(res.locals.activityId),
      id(req.params.evidenceId),
      id(res.locals.userId),
    );
    res
      .set({
        'Content-Type': file.mime,
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline; filename="evidence.jpg"',
      })
      .send(file.data);
  });
  router.get('/finance', (req, res) =>
    res.json(service.finance(id(res.locals.activityId), id(res.locals.userId))),
  );
  router.post('/expenses', (req, res) =>
    res
      .status(201)
      .json(
        service.createExpense(
          id(res.locals.activityId),
          id(res.locals.userId),
          expenseInputSchema.parse(req.body),
        ),
      ),
  );
  router.get('/expenses/:expenseId', (req, res) =>
    res.json(
      service.expense(id(res.locals.activityId), id(req.params.expenseId), id(res.locals.userId)),
    ),
  );
  router.post('/expenses/:expenseId/revisions', (req, res) => {
    const input = expenseReviseSchema.parse(req.body);
    res.json(
      service.reviseExpense(
        id(res.locals.activityId),
        id(req.params.expenseId),
        id(res.locals.userId),
        input.expectedRevision,
        input.input,
      ),
    );
  });
  router.post('/expenses/:expenseId/confirmations', (req, res) =>
    res.json(
      service.confirmExpense(
        id(res.locals.activityId),
        id(req.params.expenseId),
        id(res.locals.userId),
        expenseConfirmSchema.parse(req.body).expectedRevision,
      ),
    ),
  );
  router.post('/expenses/:expenseId/disputes', (req, res) => {
    const input = expenseDisputeSchema.parse(req.body);
    res.json(
      service.disputeExpense(
        id(res.locals.activityId),
        id(req.params.expenseId),
        id(res.locals.userId),
        input.expectedRevision,
        input.reason,
      ),
    );
  });
  router.post('/expenses/:expenseId/disputes/:disputeId/withdraw', (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(
      service.withdrawDispute(
        id(res.locals.activityId),
        id(req.params.expenseId),
        id(res.locals.userId),
        id(req.params.disputeId),
      ),
    );
  });
  return router;
}
