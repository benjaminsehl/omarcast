.pragma library

function identity(value) { return String(value || "").replace(/\.desktop$/i, "").toLowerCase() }

function matches(app, window) {
  var cls = identity(window.appClass)
  if (!cls) return false
  if (cls === identity(app.appId) || (app.startupClass && cls === identity(app.startupClass))) return true
  // A browser's app-mode windows are distinct apps/profiles. Never claim them
  // through a heuristic that merely recognizes their browser executable.
  if (/^(chrome-|crx_)/.test(cls)) return false
  return !!window.desktopId && identity(window.desktopId) === identity(app.appId)
}

function findWindow(app, windows) {
  var best = null
  for (var i = 0; i < windows.length; i++) {
    var window = windows[i]
    if (!/^0x[0-9a-f]+$/i.test(window.address || "") || !matches(app, window)) continue
    var order = Number.isFinite(window.focusOrder) && window.focusOrder >= 0 ? window.focusOrder : 1000000
    var bestOrder = best && Number.isFinite(best.focusOrder) && best.focusOrder >= 0 ? best.focusOrder : 1000000
    if (!best || order < bestOrder || (order === bestOrder && window.address < best.address)) best = window
  }
  return best
}

function workspaceLabel(window, labels, configured) {
  var name = String(window.workspaceName || "")
  if (Object.prototype.hasOwnProperty.call(labels, name)) return labels[name]
  if (name.indexOf("special:") === 0) return "Scratchpad"
  // Do not flash internal names while an explicitly configured provider loads.
  if (configured) return "Desktop…"
  return name ? "Desktop " + name : "Desktop"
}

function annotate(apps, windows, labels, configured) {
  return apps.map(function(app) {
    var copy = Object.assign({}, app)
    copy.runningWindow = findWindow(app, windows)
    copy.runningLocation = copy.runningWindow ? workspaceLabel(copy.runningWindow, labels, configured) : ""
    return copy
  })
}

function parseLabels(raw) {
  if (String(raw).length > 262144) return {}
  var parsed
  try { parsed = JSON.parse(raw) } catch (e) { return {} }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {}
  var result = {}, keys = Object.keys(parsed).slice(0, 2000)
  for (var i = 0; i < keys.length; i++) {
    var value = parsed[keys[i]]
    if (keys[i].length <= 1024 && typeof value === "string" && value.length > 0 && value.length <= 120)
      Object.defineProperty(result, keys[i], { value: value, enumerable: true })
  }
  return result
}

function labelsCommand(config) {
  var command = config && config.workspaceLabelsCommand
  return Array.isArray(command) && command.length > 0 && command.length <= 32
    && command.every(function(arg) { return typeof arg === "string" && arg.length > 0 && arg.length <= 4096 })
    ? command : []
}

function focusExpression(address) {
  if (!/^0x[0-9a-f]+$/i.test(address || "")) return ""
  // Resolve the live target again before changing the view: it may have moved
  // or closed since the snapshot. No untrusted workspace name enters Lua.
  var selector = '"address:' + address + '"'
  return 'function() local w = hl.get_window(' + selector + '); if not w then return end; '
    + 'if w.workspace and not w.workspace.special then '
    + 'hl.dispatch(hl.dsp.focus({ workspace = "name:" .. w.workspace.name })) end; '
    + 'hl.dispatch(hl.dsp.focus({ window = ' + selector + ' })) end'
}
