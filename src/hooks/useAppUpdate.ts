import { useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '../constants/version';

export type UpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'installing'
  | 'offline'
  | 'error';

export interface AppUpdateState {
  currentVersion: string;
  remoteVersion: string | null;
  releaseNotes: string | null;
  status: UpdateCheckStatus;
  lastCheckedAt: number | null;
  isUpdateAvailable: boolean;
  errorMessage: string | null;
}

export function useAppUpdate() {
  const [updateState, setUpdateState] = useState<AppUpdateState>(() => {
    const savedTime = localStorage.getItem('btt_last_update_check');
    return {
      currentVersion: APP_VERSION,
      remoteVersion: null,
      releaseNotes: null,
      status: 'idle',
      lastCheckedAt: savedTime ? parseInt(savedTime, 10) : null,
      isUpdateAvailable: false,
      errorMessage: null,
    };
  });

  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Hook into Service Worker registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          setSwRegistration(reg);

          // Listen for update found on SW
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setUpdateState((prev) => ({
                    ...prev,
                    isUpdateAvailable: true,
                    status: 'available',
                  }));
                }
              };
            }
          };
        }
      });
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!navigator.onLine) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'offline',
        errorMessage: 'Device is offline. Connect to internet to verify version.',
      }));
      return;
    }

    setUpdateState((prev) => ({
      ...prev,
      status: 'checking',
      errorMessage: null,
    }));

    try {
      // 1. Check Service Worker update in background
      if (swRegistration) {
        swRegistration.update().catch(console.warn);
      }

      // 2. Fetch fresh published version manifest (cache-busted)
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }).catch(async () => {
        // Fallback to static version.json
        return await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const manifest = await res.json();
      const remoteVer = manifest.version || APP_VERSION;
      const isNewer = compareVersions(remoteVer, APP_VERSION) > 0;

      const now = Date.now();
      localStorage.setItem('btt_last_update_check', now.toString());

      setUpdateState((prev) => ({
        ...prev,
        remoteVersion: remoteVer,
        releaseNotes: manifest.releaseNotes || null,
        status: isNewer ? 'available' : 'latest',
        isUpdateAvailable: isNewer,
        lastCheckedAt: now,
        errorMessage: null,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not check for updates';
      setUpdateState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: msg,
      }));
    }
  }, [swRegistration]);

  const applyUpdate = useCallback(async () => {
    setUpdateState((prev) => ({ ...prev, status: 'installing' }));

    try {
      if (swRegistration && swRegistration.waiting) {
        // Send message to Service Worker to skipWaiting
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Allow 500ms for service worker activation, then reload window smoothly
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch {
      window.location.reload();
    }
  }, [swRegistration]);

  return {
    ...updateState,
    checkForUpdates,
    applyUpdate,
  };
}

// Semver comparator: returns > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
