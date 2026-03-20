// @ts-strict-ignore
import { app as apiApp } from './api';
import { mainApp } from './main';

describe('API app', () => {
  describe('api/bank-sync', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should sync a single account when accountId is provided', async () => {
      vi.spyOn(mainApp, 'runHandler').mockImplementation(
        async (name: string) => {
          if (name === 'accounts-bank-sync') return { errors: [] };
          throw new Error(`Unexpected handler: ${name}`);
        },
      );

      await apiApp['api/bank-sync']({ accountId: 'account1' });
      expect(mainApp.runHandler.bind(mainApp)).toHaveBeenCalledWith(
        'accounts-bank-sync',
        {
          ids: ['account1'],
        },
      );
    });

    it('should throw an error when bank sync fails', async () => {
      vi.spyOn(mainApp, 'runHandler').mockImplementation(
        async (name: string) => {
          if (name === 'accounts-bank-sync') {
            return { errors: [{ message: 'connection-failed' }] };
          }
          throw new Error(`Unexpected handler: ${name}`);
        },
      );

      await expect(
        apiApp['api/bank-sync']({ accountId: 'account2' }),
      ).rejects.toThrow('connection-failed');
    });
  });
});
