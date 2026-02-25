import { useReducer, useCallback, useMemo } from 'react';

interface UseHistoryReturn<T> {
    state: T;
    set: (newState: T) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    reset: (initialState: T) => void;
    history: T[];
    currentIndex: number;
}

type HistoryAction<T> = 
    | { type: 'SET', payload: T }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'RESET', payload: T };

interface HistoryState<T> {
    history: T[];
    index: number;
}

function historyReducer<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
    switch (action.type) {
        case 'SET':
            // Remove any future history if we're in the middle of the stack
            const newHistory = state.history.slice(0, state.index + 1);
            return {
                history: [...newHistory, action.payload],
                index: state.index + 1
            };
        case 'UNDO':
            return {
                ...state,
                index: Math.max(0, state.index - 1)
            };
        case 'REDO':
            return {
                ...state,
                index: Math.min(state.history.length - 1, state.index + 1)
            };
        case 'RESET':
            return {
                history: [action.payload],
                index: 0
            };
        default:
            return state;
    }
}

export function useHistory<T>(initialState: T): UseHistoryReturn<T> {
    const [state, dispatch] = useReducer(historyReducer<T>, {
        history: [initialState],
        index: 0
    });

    const currentState = state.history[state.index];

    const set = useCallback((newState: T) => {
        dispatch({ type: 'SET', payload: newState });
    }, []);

    const undo = useCallback(() => {
        dispatch({ type: 'UNDO' });
    }, []);

    const redo = useCallback(() => {
        dispatch({ type: 'REDO' });
    }, []);

    const reset = useCallback((initialState: T) => {
        dispatch({ type: 'RESET', payload: initialState });
    }, []);

    const canUndo = useMemo(() => state.index > 0, [state.index]);
    const canRedo = useMemo(() => state.index < state.history.length - 1, [state.index, state.history.length]);

    return {
        state: currentState,
        set,
        undo,
        redo,
        canUndo,
        canRedo,
        reset,
        history: state.history,
        currentIndex: state.index
    };
}
