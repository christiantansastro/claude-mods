# claude-mods

Three Claude Code mods that cut wasted credits and keep long sessions sharp. Each one draws a row above the prompt box and adds no context to the conversation.

| Mod | What it does |
| --- | --- |
| **effort-picker** | Recommends an effort level (Low, Medium, High, Extra High, Max) for each prompt from what you asked. **Auto** is on by default: each prompt runs at the recommended level. Turn it off with the **Auto** button or `/effort-picker off` to get recommendations only. |
| **usage-meter** | A context-window bar (`Context ████████░░ 82% · 164k/200k`). At 80% and 85% it prompts a handoff: **Hand off** (or `/handoff`) asks Claude for a brief to paste into a new chat. |
| **cold-chat-warning** | When a session has been idle over 60 minutes, warns that the prompt cache has expired and your next message re-reads the whole history, with a **Hand off** option. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install effort-picker --marketplace christiantansastro/claude-mods
/plugin install usage-meter --marketplace christiantansastro/claude-mods
/plugin install cold-chat-warning --marketplace christiantansastro/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope loads the mod in every session, the desktop app's included).

Or from a shell:

```
claude plugin marketplace add christiantansastro/claude-mods
claude plugin install effort-picker@claude-mods
claude plugin install usage-meter@claude-mods
claude plugin install cold-chat-warning@claude-mods
```

## Notes

- Effort Picker uses keyword rules, not a model call, so it costs nothing and can misjudge a prompt.
- Hand off writes the brief; you open the new chat and paste it.

MIT licensed.
