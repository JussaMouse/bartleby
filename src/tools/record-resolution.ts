import type { GardenRecord, RecordType } from '../garden/types.js';
import type { ToolContext } from './types.js';

export function resolveRecordByTypeAndTitle(
  context: ToolContext,
  type: RecordType,
  title?: string,
  id?: string,
): GardenRecord | null {
  if (id) {
    const record = context.services.garden.get(id);
    return record && record.type === type ? record : null;
  }
  if (!title) return null;
  const record = context.services.garden.getByTitle(title);
  return record && record.type === type ? record : null;
}
