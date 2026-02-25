import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

interface Props {
    children: ReactNode;
    iconName?: string;
}

interface State {
    hasError: boolean;
}

/**
 * Error Boundary for Icon Imports
 * Catches errors when icons fail to load and shows fallback
 */
export class IconFallback extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(_: Error): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
        console.warn(
            `⚠️ Icon import failed${this.props.iconName ? ` for "${this.props.iconName}"` : ''}`,
            error.message
        );
    }

    render() {
        if (this.state.hasError) {
            // Fallback to CircleAlert icon
            return (
                <CircleAlert
                    className="text-amber-500 inline-block"
                    aria-label={`Icon not found${this.props.iconName ? `: ${this.props.iconName}` : ''}`}
                />
            );
        }

        return this.props.children;
    }
}
