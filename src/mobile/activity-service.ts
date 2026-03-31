import type { RuntimeActivityItem } from '../services/runtime-activity.js';
import { RuntimeActivityService } from '../services/runtime-activity.js';

export type MobileActivityEvent = RuntimeActivityItem;

export class MobileActivityService extends RuntimeActivityService {}
