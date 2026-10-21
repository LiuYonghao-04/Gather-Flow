import type { Evidence, ApiErrorBody } from '@gatherflow/shared';
import { storedSession, ApiError, expireSession } from './api';
import { isCurrentContext, requestContext } from './environment';

export function choosePhoto(): Promise<string | null> {
  return new Promise((resolve, reject) =>
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => resolve(result.tempFilePaths[0] ?? null),
      fail: (error) =>
        error.errMsg.includes('cancel')
          ? resolve(null)
          : reject(new Error('暂时无法打开相册，请检查照片权限')),
    }),
  );
}
export function uploadPhoto(
  activityId: string,
  filePath: string,
  formData: Record<string, string>,
): Promise<Evidence> {
  const context = requestContext();
  const token = storedSession(context)?.token;
  return new Promise((resolve, reject) =>
    uni.uploadFile({
      url: `${context.baseUrl}/activities/${activityId}/evidence`,
      filePath,
      name: 'image',
      formData,
      header: { Authorization: `Bearer ${token ?? ''}` },
      timeout: 60000,
      success: (response) => {
        if (!isCurrentContext(context)) {
          reject(new ApiError('CONTEXT_CHANGED', '空间已切换，请在当前页面继续'));
          return;
        }
        if (response.statusCode === 401) {
          expireSession(token, context);
        }
        try {
          const body: unknown = JSON.parse(response.data);
          if (response.statusCode >= 200 && response.statusCode < 300) resolve(body as Evidence);
          else {
            const error = body as ApiErrorBody;
            reject(
              new ApiError(
                error.error?.code ?? 'UPLOAD_FAILED',
                error.error?.message ?? '图片上传失败',
              ),
            );
          }
        } catch {
          reject(new Error('图片上传失败，请重试'));
        }
      },
      fail: () => reject(new Error('上传未完成，请检查网络后重试')),
    }),
  );
}
export async function previewEvidence(activityId: string, evidenceId: string): Promise<void> {
  const context = requestContext();
  const token = storedSession(context)?.token;
  const path = await new Promise<string>((resolve, reject) =>
    uni.downloadFile({
      url: `${context.baseUrl}/activities/${activityId}/evidence/${evidenceId}/image`,
      header: { Authorization: `Bearer ${token ?? ''}` },
      timeout: 30000,
      success: (r) => {
        if (!isCurrentContext(context)) {
          reject(new ApiError('CONTEXT_CHANGED', '空间已切换，请在当前页面继续'));
          return;
        }
        if (r.statusCode === 401) {
          expireSession(token, context);
        }
        if (r.statusCode === 200) resolve(r.tempFilePath);
        else reject(new Error('无法查看凭证，请确认当前身份仍是活动成员'));
      },
      fail: () => reject(new Error('图片加载失败，请重试')),
    }),
  );
  if (!isCurrentContext(context))
    throw new ApiError('CONTEXT_CHANGED', '空间已切换，请在当前页面继续');
  await new Promise<void>((resolve, reject) =>
    uni.previewImage({
      urls: [path],
      current: path,
      success: () => resolve(),
      fail: () => reject(new Error('暂时无法预览图片，请重试')),
    }),
  );
}
export function confirmAction(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) =>
    uni.showModal({
      title,
      content,
      confirmColor: '#294f40',
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    }),
  );
}
