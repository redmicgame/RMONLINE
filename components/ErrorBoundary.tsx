import React from 'react';

interface ErrorBoundaryState {
    hasError: boolean;
    errorMessage: string;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: error?.message || 'An unexpected error occurred.'
        };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Red Mic Online ErrorBoundary caught:', error, info);
    }

    render() {
        if (this.state.hasError) {
            let parsedDetails: string | null = null;
            try {
                const parsed = JSON.parse(this.state.errorMessage);
                if (parsed?.error) {
                    parsedDetails = `${parsed.operationType?.toUpperCase() || 'SYNC'} error on ${parsed.path || 'database'}: ${parsed.error}`;
                }
            } catch {
                // Not JSON
            }

            return (
                <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center shadow-2xl">
                        <div className="w-12 h-12 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center mx-auto mb-4 font-black text-xl">
                            !
                        </div>
                        <h1 className="text-xl font-black text-white mb-2">Connection Interrupted</h1>
                        <p className="text-sm text-zinc-400 mb-6 break-words">
                            {parsedDetails || this.state.errorMessage}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
                        >
                            Reconnect to Red Mic Online
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
