import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { choosePhoto, uploadPhoto, previewEvidence } from '../src/services/files';
let cached: unknown;
const chooseImage = vi.fn(),
  uploadFile = vi.fn(),
  downloadFile = vi.fn(),
  previewImage = vi.fn(),
  emit = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  cached = { token: 'a'.repeat(64), user: { id: 'A' }, mode: 'demo', expiresAt: '2099-01-01' };
  vi.stubGlobal('uni', {
    chooseImage,
    uploadFile,
    downloadFile,
    previewImage,
    getStorageSync: () => cached,
    removeStorageSync: () => {
      cached = null;
    },
    $emit: emit,
  });
});
afterEach(() => vi.unstubAllGlobals());
it('treats photo cancellation as no action and explains a permission failure', async () => {
  const cancelled = choosePhoto();
  chooseImage.mock.calls[0]![0].fail({ errMsg: 'chooseImage:fail cancel' });
  await expect(cancelled).resolves.toBeNull();
  const denied = choosePhoto();
  chooseImage.mock.calls[1]![0].fail({ errMsg: 'chooseImage:fail auth deny' });
  await expect(denied).rejects.toThrow('照片权限');
});
it('retains the new identity when an old upload returns unauthorized', async () => {
  const pending = uploadPhoto('activity', 'test.png', { taskId: 'task' });
  cached = { token: 'b'.repeat(64), user: { id: 'B' }, mode: 'demo', expiresAt: '2099-01-01' };
  uploadFile.mock.calls[0]![0].success({
    statusCode: 401,
    data: JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'expired' } }),
  });
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(emit).not.toHaveBeenCalled();
  expect(cached).toMatchObject({ user: { id: 'B' } });
});
it('rejects interrupted uploads and malformed responses without a false success', async () => {
  const offline = uploadPhoto('a', 'file', {});
  uploadFile.mock.calls[0]![0].fail();
  await expect(offline).rejects.toThrow('网络');
  const malformed = uploadPhoto('a', 'file', {});
  uploadFile.mock.calls[1]![0].success({ statusCode: 500, data: 'not JSON' });
  await expect(malformed).rejects.toThrow('重试');
});
it('does not preview unauthorized private evidence', async () => {
  const pending = previewEvidence('a', 'e');
  downloadFile.mock.calls[0]![0].success({ statusCode: 401 });
  await expect(pending).rejects.toThrow('活动成员');
  expect(emit).toHaveBeenCalledWith('session-expired');
  expect(previewImage).not.toHaveBeenCalled();
});
it('reports native preview failure after an authenticated download', async () => {
  const pending = previewEvidence('a', 'e');
  downloadFile.mock.calls[0]![0].success({ statusCode: 200, tempFilePath: 'wxfile://photo' });
  await Promise.resolve();
  previewImage.mock.calls[0]![0].fail();
  await expect(pending).rejects.toThrow('预览');
  expect(downloadFile.mock.calls[0]![0].header.Authorization).toBe('Bearer ' + 'a'.repeat(64));
});
