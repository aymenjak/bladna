import { z } from 'zod';
import { NOTIFICATION_TYPES } from '@bladna/types';

export const notificationTypeSchemaHelper = z.enum(NOTIFICATION_TYPES);
