import { TrueForge } from '@truefoundry/trueforge-sdk';
import { getSettings } from '../config/settings';

export function createTrueForgeClient() {
  const settings = getSettings();
  return new TrueForge({
    baseUrl: settings.baseUrl,
    timeoutInSeconds: 60,
    auth: false,
    stream: { reconnectionEnabled: true, maxReconnectionAttempts: 3 },
  });
}
