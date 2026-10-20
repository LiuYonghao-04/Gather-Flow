import type { Evidence, ApiErrorBody } from '@gatherflow/shared';
import { baseUrl, storedSession, ApiError, expireSession } from './api';

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
  const token = storedSession()?.token;
  return new Promise((resolve, reject) =>
    uni.uploadFile({
      url: `${baseUrl}/activities/${activityId}/evidence`,
      filePath,
      name: 'image',
      formData,
      header: { Authorization: `Bearer ${token ?? ''}` },
      timeout: 60000,
      success: (response) => {
        if (response.statusCode === 401) {
          expireSession(token);
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
  const token = storedSession()?.token;
  const path = await new Promise<string>((resolve, reject) =>
    uni.downloadFile({
      url: `${baseUrl}/activities/${activityId}/evidence/${evidenceId}/image`,
      header: { Authorization: `Bearer ${token ?? ''}` },
      timeout: 30000,
      success: (r) => {
        if (r.statusCode === 401) {
          expireSession(token);
        }
        if (r.statusCode === 200) resolve(r.tempFilePath);
        else reject(new Error('无法查看凭证，请确认当前身份仍是活动成员'));
      },
      fail: () => reject(new Error('图片加载失败，请重试')),
    }),
  );
  uni.previewImage({ urls: [path], current: path });
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
