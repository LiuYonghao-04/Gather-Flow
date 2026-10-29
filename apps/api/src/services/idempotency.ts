import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from '@gatherflow/shared';
import type { Db } from '../db/database';
import { ensure } from '../errors';

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, '提交编号无效');

export class IdempotencyService {
  constructor(private db: Db) {}

  run<T>(
    userId: string,
    scope: string,
    key: string | undefined,
    input: unknown,
    action: () => T,
  ): T {
    // Existing clients remain compatible; M6 forms send a durable request key.
    if (key === undefined) return action();
    keySchema.parse(key);
    const hash = createHash('sha256').update(canonicalJson(input)).digest('hex');
    // The receipt and business mutation commit together. BEGIN IMMEDIATE also
    // serializes retries from other processes; no asynchronous work runs inside.
    return this.db
      .transaction(() => {
        const prior = this.db
          .prepare(
            'SELECT input_hash,response_json FROM idempotent_requests WHERE user_id=? AND scope=? AND request_key=?',
          )
          .get(userId, scope, key) as { input_hash: string; response_json: string } | undefined;
        if (prior) {
          ensure(
            prior.input_hash === hash,
            409,
            'IDEMPOTENCY_CONFLICT',
            '这次提交的内容已改变，请返回编辑页重新提交',
          );
          return JSON.parse(prior.response_json) as T;
        }
        const result = action();
        this.db
          .prepare('INSERT INTO idempotent_requests VALUES (?,?,?,?,?,?)')
          .run(userId, scope, key, hash, JSON.stringify(result), new Date().toISOString());
        return result;
      })
      .immediate();
  }
}
