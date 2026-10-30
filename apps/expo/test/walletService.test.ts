import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the action + payload sent to the worker.
const callApi = vi.fn(async () => ({ ok: true }));
vi.mock('@/src/services/api', () => ({
  callApi: (...args: any[]) => (callApi as any)(...args),
  readApi: vi.fn(),
}));

beforeEach(() => callApi.mockClear());

describe('walletService', () => {
  it('claimDailyBonus calls claimDailyReward and sends nothing (the server decides the day)', async () => {
    const { walletService } = await import('@/src/services/wallet/walletService');
    await walletService.claimDailyBonus();
    expect(callApi).toHaveBeenCalledWith('claimDailyReward', {});
  });

  it('getDailyReward reads the server check-in track', async () => {
    const { walletService } = await import('@/src/services/wallet/walletService');
    await walletService.getDailyReward();
    expect(callApi).toHaveBeenCalledWith('getDailyReward', {});
  });

  it('claimAdReward calls the claimAdReward action', async () => {
    const { walletService } = await import('@/src/services/wallet/walletService');
    await walletService.claimAdReward();
    expect(callApi).toHaveBeenCalledWith('claimAdReward', {});
  });
});
