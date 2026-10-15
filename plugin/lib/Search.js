.pragma library

// Ranking for Omarcast rows. A row is a plain object:
//   { id, kind, title, subtitle, keywords[], weight? }
// Score = text match * kind weight + frecency boost.

var KIND_WEIGHT = {
  "command": 1.25,   // built-in omarcast commands (Clipboard History, …)
  "app": 1.2,
  "omarchy": 1.0,
  "omarchy-menu": 0.95,
  "window": 0.9,
  "quicklink": 1.0,
  "snippet": 0.9,
  "omarchy-cli": 0.7
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function prepare(row) {
  row._title = normalize(row.title)
  row._words = row._title.split(" ")
  row._hay = normalize([row.title, row.subtitle].concat(row.keywords || []).join(" "))
  return row
}

function textScore(row, q) {
  // QML may hand back copies of rows without the cached fields; recompute.
  if (row._title === undefined || !row._words || row._hay === undefined) prepare(row)
  var title = row._title
  if (title === q) return 1000
  if (title.indexOf(q) === 0) return 900 - Math.min(title.length, 60)
  var words = row._words
  for (var w = 1; w < words.length; w++) if (words[w].indexOf(q) === 0) return 800 - Math.min(title.length, 60)

  var compact = q.replace(/ /g, "")
  var initials = ""
  for (var k = 0; k < words.length; k++) initials += words[k].charAt(0)
  if (compact.length > 1 && initials.indexOf(compact) === 0) return 700

  var hay = row._hay
  var idx = hay.indexOf(q)
  if (idx >= 0) return 550 - Math.min(idx, 150)

  // Subsequence on the title only; subtitles make it too noisy.
  if (compact.length < 2) return 0
  var score = 0, last = -1
  for (var i = 0; i < compact.length; i++) {
    var at = title.indexOf(compact.charAt(i), last + 1)
    if (at === -1) return 0
    score += at === last + 1 ? 8 : 1
    last = at
  }
  // Mostly-consecutive matches only: "thm" → "theme" yes, letters scattered across words no.
  if (score < compact.length * 5) return 0
  return 100 + score
}

function frecency(entry) {
  if (!entry) return 0
  var hours = (Date.now() - entry.last) / 3600000
  var recency = hours < 1 ? 4 : hours < 24 ? 2 : hours < 168 ? 1 : 0.5
  return Math.min(320, entry.count * 30 * recency)
}

function rank(rows, query, history, limit, minScore) {
  var q = normalize(query)
  var out = []
  history = history || {}
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var s
    if (!q) {
      var h = history[row.id]
      if (!h) continue
      s = 1000 + frecency(h)
    } else {
      s = textScore(row, q)
      if (s <= (minScore || 0)) continue
      s = s * (row.weight || KIND_WEIGHT[row.kind] || 1) + frecency(history[row.id])
    }
    out.push({ row: row, score: s })
  }
  out.sort(function(a, b) { return b.score - a.score || (a.row.title < b.row.title ? -1 : 1) })
  var result = []
  for (var j = 0; j < out.length && j < (limit || 50); j++) result.push(out[j].row)
  return result
}

// Simple filter for sub-views (clipboard, emoji): every query word must match.
function matchesAll(text, query) {
  var hay = String(text || "").toLowerCase()
  var words = String(query || "").toLowerCase().split(/\s+/)
  for (var i = 0; i < words.length; i++) if (words[i] && hay.indexOf(words[i]) < 0) return false
  return true
}
