import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActivityArchive, Session } from '@gatherflow/shared';
import { proposalContentSchema } from '@gatherflow/shared';
import type { DemoPreview } from '../apps/miniapp/src/services/demo-types';

// A deliberate, reviewed projection of the fictional five-person demo. Never export
// tokens, session records, invitation paths, image URLs or arbitrary account data.
export function projectDemo(
  archive: ActivityArchive,
  capturedAt = new Date().toISOString(),
): DemoPreview {
  const { activity } = archive.settlement;
  assert.equal(activity.status, 'ARCHIVED', 'Export requires a finished archive');
  assert.equal(
    activity.name,
    '山野三日 · M2/M3 演示',
    'Only the scripted fictional demo can be exported',
  );
  assert.ok(activity.description.includes('所有内容均为演示数据'));
  assert.deepEqual(activity.members.map((m) => m.id).sort(), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(archive.finance.estimate.confirmedTotalCents, 86800);
  assert.ok(archive.settlement.current && archive.settlement.archivedAt);
  assert.ok(archive.settlement.current.transfers.every((t) => t.receivedAt));
  const current = archive.settlement.current;
  return {
    schemaVersion: 1,
    source: { activityId: activity.id, capturedAt, archivedAt: archive.settlement.archivedAt },
    activity: {
      name: activity.name,
      description: activity.description,
      totalCents: archive.finance.estimate.confirmedTotalCents,
    },
    members: activity.members.map(({ id, name, color, tagline }) => ({ id, name, color, tagline })),
    proposals: archive.workspace.proposals.map((p) => ({
      content: proposalContentSchema.parse(p.content),
      status: p.status,
      execution: p.execution,
      participantIds: p.participants.map((m) => m.id),
      responses: p.responses
        .filter((r) => r.version === p.version)
        .map(({ userId, response, reason }) => ({ userId, response, reason })),
      preferences: p.preferences
        .filter((r) => r.version === p.version)
        .map(({ userId, kind, note }) => ({ userId, kind, note })),
      comments: p.comments.map(({ authorId, body }) => ({ authorId, body })),
    })),
    tasks: archive.workspace.tasks.map((t) => ({
      title: t.title,
      content: t.content,
      completed: t.completed,
      assigneeIds: [...t.assigneeIds],
      handovers: t.handovers.map(({ fromUserId, toUserId, note, status }) => ({
        fromUserId,
        toUserId,
        note,
        status,
      })),
      suggestions: t.suggestions.map(({ authorId, body, status }) => ({ authorId, body, status })),
    })),
    expenses: archive.finance.expenses.map((e) => ({
      description: e.description,
      date: e.date,
      totalCents: e.totalCents,
      payerId: e.payerId,
      recorderId: e.recorderId,
      splitMode: e.splitMode,
      shares: e.shares.map(({ userId, amountCents }) => ({ userId, amountCents })),
      status: e.status,
      confirmations: e.confirmations
        .filter((c) => c.revision === e.revision)
        .map(({ userId, createdAt }) => ({ userId, createdAt })),
      disputes: e.disputes.map(({ userId, reason, withdrawnAt }) => ({
        userId,
        reason,
        withdrawnAt,
      })),
      evidenceCaptions: e.evidence.map((item) => item.caption),
    })),
    balances: current.snapshot.balances.map(({ userId, amountCents }) => ({ userId, amountCents })),
    transfers: current.transfers.map(({ fromUserId, toUserId, amountCents, receivedAt }) => ({
      fromUserId,
      toUserId,
      amountCents,
      receivedAt,
    })),
    settlementHistory: archive.settlement.history.map((s) => ({
      sequence: s.sequence,
      totalCents: s.snapshot.confirmedTotalCents,
      reopened: !!s.reopenedAt,
    })),
    evidence: archive.evidence.map((e) => ({ caption: e.caption, uploaderId: e.uploader.id })),
  };
}

async function main() {
  const base = (process.env.DEMO_API_BASE_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
  async function request<T>(path: string, token?: string, body?: object): Promise<T> {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `Demo source request failed: ${response.status}`);
    return (await response.json()) as T;
  }
  assert.equal(
    (await request<{ mode: string }>('/health')).mode,
    'demo',
    'Cannot export a WeChat identity database',
  );
  const { activityId } = JSON.parse(
    await readFile('output/wechat-regression/result.json', 'utf8'),
  ) as { activityId: string };
  assert.match(activityId, /^[a-f0-9-]{36}$/);
  const session = await request<Session>('/auth/demo-login', undefined, { userId: 'A' });
  const archive = await request<ActivityArchive>(
    `/activities/${activityId}/archive`,
    session.token,
  );
  const preview = projectDemo(archive);
  const directory = resolve('apps/miniapp/src/content');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'demo-preview.json'), JSON.stringify(preview, null, 2) + '\n');
  console.log(
    'Exported the existing fictional five-person archive: ¥868.00. No credentials or image files exported.',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
