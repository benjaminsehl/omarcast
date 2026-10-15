import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "lib/Calc.js" as Calc
import "lib/Search.js" as Search
import "lib/Sources.js" as Sources

// Omarcast — a Raycast-style palette living inside omarchy-shell, so it
// shares the menu's theme tokens, fonts, borders and corner rounding.
Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null
  property var manifest: null
  readonly property string pluginId: (manifest && manifest.id) || "sehl.omarcast"
  property string omarchyPath: Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"
  readonly property string home: Quickshell.env("HOME")
  readonly property string configDir: (Quickshell.env("XDG_CONFIG_HOME") || home + "/.config") + "/omarcast"
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarcast"
  readonly property string cacheDir: (Quickshell.env("XDG_CACHE_HOME") || home + "/.cache") + "/omarcast"
  readonly property var appLibrary: shell ? shell.appLibrary : null

  // ------------------------------------------------------------ theme tokens
  // Same [menu] surface tokens as the Omarchy menu, emojis and clipboard.
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property color selectedBorder: Color.menu.selectedBorder
  property var selectedBorderSpec: Border.surfaceSpec("menu", "selected-border", selectedBorder, 0)
  readonly property color accent: Color.accent
  readonly property color divider: Util.alpha(foreground, 0.14)
  readonly property int cornerRadius: Style.cornerRadius
  readonly property string fontFamily: Style.font.menuFamily
  readonly property int pad: Style.spacing.panelPadding
  readonly property int rowHeight: Math.max(Style.space(44), Style.font.title + Style.font.caption + Style.spacing.rowPaddingX * 2)
  readonly property int cardWidth: Math.min(Style.space(760), panel.width - Style.gapsOut * 4)
  readonly property int cardHeight: Math.min(Style.space(500), panel.height - Style.gapsOut * 4)

  // ------------------------------------------------------------ state
  property bool opened: false
  property string view: "root"           // root | clipboard | emoji | windows | files
  property string query: ""
  property int selectedIndex: 0
  property var rows: []                  // rows currently displayed (parallel to displayModel)
  property bool actionsOpen: false
  property int actionIndex: 0
  readonly property var selectedRow: rows.length > 0 && selectedIndex < rows.length ? rows[selectedIndex] : null
  readonly property var selectedActions: actionsFor(selectedRow)

  // ------------------------------------------------------------ data
  property var appRows: []
  property var menuRows: []
  property var cliRows: []
  property var windowRows: []
  property var snippetRows: []
  property var links: Sources.quicklinks("")
  property var zones: []
  property var rates: null
  property var history: ({})
  property var clipboard: []
  property var emojis: []
  property var fileRows: []
  property var whenOk: ({})
  property bool whenEvaluated: false
  property var clock: ({ zone: "", text: "" })
  property var windowIcons: ({})
  property string defaultAgent: ""
  property string defaultMenuRaw: ""
  property string userMenuRaw: ""

  readonly property var views: ({
    "root": { title: "Omarcast", glyph: "󰘳", placeholder: "Search apps, actions, or calculate…" },
    "clipboard": { title: "Clipboard History", glyph: "󰅌", placeholder: "Search clipboard…" },
    "emoji": { title: "Emoji", glyph: "󰞅", placeholder: "Search emoji…" },
    "windows": { title: "Switch Windows", glyph: "󱂬", placeholder: "Search open windows…" },
    "files": { title: "Search Files", glyph: "󰈞", placeholder: "Search files in ~…" }
  })

  readonly property var builtinCommands: [
    { id: "cmd:clipboard", kind: "command", title: "Clipboard History", subtitle: "Omarcast", glyph: "󰅌", keywords: ["clip", "paste", "copy history"], targetView: "clipboard" },
    { id: "cmd:emoji", kind: "command", title: "Search Emoji & Symbols", subtitle: "Omarcast", glyph: "󰞅", keywords: ["emoji", "emojis", "symbols", "smiley"], targetView: "emoji" },
    { id: "cmd:windows", kind: "command", title: "Switch Windows", subtitle: "Omarcast", glyph: "󱂬", keywords: ["windows", "switch", "focus", "alt tab"], targetView: "windows" },
    { id: "cmd:files", kind: "command", title: "Search Files", subtitle: "Omarcast", glyph: "󰈞", keywords: ["files", "find", "open file", "documents"], targetView: "files" },
    { id: "cmd:omarchy-menu", kind: "command", title: "Omarchy Menu", subtitle: "Omarchy", glyph: "", keywords: ["menu", "go"], command: "omarchy-menu summon root" },
    { id: "cmd:edit-quicklinks", kind: "command", title: "Edit Quicklinks", subtitle: "Omarcast", glyph: "󰌷", keywords: ["quicklink", "bookmarks", "settings"], editFile: "quicklinks.json" },
    { id: "cmd:edit-snippets", kind: "command", title: "Edit Snippets", subtitle: "Omarcast", glyph: "󰅍", keywords: ["snippet", "text", "settings"], editFile: "snippets.json" },
    { id: "cmd:reload", kind: "command", title: "Reload Omarcast", subtitle: "Omarcast", glyph: "󰑓", keywords: ["refresh", "reindex"], reload: true }
  ]

  // ------------------------------------------------------------ plugin lifecycle

  function open(payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (e) { payload = {} }
    root.view = views[payload.view] ? payload.view : "root"
    root.query = payload.query || ""
    input.text = root.query
    root.actionsOpen = false
    root.opened = true
    root.refreshApps()
    windowsProc.running = true
    root.maybeFetchRates()
    pointerGate.reset()
    if (root.view === "files") { root.fileRows = []; filesDebounce.restart() }
    root.rebuild()
    if (payload.actions) { root.actionsOpen = root.selectedActions.length > 0; root.actionIndex = 0 }
    Qt.callLater(function() { input.forceActiveFocus() })
  }

  function close() {
    root.opened = false
    root.actionsOpen = false
  }

  function dismiss() {
    root.opened = false
    root.actionsOpen = false
    if (root.shell && typeof root.shell.hide === "function") root.shell.hide(root.pluginId)
  }

  function toggle() { if (root.opened) root.dismiss(); else root.open("{}") }
  function refresh() { root.reloadAll(); return "ok" }
  function ping() { return "ok" }

  Component.onCompleted: {
    mkdirProc.running = true
    cliProc.running = true
    zonesProc.running = true
  }

  function reloadAll() {
    defaultMenuFile.reload()
    userMenuFile.reload()
    quicklinksFile.reload()
    snippetsFile.reload()
    cliProc.running = true
    root.refreshApps()
    root.maybeFetchRates(true)
  }

  // ------------------------------------------------------------ sources

  function refreshApps() {
    var entries = []
    if (root.appLibrary && typeof root.appLibrary.sortedEntries === "function") {
      entries = root.appLibrary.sortedEntries("")
      if (typeof root.appLibrary.refreshIcons === "function") root.appLibrary.refreshIcons()
    } else {
      entries = DesktopEntries.applications.values || []
    }
    var out = []
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      if (!e || !e.id || e.noDisplay) continue
      var kw = []
      try { if (e.keywords) for (var k = 0; k < e.keywords.length; k++) kw.push(String(e.keywords[k])) } catch (err) {}
      out.push(Search.prepare({
        id: "app:" + e.id,
        kind: "app",
        title: String(e.name || e.id),
        subtitle: String(e.genericName || e.comment || ""),
        keywords: kw.concat([String(e.comment || ""), String(e.id)]),
        icon: String(e.icon || ""),
        appId: String(e.id)
      }))
    }
    root.appRows = out
  }

  function applyMenu() {
    var rows = Sources.menuRows(root.defaultMenuRaw, root.userMenuRaw)
    for (var i = 0; i < rows.length; i++) Search.prepare(rows[i])
    root.menuRows = rows
    root.evaluateWhen()
    if (root.opened) root.rebuild(true)
  }

  // Batch-evaluate the menu's `when:` guards once, the same way the stock
  // menu hides Hibernate on machines without it.
  function evaluateWhen() {
    var lines = []
    for (var i = 0; i < root.menuRows.length; i++) {
      var r = root.menuRows[i]
      if (!r.when) continue
      lines.push("if ( " + r.when + " ) >/dev/null 2>&1; then printf '%s\\n' " + Util.shellQuote(r.id) + "; fi")
    }
    if (lines.length === 0) { root.whenEvaluated = true; return }
    whenProc.command = ["bash", "-c", lines.join("\n")]
    whenProc.running = true
  }

  function visibleMenuRow(r) {
    return !r.when || root.whenOk[r.id] === true
  }

  function windowIcon(cls) {
    if (!cls) return ""
    var cached = root.windowIcons[cls]
    if (cached !== undefined) return cached
    var icon = ""
    try {
      var entry = DesktopEntries.heuristicLookup(cls)
      if (entry && entry.icon) icon = String(entry.icon)
    } catch (e) {}
    var next = {}
    for (var k in root.windowIcons) next[k] = root.windowIcons[k]
    next[cls] = icon || cls
    root.windowIcons = next
    return next[cls]
  }

  function iconSource(icon) {
    if (!icon) return ""
    if (root.appLibrary && typeof root.appLibrary.iconSource === "function") return root.appLibrary.iconSource(icon)
    if (icon.charAt(0) === "/") return Util.fileUrl(icon)
    return Quickshell.iconPath(icon, true)
  }

  function maybeFetchRates(force) {
    var now = Date.now() / 1000
    if (!force && root.rates && root.rates.fetched && now - root.rates.fetched < 12 * 3600) return
    if (!ratesProc.running) ratesProc.running = true
  }

  function loadRates(raw) {
    try {
      var j = JSON.parse(raw)
      if (!j || !j.rates) return
      var date = String(j.time_last_update_utc || "").replace(/^\w+,\s*/, "").replace(/\s+\d\d:\d\d:\d\d.*$/, "")
      root.rates = {
        base: j.base_code || "USD",
        rates: j.rates,
        date: date,
        home: Quickshell.env("OMARCAST_CURRENCY") || "",
        fetched: j.time_last_update_unix || 0
      }
      if (root.opened && root.view === "root") root.rebuild(true)
    } catch (e) {}
  }

  // ------------------------------------------------------------ history

  function recordUse(id) {
    if (!id) return
    var next = {}
    for (var k in root.history) next[k] = root.history[k]
    var prev = next[id] || { count: 0, last: 0 }
    next[id] = { count: prev.count + 1, last: Date.now() }
    root.history = next
    historyFile.setText(JSON.stringify(next) + "\n")
  }

  // ------------------------------------------------------------ building rows

  function allSearchRows() {
    var out = root.builtinCommands.slice()
    for (var i = 0; i < root.menuRows.length; i++) if (root.visibleMenuRow(root.menuRows[i])) out.push(root.menuRows[i])
    return out.concat(root.appRows, root.windowRows, root.snippetRows, root.cliRows)
  }

  function sectioned(list, section) {
    for (var i = 0; i < list.length; i++) list[i]._section = section
    return list
  }

  function rootRows() {
    var q = root.query.trim()
    var out = []

    if (!q) {
      var all = root.allSearchRows()
      for (var p = 0; p < all.length; p++) if (!all[p]._title) Search.prepare(all[p])
      var recent = Search.rank(all, "", root.history, 8)
      out = out.concat(root.sectioned(recent, "Recent"))
      var cmds = root.builtinCommands.slice()
      for (var c = 0; c < cmds.length; c++) Search.prepare(cmds[c])
      out = out.concat(root.sectioned(cmds.filter(function(r) { return recent.indexOf(r) < 0 }), "Commands"))
      out = out.concat(root.sectioned(root.appRows.filter(function(r) { return recent.indexOf(r) < 0 }), "Applications"))
      return out
    }

    // Shell command: "> htop"
    if (q.charAt(0) === ">") {
      var cmd = q.slice(1).trim()
      if (!cmd) return [{ kind: "hint", title: "Type a shell command to run", subtitle: "e.g.  > btop", glyph: "", _section: "Shell" }]
      return [
        { id: "", kind: "shell", title: cmd, subtitle: "Run in terminal", glyph: "", command: cmd, terminal: true, _section: "Shell" },
        { id: "", kind: "shell", title: cmd, subtitle: "Run in background", glyph: "󰜎", command: cmd, terminal: false, _section: "Shell" }
      ]
    }

    var calc = Calc.evaluate(q, root.rates)
    if (calc) out.push({ id: "", kind: "calc", calc: calc, title: calc.result, _section: "Calculator" })

    var place = Sources.timePlace(q)
    if (place) {
      var zone = Sources.findZone(root.zones, place)
      if (zone) {
        if (root.clock.zone !== zone) root.fetchClock(zone)
        out.push({ id: "", kind: "clock", zone: zone, title: root.clock.zone === zone ? root.clock.text : "…", _section: "World Clock" })
      }
    }

    var ql = Sources.matchQuicklink(root.links, q)
    if (ql) {
      var qurl = Sources.fillUrl(ql.link.url, ql.query)
      out.push({ id: "quicklink:" + ql.link.keyword, kind: "quicklink", title: "Search " + ql.link.name + " for “" + ql.query + "”", subtitle: qurl, glyph: ql.link.glyph || "󰌷", url: qurl, _section: "Quicklink" })
    }

    var url = Sources.looksLikeUrl(q)
    if (url) out.push({ id: "", kind: "url", title: "Open " + url.replace(/^https?:\/\//, ""), subtitle: url, glyph: "󰖟", url: url, _section: "Quicklink" })

    // With a calculator/clock card, only keep strong text matches (no fuzzy noise).
    var ranked = Search.rank(root.allSearchRows(), q, root.history, 40, out.length > 0 ? 500 : 0)
    out = out.concat(root.sectioned(ranked, "Results"))

    // Typed text goes to the default Omarchy agent. It leads the list when the
    // query reads like a message (3+ words or a question) or nothing matched;
    // otherwise it heads the fallbacks, ahead of web search.
    var agent = root.agentRow(q)
    var sentence = q.split(/\s+/).length >= 3 || /\?$/.test(q)
    // An answer card (calculator, clock) always stays on top.
    var hasCard = out.length > 0 && (out[0].kind === "calc" || out[0].kind === "clock")
    if (agent && !hasCard && (sentence || ranked.length === 0)) {
      agent._section = "Ask"
      out = [agent].concat(out)
      agent = null
    }

    // Raycast-style fallbacks.
    var fallbacks = agent ? [agent] : []
    for (var i = 0, web = 0; i < root.links.length && web < 2; i++) {
      var l = root.links[i]
      if (l.keyword !== "g" && l.keyword !== "ddg") continue
      var furl = Sources.fillUrl(l.url, q)
      web++
      fallbacks.push({ id: "", kind: "url", title: "Search " + l.name + " for “" + q + "”", subtitle: l.keyword + " " + q, glyph: l.glyph, url: furl })
    }
    fallbacks.push({ id: "", kind: "shell", title: "Run “" + q + "” in terminal", subtitle: "> " + q, glyph: "", command: q, terminal: true })
    return out.concat(root.sectioned(fallbacks, "Use “" + q + "” with…"))
  }

  function agentInfo() {
    var name = root.defaultAgent || "agent"
    for (var i = 0; i < root.menuRows.length; i++) {
      var r = root.menuRows[i]
      if (r.id === "omarchy:setup.default.agent." + name) return { name: r.title, glyph: r.glyph, glyphFont: r.glyphFont }
    }
    return { name: name.charAt(0).toUpperCase() + name.slice(1), glyph: "󰚩", glyphFont: "" }
  }

  function agentRow(q) {
    if (!root.defaultAgent) return null
    var a = root.agentInfo()
    return { id: "", kind: "agent", title: "Ask " + a.name + ": “" + q + "”", subtitle: "omarchy agent prompt", glyph: a.glyph, glyphFont: a.glyphFont, prompt: q }
  }

  function clipboardRows() {
    var out = []
    for (var i = 0; i < root.clipboard.length && out.length < 100; i++) {
      var e = root.clipboard[i]
      if (!e) continue
      var isImage = e.type === "image"
      var text = isImage ? "Image" : String(e.text || "")
      if (root.query && !Search.matchesAll(isImage ? "image " + (e.mime || "") : text, root.query)) continue
      out.push({
        id: "", kind: "clip", historyIndex: i, isImage: isImage,
        title: isImage ? "Image" : text.replace(/\s+/g, " ").trim().slice(0, 200),
        subtitle: isImage ? String(e.mime || "") : (text.length + " chars"),
        glyph: isImage ? "󰋩" : "󰅍", text: text, path: e.path || "", mime: e.mime || "",
        _section: root.query ? "Results" : "Most recent"
      })
    }
    return out
  }

  function emojiRows() {
    var out = []
    var q = root.query.trim()
    for (var i = 0; i < root.emojis.length && out.length < 150; i++) {
      var e = root.emojis[i]
      if (q && !Search.matchesAll(e.k, q)) continue
      out.push({ id: "", kind: "emoji", title: root.emojiTitle(e.k), subtitle: "", emoji: e.e, glyph: e.e, _section: q ? "Results" : "All" })
    }
    return out
  }

  // "smiling_face_with_three_hearts smiling face with …" → "Smiling face with three hearts"
  function emojiTitle(k) {
    var seen = {}
    var words = String(k || "").replace(/_/g, " ").split(/\s+/).filter(function(w) {
      if (!w || seen[w]) return false
      seen[w] = true
      return true
    })
    var t = words.slice(0, 6).join(" ")
    return t.charAt(0).toUpperCase() + t.slice(1)
  }

  function windowViewRows() {
    var list = root.windowRows
    if (root.query.trim()) {
      for (var i = 0; i < list.length; i++) if (!list[i]._title) Search.prepare(list[i])
      list = Search.rank(list, root.query, {}, 50)
    }
    return root.sectioned(list.slice(), "Open Windows")
  }

  // soft: a background data refresh — keep the selected row and action panel.
  function rebuild(soft) {
    // Only preserve a selection the user moved to; otherwise re-rank picks the top row.
    var prev = soft && root.selectedIndex > 0 ? root.selectedRow : null
    var prevKey = prev ? (prev.id || prev.kind + ":" + prev.title) : ""
    var next
    if (root.view === "clipboard") next = root.clipboardRows()
    else if (root.view === "emoji") next = root.emojiRows()
    else if (root.view === "windows") next = root.windowViewRows()
    else if (root.view === "files") next = root.sectioned(root.fileRows.slice(), root.query ? "Files" : "")
    else next = root.rootRows()

    root.rows = next
    displayModel.clear()
    for (var i = 0; i < next.length; i++) displayModel.append({ ri: i, section: String(next[i]._section || "") })
    var keep = -1
    if (prevKey) for (var j = 0; j < next.length; j++) if ((next[j].id || next[j].kind + ":" + next[j].title) === prevKey) { keep = j; break }
    if (keep >= 0) {
      root.selectedIndex = keep
      Qt.callLater(function() { resultList.positionViewAtIndex(keep, ListView.Contain) })
      return
    }
    if (soft && root.selectedIndex === 0 && next.length > 0) return  // refresh, nothing moved
    root.selectedIndex = 0
    root.actionsOpen = false
    Qt.callLater(function() { if (resultList.count > 0) resultList.positionViewAtBeginning() })
  }

  function setQuery(q) {
    root.query = q
    if (root.view === "files") filesDebounce.restart()
    root.rebuild()
  }

  function pushView(name) {
    root.view = name
    root.query = ""
    input.text = ""
    if (name === "windows") windowsProc.running = true
    if (name === "files") root.fileRows = []
    root.rebuild()
  }

  function popView() {
    root.view = "root"
    root.query = ""
    input.text = ""
    root.rebuild()
  }

  function move(delta) {
    if (root.rows.length === 0) return
    var i = root.selectedIndex + delta
    // Skip non-actionable hint rows.
    if (i < 0) i = delta < -1 ? 0 : root.rows.length - 1
    else if (i >= root.rows.length) i = delta > 1 ? root.rows.length - 1 : 0
    root.selectedIndex = i
    resultList.positionViewAtIndex(i, ListView.Contain)
  }

  // ------------------------------------------------------------ actions

  function act(title, glyph, shortcut, fn) { return { title: title, glyph: glyph, shortcut: shortcut, run: fn } }

  function actionsFor(row) {
    if (!row) return []
    var k = row.kind
    if (k === "app") return [
      act("Open Application", "󰏌", "↵", function() { root.launchApp(row) }),
      act("Copy Name", "󰆏", "⌃↵", function() { root.copy(row.title) })
    ]
    if (k === "command") {
      if (row.targetView) return [act("Open " + row.title, "󰁔", "↵", function() { root.recordUse(row.id); root.pushView(row.targetView) })]
      if (row.editFile) return [act("Edit " + row.editFile, "󰏫", "↵", function() { root.recordUse(row.id); root.editConfig(row.editFile) })]
      if (row.reload) return [act("Reload", "󰑓", "↵", function() { root.reloadAll(); root.dismiss() })]
      return [act("Run", "󰐊", "↵", function() { root.recordUse(row.id); root.runDetached(row.command) })]
    }
    if (k === "omarchy") return [
      act("Run", "󰐊", "↵", function() { root.recordUse(row.id); root.runDetached(row.command) }),
      act("Copy Command", "󰆏", "⌃↵", function() { root.copy(row.command) }),
      act("Show in Omarchy Menu", "", "", function() { root.recordUse(row.id); root.runDetached("omarchy-menu summon " + Util.shellQuote(row.route.split(".").slice(0, -1).join(".") || "root")) })
    ]
    if (k === "omarchy-menu") return [
      act("Open in Omarchy Menu", "", "↵", function() { root.recordUse(row.id); root.runDetached("omarchy-menu summon " + Util.shellQuote(row.route)) })
    ]
    if (k === "omarchy-cli") return [
      act(row.args ? "Type Arguments…" : "Run in Terminal", "", "↵", function() {
        if (row.args) { root.setQueryText("> " + row.command + " ") }
        else { root.recordUse(row.id); root.runInTerminal(row.command) }
      }),
      act("Copy Command", "󰆏", "⌃↵", function() { root.copy(row.command) }),
      act("Show Help", "󰋖", "", function() { root.runInTerminal(row.command + " --help") })
    ]
    if (k === "window") return [
      act("Switch to Window", "", "↵", function() { root.focusWindow(row) }),
      act("Close Window", "󰅖", "⌃↵", function() { root.closeWindow(row) }),
      act("Copy Title", "󰆏", "", function() { root.copy(row.title) })
    ]
    if (k === "calc") return [
      act("Copy Answer", "󰆏", "↵", function() { root.copy(row.calc.copy) }),
      act("Paste Answer", "󰆒", "⌃↵", function() { root.paste(row.calc.copy) }),
      act("Copy Full Result", "󰆏", "", function() { root.copy(row.calc.input + " = " + row.calc.result) })
    ]
    if (k === "clock") return [
      act("Copy Time", "󰆏", "↵", function() { root.copy(row.title.split("|")[0]) })
    ]
    if (k === "quicklink" || k === "url") return [
      act("Open in Browser", "󰖟", "↵", function() { if (row.id) root.recordUse(row.id); root.openUrl(row.url) }),
      act("Copy URL", "󰆏", "⌃↵", function() { root.copy(row.url) })
    ]
    if (k === "agent") return [
      act("Send to " + root.agentInfo().name, "󰒊", "↵", function() { root.dismiss(); Quickshell.execDetached(["omarchy-agent-prompt", row.prompt]) }),
      act("Copy Message", "󰆏", "⌃↵", function() { root.copy(row.prompt) })
    ]
    if (k === "shell") return [
      act(row.terminal ? "Run in Terminal" : "Run in Background", "󰐊", "↵", function() { row.terminal ? root.runInTerminal(row.command) : root.runDetached(row.command) }),
      act("Copy Command", "󰆏", "⌃↵", function() { root.copy(row.command) })
    ]
    if (k === "clip") return [
      act("Paste", "󰆒", "↵", function() { root.pasteClip(row, false) }),
      act("Copy to Clipboard", "󰆏", "⌃↵", function() { root.pasteClip(row, true) }),
      act("Open", "󰏌", "", function() { root.dismiss(); Quickshell.execDetached([root.omarchyPath + "/bin/omarchy-clipboard-open", "--history-index", String(row.historyIndex)]) })
    ]
    if (k === "emoji") return [
      act("Paste Emoji", "󰆒", "↵", function() { root.paste(row.emoji) }),
      act("Copy Emoji", "󰆏", "⌃↵", function() { root.copy(row.emoji) })
    ]
    if (k === "snippet") return [
      act("Paste Snippet", "󰆒", "↵", function() { root.recordUse(row.id); root.paste(row.text) }),
      act("Copy Snippet", "󰆏", "⌃↵", function() { root.recordUse(row.id); root.copy(row.text) })
    ]
    if (k === "file") return [
      act("Open", "󰏌", "↵", function() { root.dismiss(); Quickshell.execDetached(["xdg-open", row.path]) }),
      act("Open Containing Folder", "", "⌃↵", function() { root.dismiss(); Quickshell.execDetached(["xdg-open", row.dir]) }),
      act("Copy Path", "󰆏", "", function() { root.copy(row.path) })
    ]
    return []
  }

  function runAction(index) {
    var list = root.selectedActions
    if (index < 0 || index >= list.length) return
    root.actionsOpen = false
    list[index].run()
  }

  function setQueryText(text) {
    input.text = text
    input.cursorPosition = text.length
  }

  function launchApp(row) {
    root.recordUse(row.id)
    root.dismiss()
    if (root.appLibrary && typeof root.appLibrary.launch === "function") root.appLibrary.launch(row.appId, row.title)
    else Util.execDetached("uwsm-app -- gtk-launch " + Util.shellQuote(row.appId + ".desktop"))
  }

  function runDetached(command) {
    root.dismiss()
    Util.execDetached(command)
  }

  function runInTerminal(command) {
    root.dismiss()
    Quickshell.execDetached(["omarchy-launch-floating-terminal-with-presentation", command])
  }

  function openUrl(url) {
    root.dismiss()
    Quickshell.execDetached(["xdg-open", url])
  }

  function copy(text) {
    root.dismiss()
    Quickshell.execDetached(["wl-copy", "--", String(text)])
    Quickshell.execDetached(["omarchy-osd", "-i", "copy", "-m", "Copied to clipboard", "-d", "1200"])
  }

  // Types text into whatever had focus before the palette opened.
  function paste(text) {
    root.dismiss()
    Quickshell.execDetached([root.omarchyPath + "/bin/omarchy-menu-emoji-insert", String(text)])
  }

  function pasteClip(row, copyOnly) {
    root.dismiss()
    var args = row.isImage
      ? [root.omarchyPath + "/bin/omarchy-clipboard-paste-file"].concat(copyOnly ? ["--copy-only"] : []).concat([row.mime, row.path])
      : [root.omarchyPath + "/bin/omarchy-clipboard-paste-text"].concat(copyOnly ? ["--copy-only"] : ["--shift-insert"]).concat(["--history-index", String(row.historyIndex)])
    Quickshell.execDetached(args)
  }

  function focusWindow(row) {
    root.recordUse(row.historyId)
    root.dismiss()
    Quickshell.execDetached(["hyprctl", "dispatch", "hl.dsp.focus({ window = \"address:" + row.address + "\" })"])
  }

  function closeWindow(row) {
    Quickshell.execDetached(["hyprctl", "dispatch", "hl.dsp.window.close({ window = \"address:" + row.address + "\" })"])
    root.windowRows = root.windowRows.filter(function(w) { return w.address !== row.address })
    root.rebuild()
  }

  function editConfig(name) {
    root.dismiss()
    var path = root.configDir + "/" + name
    var seed = name === "quicklinks.json"
      ? '[\n  // { "keyword": "gh", "name": "GitHub", "url": "https://github.com/search?q={query}" }\n]\n'
      : '[\n  // { "name": "Email", "keyword": "@@", "text": "me@example.com" },\n  // { "name": "Today", "text": "{date}" }\n]\n'
    Util.execDetached("mkdir -p " + Util.shellQuote(root.configDir) + " && { [ -f " + Util.shellQuote(path) + " ] || printf %s " + Util.shellQuote(seed) + " > " + Util.shellQuote(path) + "; } && omarchy-launch-config-editor " + Util.shellQuote(path))
  }

  function fetchClock(zone) {
    if (clockProc.running) return
    clockProc.zone = zone
    clockProc.command = ["bash", "-c", "TZ=\"$1\" date '+%H:%M|%A, %-d %B|%Z (UTC%:z)'", "_", zone]
    clockProc.running = true
  }

  // ------------------------------------------------------------ processes & files

  ListModel { id: displayModel }

  PointerMoveGate { id: pointerGate; referenceItem: card }

  Process { id: mkdirProc; command: ["mkdir", "-p", root.stateDir, root.cacheDir] }

  FileView {
    id: defaultMenuFile
    path: root.omarchyPath + "/default/omarchy/omarchy-menu.jsonc"
    watchChanges: true
    onFileChanged: reload()
    onLoaded: { root.defaultMenuRaw = text(); root.applyMenu() }
  }

  FileView {
    id: userMenuFile
    path: root.home + "/.config/omarchy/extensions/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: { root.userMenuRaw = text(); root.applyMenu() }
  }

  Process {
    id: whenProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var ok = {}
        var lines = text.split("\n")
        for (var i = 0; i < lines.length; i++) if (lines[i]) ok[lines[i]] = true
        root.whenOk = ok
        root.whenEvaluated = true
        if (root.opened) root.rebuild(true)
      }
    }
  }

  Process {
    id: cliProc
    command: ["omarchy", "commands", "--json"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var rows = Sources.cliRows(text)
        for (var i = 0; i < rows.length; i++) Search.prepare(rows[i])
        root.cliRows = rows
      }
    }
  }

  Process {
    id: windowsProc
    command: ["hyprctl", "clients", "-j"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var rows = Sources.windowRows(text)
        for (var i = 0; i < rows.length; i++) { rows[i].icon = root.windowIcon(rows[i].appClass); Search.prepare(rows[i]) }
        // The palette itself has focus; the focused window is the one we came from.
        root.windowRows = rows
        if (root.opened && (root.view === "windows" || root.query)) root.rebuild(true)
      }
    }
  }

  Process {
    id: zonesProc
    command: ["timedatectl", "list-timezones"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.zones = text.split("\n").filter(function(z) { return z.length > 0 })
    }
  }

  Process {
    id: clockProc
    property string zone: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.clock = { zone: clockProc.zone, text: text.trim() }
        if (root.opened && root.view === "root") root.rebuild(true)
      }
    }
  }

  FileView {
    path: root.home + "/.config/omarchy/defaults/agent"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.defaultAgent = text().trim()
    onLoadFailed: root.defaultAgent = ""
  }

  FileView {
    id: ratesFile
    path: root.cacheDir + "/rates.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.loadRates(text())
  }

  Process {
    id: ratesProc
    command: ["bash", "-c", "mkdir -p \"$1\" && curl -fsS --max-time 8 https://open.er-api.com/v6/latest/USD -o \"$1/rates.json.tmp\" && mv \"$1/rates.json.tmp\" \"$1/rates.json\"", "_", root.cacheDir]
    onExited: ratesFile.reload()
  }

  FileView {
    id: historyFile
    path: root.stateDir + "/history.json"
    printErrors: false
    onLoaded: { try { root.history = JSON.parse(text()) || {} } catch (e) { root.history = {} } }
  }

  FileView {
    id: quicklinksFile
    path: root.configDir + "/quicklinks.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.links = Sources.quicklinks(text())
  }

  FileView {
    id: snippetsFile
    path: root.configDir + "/snippets.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      var rows = Sources.snippetRows(text())
      for (var i = 0; i < rows.length; i++) Search.prepare(rows[i])
      root.snippetRows = rows
    }
  }

  FileView {
    path: root.home + "/.local/state/omarchy/clipboard-history.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try { root.clipboard = JSON.parse(text()) || [] } catch (e) { root.clipboard = [] }
      if (root.opened && root.view === "clipboard") root.rebuild(true)
    }
  }

  FileView {
    path: root.omarchyPath + "/shell/plugins/emojis/emojis.json"
    onLoaded: { try { root.emojis = JSON.parse(text()) || [] } catch (e) { root.emojis = [] } }
  }

  Timer {
    id: filesDebounce
    interval: 140
    onTriggered: {
      var q = root.query.trim()
      if (q.length < 2) { root.fileRows = []; root.rebuild(); return }
      filesProc.running = false
      filesProc.command = ["fd", "--fixed-strings", "--ignore-case", "--max-results", "80",
        "--exclude", ".git", "--exclude", "node_modules", "--exclude", ".cache", "--exclude", ".local/share/Trash",
        "--", q, root.home]
      filesProc.running = true
    }
  }

  Process {
    id: filesProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var lines = text.split("\n")
        var out = []
        for (var i = 0; i < lines.length; i++) {
          var p = lines[i]
          if (!p) continue
          var isDir = p.charAt(p.length - 1) === "/"
          var clean = isDir ? p.slice(0, -1) : p
          var name = clean.split("/").pop()
          var dir = clean.slice(0, clean.length - name.length - 1)
          out.push({
            id: "", kind: "file", title: name, path: clean, dir: isDir ? clean : dir, isDir: isDir,
            subtitle: dir.replace(root.home, "~"), glyph: isDir ? "" : root.fileGlyph(name)
          })
        }
        // Shorter paths first: closer to home is usually what you want.
        out.sort(function(a, b) { return a.path.split("/").length - b.path.split("/").length || a.title.length - b.title.length })
        root.fileRows = out
        if (root.opened && root.view === "files") root.rebuild()
      }
    }
  }

  function fileGlyph(name) {
    var ext = (name.split(".").pop() || "").toLowerCase()
    if (/^(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(ext)) return "󰋩"
    if (/^(mp4|mkv|webm|mov|avi)$/.test(ext)) return "󰕧"
    if (/^(mp3|flac|wav|ogg|m4a)$/.test(ext)) return "󰎈"
    if (ext === "pdf") return "󰈦"
    if (/^(md|txt|rst|org)$/.test(ext)) return "󰈙"
    if (/^(zip|tar|gz|xz|zst|7z|rar)$/.test(ext)) return "󰗄"
    if (/^(js|mjs|ts|tsx|jsx|py|rb|go|rs|c|h|cpp|lua|sh|qml|json|toml|ya?ml)$/.test(ext)) return "󰈮"
    return "󰈔"
  }

  function isImagePath(p) { return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(String(p || "")) }

  // ------------------------------------------------------------ window

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarcast"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle { anchors.fill: parent; color: root.scrim }
    MouseArea { anchors.fill: parent; onClicked: root.dismiss() }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      radius: root.cornerRadius
      anchors.horizontalCenter: parent.horizontalCenter
      // Fixed top line (Raycast-like): the card never jumps while typing.
      y: Math.round((panel.height - root.cardHeight) * 0.38)
      color: root.background
      borderSpec: root.borderSpec
      padding: 0

      MouseArea { anchors.fill: parent; onClicked: input.forceActiveFocus() }

      Item {
        id: content
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset

        // ---------------- search header
        Item {
          id: header
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: parent.top
          height: Math.max(Style.space(56), Style.font.heading * 3)

          Rectangle {
            id: viewChip
            visible: root.view !== "root"
            anchors.left: parent.left
            anchors.leftMargin: root.pad
            anchors.verticalCenter: parent.verticalCenter
            height: chipText.implicitHeight + Style.spacing.sm * 2
            width: chipText.implicitWidth + Style.spacing.lg * 2
            radius: root.cornerRadius
            color: root.selectedBackground

            Text {
              id: chipText
              anchors.centerIn: parent
              textFormat: Text.PlainText
              text: "‹  " + root.views[root.view].title
              color: root.selectedText
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }
            MouseArea { anchors.fill: parent; onClicked: root.popView() }
          }

          TextInput {
            id: input
            anchors.left: viewChip.visible ? viewChip.right : parent.left
            anchors.leftMargin: viewChip.visible ? Style.spacing.xl : root.pad
            anchors.right: parent.right
            anchors.rightMargin: root.pad
            anchors.verticalCenter: parent.verticalCenter
            focus: true
            clip: true
            color: root.foreground
            selectionColor: Util.alpha(root.accent, 0.35)
            selectedTextColor: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading + Style.space(2)
            cursorDelegate: Rectangle { width: Style.space(2); color: root.selectedText; visible: input.cursorVisible }
            onTextChanged: if (text !== root.query) root.setQuery(text)

            Text {
              anchors.fill: parent
              verticalAlignment: Text.AlignVCenter
              textFormat: Text.PlainText
              visible: input.text.length === 0
              text: root.views[root.view].placeholder
              color: root.foreground
              opacity: 0.45
              font: input.font
              elide: Text.ElideRight
            }

            Keys.priority: Keys.BeforeItem
            Keys.onPressed: function(event) {
              var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
              var key = event.key
              if (key === Qt.Key_Escape) {
                if (root.actionsOpen) root.actionsOpen = false
                else if (input.text) input.text = ""
                else if (root.view !== "root") root.popView()
                else root.dismiss()
              } else if (ctrl && key === Qt.Key_K) {
                root.actionsOpen = !root.actionsOpen && root.selectedActions.length > 0
                root.actionIndex = 0
              } else if (key === Qt.Key_Backspace && !input.text && root.view !== "root") {
                root.popView()
              } else if (key === Qt.Key_Down || (ctrl && (key === Qt.Key_N || key === Qt.Key_J))) {
                if (root.actionsOpen) root.actionIndex = Math.min(root.selectedActions.length - 1, root.actionIndex + 1)
                else root.move(1)
              } else if (key === Qt.Key_Up || (ctrl && (key === Qt.Key_P))) {
                if (root.actionsOpen) root.actionIndex = Math.max(0, root.actionIndex - 1)
                else root.move(-1)
              } else if (key === Qt.Key_PageDown) {
                root.move(8)
              } else if (key === Qt.Key_PageUp) {
                root.move(-8)
              } else if (key === Qt.Key_Return || key === Qt.Key_Enter) {
                if (root.actionsOpen) root.runAction(root.actionIndex)
                else root.runAction(ctrl ? 1 : 0)
              } else if (key === Qt.Key_Tab && root.selectedRow && root.selectedRow.kind === "command" && root.selectedRow.targetView) {
                root.pushView(root.selectedRow.targetView)
              } else {
                return
              }
              event.accepted = true
            }
          }
        }

        Rectangle { id: headerRule; anchors.top: header.bottom; anchors.left: parent.left; anchors.right: parent.right; height: Style.spacing.hairline; color: root.divider }

        // ---------------- body
        Item {
          id: body
          anchors.top: headerRule.bottom
          anchors.bottom: footerRule.top
          anchors.left: parent.left
          anchors.right: parent.right

          readonly property bool showDetail: (root.view === "clipboard" || root.view === "files") && root.selectedRow !== null

          ListView {
            id: resultList
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            anchors.topMargin: Style.spacing.md
            anchors.bottomMargin: Style.spacing.md
            anchors.leftMargin: Style.spacing.lg
            width: body.showDetail ? Math.round(parent.width * 0.48) : parent.width - Style.spacing.lg * 2
            model: displayModel
            clip: true
            spacing: Style.spacing.xxs
            boundsBehavior: Flickable.StopAtBounds
            highlightMoveDuration: 0

            section.property: "section"
            section.criteria: ViewSection.FullString
            section.delegate: Item {
              required property string section
              width: ListView.view.width
              height: section ? Style.space(28) : 0
              visible: section.length > 0
              Text {
                anchors.left: parent.left
                anchors.leftMargin: Style.spacing.lg
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Style.spacing.sm
                textFormat: Text.PlainText
                text: parent.section
                color: root.foreground
                opacity: 0.45
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.weight: Font.Medium
              }
            }

            delegate: BorderSurface {
              id: rowItem
              required property int index
              required property int ri
              readonly property var row: root.rows[ri] || ({})
              readonly property bool hasCursor: index === root.selectedIndex
              readonly property bool isCard: row.kind === "calc" || row.kind === "clock"
              readonly property string imageSource: row.kind === "app" || row.kind === "window" ? root.iconSource(row.icon) : ""

              width: ListView.view.width
              height: isCard ? Style.space(104) : root.rowHeight
              radius: root.cornerRadius
              color: hasCursor ? root.selectedBackground : "transparent"
              borderSpec: hasCursor ? root.selectedBorderSpec : Border.none()

              // ---- standard row
              Item {
                anchors.fill: parent
                visible: !rowItem.isCard

                Item {
                  id: iconSlot
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.lg
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(28)
                  height: Style.space(28)

                  Image {
                    anchors.centerIn: parent
                    width: Style.font.iconLarge + Style.space(4)
                    height: width
                    visible: rowItem.imageSource !== ""
                    source: rowItem.imageSource
                    sourceSize.width: width * Screen.devicePixelRatio
                    sourceSize.height: height * Screen.devicePixelRatio
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                  }

                  Text {
                    anchors.centerIn: parent
                    visible: rowItem.imageSource === ""
                    textFormat: Text.PlainText
                    text: rowItem.row.glyph || ""
                    color: rowItem.hasCursor ? root.selectedText : root.foreground
                    font.family: rowItem.row.glyphFont || root.fontFamily
                    font.pixelSize: rowItem.row.kind === "emoji" ? Style.font.display : Style.font.iconLarge
                  }
                }

                Text {
                  id: titleText
                  anchors.left: iconSlot.right
                  anchors.leftMargin: Style.spacing.lg
                  anchors.verticalCenter: parent.verticalCenter
                  width: Math.min(implicitWidth, parent.width * (body.showDetail ? 0.7 : 0.55))
                  textFormat: Text.PlainText
                  text: rowItem.row.title || ""
                  color: rowItem.hasCursor ? root.selectedText : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.title
                  font.weight: Font.Medium
                  elide: Text.ElideRight
                  maximumLineCount: 1
                }

                Text {
                  anchors.left: titleText.right
                  anchors.leftMargin: Style.spacing.lg
                  anchors.right: accessory.left
                  anchors.rightMargin: Style.spacing.lg
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: rowItem.row.subtitle || ""
                  color: root.foreground
                  opacity: 0.5
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  elide: Text.ElideRight
                  maximumLineCount: 1
                }

                Text {
                  id: accessory
                  anchors.right: parent.right
                  anchors.rightMargin: Style.spacing.xl
                  anchors.verticalCenter: parent.verticalCenter
                  visible: !body.showDetail
                  textFormat: Text.PlainText
                  text: root.kindLabel(rowItem.row)
                  color: root.foreground
                  opacity: 0.4
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }

              // ---- calculator / clock card
              Item {
                anchors.fill: parent
                anchors.margins: Style.spacing.lg
                visible: rowItem.isCard

                readonly property var calc: rowItem.row.calc || null
                readonly property var clockParts: rowItem.row.kind === "clock" ? String(rowItem.row.title || "").split("|") : []

                Column {
                  anchors.left: parent.left
                  anchors.right: arrow.left
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.spacing.sm
                  Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.PlainText
                    text: parent.parent.calc ? parent.parent.calc.input : (rowItem.row.zone || "").replace(/_/g, " ").split("/").pop()
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.display
                    elide: Text.ElideMiddle
                  }
                  Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.PlainText
                    text: parent.parent.calc ? parent.parent.calc.inputLabel : (rowItem.row.zone || "")
                    color: root.foreground
                    opacity: 0.5
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                }

                Text {
                  id: arrow
                  anchors.centerIn: parent
                  textFormat: Text.PlainText
                  text: "→"
                  color: root.foreground
                  opacity: 0.35
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.display
                }

                Column {
                  anchors.left: arrow.right
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.spacing.sm
                  Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.PlainText
                    text: parent.parent.calc ? parent.parent.calc.result : (parent.parent.clockParts[0] || "…")
                    color: rowItem.hasCursor ? root.selectedText : root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.display
                    font.weight: Font.DemiBold
                    elide: Text.ElideMiddle
                  }
                  Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.PlainText
                    text: parent.parent.calc ? parent.parent.calc.resultLabel : [parent.parent.clockParts[1], parent.parent.clockParts[2]].filter(function(s) { return !!s }).join("  ·  ")
                    color: root.foreground
                    opacity: 0.5
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                  }
                }
              }

              MouseArea {
                id: mouseArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onPositionChanged: function(mouse) {
                  if (pointerGate.moved(rowItem, mouse)) root.selectedIndex = rowItem.index
                }
                onClicked: {
                  root.selectedIndex = rowItem.index
                  root.runAction(0)
                }
              }
            }
          }

          // ---------------- empty state
          Column {
            anchors.centerIn: resultList
            spacing: Style.space(8)
            visible: displayModel.count === 0

            Text {
              width: Style.space(360)
              horizontalAlignment: Text.AlignHCenter
              text: root.view === "files" ? "󰈞" : "󰈉"
              color: root.selectedText
              opacity: 0.8
              font.family: root.fontFamily
              font.pixelSize: Style.font.displayLarge
            }
            Text {
              width: Style.space(360)
              horizontalAlignment: Text.AlignHCenter
              textFormat: Text.PlainText
              text: root.view === "files" && root.query.trim().length < 2 ? "Type at least two characters"
                : root.query ? "No results for “" + root.query + "”" : "Nothing here yet"
              color: root.foreground
              opacity: 0.7
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
            }
          }

          // ---------------- detail pane (clipboard / files)
          Rectangle {
            visible: body.showDetail
            anchors.left: resultList.right
            anchors.leftMargin: Style.spacing.lg
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: Style.spacing.hairline
            color: root.divider
          }

          Item {
            id: detail
            visible: body.showDetail
            anchors.left: resultList.right
            anchors.leftMargin: Style.spacing.lg * 2
            anchors.right: parent.right
            anchors.rightMargin: root.pad
            anchors.top: parent.top
            anchors.topMargin: root.pad
            anchors.bottom: parent.bottom
            anchors.bottomMargin: root.pad

            readonly property var r: root.selectedRow || ({})
            readonly property string imagePath: r.kind === "clip" && r.isImage ? r.path : (r.kind === "file" && root.isImagePath(r.path) ? r.path : "")

            Image {
              anchors.top: parent.top
              anchors.left: parent.left
              anchors.right: parent.right
              height: parent.height * 0.72
              visible: detail.imagePath !== ""
              source: detail.imagePath ? Util.fileUrl(detail.imagePath) : ""
              fillMode: Image.PreserveAspectFit
              asynchronous: true
              sourceSize.width: width * Screen.devicePixelRatio
            }

            Flickable {
              anchors.top: parent.top
              anchors.left: parent.left
              anchors.right: parent.right
              height: parent.height * 0.72
              visible: detail.imagePath === "" && detail.r.kind === "clip"
              contentHeight: clipText.implicitHeight
              clip: true
              Text {
                id: clipText
                width: parent.width
                textFormat: Text.PlainText
                text: detail.r.text || ""
                wrapMode: Text.WrapAnywhere
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }
            }

            Text {
              anchors.centerIn: parent
              anchors.verticalCenterOffset: -parent.height * 0.14
              visible: detail.imagePath === "" && detail.r.kind === "file"
              text: detail.r.glyph || ""
              color: root.selectedText
              font.family: root.fontFamily
              font.pixelSize: Style.font.displayLarge * 2
            }

            Column {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.bottom: parent.bottom
              spacing: Style.spacing.sm
              Rectangle { width: parent.width; height: Style.spacing.hairline; color: root.divider }
              Repeater {
                model: root.detailFields(detail.r)
                delegate: Item {
                  required property var modelData
                  width: parent.width
                  height: Style.font.body + Style.spacing.md
                  Text {
                    anchors.left: parent.left
                    textFormat: Text.PlainText
                    text: modelData[0]
                    color: root.foreground
                    opacity: 0.5
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }
                  Text {
                    anchors.right: parent.right
                    width: parent.width * 0.7
                    horizontalAlignment: Text.AlignRight
                    textFormat: Text.PlainText
                    text: modelData[1]
                    color: root.foreground
                    elide: Text.ElideLeft
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }
                }
              }
            }
          }
        }

        Rectangle { id: footerRule; anchors.bottom: footer.top; anchors.left: parent.left; anchors.right: parent.right; height: Style.spacing.hairline; color: root.divider }

        // ---------------- footer / action bar
        Item {
          id: footer
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          height: Math.max(Style.space(36), Style.font.body * 3)

          Row {
            anchors.left: parent.left
            anchors.leftMargin: root.pad
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.spacing.md
            Text {
              textFormat: Text.PlainText
              text: root.views[root.view].glyph
              color: root.selectedText
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }
            Text {
              textFormat: Text.PlainText
              text: root.views[root.view].title
              color: root.foreground
              opacity: 0.6
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
          }

          Row {
            anchors.right: parent.right
            anchors.rightMargin: root.pad
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.spacing.xxl

            Text {
              visible: root.selectedActions.length > 0
              textFormat: Text.PlainText
              text: root.selectedActions.length > 0 ? root.selectedActions[0].title + "  ↵" : ""
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.weight: Font.Medium
            }
            Rectangle { width: Style.spacing.hairline; height: Style.font.body; color: root.divider; visible: root.selectedActions.length > 1 }
            Text {
              visible: root.selectedActions.length > 1
              textFormat: Text.PlainText
              text: "Actions  ⌃K"
              color: root.foreground
              opacity: 0.6
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
          }
        }

        // ---------------- action panel (Ctrl+K)
        BorderSurface {
          id: actionPanel
          visible: root.actionsOpen
          z: 10
          anchors.right: parent.right
          anchors.rightMargin: Style.spacing.lg
          anchors.bottom: footer.top
          anchors.bottomMargin: Style.spacing.lg
          width: Style.space(300)
          height: actionColumn.implicitHeight + Style.spacing.lg * 2
          radius: root.cornerRadius
          color: root.background
          borderSpec: root.borderSpec
          padding: 0

          Column {
            id: actionColumn
            anchors.fill: parent
            anchors.margins: Style.spacing.lg
            spacing: Style.spacing.xxs

            Text {
              textFormat: Text.PlainText
              text: root.selectedRow ? String(root.selectedRow.title || "").slice(0, 40) : ""
              color: root.foreground
              opacity: 0.45
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              bottomPadding: Style.spacing.sm
              leftPadding: Style.spacing.md
            }

            Repeater {
              model: root.actionsOpen ? root.selectedActions : []
              delegate: BorderSurface {
                required property var modelData
                required property int index
                readonly property bool hasCursor: index === root.actionIndex
                width: actionColumn.width
                height: Style.space(34)
                radius: root.cornerRadius
                color: hasCursor ? root.selectedBackground : "transparent"
                borderSpec: hasCursor ? root.selectedBorderSpec : Border.none()

                Text {
                  id: actionGlyph
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.md
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(20)
                  textFormat: Text.PlainText
                  text: modelData.glyph
                  color: hasCursor ? root.selectedText : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }
                Text {
                  anchors.left: actionGlyph.right
                  anchors.leftMargin: Style.spacing.md
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: modelData.title
                  color: hasCursor ? root.selectedText : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }
                Text {
                  anchors.right: parent.right
                  anchors.rightMargin: Style.spacing.md
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: modelData.shortcut
                  color: root.foreground
                  opacity: 0.45
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true
                  onEntered: root.actionIndex = index
                  onClicked: root.runAction(index)
                }
              }
            }
          }
        }
      }
    }
  }

  function kindLabel(row) {
    if (!row) return ""
    var k = row.kind
    if (k === "app") return "Application"
    if (k === "command") return "Command"
    if (k === "omarchy") return "Omarchy"
    if (k === "omarchy-menu") return "Menu"
    if (k === "omarchy-cli") return "CLI"
    if (k === "window") return row.focused ? "Current" : "Window"
    if (k === "quicklink") return "Quicklink"
    if (k === "url") return "Web"
    if (k === "snippet") return "Snippet"
    if (k === "shell") return "Shell"
    if (k === "agent") return "Agent"
    if (k === "file") return row.isDir ? "Folder" : "File"
    return ""
  }

  function detailFields(r) {
    if (!r) return []
    if (r.kind === "clip") {
      var e = root.clipboard[r.historyIndex] || {}
      var when = e.capturedAt ? new Date(e.capturedAt).toLocaleString(Qt.locale(), Locale.ShortFormat) : ""
      return r.isImage
        ? [["Type", r.mime || "image"], ["Copied", when]].filter(function(f) { return f[1] })
        : [["Type", "Text"], ["Characters", String(r.text.length)], ["Words", String(r.text.split(/\s+/).filter(function(w) { return w }).length)], ["Copied", when]].filter(function(f) { return f[1] })
    }
    if (r.kind === "file") return [["Name", r.title], ["Where", r.subtitle], ["Kind", r.isDir ? "Folder" : ((r.title.indexOf(".") > 0 ? r.title.split(".").pop().toUpperCase() + " " : "") + "File")]]
    return []
  }
}
