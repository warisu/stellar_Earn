'use client';

/**
 * useNetworkStatus – FE-027
 *
 * Provides a unified view of:
 *  1. Browser connectivity  (`isOnline`)
 *  2. API base-URL reachability (`isApiReachable`)
 *
 * Both values are kept in sync with the global Zustand store so any
 * component can subscribe without re-mounting this hook.
 *
 * Behaviour:
 * - While offline, the API reachability check is skipped.
 * - When the browser comes back online, an immediate API probe is fired.
 * - A periodic health check runs every HEALTH_CHECK_INTERVAL_MS while online.
 * - Consumers can call `recheckApi()` to trigger an on-demand probe.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiClient } from '../api/client';
import { useStore } from '@/lib/store';

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

export interface NetworkStatus {
  /** True when `navigator.onLine` is true and no offline event has fired. */
  isOnline: boolean;
  /**
   * True when the API `/health` endpoint responded successfully.
   * Remains `true` on the first render until the first probe completes, to
   * avoid a flash of the offline banner.
   */
  isApiReachable: boolean;
  /** Fire an on-demand API reachability probe. */
  recheckApi: () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  const setOnlineStatus = useStore((s) => s.setOnlineStatus);
  const setApiReachable = useStore((s) => s.setApiReachable);

  const storeIsOnline = useStore((s) => s.isOnline);
  const storeIsApiReachable = useStore((s) => s.isApiReachable);

  // Local shadow of `isOnline` so we can read it synchronously inside
  // callbacks without stale closure issues.
  const isOnlineRef = useRef<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // -----------------------------------------------------------------------
  // Browser online / offline events
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      setOnlineStatus(true);
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      setOnlineStatus(false);
      // When we go offline the API is immediately unreachable.
      setApiReachable(false);
    };

    // Sync initial state in case it changed before mount.
    isOnlineRef.current = navigator.onLine;
    setOnlineStatus(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnlineStatus, setApiReachable]);

  // -----------------------------------------------------------------------
  // API health probe
  // -----------------------------------------------------------------------

  const probeApi = useCallback(async () => {
    if (!isOnlineRef.current) return;

    try {
      await getApiClient().get('/health', {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
      });
      setApiReachable(true);
    } catch {
      setApiReachable(false);
    }
  }, [setApiReachable]);

  // -----------------------------------------------------------------------
  // Periodic health checks + immediate probe when coming back online
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!storeIsOnline) return;

    // Fire immediately when we (re-)go online.
    probeApi();

    const interval = setInterval(probeApi, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [storeIsOnline, probeApi]);

  // -----------------------------------------------------------------------
  // network-unreachable custom event emitted by the Axios client
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleNetworkUnreachable = () => {
      setApiReachable(false);
    };

    window.addEventListener('network-unreachable', handleNetworkUnreachable);
    return () => {
      window.removeEventListener(
        'network-unreachable',
        handleNetworkUnreachable
      );
    };
  }, [setApiReachable]);

  return {
    isOnline: storeIsOnline,
    isApiReachable: storeIsApiReachable,
    recheckApi: probeApi,
  };
}
