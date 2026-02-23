import { queryOptions } from '@tanstack/react-query';

import { send } from 'loot-core/platform/client/connection';
import { parseNumberFormat, setNumberFormat } from 'loot-core/shared/util';
import type {
  GlobalPrefs,
  MetadataPrefs,
  ServerPrefs,
  SyncedPrefs,
} from 'loot-core/types/prefs';

import { setI18NextLanguage } from '@desktop-client/i18n';

export type AllPrefs = {
  metadata: MetadataPrefs;
  global: GlobalPrefs;
  synced: SyncedPrefs;
  server: ServerPrefs;
};

export const prefQueries = {
  all: () => ['prefs'],
  lists: () => [...prefQueries.all(), 'lists'],
  list: () =>
    queryOptions<AllPrefs>({
      queryKey: [...prefQueries.lists(), 'all'],
      queryFn: async ({ client }) => {
        const [metadataPrefs, globalPrefs, syncedPrefs] = await Promise.all([
          client.ensureQueryData(prefQueries.listMetadata()),
          client.ensureQueryData(prefQueries.listGlobal()),
          client.ensureQueryData(prefQueries.listSynced()),
        ]);

        // Certain loot-core utils depend on state outside of the React tree, update them
        setNumberFormat(
          parseNumberFormat({
            format: syncedPrefs.numberFormat,
            hideFraction: syncedPrefs.hideFraction,
          }),
        );

        // We need to load translations before the app renders
        setI18NextLanguage(globalPrefs.language ?? '');

        return {
          metadata: metadataPrefs,
          global: globalPrefs,
          synced: syncedPrefs,
          server: {}, // Server prefs are loaded separately
        };
      },
      placeholderData: {
        metadata: {},
        global: {},
        synced: {},
        server: {},
      },
      // Manually invalidated when preferences change
      staleTime: Infinity,
    }),
  listMetadata: () =>
    queryOptions<MetadataPrefs>({
      queryKey: [...prefQueries.lists(), 'metadata'],
      queryFn: async () => {
        return await send('load-prefs');
      },
      placeholderData: {},
      // Manually invalidated when local preferences change
      staleTime: Infinity,
    }),
  listGlobal: () =>
    queryOptions<GlobalPrefs>({
      queryKey: [...prefQueries.lists(), 'global'],
      queryFn: async () => {
        return await send('load-global-prefs');
      },
      placeholderData: {},
      // Manually invalidated when global preferences change
      staleTime: Infinity,
    }),
  listSynced: () =>
    queryOptions<SyncedPrefs>({
      queryKey: [...prefQueries.lists(), 'synced'],
      queryFn: async ({ client }) => {
        const metadataPrefs = await client.getQueryData(
          prefQueries.listMetadata().queryKey,
        );
        // Synced prefs are budget-specific, so if we don't have
        // a budget loaded, just return an empty object.
        if (!metadataPrefs?.id) {
          return {};
        }
        return await send('preferences/get');
      },
      placeholderData: {},
      // Manually invalidated when synced preferences change
      staleTime: Infinity,
    }),
  listServer: () =>
    queryOptions({
      ...prefQueries.list(),
      select: data => data.server,
    }),
};
