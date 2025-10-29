import React from 'react';import React, { Component, ErrorInfo, ReactNode } from 'react';



interface Props {interface Props {

  children: React.ReactNode;  children: ReactNode;

  fallback?: React.ReactNode;  fallback?: ReactNode;

}}



interface State {interface State {

  hasError: boolean;  hasError: boolean;

  error: Error | null;  error: Error | null;

}  errorInfo: ErrorInfo | null;

}

class ErrorBoundary extends React.Component<Props, State> {

  override state: State = {export default class ErrorBoundary extends Component<Props, State> {

    hasError: false,  public state: State = {

    error: null,    hasError: false,

  };    error: null,

    errorInfo: null,

  static getDerivedStateFromError(error: Error): Partial<State> {  };

    return { hasError: true, error };  constructor(props: Props) {

  }    super(props);

    this.state = {

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {      hasError: false,

    console.error('ErrorBoundary caught an error:', error, errorInfo);      error: null,

  }      errorInfo: null,

    };

  handleReset = () => {  }

    this.setState({ hasError: false, error: null });

  };  static getDerivedStateFromError(error: Error): Partial<State> {

    return { hasError: true, error };

  override render() {  }

    if (this.state.hasError) {

      if (this.props.fallback) {  componentDidCatch(error: Error, errorInfo: ErrorInfo) {

        return this.props.fallback;    console.error('ErrorBoundary caught an error:', error, errorInfo);

      }    this.setState({

      error,

      return (      errorInfo,

        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">    });

          <div className="max-w-xl w-full bg-gray-800 rounded-lg shadow-lg border border-red-500 p-8">  }

            <div className="flex items-center mb-4">

              <svg className="w-12 h-12 text-red-500 mr-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">  handleReset = () => {

                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />    this.setState({

              </svg>      hasError: false,

              <div>      error: null,

                <h1 className="text-2xl font-bold text-white">Something went wrong</h1>      errorInfo: null,

                <p className="text-gray-400 mt-1">An unexpected error occurred</p>    });

              </div>  };

            </div>

  render() {

            {this.state.error && (    if (this.state.hasError) {

              <div className="mb-6">      if (this.props.fallback) {

                <h2 className="text-lg font-semibold text-red-400 mb-2">Error:</h2>        return this.props.fallback;

                <div className="bg-gray-900 rounded p-4 overflow-auto max-h-32">      }

                  <pre className="text-sm text-red-300">{this.state.error.toString()}</pre>

                </div>      return (

              </div>        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">

            )}          <div className="max-w-2xl w-full bg-gray-800 rounded-lg shadow-lg border border-red-500 p-8">

            <div className="flex items-center mb-4">

            <div className="flex gap-4">              <svg

              <button onClick={this.handleReset} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">                className="w-12 h-12 text-red-500 mr-4"

                Try Again                fill="none"

              </button>                viewBox="0 0 24 24"

              <button onClick={() => window.location.href = '/'} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">                stroke="currentColor"

                Go to Home              >

              </button>                <path

            </div>                  strokeLinecap="round"

          </div>                  strokeLinejoin="round"

        </div>                  strokeWidth={2}

      );                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"

    }                />

              </svg>

    return this.props.children;              <div>

  }                <h1 className="text-2xl font-bold text-white">Something went wrong</h1>

}                <p className="text-gray-400 mt-1">

                  An unexpected error occurred in the application

export default ErrorBoundary;                </p>

              </div>
            </div>

            {this.state.error && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-red-400 mb-2">Error Details:</h2>
                <div className="bg-gray-900 rounded p-4 overflow-auto max-h-48">
                  <pre className="text-sm text-red-300">
                    {this.state.error.toString()}
                  </pre>
                </div>
              </div>
            )}

            {this.state.errorInfo && process.env.NODE_ENV === 'development' && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-yellow-400 mb-2">
                  Component Stack:
                </h2>
                <div className="bg-gray-900 rounded p-4 overflow-auto max-h-48">
                  <pre className="text-xs text-gray-400">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={this.handleReset}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Go to Home
              </button>
            </div>

            <div className="mt-6 p-4 bg-gray-700 rounded-lg">
              <h3 className="text-sm font-semibold text-white mb-2">
                What you can do:
              </h3>
              <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                <li>Click "Try Again" to reset the component</li>
                <li>Refresh the page to reload the application</li>
                <li>Check your internet connection</li>
                <li>Clear your browser cache and cookies</li>
                <li>Contact support if the problem persists</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
