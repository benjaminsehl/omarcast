.pragma library

// Rank titles and full menu breadcrumbs by tobi/try's fuzzy score, without
// categorical prefix/initialism tiers overriding boundary/distance quality.
// Kind and usage break ties only. Metadata is discounted and never concatenated.
// Core: tobi/try lib/fuzzy.rb (be566829), MIT; see TRY-LICENSE.
var KIND_WEIGHT = {
  "command": 1.25, "app": 1.2, "omarchy": 1.0, "omarchy-menu": 0.95,
  "window": 0.9, "quicklink": 1.0, "snippet": 0.9, "omarchy-cli": 0.7,
  "keybinding": 1.0
}

var KIND_LABEL = {
  "app": "Application", "command": "Command", "omarchy": "Omarchy",
  "omarchy-menu": "Menu", "omarchy-cli": "CLI", "keybinding": "Shortcut",
  "window": "Window", "quicklink": "Quicklink", "snippet": "Snippet",
  "url": "Web", "shell": "Shell", "agent": "Agent", "file": "File", "clip": "Clipboard"
}

function kindLabel(row) {
  return row && row.kind === "file" && row.isDir ? "Folder" : KIND_LABEL[row && row.kind] || ""
}

function parseQuery(value) {
  var raw = String(value || "").trim()
  var slash = raw.indexOf("/")
  if (slash > 0) {
    var scope = raw.slice(0, slash).trim().toLowerCase()
    if (/^[a-z]+$/.test(scope)) {
      var labels = Object.keys(KIND_LABEL).map(function(k) { return KIND_LABEL[k].toLowerCase() }).concat(["folder"])
      if (labels.some(function(label) { return label.indexOf(scope) === 0 })) {
        return { scoped: true, scope: scope, text: normalize(raw.slice(slash + 1)) }
      }
    }
  }
  return { scoped: false, scope: "", text: normalize(raw) }
}

function scopeMatches(row, scope) {
  return kindLabel(row).toLowerCase().indexOf(scope) === 0
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function prepare(row) {
  row._title = normalize(row.title)
  row._path = normalize(row.path)
  // Do not join metadata into one haystack: a match must fit in one field.
  row._metadata = [row.subtitle || ""].concat(row.keywords || []).map(normalize).filter(function(s) { return s !== "" })
  return row
}

function quicksilverMatch(value, query) {
  var text = String(value || "").toLowerCase()
  var q = String(query || "").toLowerCase()
  if (!q) return { score: 0, positions: [] }
  var score = 0, last = -1, positions = []
  for (var i = 0; i < q.length; i++) {
    var at = text.indexOf(q.charAt(i), last + 1)
    if (at < 0) return { score: 0, positions: [] }
    positions.push(at)
    score += 1
    if (at === 0 || /[^a-z0-9]/.test(text.charAt(at - 1))) score += 1
    if (last >= 0) score += 2 / Math.sqrt(at - last)
    last = at
  }
  return { score: score * (q.length / (last + 1)) * (10 / (text.length + 10)), positions: positions }
}

function quicksilverScore(value, query) {
  return quicksilverMatch(value, query).score
}

function textMatch(row, q, namesOnly) {
  if (row._title === undefined || row._path === undefined || !row._metadata) prepare(row)
  q = normalize(q)
  var best = { score: quicksilverScore(row._title, q), field: "title", text: row.title || "" }
  var pathScore = quicksilverScore(row._path, q)
  if (pathScore > best.score) best = { score: pathScore, field: "path", text: row.path }
  if (!namesOnly) {
    for (var i = 0; i < row._metadata.length; i++) {
      var metadataScore = 0.15 * quicksilverScore(row._metadata[i], q)
      if (metadataScore > best.score) best = { score: metadataScore, field: "metadata", text: row.title || "" }
    }
  }
  return best
}

function textScore(row, q) { return textMatch(row, q, false).score }

function displayText(row, query) {
  var parsed = parseQuery(query)
  return textMatch(row, parsed.text, parsed.scoped).text
}

function frecency(entry) {
  if (!entry) return 0
  var hours = Math.max(0, (Date.now() - Number(entry.last || 0)) / 3600000)
  var recency = hours < 1 ? 4 : hours < 24 ? 2 : hours < 168 ? 1 : 0.5
  return Math.min(320, Math.max(0, Number(entry.count || 0)) * 30 * recency)
}

function rank(rows, query, history, limit, minScore) {
  var parsed = parseQuery(query)
  var q = parsed.text
  var out = []
  history = history || {}
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (parsed.scoped && !scopeMatches(row, parsed.scope)) continue
    var score
    if (!q) {
      var h = history[row.id]
      if (!h && !parsed.scoped) continue
      score = frecency(h)
    } else {
      score = textMatch(row, q, parsed.scoped).score
      if (score <= (minScore || 0)) continue
    }
    out.push({ row: row, score: score, usage: frecency(history[row.id]),
      preference: row.weight || KIND_WEIGHT[row.kind] || 1 })
  }
  out.sort(function(a, b) {
    return b.score - a.score || b.usage - a.usage || b.preference - a.preference
      || String(a.row.title).localeCompare(String(b.row.title))
      || String(a.row.id || "").localeCompare(String(b.row.id || ""))
  })
  var result = []
  for (var j = 0; j < out.length && j < (limit || 50); j++) result.push(out[j].row)
  return result
}

// Map normalized matching back to the original displayed characters. The UI
// renders these as plain-text fragments, never as interpolated HTML.
function matchPositions(value, query) {
  var text = String(value || ""), normalized = "", indices = [], pendingSpace = -1
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i).toLowerCase()
    if (/[a-z0-9]/.test(c)) {
      if (pendingSpace >= 0 && normalized.length > 0) {
        normalized += " "
        indices.push(pendingSpace)
      }
      normalized += c
      indices.push(i)
      pendingSpace = -1
    } else if (pendingSpace < 0) pendingSpace = i
  }
  var matched = quicksilverMatch(normalized, normalize(query))
  return matched.positions.map(function(at) { return indices[at] })
}

function matchRuns(value, positions) {
  var text = String(value || ""), marked = {}, runs = []
  for (var i = 0; i < (positions || []).length; i++) marked[positions[i]] = true
  for (var at = 0; at < text.length; at++) {
    var highlighted = marked[at] === true && text.charAt(at) !== "…"
    var last = runs[runs.length - 1]
    if (last && last.matched === highlighted) last.text += text.charAt(at)
    else runs.push({ text: text.charAt(at), matched: highlighted })
  }
  return runs
}

function matchesAll(text, query) {
  var hay = String(text || "").toLowerCase()
  var words = String(query || "").toLowerCase().split(/\s+/)
  for (var i = 0; i < words.length; i++) if (words[i] && hay.indexOf(words[i]) < 0) return false
  return true
}
