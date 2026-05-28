'use client';

import React, { ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorMessage } from './ErrorMessage';
import { logError } from '@/lib/utils/error-handler';
import type { AppError } from '@/lib/utils/error-handler';

interface APIBootstrapErrorBoundaryProps {
  children: ReactNode;
  componentName: string;
  fallback?: React.ComponentType<{
    error: Error;
    resetError: () => void;
    componentName: string;
  }>;
  onError?: (error: Error, componentName: string) => void;
  retryable?: boolean;
  showDetails?: boolean;
}

interface APIBootstrapErrorState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

/**
 * Error boundary specifically designed for handling API bootstrap failures
 * in homepage widgets. Provides better recovery and user feedback for
 * async/API errors, not just render errors.
 *
 * @example
 * ```tsx
 * <APIBootstrapErrorBoundary
 *   componentName="FeaturedQuests"
 *   retryable={true}
 *   onError={(error, name) => console.log(`Error in ${name}:`, error)}
 * >
 *   <FeaturedQuests />
 * </APIBootstrapErrorBoundary>
 * ```
 */
export class APIBootstrapErrorBoundary extends React.Component<
  APIBootstrapErrorBoundaryProps,
  APIBootstrapErrorState
> {
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(props: APIBootstrapErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<APIBootstrapErrorState> {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error with context
    const errorContext = {
      component: this.props.componentName,
      retryCount: this.state.retryCount,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };

    logError(error, `API Bootstrap Error - ${this.props.componentName}`);

    // Report to Sentry with context
    Sentry.captureException(error, {
      contexts: {
        bootstrap: errorContext,
      },
      tags: {
        component: this.props.componentName,
        errorBoundary: 'APIBootstrap',
      },
    });

    // Call the onError callback if provided
    this.props.onError?.(error, this.props.componentName);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });
  }

  resetError = () => {
    // Clear any pending timers
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: FallbackComponent, componentName, showDetails = false } = this.props;
      const { error } = this.state;

      // Use custom fallback component if provided
      if (FallbackComponent) {
        return (
          <FallbackComponent
            error={error!}
            resetError={this.resetError}
            componentName={componentName}
          />
        );
      }

      // Default fallback UI for API bootstrap errors
      return (
        <div
          className="w-full rounded-lg border border-red-900/30 bg-red-900/10 p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-4">
            {/* Error Icon */}
            <div className="flex-shrink-0 text-2xl" aria-hidden="true">
              ⚠️
            </div>

            {/* Error Content */}
            <div className="flex-1">
              <h3 className="font-semibold text-red-200">
                Failed to Load {componentName}
              </h3>
              <p className="mt-1 text-sm text-red-300">
                We encountered an issue while loading this section. Please try again or check
                back later.
              </p>

              {/* Error Details (Development only) */}
              {showDetails && process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4 text-xs text-red-400">
                  <summary className="cursor-pointer font-medium hover:text-red-300">
                    Error Details
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-red-950/50 p-3">
                    {error.message}
                    {error.stack && `\n\n${error.stack}`}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={this.resetError}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-red-900/20"
                  aria-label={`Try loading ${componentName} again`}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
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

                <button
                  onClick={() => window.location.href = '/'}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-red-900/20"
                  aria-label="Go to homepage"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 12l2-3m0 0l7-4 7 4M5 10v10a1 1 0 001 1h3m10-11l2 3m-2-3V9m-6 11h3m6 0h3"
                    />
                  </svg>
                  Go Home
                </button>
              </div>

              {/* Retry hint */}
              {this.state.retryCount > 0 && (
                <p className="mt-3 text-xs text-red-400">
                  Retry attempts: {this.state.retryCount}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional wrapper for easier use in most cases
 */
export function WithAPIBootstrapErrorBoundary({
  children,
  componentName,
  onError,
  fallback,
  showDetails = false,
}: {
  children: ReactNode;
  componentName: string;
  onError?: (error: Error, componentName: string) => void;
  fallback?: React.ComponentType<{
    error: Error;
    resetError: () => void;
    componentName: string;
  }>;
  showDetails?: boolean;
}) {
  return (
    <APIBootstrapErrorBoundary
      componentName={componentName}
      onError={onError}
      fallback={fallback}
      showDetails={showDetails}
    >
      {children}
    </APIBootstrapErrorBoundary>
  );
}
