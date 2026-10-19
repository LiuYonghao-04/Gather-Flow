import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import type { Evidence, User } from '@gatherflow/shared';
import { CollaborationService } from './collaboration';
import { ensure, HttpError } from '../errors';

export const evidenceInputSchema = z
  .object({
    taskId: z.string().min(1).max(128),
    proposalId: z.string().min(1).max(128).optional(),
    expectedVersion: z.coerce.number().int().positive().optional(),
    caption: z.string().trim().max(300).default(''),
  })
  .strict();

export class EvidenceService extends CollaborationService {
  listEvidence(activityId: string, actor: string): Evidence[] {
    this.requireMember(activityId, actor);
    const rows = this.db
      .prepare(
        `SELECT e.id, e.activity_id AS activityId, e.task_id AS taskId, e.proposal_id AS proposalId, e.proposal_version AS proposalVersion,
      e.uploader_id AS uploaderId, e.caption, e.mime_type AS mimeType, e.byte_size AS byteSize, e.created_at AS createdAt,
      u.name, u.color, u.tagline FROM evidence e JOIN users u ON u.id = e.uploader_id WHERE e.activity_id = ? ORDER BY e.rowid DESC`,
      )
      .all(activityId) as (Omit<Evidence, 'uploader'> & User & { uploaderId: string })[];
    return rows.map(({ uploaderId, name, color, tagline, ...row }) => ({
      ...row,
      uploader: { id: uploaderId, name, color, tagline },
    }));
  }
  async upload(
    activityId: string,
    actor: string,
    input: z.infer<typeof evidenceInputSchema>,
    file: Express.Multer.File | undefined,
  ): Promise<Evidence> {
    this.requireActive(activityId, actor);
    this.requireAssignee(this.task(activityId, input.taskId, actor), actor);
    ensure(
      file && file.buffer.length > 0 && file.buffer.length <= 5 * 1024 * 1024,
      400,
      'IMAGE_REQUIRED',
      '请选择一张不超过 5 MB 的照片',
    );
    let bytes: Buffer;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 25_000_000,
        failOn: 'warning',
        animated: false,
      });
      const meta = await image.metadata();
      ensure(
        meta.format && ['jpeg', 'png', 'webp'].includes(meta.format) && (meta.pages ?? 1) === 1,
        400,
        'INVALID_IMAGE',
        '仅支持单张 JPG、PNG 或 WebP 图片',
      );
      // Decode then re-encode: never serve user-supplied MIME, SVG, file names or EXIF metadata.
      bytes = await image
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch (cause) {
      if (cause instanceof HttpError) throw cause;
      throw new HttpError(400, 'INVALID_IMAGE', '图片无法读取，请选择完整的 JPG、PNG 或 WebP 图片');
    }
    return this.db
      .transaction(() => {
        // Recheck permissions/version after asynchronous decoding, within the write transaction.
        this.requireActive(activityId, actor);
        this.requireAssignee(this.task(activityId, input.taskId, actor), actor);
        let version: number | null = null;
        if (input.proposalId) {
          const p = this.proposal(activityId, input.proposalId, actor);
          ensure(p.taskId === input.taskId, 400, 'WRONG_TASK', '方案与所选任务不一致');
          ensure(input.expectedVersion !== undefined, 400, 'VERSION_REQUIRED', '请指定方案版本');
          this.checkVersion(p.version, input.expectedVersion);
          version = p.version;
        } else
          ensure(input.expectedVersion === undefined, 400, 'PROPOSAL_REQUIRED', '请先指定关联方案');
        const id = randomUUID();
        this.db
          .prepare('INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(
            id,
            activityId,
            input.taskId,
            input.proposalId ?? null,
            version,
            actor,
            input.caption,
            'image/jpeg',
            bytes.length,
            bytes,
            new Date().toISOString(),
          );
        this.audit(activityId, actor, 'EVIDENCE_UPLOADED', id, null, {
          taskId: input.taskId,
          proposalId: input.proposalId ?? null,
          version,
          caption: input.caption,
        });
        return this.listEvidence(activityId, actor).find((x) => x.id === id)!;
      })
      .immediate();
  }
  image(activityId: string, id: string, actor: string): { data: Buffer; mime: string } {
    this.requireMember(activityId, actor);
    const row = this.db
      .prepare(
        'SELECT image_data AS data, mime_type AS mime FROM evidence WHERE id = ? AND activity_id = ?',
      )
      .get(id, activityId) as { data: Buffer; mime: string } | undefined;
    ensure(row, 404, 'EVIDENCE_NOT_FOUND', '凭证不存在');
    return row;
  }
}
