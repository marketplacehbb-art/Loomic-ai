import React, { Component, ReactNode } from 'react';
import LocalPreview from './LocalPreview';

interface CodePreviewProps {
    files: Record<string, string>;
    dependencies?: Record<string, string>;
    previewPath?: string;
    refreshToken?: number;
    previewMode?: 'desktop' | 'tablet' | 'mobile';
    onPreviewDocument?: (html: string) => void;
    onPreviewIssue?: (issue: {
        type: 'bundler' | 'runtime';
        message: string;
        stack?: string;
        source?: string;
        category?: string;
        fingerprint?: string;
        routePath?: string;
        timestamp: number;
    }) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class PreviewErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Preview Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-full w-full flex items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="text-center max-w-md">
                        <span className="material-icons-round text-6xl text-red-500 mb-4">error_outline</span>
                        <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-2">Preview Error</h3>
                        <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                            The preview could not be rendered. Please check the console for details.
                        </p>
                        {this.state.error && (
                            <details className="text-left mt-4">
                                <summary className="cursor-pointer text-xs font-semibold text-red-700 dark:text-red-400 mb-2">
                                    Error Details
                                </summary>
                                <pre className="text-xs bg-red-100 dark:bg-red-900/30 p-3 rounded overflow-auto max-h-40">
                                    {this.state.error.message}
                                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                                </pre>
                            </details>
                        )}
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export function CodePreview({
    files,
    dependencies,
    previewPath = '/',
    refreshToken = 0,
    previewMode = 'desktop',
    onPreviewDocument,
    onPreviewIssue
}: CodePreviewProps) {
    // Falls nur eine Datei vorhanden ist, nehmen wir diese als App.tsx Basis
    const entryPath =
        files['src/App.tsx'] !== undefined ? 'src/App.tsx' :
            files['App.tsx'] !== undefined ? 'App.tsx' :
                files['app.tsx'] !== undefined ? 'app.tsx' :
                    Object.keys(files)[0] || 'src/App.tsx';

    const mainFile = files[entryPath] || '';

    return (
        <PreviewErrorBoundary>
            <div className="h-full w-full">
                <LocalPreview
                    code={mainFile}
                    files={files}
                    entryPath={entryPath}
                    dependencies={dependencies}
                    previewPath={previewPath}
                    refreshToken={refreshToken}
                    previewMode={previewMode}
                    onPreviewDocument={onPreviewDocument}
                    onPreviewIssue={onPreviewIssue}
                />
            </div>
        </PreviewErrorBoundary>
    );
}
