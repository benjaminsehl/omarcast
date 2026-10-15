# Omarcast

A Raycast-style command palette for Omarchy, built as an **omarchy-shell plugin**
(`sehl.omarcast`). Because it runs inside the Omarchy shell it uses the same theme
tokens as the Omarchy menu (`Color.menu.*`), the same font (`Style.font.menuFamily`,
`OMARCHY_MENU_FONT`), borders, and Hyprland corner rounding, and it re-themes live
when you switch themes.

Bound to **SUPER+SPACE** and **CTRL+SPACE** (⌘+Space under a Mac-style Cmd/Ctrl swap)
in `~/.config/hypr/bindings.lua`. The Omarchy menu is still on SUPER+ALT+SPACE.

## What it does

Root search, type-first:

| Type | You get |
|---|---|
| `firefox`, `chrom` | Applications (Omarchy's app library: hidden entries, icons, launch feedback) |
| `theme`, `lock`, `wifi` | Every Omarchy menu action; submenus/pickers open the Omarchy menu at that spot |
| `omarchy theme` | `omarchy` CLI commands (run in a terminal, or prefill args) |
| `1+1`, `2^10`, `sqrt(2)`, `20% of 50`, `5!`, `0xff`, `255 to hex` | Calculator card |
| `32F`, `5 km`, `6 ft in cm`, `1 GiB to MB`, `90 min to h` | Unit conversion card (length, mass, volume, area, speed, time, data, energy, angle, temperature) |
| `100 usd to eur`, `$20`, `10 eur` | Currency card (rates from open.er-api.com, cached 12h in `~/.cache/omarcast`) |
| `time in tokyo`, `nyc time` | World clock card |
| `gh omarchy`, `yt …`, `aur …`, `aw …` | Quicklinks |
| `omarchy.org` | Open URL |
| `> btop` | Run a shell command (terminal or background) |
| window titles | Switch to open windows |
| `how do I …?`, any 3+ word message | **Ask your default Omarchy agent** (`omarchy agent prompt`) — top result |
| anything else | Fallbacks: ask the agent, search Google / DuckDuckGo, run in terminal |

Built-in commands (each opens its own view; Backspace on empty / Esc goes back):

- **Clipboard History** – Omarchy's clipboard history with text/image preview pane
- **Search Emoji & Symbols** – paste or copy
- **Switch Windows** – focus or close
- **Search Files** – `fd` over `~`, with preview pane
- **Edit Quicklinks / Edit Snippets** – `~/.config/omarcast/{quicklinks,snippets}.json` (see `examples/`)

Keys: `↵` primary action · `Ctrl+↵` secondary · `Ctrl+K` action panel · `↑↓` / `Ctrl+N/P` ·
`Tab` opens a command's view · `Esc` clears → back → close.

Usage is remembered (`~/.local/state/omarcast/history.json`) and boosts ranking;
the empty query shows Recent, Commands, Applications.

## Layout

```
plugin/              the shell plugin (linked into ~/.config/omarchy/plugins/sehl.omarcast)
  Omarcast.qml       UI, views, actions, data sources
  lib/Calc.js        calculator, units, currency, bases
  lib/Search.js      ranking + frecency
  lib/Sources.js     Omarchy menu/CLI parsing, windows, quicklinks, time zones, snippets
bin/omarcast-install link/reload the plugin (--restart restarts omarchy-shell)
bin/omarcast-ui      toggle from a shell: omarcast-ui [clipboard|emoji|windows|files] [query]
dev/                 standalone harness (real Omarchy Commons/Ui) + screenshot helper
test/                node tests for lib/*.js
```

## Develop

```bash
npm test                          # calculator + sources tests
./bin/omarcast-install            # reload after edits (shell doesn't watch through symlinks)
./bin/omarcast-install --restart  # if a property-declaration change doesn't take
qs -p dev                         # run standalone with QML errors on stdout
dev/shot '{"query":"32F"}'        # harness + screenshot to /tmp/omarcast-shot.png
```

Uninstall: `omarchy plugin disable sehl.omarcast`, `rm ~/.config/omarchy/plugins/sehl.omarcast`,
and remove the omarcast block from `~/.config/hypr/bindings.lua`.
