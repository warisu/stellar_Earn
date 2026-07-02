'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ConfigurationBoundaryError } from '../lib/env-boundary';

interface Props {
  children: ReactNode;
  fallbackBoundaryName: string;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class ConfigBoundaryGuard extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: null
  };

  public static getDerivedStateFromError(error: Error): State {
    if (error instanceof ConfigurationBoundaryError) {
      return { hasError: true, errorMessage: error.message };
    }
    throw error;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Task Requirement: Strip verbose console logging from environmental contexts in production
    if (process.env.NODE_ENV !== 'production') {
      console.error("Configuration Boundary Intercepted:", error, errorInfo);
    } else {
      // Send trace diagnostics to your telemetry endpoint securely instead of dumping to standard browser out
      // myTelemetryClient.captureException(error);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 border border-red-800 bg-red-950/20 text-red-400 rounded-lg">
          <h3>⚠️ Configuration Error</h3>
          <p className="text-sm font-mono mt-1">{this.state.errorMessage}</p>
        </div>
      );
    }

    return this.props.children;
  }
}