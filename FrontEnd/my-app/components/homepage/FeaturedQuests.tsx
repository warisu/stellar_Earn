'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Quest } from '@/lib/types/quest';
import type { QuestQueryParams } from '@/lib/types/api.types';
import { getQuests } from '@/lib/api/quests';
import { createCancelToken } from '@/lib/api/client';
import { useQuestFilter } from '@/lib/hooks/useQuestFilter';
import type { FilterTab } from '@/lib/hooks/useQuestFilter';
import { QuestFilterTabs } from './QuestFilterTabs';
import { QuestCarousel } from './QuestCarousel';
import { FeaturedQuestsSkeleton } from './SkeletonLoaders';
import { APIBootstrapErrorBoundary } from '@/components/error/APIBootstrapErrorBoundary';
import { BootstrapErrorFallback } from '@/components/error/BootstrapErrorFallback';

const TAB_PARAMS: Record<FilterTab, QuestQueryParams> = {
  Trending: { sortBy: 'xpReward', order: 'DESC', limit: 10 },
  'High Reward': { sortBy: 'rewardAmount', order: 'DESC', limit: 10 },
  New: { sortBy: 'createdAt', order: 'DESC', limit: 10 },
  'Ending Soon': { sortBy: 'deadline', order: 'ASC', limit: 10 },
};

/**
 * Internal component that handles the quest data fetching and display.
 * Uses improved error handling with retry logic and better error states.
 */
function FeaturedQuestsContent() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const { activeFilter, setActiveFilter } = useQuestFilter(quests);
  const cancelRef = useRef(createCancelToken());

  /**
   * Fetch quests with improved error handling
   */
  const fetchQuests = useCallback(async () => {
    cancelRef.current.cancel();
    cancelRef.current = createCancelToken();
    setLoading(true);
    setError(null);

    try {
      const res = await getQuests(TAB_PARAMS[activeFilter], cancelRef.current);
      const items = (res as any).data ?? (res as any).quests ?? [];
      setQuests(items);
      setRetryCount(0); // Reset retry count on success
    } catch (err) {
      // Don't show error if request was cancelled (e.g., component unmounting)
      if (err && typeof err === 'object' && ('name' in err)) {
        const errorName = (err as any).name;
        if (errorName === 'CanceledError' || errorName === 'AbortError') {
          return;
        }
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load quests. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  /**
   * Handle manual retry from error UI
   */
  const handleRetry = useCallback(async () => {
    setRetryCount((prev) => prev + 1);
    await fetchQuests();
  }, [fetchQuests]);

  /**
   * Fetch quests when filter changes
   */
  useEffect(() => {
    fetchQuests();

    return () => {
      cancelRef.current.cancel();
    };
  }, [activeFilter, fetchQuests]);

  // Loading state - show skeleton
  if (loading && quests.length === 0) {
    return (
      <section className="featured-quests" aria-labelledby="featured-quests-heading">
        <div className="featured-quests__header">
          <div>
            <p className="featured-quests__eyebrow">Featured Opportunities</p>
            <h2 id="featured-quests-heading" className="featured-quests__heading">
              Top Quests Right Now
            </h2>
            <p className="featured-quests__subtext">
              Hand-picked high-value tasks with on-chain rewards.
            </p>
          </div>
          <a href="/quests" className="featured-quests__view-all">
            View all quests →
          </a>
        </div>
        <FeaturedQuestsSkeleton />
      </section>
    );
  }

  // Error state - show error message with retry
  if (error && !loading) {
    return (
      <section className="featured-quests" aria-labelledby="featured-quests-heading">
        <div className="featured-quests__header">
          <div>
            <p className="featured-quests__eyebrow">Featured Opportunities</p>
            <h2 id="featured-quests-heading" className="featured-quests__heading">
              Top Quests Right Now
            </h2>
            <p className="featured-quests__subtext">
              Hand-picked high-value tasks with on-chain rewards.
            </p>
          </div>
          <a href="/quests" className="featured-quests__view-all">
            View all quests →
          </a>
        </div>

        <div className="rounded-lg border border-red-900/30 bg-red-900/10 p-6" role="alert">
          <div className="flex items-start gap-4">
            <div className="text-2xl flex-shrink-0">⚠️</div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-200">Unable to Load Quests</h3>
              <p className="mt-2 text-sm text-red-300">{error}</p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  aria-label="Retry loading featured quests"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Try Again
                </button>

                <a
                  href="/quests"
                  className="inline-flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  View All Quests
                </a>
              </div>

              {retryCount > 0 && (
                <p className="mt-3 text-xs text-red-400">Retry attempts: {retryCount}</p>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Success state - show content
  return (
    <section className="featured-quests" aria-labelledby="featured-quests-heading">
      <div className="featured-quests__header">
        <div>
          <p className="featured-quests__eyebrow">Featured Opportunities</p>
          <h2 id="featured-quests-heading" className="featured-quests__heading">
            Top Quests Right Now
          </h2>
          <p className="featured-quests__subtext">
            Hand-picked high-value tasks with on-chain rewards.
          </p>
        </div>
        <a href="/quests" className="featured-quests__view-all">
          View all quests →
        </a>
      </div>

      <QuestFilterTabs active={activeFilter} onChange={setActiveFilter} />
      <QuestCarousel quests={quests} />
    </section>
  );
}

/**
 * Main component with error boundary wrapper for resilient error handling
 */
export default function FeaturedQuests() {
  return (
    <APIBootstrapErrorBoundary
      componentName="Featured Quests"
      fallback={({ error, resetError, componentName }) => (
        <BootstrapErrorFallback
          error={error}
          resetError={resetError}
          componentName={componentName}
          showDetails={false}
        />
      )}
      onError={(error) => {
        console.error('FeaturedQuests bootstrap error:', error);
      }}
    >
      <FeaturedQuestsContent />
    </APIBootstrapErrorBoundary>
  );
}

