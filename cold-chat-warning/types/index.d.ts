export type Cold = {
  /** When the session was last active, in $.clock.now() milliseconds. */
  lastActiveAt: number
  /** Whole minutes idle at the last check. */
  idleMinutes: number
  /** Input tokens the next message will re-read, if known. */
  tokens: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'cold-chat-warning': { cold: Shaped<Cold | null>; dismissedAt: number }
  }
}
