import type { LurkwireApi } from "../../preload/index";

declare global {
  interface Window {
    lurkwire: LurkwireApi;
  }
}

export {};
