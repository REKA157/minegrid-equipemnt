import React from 'react';
import { logger } from '../utils/logger';

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('[ErrorBoundary] crash React', error, { componentStack: info.componentStack });
  }

  private handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[40vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white border border-red-200 rounded-xl shadow-lg p-8 text-center">
            <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Une erreur est survenue</h2>
            <p className="text-sm text-gray-500 mb-4">
              Quelque chose s’est mal passé. Veuillez rafraîchir la page.
            </p>
            {this.state.error?.message && (
              <p
                className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 break-words border border-gray-200 max-h-32 overflow-y-auto"
                title={this.state.error.message}
              >
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
