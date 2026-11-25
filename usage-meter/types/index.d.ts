export type Reading = { percent: number; tokens: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      reading: Shaped<Reading | null>
      /** The highest threshold (80 or 85) already warned about; 0 for none. */
      warnedAt: number
      isDismissed: boolean
    }
  }
}
