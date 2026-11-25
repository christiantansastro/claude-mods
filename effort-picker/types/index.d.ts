export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Pick = {
  level: Level
  reason: string
  /** The level the session last ran a step at, if the model takes effort. */
  current: Level | null
}

declare module 'claude-code' {
  interface PluginState {
    'effort-picker': { pick: Shaped<Pick | null>; isAuto: boolean; isHidden: boolean }
  }
}
