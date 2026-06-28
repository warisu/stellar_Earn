/**
 * Tests for useNetworkStatus – FE-027
 *
 * Covers:
 * - Initial state synchronisation
 * - Browser online / offline events
 * - API health probe logic
 * - `network-unreachable` custom-event handling
 * - `recheckApi` on-demand probe
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNetworkStatus } from './useNetworkStatus';
import { useStore } from '@/lib/store';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/store', () => ({
  useStore: vi.fn(),
}));

vi.mock('../api/client', () => ({
  getApiClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue({ data: { status: 'ok' } }),
  })),
}));

import { getApiClient } from '../api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStoreMock(overrides?: Partial<ReturnType<typeof buildStoreMock>>) {
  const mock = {
    isOnline: true,
    isApiReachable: true,
    setOnlineStatus: vi.fn(),
    setApiReachable: vi.fn(),
    ...overrides,
  };
  (useStore as any).mockImplementation((selector: any) => selector(mock));
  return mock;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('useNetworkStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
    buildStoreMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── initial state ─────────────────────────────────────────────────────────

  it('sets initial online status from navigator.onLine on mount', () => {
    const { setOnlineStatus } = buildStoreMock();
    renderHook(() => useNetworkStatus());
    expect(setOnlineStatus).toHaveBeenCalledWith(navigator.onLine);
  });

  it('returns isOnline and isApiReachable from the store', () => {
    buildStoreMock({ isOnline: true, isApiReachable: false });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isApiReachable).toBe(false);
  });

  // ── online / offline events ───────────────────────────────────────────────

  it('registers online and offline event listeners', () => {
    renderHook(() => useNetworkStatus());
    expect(window.addEventListener).toHaveBeenCalledWith(
      'online',
      expect.any(Function)
    );
    expect(window.addEventListener).toHaveBeenCalledWith(
      'offline',
      expect.any(Function)
    );
  });

  it('removes event listeners on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'online',
      expect.any(Function)
    );
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'offline',
      expect.any(Function)
    );
  });

  it('calls setOnlineStatus(true) when the online event fires', () => {
    const { setOnlineStatus } = buildStoreMock();
    renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(setOnlineStatus).toHaveBeenCalledWith(true);
  });

  it('calls setOnlineStatus(false) and setApiReachable(false) when the offline event fires', () => {
    const { setOnlineStatus, setApiReachable } = buildStoreMock();
    renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(setOnlineStatus).toHaveBeenCalledWith(false);
    expect(setApiReachable).toHaveBeenCalledWith(false);
  });

  // ── API health probe ──────────────────────────────────────────────────────

  it('fires an API health probe immediately when online', async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: { status: 'ok' } });
    (getApiClient as any).mockReturnValue({ get: mockGet });

    renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGet).toHaveBeenCalledWith('/health', expect.objectContaining({ timeout: 5000 }));
  });

  it('sets isApiReachable(true) when the health probe succeeds', async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: { status: 'ok' } });
    (getApiClient as any).mockReturnValue({ get: mockGet });
    const { setApiReachable } = buildStoreMock();

    renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(setApiReachable).toHaveBeenCalledWith(true);
  });

  it('sets isApiReachable(false) when the health probe fails', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('Network Error'));
    (getApiClient as any).mockReturnValue({ get: mockGet });
    const { setApiReachable } = buildStoreMock();

    renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(setApiReachable).toHaveBeenCalledWith(false);
  });

  it('does NOT probe the API when offline', async () => {
    buildStoreMock({ isOnline: false });
    const mockGet = vi.fn().mockResolvedValue({ data: { status: 'ok' } });
    (getApiClient as any).mockReturnValue({ get: mockGet });

    renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The periodic effect only runs when isOnline is true – so get should
    // never be called when starting offline.
    expect(mockGet).not.toHaveBeenCalled();
  });

  // ── network-unreachable custom event ──────────────────────────────────────

  it('registers a network-unreachable event listener', () => {
    renderHook(() => useNetworkStatus());
    expect(window.addEventListener).toHaveBeenCalledWith(
      'network-unreachable',
      expect.any(Function)
    );
  });

  it('sets isApiReachable(false) when network-unreachable fires', () => {
    const { setApiReachable } = buildStoreMock();
    renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new CustomEvent('network-unreachable'));
    });

    expect(setApiReachable).toHaveBeenCalledWith(false);
  });

  it('removes network-unreachable listener on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'network-unreachable',
      expect.any(Function)
    );
  });

  // ── recheckApi ────────────────────────────────────────────────────────────

  it('exposes recheckApi as a function', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(typeof result.current.recheckApi).toBe('function');
  });

  it('recheckApi triggers an API probe and resolves', async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: { status: 'ok' } });
    (getApiClient as any).mockReturnValue({ get: mockGet });

    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      await result.current.recheckApi();
    });

    expect(mockGet).toHaveBeenCalledWith('/health', expect.objectContaining({ timeout: 5000 }));
  });
});
