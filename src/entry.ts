import { PipController } from './pip';
import type { ToggleResult } from './types';

// Isolated-world state survives toolbar reinjection and is inaccessible to page scripts.
const state = globalThis as typeof globalThis & { __betterMiniPlayerV1?: PipController };
export function toggle(): Promise<ToggleResult> {
  state.__betterMiniPlayerV1 ??= new PipController();
  return state.__betterMiniPlayerV1.toggle();
}
