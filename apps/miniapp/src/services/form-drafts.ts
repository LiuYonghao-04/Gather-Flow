import { z } from 'zod';
export const activityDraftSchema = z
  .object({
    name: z.string().max(40),
    description: z.string().max(300),
    type: z.enum(['TRIP', 'MEAL', 'HANGOUT', 'OTHER']).nullable(),
  })
  .strict();
export const proposalDraftSchema = z
  .object({
    title: z.string().max(80),
    description: z.string().max(4000),
    location: z.string().max(200),
    date: z.string().max(10),
    start: z.string().max(5),
    end: z.string().max(5),
    budget: z.string().max(32),
    category: z.enum(['DATE', 'DESTINATION', 'TRANSPORT', 'STAY', 'ACTIVITY', 'MEAL', 'OTHER']),
    needsBooking: z.boolean(),
    selected: z.array(z.string()).max(100),
    taskId: z.string(),
  })
  .strict();
export const expenseDraftSchema = z
  .object({
    description: z.string().max(120),
    total: z.string().max(32),
    payer: z.string(),
    selected: z.array(z.string()).max(100),
    mode: z.enum(['EQUAL', 'CUSTOM']),
    custom: z.record(z.string().max(32)),
    date: z.string().max(10),
    category: z.enum(['TRANSPORT', 'STAY', 'MEAL', 'TICKET', 'OTHER']),
    taskId: z.string().nullable(),
    evidenceIds: z.array(z.string()).max(10),
  })
  .strict();
