import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { App } from '../app.ts';
import type { GameState } from '../store/state.ts';

export const AppContext = createContext<Pick<App, 'store' | 'controller'> | null>(null);

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppContext missing');
  return app;
}

/** Selector hook over the vanilla store. Selectors must return stable references (pick fields, derive in useMemo). */
export function useGame<T>(selector: (s: GameState) => T): T {
  return useStore(useApp().store, selector);
}
