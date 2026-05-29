import type { Metric } from 'web-vitals';
import { sloTracker } from '@/lib/slo/tracker';

export const trackPerformance = (
  metricName: string,
  value: number,
  extra?: any
) => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    console.log(`[Performance] ${metricName}: ${value}ms`, extra || '');

    // Track performance for SLO monitoring
    sloTracker.trackPerformance(metricName, value);
  }
};

export const measureTTFB = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const navEntry = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;
    if (navEntry) {
      trackPerformance('TTFB', navEntry.responseStart - navEntry.requestStart);
    }
  }
};

export const measureFCP = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(
      (entry) => entry.name === 'first-contentful-paint'
    );
    if (fcpEntry) {
      trackPerformance('FCP', fcpEntry.startTime);
    }
  }
};

export const reportWebVitals = (onPerfEntry?: (metric: Metric) => void) => {
  if (typeof onPerfEntry !== 'function') return;

  import('web-vitals')
    .then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
      onCLS(onPerfEntry);
      onINP(onPerfEntry);
      onFCP(onPerfEntry);
      onLCP(onPerfEntry);
      onTTFB(onPerfEntry);
    })
    .catch((err) => {
      console.error('Error reporting web vitals:', err);
    });
};
