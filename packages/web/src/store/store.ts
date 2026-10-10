import { createStore, type StoreApi } from 'zustand/vanilla';
import { initialState, type GameState } from './state.ts';

export type GameStore = StoreApi<GameState>;

/** Vanilla (React-free) store so Phaser can read it in phase 2. Mutate only through the pure reducers. */
export const createGameStore = (): GameStore => createStore<GameState>(() => initialState());
