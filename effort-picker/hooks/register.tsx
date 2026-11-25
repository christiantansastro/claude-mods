import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level, Pick } from '../types'

const pick = atom({ plugin: 'effort-picker', key: 'pick' } as const, null, { shape: 'pick-1' })
const isAuto = atom({ plugin: 'effort-picker', key: 'isAuto' } as const, false)
const isHidden = atom({ plugin: 'effort-picker', key: 'isHidden' } as const, false)

const LABEL: Record<Level, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
}
const ORDER: Level[] = ['low', 'medium', 'high', 'xhigh', 'max']

const RULES: { level: Level; why: string; test: RegExp }[] = [
  {
    level: 'max',
    why: 'architecture / system-wide work',
    test: /\b(architect(ure)?|system design|from scratch|whole (codebase|app|repo)|entire (codebase|app|repo)|security (audit|review)|migrate (the|all|every)|rewrite (the|all))\b/i,
  },
  {
    level: 'xhigh',
    why: 'hard debugging or investigation',
    test: /\b(race condition|deadlock|memory leak|flaky|intermittent|root cause|investigate|performance|optimi[sz]e|why (does|is|did)|doesn'?t work|not working|broken|regression)\b/i,
  },
  {
    level: 'high',
    why: 'building or changing a feature',
    test: /\b(implement|build|create|add (a |an )?(feature|endpoint|page|component|flow)|refactor|integrate|write tests?|fix (the |a |this )?bug|checkout|auth(entication)?|migration)\b/i,
  },
  {
    level: 'medium',
    why: 'a contained edit or explanation',
    test: /\b(update|change|tweak|adjust|move|explain|review|add|remove|replace|style|css)\b/i,
  },
  {
    level: 'low',
    why: 'a quick lookup or trivial edit',
    test: /^(yes|no|ok(ay)?|sure|thanks?|go ahead|do it|continue)\b|\b(typo|rename|format|lint|commit|push|what is|where is|which file|list|show me)\b/i,
  },
]

export function recommend(text: string): { level: Level; reason: string } {
  const t = text.trim()
  const hit = RULES.find(rule => rule.test.test(t))
  let level: Level = hit?.level ?? (t.length < 120 ? 'low' : 'medium')
  let reason = hit?.why ?? (t.length < 120 ? 'a short, simple ask' : 'a general request')

  // Long, multi-part prompts deserve a step up; one-liners a step down.
  const parts = (t.match(/^\s*(\d+[.)]|[-*•])\s+/gm) ?? []).length
  if (t.length > 1500 || parts >= 4) {
    level = ORDER[Math.min(ORDER.indexOf(level) + 1, ORDER.length - 1)] ?? level
    reason += ', long multi-part prompt'
  } else if (t.length < 40 && level !== 'max' && level !== 'xhigh') {
    level = ORDER[Math.max(ORDER.indexOf(level) - 1, 0)] ?? level
  }

  return { level, reason }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'effort-picker',
      description: 'Toggle auto-applying the recommended effort level (or: /effort-picker on|off|show)',
    })

    return next(e)
  })

  on('command.run', { command: 'effort-picker' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'show') {
      await update($, isHidden, () => false)
      return { text: 'Effort Picker band shown.' }
    }
    const was = await read($, isAuto)
    const now = arg === 'on' ? true : arg === 'off' ? false : !was
    await update($, isAuto, () => now)

    return {
      text: now
        ? 'Effort Picker: auto-apply ON. Each prompt runs at its recommended effort.'
        : 'Effort Picker: auto-apply OFF. Recommendations only.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta && e.origin.kind === 'composer') {
      const rec = recommend(e.text)
      const prev = await read($, pick)
      const value: Pick = { ...rec, current: prev?.current ?? null }
      await update($, pick, () => value)
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const current = typeof e.effort === 'string' ? e.effort : null
    const rec = await read($, pick)
    if (rec && current && rec.current !== current) {
      await update($, pick, p => (p ? { ...p, current } : p))
    }
    const isApplied = rec !== null && current !== null && (await read($, isAuto))

    return yield* next(isApplied ? { ...e, effort: rec.level } : e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rec = await read($, pick)
    if (e.props.hasSurvey || rec === null || (await read($, isHidden))) {
      return next(e)
    }
    const auto = await read($, isAuto)
    const { Box, Button, Text } = $.ui.resolve(e)
    const isOver =
      rec.current !== null && ORDER.indexOf(rec.current) > ORDER.indexOf(rec.level)
    const isUnder =
      rec.current !== null && ORDER.indexOf(rec.current) < ORDER.indexOf(rec.level)

    return (
      <Box>
        <Text dimColor>Effort: </Text>
        <Text bold color={isOver ? 'warning' : isUnder ? 'suggestion' : 'success'}>
          {LABEL[rec.level]}
        </Text>
        <Text dimColor>
          {' '}({rec.reason})
          {rec.current && !auto ? ` · running at ${LABEL[rec.current]}` : ''}
          {isOver && !auto ? ' · /effort ' + rec.level + ' saves credits' : ''}
          {isUnder && !auto ? ' · consider /effort ' + rec.level : ''}{' '}
        </Text>
        <Button
          key="auto"
          label={auto ? 'Auto: on' : 'Auto: off'}
          onPress={() => update($, isAuto, v => !v)}
        />
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
