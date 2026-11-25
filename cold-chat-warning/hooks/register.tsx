import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cold } from '../types'

const COLD_MINUTES = 60
const KEEP_DAYS = 14

const cold = atom({ plugin: 'cold-chat-warning', key: 'cold' } as const, null, { shape: 'cold-1' })
// The lastActiveAt the person dismissed the warning for; 0 for none.
const dismissedAt = atom({ plugin: 'cold-chat-warning', key: 'dismissedAt' } as const, 0)

const HANDOFF = [
  'This session went cold. Write a handoff brief I can paste into a NEW chat so it continues this work without re-reading this history.',
  'Include: the goal; what is done (files, branch, commits); current state and anything uncommitted; decisions and why; open questions; exact next steps.',
  'Under 350 words, one fenced block, nothing else.',
].join(' ')

function idleText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

async function keyOf($: EngineInterface): Promise<string> {
  return `last:${await $.session.id()}`
}

async function touch($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, cold, () => ({ lastActiveAt: now, idleMinutes: 0, tokens: null }))
  await $.store.set(await keyOf($), now)
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const storeKey = await keyOf($)
    const now = await $.clock.now()

    // Prune entries of sessions long gone.
    for (const key of await $.store.keys()) {
      const at = await $.store.get(key)
      if (typeof at === 'number' && now - at > KEEP_DAYS * 86_400_000) await $.store.delete(key)
    }

    // A resumed session remembers when it was last used; a new one starts now.
    const stored = await $.store.get(storeKey)
    const lastActiveAt =
      typeof stored === 'number' ? stored : ((await read($, cold))?.lastActiveAt ?? now)
    await update($, cold, () => ({ lastActiveAt, idleMinutes: 0, tokens: null }))

    const check = async () => {
      const c = await read($, cold)
      if (!c) return
      const idleMinutes = Math.floor(((await $.clock.now()) - c.lastActiveAt) / 60_000)
      if (idleMinutes === c.idleMinutes) return
      let tokens = c.tokens
      if (idleMinutes >= COLD_MINUTES && tokens === null) {
        tokens = (await $.session.usage()).context.tokens ?? null
      }
      await update($, cold, v => (v ? { ...v, idleMinutes, tokens } : v))
    }

    void check()
    $.clock.every(60_000, () => void check())

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const c = await read($, cold)
    if (c && c.idleMinutes >= COLD_MINUTES && e.origin.kind === 'composer' && !e.command) {
      const dismissed = (await read($, dismissedAt)) === c.lastActiveAt
      if (!dismissed) {
        $.ui.toast(
          `Cold chat (idle ${idleText(c.idleMinutes)}): this message re-reads ${
            c.tokens ? `~${k(c.tokens)} tokens of` : 'the whole'
          } history uncached. Consider a fresh chat for new work.`,
          { timeoutMs: 8000 },
        )
      }
    }
    const result = await next(e)
    await touch($)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await touch($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, cold)
    if (
      e.props.hasSurvey ||
      e.props.isWorking ||
      !c ||
      c.idleMinutes < COLD_MINUTES ||
      (await read($, dismissedAt)) === c.lastActiveAt
    ) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="warning" bold>
          Cold chat
        </Text>
        <Text color="warning">
          {' '}idle {idleText(c.idleMinutes)}: cache expired, so your next message re-reads{' '}
          {c.tokens ? `~${k(c.tokens)} tokens` : 'the full history'}. New work? Start a new chat.{' '}
        </Text>
        <Button
          key="handoff"
          label="Hand off"
          onPress={() => void $.prompt.submit({ text: HANDOFF, asUser: true })}
        />
        <Button
          key="dismiss"
          label="Continue here"
          onPress={() => update($, dismissedAt, () => c.lastActiveAt)}
        />
      </Box>
    )
  })
}
