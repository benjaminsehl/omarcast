.pragma library

// Additional intent words complement Emojibase's CLDR + community annotations.
// Keep these small and explicit; never guess a remote/AI result at runtime.
var INTENTS = {
  "1F389": ["congratulations", "congrats", "celebrate", "celebration", "tada", "party", "hooray"],
  "1F64F": ["thanks", "thank you", "please", "grateful", "gratitude", "pray"],
  "1F44D": ["approve", "approved", "agree", "agreement", "yes", "good job", "+1"],
  "1F44E": ["disapprove", "disagree", "no", "-1"],
  "1F602": ["lol", "lmao", "laughing", "funny"],
  "1F923": ["rofl", "hilarious"],
  "2764-FE0F": ["love", "heart", "affection"],
  "1F680": ["ship", "shipping", "launch", "deploy", "liftoff"],
  "1F440": ["looking", "watching", "review", "eyes"],
  "2705": ["done", "complete", "completed", "approved", "success"],
  "1F525": ["fire", "lit", "hot", "awesome"],
  "1F4AF": ["perfect", "absolutely", "hundred percent"],
  "1F914": ["hmm", "thinking", "consider", "ponder"],
  "1F937": ["idk", "dunno", "shrug", "whatever"],
  "1F622": ["sad", "cry", "unhappy"],
  "1F62D": ["sobbing", "crying", "tears"],
  "1F634": ["sleep", "tired", "sleepy", "zzz"]
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[_:\-]+/g, " ").replace(/\s+/g, " ").trim()
}

function prepare(entries) {
  return entries.map(function(e) {
    var row = { id: "emoji:" + e.id, kind: "emoji", title: e.label, emoji: e.emoji,
      glyph: e.emoji, group: e.group, tone: e.tone, order: e.order,
      aliases: e.aliases || [] }
    // Parent intent tags also apply to skin variants.
    var parent = e.id.replace(/-1F3F[B-F]/g, "")
    var intent = INTENTS[e.id] || INTENTS[parent] || []
    row.fields = [e.label].concat(e.aliases || [], e.tags || [], intent, [e.group, e.subgroup])
      .map(normalize).filter(function(s) { return !!s })
    row.words = row.fields.join(" ").split(/\s+/)
    return row
  })
}

// One typo (insertion, deletion, substitution, transposition), for >=4 letters.
function near(a, b) {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false
  var i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2 }
    else if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1
}

function score(row, raw, q) {
  if (raw === row.emoji) return 2000
  // Preserve +1/-1 before punctuation normalization.
  if (raw === "+1" || raw === "-1") return row.aliases.indexOf(raw) >= 0 ? 1800 : 0
  if (!q) return 0
  var title = normalize(row.title)
  if (title === q) return 1600
  var best = 0
  for (var f = 0; f < row.fields.length; f++) {
    if (row.fields[f] === q) best = Math.max(best, f === 0 ? 1600 : 1400)
  }
  if (best) return best
  if (near(q, title)) return 900 // misspelled canonical name beats a peripheral tag
  var tokens = q.split(" "), total = 0
  for (var t = 0; t < tokens.length; t++) {
    var word = tokens[t], match = 0
    for (var w = 0; w < row.words.length; w++) {
      var candidate = row.words[w]
      if (word === candidate) { match = 100; break }
      if (candidate.indexOf(word) === 0) match = Math.max(match, 65)
      else if (word.length >= 3 && candidate.indexOf(word) >= 0) match = Math.max(match, 30)
      else if (match < 15 && near(word, candidate)) match = 15
    }
    if (!match) return 0 // AND, so multiword intent doesn't become an OR flood.
    total += match
  }
  return total / tokens.length + (title.indexOf(q) >= 0 ? 100 : 0)
}

function search(entries, query, history) {
  var raw = String(query || "").trim().replace(/^:(.+):$/, "$1"), q = normalize(raw), results = []
  history = history || {}
  for (var i = 0; i < entries.length; i++) {
    var row = entries[i], s = raw ? score(row, raw, q) : 0
    if (raw && !s) continue
    results.push({ row: row, score: s, count: Number((history[row.id] || {}).count || 0),
      last: Number((history[row.id] || {}).last || 0) })
  }
  results.sort(function(a, b) {
    return b.score - a.score || b.last - a.last || b.count - a.count
      || (a.row.tone ? 1 : 0) - (b.row.tone ? 1 : 0) || a.row.order - b.row.order
  })
  // ListView virtualizes this full list: don't silently truncate browse/search.
  return results.map(function(item) {
    var r = item.row
    return { id: r.id, kind: r.kind, title: r.title, emoji: r.emoji, glyph: r.glyph,
      subtitle: r.group + (r.aliases.length ? " · :" + r.aliases[0] + ":" : ""),
      _section: raw ? "Results" : (item.last ? "Recently used" : r.group) }
  })
}
