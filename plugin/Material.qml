import QtQuick
import qs.Commons

// Depth, read from the theme. Opt-in and shared with other widgets (Omarcal
// reads the same keys); a theme without the section stays flat:
//
//   [material]
//   depth        = 1.0         # 0 = flat (default), 1 = keys stand off the body
//   key          = "#f7f5f1"   # face of a secondary key (default: popup background)
//   shadow       = "#2b2418"   # shadow ink              (default: black)
//   shadow-alpha = 0.2         # card shadow strength    (default: 0)
QtObject {
  function str(key) {
    var v = Color.shellValues["material." + key]
    if (typeof v === "number") return String(v)
    return typeof v === "string" && v.length > 0 ? v : ""
  }

  function num(key, fallback) {
    var v = str(key)
    var n = Number(v)
    return v && isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
  }

  readonly property real depth: num("depth", 0)
  readonly property bool on: depth > 0
  readonly property color key: str("key") ? Color.flatColor(str("key"), Color.popups.background) : Color.popups.background
  readonly property color shadow: str("shadow") ? Color.flatColor(str("shadow"), "#000000") : "#000000"
  readonly property real shadowAlpha: num("shadow-alpha", 0)
}
