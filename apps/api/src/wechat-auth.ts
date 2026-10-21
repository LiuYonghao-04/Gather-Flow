import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Session, User } from '@gatherflow/shared';
import type { Settings } from './config';
import type { Db } from './db/database';
import { ensure, HttpError } from './errors';
import { hashToken, secretToken } from './security';

const responseSchema = z.object({
  errcode: z.number().int().optional(),
  openid: z.string().min(1).max(128).optional(),
  session_key: z.string().min(1).optional(),
});

export class WechatAuthService {
  constructor(
    private db: Db,
    private settings: Pick<Settings, 'wechatAppId' | 'wechatAppSecret'>,
    private fetcher: typeof fetch = fetch,
  ) {}

  async login(code: string): Promise<Session> {
    const { wechatAppId: appId, wechatAppSecret: secret } = this.settings;
    ensure(
      appId && secret,
      501,
      'WECHAT_NOT_CONFIGURED',
      '服务端尚未配置微信登录，请联系活动发起人',
    );
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({
      appid: appId,
      secret,
      js_code: code,
      grant_type: 'authorization_code',
    }).toString();
    let raw: unknown;
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      ensure(response.ok, 503, 'WECHAT_UNAVAILABLE', '微信登录暂时不可用，请稍后重试');
      raw = await response.json();
    } catch {
      // Network errors may contain the URL (including the AppSecret). Never propagate them.
      throw new HttpError(503, 'WECHAT_UNAVAILABLE', '微信登录暂时不可用，请稍后重试');
    }
    const parsed = responseSchema.safeParse(raw);
    ensure(parsed.success, 502, 'WECHAT_BAD_RESPONSE', '微信登录响应异常，请稍后重试');
    const result = parsed.data;
    if (result.errcode) {
      if ([40029, 40163].includes(result.errcode))
        throw new HttpError(400, 'WECHAT_CODE_INVALID', '登录凭证已失效，请重新点击微信登录');
      if (result.errcode === 45011)
        throw new HttpError(429, 'WECHAT_RATE_LIMITED', '微信登录过于频繁，请稍后重试');
      if (result.errcode === 40226)
        throw new HttpError(403, 'WECHAT_LOGIN_REJECTED', '微信暂未允许本次登录，请稍后重试');
      throw new HttpError(503, 'WECHAT_UNAVAILABLE', '微信登录暂时不可用，请联系活动发起人');
    }
    ensure(
      result.openid && result.session_key,
      502,
      'WECHAT_BAD_RESPONSE',
      '微信登录响应异常，请稍后重试',
    );
    const openid = result.openid;
    // session_key is not needed for GatherFlow and is neither persisted nor returned.
    return this.db
      .transaction(() => {
        let user = this.db
          .prepare(
            `SELECT u.id,u.name,u.color,u.tagline FROM wechat_identities i
        JOIN users u ON u.id = i.user_id WHERE i.app_id = ? AND i.openid = ? AND u.auth_kind = 'wechat'`,
          )
          .get(appId, openid) as User | undefined;
        if (!user) {
          const id = randomUUID();
          user = {
            id,
            name: `微信朋友 ${id.slice(0, 6)}`,
            color: '#52745e',
            tagline: '一起把相聚安排好',
          };
          this.db
            .prepare(
              "INSERT INTO users (id,name,color,tagline,auth_kind) VALUES (?,?,?,?,'wechat')",
            )
            .run(user.id, user.name, user.color, user.tagline);
          this.db
            .prepare('INSERT INTO wechat_identities VALUES (?,?,?)')
            .run(appId, openid, user.id);
        }
        const token = secretToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
        this.db
          .prepare("INSERT INTO sessions VALUES (?,?,'wechat',?)")
          .run(hashToken(token), user.id, expiresAt);
        this.db
          .prepare('INSERT INTO wechat_session_apps VALUES (?,?)')
          .run(hashToken(token), appId);
        return { token, user, expiresAt, mode: 'wechat' as const };
      })
      .immediate();
  }
}
