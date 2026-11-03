import { registerNotificationWorkers } from './services/notifications';

/**
 * One-time server bootstrapping (idempotent). Called by the API route module
 * before dispatching so queue workers exist in inline (no-Redis) mode.
 */

let initialized = false;

export function initServer(): void {
  if (initialized) return;
  initialized = true;
  registerNotificationWorkers();
}
