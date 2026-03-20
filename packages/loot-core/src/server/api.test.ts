import { getBankSyncError } from '../shared/errors';

import { app as apiApp } from './api';

vi.mock('../shared/errors', () => ({
  getBankSyncError: vi.fn(error => `Bank sync error: ${error}`),
}));

describe('API handlers', () => {
  describe('api/bank-sync', () => {
    it('should sync a single account when accountId is provided', async () => {
      apiApp['accounts-bank-sync'] = vi.fn().mockResolvedValue({ errors: [] });

      await apiApp['api/bank-sync']({ accountId: 'account1' });
      expect(apiApp['accounts-bank-sync']).toHaveBeenCalledWith({
        ids: ['account1'],
      });
    });

    it('should handle errors in non batch sync', async () => {
      apiApp['accounts-bank-sync'] = vi.fn().mockResolvedValue({
        errors: ['connection-failed'],
      });

      await expect(
        apiApp['api/bank-sync']({ accountId: 'account2' }),
      ).rejects.toThrow('Bank sync error: connection-failed');

      expect(getBankSyncError).toHaveBeenCalledWith('connection-failed');
    });
  });
});
