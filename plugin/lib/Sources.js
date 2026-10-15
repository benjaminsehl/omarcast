.pragma library

// Pure helpers that turn raw data (JSONC menus, hyprctl JSON, zone lists,
// user config) into Omarcast rows. Kept free of QML so node can test them.

// ---------------------------------------------------------------- Omarchy menu

function stripJsonc(raw) {
  return String(raw || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*(\n|$)/gm, "")
    .replace(/,(\s*[}\]])/g, "$1")
}

function parseJsonc(raw, fallback) {
  try {
    var v = JSON.parse(stripJsonc(raw))
    return v === null || v === undefined ? fallback : v
  } catch (e) {
    return fallback
  }
}

function asArray(v) { return Array.isArray(v) ? v : (v ? [v] : []) }

// Merge default + user JSONC menus and emit one row per item. Actions run
// their command; submenus / providers open the Omarchy menu at that route, so
// every picker the stock menu has (themes, fonts, …) stays one Enter away.
function menuRows(defaultRaw, userRaw) {
  var merged = {}
  var order = []
  var sources = [parseJsonc(defaultRaw, {}), parseJsonc(userRaw, {})]
  for (var s = 0; s < sources.length; s++) {
    var src = sources[s] && sources[s].items ? sources[s].items : sources[s]
    for (var id in src) {
      var item = src[id]
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      if (!merged[id]) { merged[id] = {}; order.push(id) }
      for (var k in item) merged[id][k] = item[k]
    }
  }

  function label(id) { return (merged[id] && merged[id].label) || id }
  function path(id) {
    var parts = id.split(".")
    var out = []
    for (var i = 1; i < parts.length; i++) out.push(label(parts.slice(0, i).join(".")))
    return out.join(" › ")
  }

  var rows = []
  for (var i = 0; i < order.length; i++) {
    var key = order[i]
    var it = merged[key]
    if (key === "root" || key === "apps" || key.indexOf("apps.") === 0) continue
    var isAction = !!it.action
    var crumbs = path(key)
    rows.push({
      id: "omarchy:" + key,
      kind: isAction ? "omarchy" : "omarchy-menu",
      title: it.label || key,
      subtitle: (crumbs ? crumbs : "Omarchy") + (isAction ? "" : " ›"),
      glyph: it.icon || "",
      glyphFont: it.iconFont || "",
      keywords: [key.replace(/\./g, " "), it.title || "", it.description || ""].concat(asArray(it.aliases)),
      command: isAction ? it.action : "",
      route: key,
      when: it.when || ""
    })
  }
  return rows
}

// ---------------------------------------------------------------- omarchy CLI

function cliRows(raw) {
  var parsed = parseJsonc(raw, {})
  var list = (parsed && parsed.commands) || []
  var rows = []
  for (var i = 0; i < list.length; i++) {
    var c = list[i]
    if (!c || c.hidden || !c.route) continue
    rows.push({
      id: "cli:" + c.route,
      kind: "omarchy-cli",
      title: c.route,
      subtitle: c.summary || "",
      glyph: "",
      keywords: [c.group || "", c.name || ""].concat(asArray(c.aliases)),
      command: c.route,
      args: c.args || ""
    })
  }
  return rows
}

// ---------------------------------------------------------------- windows

function windowRows(raw) {
  var list = parseJsonc(raw, [])
  if (!Array.isArray(list)) return []
  list.sort(function(a, b) { return (a.focusHistoryID || 0) - (b.focusHistoryID || 0) })
  var rows = []
  for (var i = 0; i < list.length; i++) {
    var w = list[i]
    if (!w || !w.address || w.mapped === false) continue
    var cls = w["class"] || w.initialClass || ""
    var ws = w.workspace && w.workspace.name ? w.workspace.name : ""
    rows.push({
      id: "window:" + w.address,
      historyId: "window-class:" + cls,
      kind: "window",
      title: w.title || cls || "Window",
      subtitle: (cls ? cls : "") + (ws ? "  ·  workspace " + ws.replace(/^special:/, "special ") : ""),
      appClass: cls,
      address: w.address,
      focused: w.focusHistoryID === 0,
      keywords: [cls, w.initialTitle || ""]
    })
  }
  return rows
}

// ---------------------------------------------------------------- quicklinks

var DEFAULT_QUICKLINKS = [
  { keyword: "g", name: "Google", url: "https://www.google.com/search?q={query}", glyph: "" },
  { keyword: "ddg", name: "DuckDuckGo", url: "https://duckduckgo.com/?q={query}", glyph: "󰇥" },
  { keyword: "yt", name: "YouTube", url: "https://www.youtube.com/results?search_query={query}", glyph: "" },
  { keyword: "gh", name: "GitHub", url: "https://github.com/search?q={query}", glyph: "" },
  { keyword: "aur", name: "AUR", url: "https://aur.archlinux.org/packages?K={query}", glyph: "󰣇" },
  { keyword: "pkg", name: "Arch Packages", url: "https://archlinux.org/packages/?q={query}", glyph: "󰣇" },
  { keyword: "aw", name: "Arch Wiki", url: "https://wiki.archlinux.org/index.php?search={query}", glyph: "󰣇" },
  { keyword: "wiki", name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search={query}", glyph: "" },
  { keyword: "maps", name: "Google Maps", url: "https://www.google.com/maps/search/{query}", glyph: "󰍎" },
  { keyword: "npm", name: "npm", url: "https://www.npmjs.com/search?q={query}", glyph: "" },
  { keyword: "hypr", name: "Hyprland Wiki", url: "https://wiki.hypr.land/?q={query}", glyph: "" }
]

function quicklinks(userRaw) {
  var user = parseJsonc(userRaw, null)
  var list = DEFAULT_QUICKLINKS.slice()
  if (Array.isArray(user)) {
    for (var i = 0; i < user.length; i++) {
      var q = user[i]
      if (!q || !q.url) continue
      list = list.filter(function(x) { return x.keyword !== q.keyword })
      list.push({ keyword: q.keyword || "", name: q.name || q.url, url: q.url, glyph: q.icon || "󰌷" })
    }
  }
  return list
}

function fillUrl(template, query) {
  return String(template).replace(/\{query\}/g, encodeURIComponent(query))
}

// "gh omarchy" → { link, query: "omarchy" }
function matchQuicklink(links, query) {
  var m = String(query || "").match(/^(\S+)\s+(.+)$/)
  if (!m) return null
  var kw = m[1].toLowerCase()
  for (var i = 0; i < links.length; i++) if (links[i].keyword && links[i].keyword.toLowerCase() === kw) return { link: links[i], query: m[2] }
  return null
}

function looksLikeUrl(q) {
  var s = String(q || "").trim()
  if (/\s/.test(s)) return ""
  if (/^https?:\/\/\S+$/i.test(s)) return s
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(s) && /\.[a-z]{2,}(?::|\/|$)/i.test(s)) return "https://" + s
  return ""
}

// ---------------------------------------------------------------- time zones

var ZONE_ALIASES = {
  "sf": "America/Los_Angeles", "san francisco": "America/Los_Angeles", "la": "America/Los_Angeles",
  "seattle": "America/Los_Angeles", "pst": "America/Los_Angeles", "pacific": "America/Los_Angeles",
  "nyc": "America/New_York", "ny": "America/New_York", "boston": "America/New_York", "est": "America/New_York", "eastern": "America/New_York",
  "austin": "America/Chicago", "dallas": "America/Chicago", "cst": "America/Chicago",
  "denver": "America/Denver", "mst": "America/Denver",
  "uk": "Europe/London", "england": "Europe/London", "gmt": "Etc/GMT", "utc": "Etc/UTC",
  "germany": "Europe/Berlin", "france": "Europe/Paris", "spain": "Europe/Madrid", "italy": "Europe/Rome",
  "netherlands": "Europe/Amsterdam", "japan": "Asia/Tokyo", "china": "Asia/Shanghai", "beijing": "Asia/Shanghai",
  "india": "Asia/Kolkata", "mumbai": "Asia/Kolkata", "delhi": "Asia/Kolkata", "bangalore": "Asia/Kolkata",
  "korea": "Asia/Seoul", "australia": "Australia/Sydney", "canada": "America/Toronto", "brazil": "America/Sao_Paulo",
  "denmark": "Europe/Copenhagen", "sweden": "Europe/Stockholm", "norway": "Europe/Oslo", "dubai": "Asia/Dubai",
  "singapore": "Asia/Singapore", "hong kong": "Asia/Hong_Kong", "mexico": "America/Mexico_City"
}

// "time in tokyo", "tokyo time", "now in berlin" → place string, else ""
function timePlace(query) {
  var q = String(query || "").trim().toLowerCase()
  var m = q.match(/^(?:time|now|clock)\s+(?:in|at)\s+(.+)$/) || q.match(/^(.+?)\s+time$/) || q.match(/^time\s+(.+)$/)
  return m ? m[1].trim() : ""
}

function findZone(zones, place) {
  var p = String(place || "").toLowerCase().trim()
  if (!p) return ""
  if (ZONE_ALIASES[p]) return ZONE_ALIASES[p]
  var slug = p.replace(/\s+/g, "_")
  var prefix = ""
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i]
    var city = z.split("/").pop().toLowerCase()
    if (city === slug || z.toLowerCase() === slug) return z
    if (!prefix && city.indexOf(slug) === 0) prefix = z
  }
  return prefix
}

// ---------------------------------------------------------------- snippets

function snippetRows(raw) {
  var list = parseJsonc(raw, [])
  if (!Array.isArray(list)) return []
  var rows = []
  for (var i = 0; i < list.length; i++) {
    var s = list[i]
    if (!s || !s.text) continue
    rows.push({
      id: "snippet:" + (s.name || i),
      kind: "snippet",
      title: s.name || s.text.slice(0, 40),
      subtitle: (s.keyword ? s.keyword + "  ·  " : "") + s.text.replace(/\s+/g, " ").slice(0, 80),
      glyph: "󰅍",
      keywords: [s.keyword || ""],
      text: expandSnippet(s.text)
    })
  }
  return rows
}

function pad(n) { return n < 10 ? "0" + n : String(n) }

// {date} {time} {datetime} {clipboard} placeholders (clipboard filled by caller).
function expandSnippet(text) {
  var d = new Date()
  var date = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
  var time = pad(d.getHours()) + ":" + pad(d.getMinutes())
  return String(text).replace(/\{date\}/g, date).replace(/\{time\}/g, time).replace(/\{datetime\}/g, date + " " + time)
}
