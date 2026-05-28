import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import FeaturedQuests from '@/components/homepage/FeaturedQuests';

/**
 * Integration tests for FeaturedQuests with error handling
 */
describe('FeaturedQuests - Error Boundary Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading skeleton while fetching', () => {
    // Mock the API to not resolve immediately
    vi.mock('@/lib/api/quests', () => ({
      getQuests: vi.fn(() => new Promise(() => {})), // Never resolves
    }));

    render(<FeaturedQuests />);

    // Should show loading indicators
    expect(screen.getByText(/Loading featured quests/i)).toBeInTheDocument();
  });

  it('should display error message on API failure', async () => {
    const mockError = new Error('API request failed');

    vi.mock('@/lib/api/quests', () => ({
      getQuests: vi.fn(async () => {
        throw mockError;
      }),
    }));

    render(<FeaturedQuests />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to Load Quests/i)).toBeInTheDocument();
    });
  });

  it('should provide retry functionality in error state', async () => {
    const mockError = new Error('API request failed');

    vi.mock('@/lib/api/quests', () => ({
      getQuests: vi.fn(async () => {
        throw mockError;
      }),
    }));

    render(<FeaturedQuests />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });
  });

  it('should show section title and links regardless of state', async () => {
    render(<FeaturedQuests />);

    // These should be visible in all states
    expect(screen.getByText('Featured Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Top Quests Right Now')).toBeInTheDocument();
    expect(screen.getByText(/Hand-picked high-value tasks/i)).toBeInTheDocument();
  });

  it('should wrap component with APIBootstrapErrorBoundary', () => {
    // The component should render without throwing
    expect(() => {
      render(<FeaturedQuests />);
    }).not.toThrow();
  });
});
