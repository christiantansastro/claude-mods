import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'

const WARN = 80
const URGENT = 85

const reading = atom({ plugin: 'usage-meter', key: 'reading' } as const, null, { shape: 'reading-1' })
const warnedAt = atom({ plugin: 'usage-meter', key: 'warnedAt' } as const, 0)
const isDismissed = atom({ plugin: 'usage-meter', key: 'isDismissed' } as const, false)

const HANDOFF = [
  'Context is nearly full. Write a handoff brief I can paste into a NEW chat so it continues this work without re-reading this history.',
  'Include: the goal; what is done (files changed, branch, commits); the current state and anything uncommitted; decisions made and why; open questions; the exact next steps.',
  'Keep it under 350 words, in one fenced block, and add nothing else.',
].join(' ')

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

function bar(percent: number, width = 10): string {
  const full = Math.round((Math.min(percent, 100) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff',
      description: 'Ask Claude for a handoff brief to paste into a new chat',
    })

    const poll = async () => {
      const { context } = await $.session.usage()
      if (context.percent === undefined) return
      const value: Reading = {
        percent: context.percent,
        tokens: context.tokens ?? 0,
        window: context.window,
      }
      await update($, reading, () => value)

      const warned = await read($, warnedAt)
      const level = value.percent >= URGENT ? URGENT : value.percent >= WARN ? WARN : 0
      if (level > warned) {
        await update($, warnedAt, () => level)
        await update($, isDismissed, () => false)
        $.ui.toast(
          `Context ${value.percent}% full. Hand off to a new chat to keep quality up and costs down (/handoff).`,
          { timeoutMs: 8000 },
        )
      } else if (level < warned) {
        // Compacted or cleared: re-arm the warnings.
        await update($, warnedAt, () => level)
      }
    }

    void poll()
    $.clock.every(30_000, () => void poll())

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    if (context.percent !== undefined) {
      await update($, reading, () => ({
        percent: context.percent ?? 0,
        tokens: context.tokens ?? 0,
        window: context.window,
      }))
    }

    return result
  })

  on('command.run', { command: 'handoff' }, async $ => {
    await $.prompt.submit({ text: HANDOFF, asUser: true })

    return { text: 'Asking for a handoff brief. Paste it into a new chat when it arrives.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    if (e.props.hasSurvey || r === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isWarn = r.percent >= WARN
    const isUrgent = r.percent >= URGENT
    const color = isUrgent ? 'error' : isWarn ? 'warning' : 'success'
    const showAsk = isWarn && !(await read($, isDismissed)) && !e.props.isWorking

    return (
      <Box>
        <Text dimColor>Context </Text>
        <Text color={color}>{bar(r.percent)}</Text>
        <Text color={isWarn ? color : undefined} dimColor={!isWarn}>
          {' '}{r.percent}% · {k(r.tokens)}/{k(r.window)}
        </Text>
        {showAsk && (
          <Text color={color}>
            {isUrgent ? ' · hand off now ' : ' · time to hand off '}
          </Text>
        )}
        {showAsk && (
          <Button
            key="handoff"
            label="Hand off"
            onPress={() => void $.prompt.submit({ text: HANDOFF, asUser: true })}
          />
        )}
        {showAsk && (
          <Button key="later" label="Later" onPress={() => update($, isDismissed, () => true)} />
        )}
      </Box>
    )
  })
}
