import { send } from '@actual-app/core/platform/client/connection';
import type { Query } from 'loot-core/shared/query';

export async function aqlQuery(query: Query) {
  return send('query', query.serialize());
}
