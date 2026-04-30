import type { DogentApi } from "../electron/preload";

declare global {
  interface Window {
    dogent: DogentApi;
  }
}

export {};
