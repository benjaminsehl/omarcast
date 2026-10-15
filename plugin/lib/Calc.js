.pragma library

// Omarcast inline calculator: arithmetic, percentages, unit/currency/base
// conversion. evaluate(query, rates) returns null when the query is not a
// calculation, otherwise:
//   { kind: "math"|"unit"|"currency"|"base", input, result, resultLabel, copy }
// `rates` is an optional { base: "USD", rates: { EUR: 0.9, ... } } table.

// ---------------------------------------------------------------- units

var UNITS = {}
var UNIT_LIST = []

function defUnits(dim, list) {
  for (var i = 0; i < list.length; i++) {
    var u = { dim: dim, name: list[i][0], factor: list[i][1], aliases: list[i][2], system: list[i][3] || "" }
    UNIT_LIST.push(u)
    for (var j = 0; j < u.aliases.length; j++) UNITS[u.aliases[j]] = u
  }
}

// factor = how many base units one of this unit is.
defUnits("length", [
  ["mm", 0.001, ["mm", "millimeter", "millimeters", "millimetre", "millimetres"], "metric"],
  ["cm", 0.01, ["cm", "centimeter", "centimeters", "centimetre", "centimetres"], "metric"],
  ["m", 1, ["m", "meter", "meters", "metre", "metres"], "metric"],
  ["km", 1000, ["km", "kilometer", "kilometers", "kilometre", "kilometres"], "metric"],
  ["in", 0.0254, ["in", "inch", "inches", "\""], "imperial"],
  ["ft", 0.3048, ["ft", "foot", "feet", "'"], "imperial"],
  ["yd", 0.9144, ["yd", "yard", "yards"], "imperial"],
  ["mi", 1609.344, ["mi", "mile", "miles"], "imperial"],
  ["nmi", 1852, ["nmi", "nautical mile", "nautical miles"], ""]
])
defUnits("mass", [
  ["mg", 0.001, ["mg", "milligram", "milligrams"], "metric"],
  ["g", 1, ["g", "gram", "grams", "gr"], "metric"],
  ["kg", 1000, ["kg", "kilo", "kilos", "kilogram", "kilograms"], "metric"],
  ["t", 1e6, ["t", "tonne", "tonnes", "metric ton"], "metric"],
  ["oz", 28.349523125, ["oz", "ounce", "ounces"], "imperial"],
  ["lb", 453.59237, ["lb", "lbs", "pound", "pounds"], "imperial"],
  ["st", 6350.29318, ["st", "stone", "stones"], "imperial"]
])
defUnits("volume", [
  ["ml", 0.001, ["ml", "milliliter", "milliliters", "millilitre", "millilitres"], "metric"],
  ["l", 1, ["l", "liter", "liters", "litre", "litres"], "metric"],
  ["m³", 1000, ["m3", "m³", "cubic meter", "cubic meters"], "metric"],
  ["tsp", 0.00492892159, ["tsp", "teaspoon", "teaspoons"], "imperial"],
  ["tbsp", 0.0147867648, ["tbsp", "tablespoon", "tablespoons"], "imperial"],
  ["fl oz", 0.0295735296, ["floz", "fl oz", "fluid ounce", "fluid ounces"], "imperial"],
  ["cup", 0.2365882365, ["cup", "cups"], "imperial"],
  ["pt", 0.473176473, ["pt", "pint", "pints"], "imperial"],
  ["qt", 0.946352946, ["qt", "quart", "quarts"], "imperial"],
  ["gal", 3.785411784, ["gal", "gallon", "gallons"], "imperial"]
])
defUnits("area", [
  ["m²", 1, ["m2", "m²", "sqm", "square meter", "square meters"], "metric"],
  ["km²", 1e6, ["km2", "km²", "square kilometer", "square kilometers"], "metric"],
  ["ha", 1e4, ["ha", "hectare", "hectares"], "metric"],
  ["ft²", 0.09290304, ["ft2", "ft²", "sqft", "square foot", "square feet"], "imperial"],
  ["mi²", 2589988.110336, ["mi2", "mi²", "square mile", "square miles"], "imperial"],
  ["acre", 4046.8564224, ["acre", "acres", "ac"], "imperial"]
])
defUnits("speed", [
  ["m/s", 1, ["m/s", "mps"], "metric"],
  ["km/h", 1 / 3.6, ["km/h", "kmh", "kph"], "metric"],
  ["mph", 0.44704, ["mph", "mi/h"], "imperial"],
  ["kn", 0.514444, ["kn", "knot", "knots"], ""]
])
defUnits("time", [
  ["ms", 0.001, ["ms", "millisecond", "milliseconds"]],
  ["s", 1, ["s", "sec", "secs", "second", "seconds"]],
  ["min", 60, ["min", "mins", "minute", "minutes"]],
  ["h", 3600, ["h", "hr", "hrs", "hour", "hours"]],
  ["day", 86400, ["d", "day", "days"]],
  ["week", 604800, ["wk", "week", "weeks"]],
  ["month", 2629746, ["mo", "month", "months"]],
  ["year", 31556952, ["y", "yr", "yrs", "year", "years"]]
])
defUnits("data", [
  ["bit", 0.125, ["bit", "bits"]],
  ["B", 1, ["b", "byte", "bytes"]],
  ["KB", 1e3, ["kb", "kilobyte", "kilobytes"]],
  ["MB", 1e6, ["mb", "megabyte", "megabytes"]],
  ["GB", 1e9, ["gb", "gigabyte", "gigabytes"]],
  ["TB", 1e12, ["tb", "terabyte", "terabytes"]],
  ["KiB", 1024, ["kib", "kibibyte"]],
  ["MiB", 1048576, ["mib", "mebibyte"]],
  ["GiB", 1073741824, ["gib", "gibibyte"]],
  ["TiB", 1099511627776, ["tib", "tebibyte"]]
])
defUnits("energy", [
  ["J", 1, ["j", "joule", "joules"]],
  ["kJ", 1000, ["kj", "kilojoule", "kilojoules"]],
  ["cal", 4.184, ["cal", "calorie", "calories"]],
  ["kcal", 4184, ["kcal", "kilocalorie", "kilocalories"]],
  ["Wh", 3600, ["wh"]],
  ["kWh", 3.6e6, ["kwh"]]
])
defUnits("angle", [
  ["deg", Math.PI / 180, ["deg", "degree", "degrees", "°"]],
  ["rad", 1, ["rad", "radian", "radians"]]
])
// Temperature is affine, handled specially. factor unused.
defUnits("temperature", [
  ["°C", 0, ["c", "°c", "celsius", "centigrade", "degc"], "metric"],
  ["°F", 0, ["f", "°f", "fahrenheit", "degf"], "imperial"],
  ["K", 0, ["k", "kelvin", "kelvins"], ""]
])

// Preferred target when no "to <unit>" is given.
var DEFAULT_TARGET = {
  "mm": "in", "cm": "in", "m": "ft", "km": "mi", "in": "cm", "ft": "m", "yd": "m", "mi": "km", "nmi": "km",
  "mg": "oz", "g": "oz", "kg": "lb", "t": "lb", "oz": "g", "lb": "kg", "st": "kg",
  "ml": "fl oz", "l": "gal", "m³": "l", "tsp": "ml", "tbsp": "ml", "fl oz": "ml", "cup": "ml", "pt": "l", "qt": "l", "gal": "l",
  "m²": "ft²", "km²": "mi²", "ha": "acre", "ft²": "m²", "mi²": "km²", "acre": "ha",
  "m/s": "km/h", "km/h": "mph", "mph": "km/h", "kn": "km/h",
  "ms": "s", "s": "min", "min": "h", "h": "min", "day": "h", "week": "day", "month": "day", "year": "day",
  "bit": "B", "B": "bit", "KB": "KiB", "MB": "MiB", "GB": "GiB", "TB": "TiB", "KiB": "KB", "MiB": "MB", "GiB": "GB", "TiB": "TB",
  "J": "cal", "kJ": "kcal", "cal": "J", "kcal": "kJ", "Wh": "J", "kWh": "J",
  "deg": "rad", "rad": "deg",
  "°C": "°F", "°F": "°C", "K": "°C"
}

function unitByName(name) {
  for (var i = 0; i < UNIT_LIST.length; i++) if (UNIT_LIST[i].name === name) return UNIT_LIST[i]
  return null
}

function lookupUnit(text) {
  var key = String(text || "").trim().toLowerCase().replace(/\s+/g, " ")
  if (!key) return null
  return UNITS[key] || UNITS[key.replace(/^degrees? /, "")] || null
}

function toKelvin(v, name) {
  if (name === "°C") return v + 273.15
  if (name === "°F") return (v - 32) * 5 / 9 + 273.15
  return v
}

function fromKelvin(v, name) {
  if (name === "°C") return v - 273.15
  if (name === "°F") return (v - 273.15) * 9 / 5 + 32
  return v
}

function convertUnit(value, from, to) {
  if (from.dim !== to.dim) return null
  if (from.dim === "temperature") return fromKelvin(toKelvin(value, from.name), to.name)
  return value * from.factor / to.factor
}

// ---------------------------------------------------------------- currency

var CURRENCY_SYMBOLS = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₩": "KRW", "₽": "RUB", "₺": "TRY", "₪": "ILS", "₫": "VND", "฿": "THB", "₴": "UAH", "₦": "NGN", "₱": "PHP", "r$": "BRL", "c$": "CAD", "a$": "AUD", "chf": "CHF" }
var CURRENCY_WORDS = {
  "dollar": "USD", "dollars": "USD", "usd": "USD", "bucks": "USD",
  "euro": "EUR", "euros": "EUR", "eur": "EUR",
  "pound": "GBP", "pounds sterling": "GBP", "quid": "GBP", "gbp": "GBP",
  "yen": "JPY", "rupee": "INR", "rupees": "INR", "yuan": "CNY", "rmb": "CNY",
  "franc": "CHF", "francs": "CHF", "won": "KRW", "peso": "MXN", "pesos": "MXN",
  "bitcoin": "BTC", "btc": "BTC"
}

function lookupCurrency(text, rates) {
  var key = String(text || "").trim().toLowerCase()
  if (!key) return ""
  if (CURRENCY_SYMBOLS[key]) return CURRENCY_SYMBOLS[key]
  if (CURRENCY_WORDS[key]) return CURRENCY_WORDS[key]
  var code = key.toUpperCase()
  if (/^[A-Z]{3}$/.test(code) && rates && rates.rates && (rates.rates[code] !== undefined || code === rates.base)) return code
  return ""
}

function rateOf(code, rates) {
  if (!rates || !rates.rates) return null
  if (code === rates.base) return 1
  var r = rates.rates[code]
  return typeof r === "number" && r > 0 ? r : null
}

function convertCurrency(amount, from, to, rates) {
  var a = rateOf(from, rates), b = rateOf(to, rates)
  if (a === null || b === null) return null
  return amount / a * b
}

// ---------------------------------------------------------------- expression parser

var FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt || function(x) { return Math.pow(x, 1 / 3) },
  abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10 || function(x) { return Math.log(x) / Math.LN10 },
  log2: Math.log2 || function(x) { return Math.log(x) / Math.LN2 },
  exp: Math.exp
}
var CONSTS = { pi: Math.PI, "π": Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 }

function tokenize(src) {
  var s = String(src)
    .replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\*\*/g, "^")
  var tokens = []
  var i = 0
  while (i < s.length) {
    var ch = s[i]
    if (/\s/.test(ch)) { i++; continue }
    var rest = s.slice(i)
    var m
    if ((m = rest.match(/^0x[0-9a-f]+/i))) { tokens.push({ t: "num", v: parseInt(m[0], 16), base: 16 }); i += m[0].length; continue }
    if ((m = rest.match(/^0b[01]+/i))) { tokens.push({ t: "num", v: parseInt(m[0].slice(2), 2), base: 2 }); i += m[0].length; continue }
    if ((m = rest.match(/^0o[0-7]+/i))) { tokens.push({ t: "num", v: parseInt(m[0].slice(2), 8), base: 8 }); i += m[0].length; continue }
    if ((m = rest.match(/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?(e[+-]?\d+)?|^\.\d+(e[+-]?\d+)?/i))) {
      tokens.push({ t: "num", v: parseFloat(m[0].replace(/,/g, "")) }); i += m[0].length; continue
    }
    if ((m = rest.match(/^[a-zπ][a-z0-9]*/i))) { tokens.push({ t: "id", v: m[0].toLowerCase() }); i += m[0].length; continue }
    if ("+-*/^%()!,".indexOf(ch) >= 0) { tokens.push({ t: "op", v: ch }); i++; continue }
    return null
  }
  return tokens
}

// Recursive-descent parser. Grammar:
//   expr   := term (("+"|"-") term)*      a + b% means a + a*b/100
//   term   := unary (("*"|"/"|"mod"|implicit) unary)*
//   unary  := ("-"|"+") unary | power
//   power  := postfix ("^" unary)?
//   postfix:= atom ("!" | "%")*
//   atom   := num | const | func "(" expr ")" | "(" expr ")"
function parse(tokens) {
  var pos = 0
  var usedOperator = false

  function peek() { return tokens[pos] }
  function isOp(v) { var t = tokens[pos]; return t && t.t === "op" && t.v === v }
  function take() { return tokens[pos++] }
  function fail() { throw new Error("parse") }

  function expr() {
    var left = term()
    while (isOp("+") || isOp("-")) {
      var op = take().v
      usedOperator = true
      var right = term()
      var value = right.pct ? left.v * right.v : right.v
      left = { v: op === "+" ? left.v + value : left.v - value }
    }
    return left
  }

  function term() {
    var left = unary()
    for (;;) {
      var t = peek()
      if (isOp("*") || isOp("/")) {
        var op = take().v
        usedOperator = true
        var right = unary()
        // "a * 20% of b" → a * (20% of b)
        var nt = peek()
        if (right.pct && nt && nt.t === "id" && nt.v === "of") { take(); right = { v: right.v * unary().v } }
        left = { v: op === "*" ? left.v * right.v : left.v / right.v }
      } else if (t && t.t === "id" && t.v === "mod") {
        take(); usedOperator = true
        var r = unary()
        left = { v: ((left.v % r.v) + r.v) % r.v }
      } else if (t && t.t === "id" && t.v === "of" && left.pct) {
        take(); usedOperator = true
        var of = unary()
        left = { v: left.v * of.v }
      } else if (t && (isOp("(") || (t.t === "id" && (CONSTS[t.v] !== undefined || FUNCS[t.v])))) {
        // implicit multiplication: 2pi, 3(4+1), 2 sqrt(9)
        usedOperator = true
        var rr = unary()
        left = { v: left.v * rr.v }
      } else {
        return left
      }
    }
  }

  function unary() {
    if (isOp("-")) { take(); var v = unary(); return { v: -v.v, pct: v.pct } }
    if (isOp("+")) { take(); return unary() }
    return power()
  }

  function power() {
    var base = postfix()
    if (isOp("^")) {
      take(); usedOperator = true
      var exp = unary()
      return { v: Math.pow(base.v, exp.v) }
    }
    return base
  }

  function postfix() {
    var node = atom()
    for (;;) {
      if (isOp("!")) {
        take(); usedOperator = true
        node = { v: factorial(node.v) }
      } else if (isOp("%")) {
        take(); usedOperator = true
        node = { v: node.v / 100, pct: true }
      } else {
        return node
      }
    }
  }

  function atom() {
    var t = take()
    if (!t) fail()
    if (t.t === "num") return { v: t.v }
    if (t.t === "op" && t.v === "(") {
      var inner = expr()
      if (!isOp(")")) fail()
      take()
      return { v: inner.v }
    }
    if (t.t === "id") {
      if (CONSTS[t.v] !== undefined) { usedOperator = true; return { v: CONSTS[t.v] } }
      if (FUNCS[t.v]) {
        usedOperator = true
        var hasParen = isOp("(")
        if (hasParen) take()
        var arg = hasParen ? expr() : unary()
        if (hasParen) { if (!isOp(")")) fail(); take() }
        return { v: FUNCS[t.v](arg.v) }
      }
    }
    fail()
  }

  var result = expr()
  if (pos !== tokens.length) fail()
  return { value: result.v, pct: !!result.pct, usedOperator: usedOperator }
}

function factorial(n) {
  if (n < 0 || n !== Math.floor(n) || n > 170) return NaN
  var r = 1
  for (var i = 2; i <= n; i++) r *= i
  return r
}

function evalExpression(src) {
  var tokens = tokenize(src)
  if (!tokens || tokens.length === 0) return null
  try {
    var r = parse(tokens)
    if (typeof r.value !== "number" || isNaN(r.value)) return null
    return r
  } catch (e) {
    return null
  }
}

// ---------------------------------------------------------------- formatting

function formatNumber(v) {
  if (!isFinite(v)) return v > 0 ? "∞" : (v < 0 ? "−∞" : "NaN")
  if (v === 0) return "0"
  var abs = Math.abs(v)
  if (abs >= 1e15 || abs < 1e-9) return v.toExponential(6).replace(/\.?0+e/, "e")
  var rounded = Number(v.toPrecision(12))
  var parts = String(rounded).split(".")
  // String() can produce exponent form for small numbers; fall back to fixed.
  if (parts[0].indexOf("e") >= 0) return String(rounded)
  var neg = parts[0][0] === "-"
  var int = neg ? parts[0].slice(1) : parts[0]
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return (neg ? "-" : "") + int + (parts[1] ? "." + parts[1] : "")
}

function plain(v) {
  // Copy-friendly: no thousands separators.
  return formatNumber(v).replace(/,/g, "")
}

function formatMoney(v, code) {
  if (Math.abs(v) < 1 && v !== 0) return formatNumber(Number(v.toPrecision(4))) + " " + code
  var fixed = v.toFixed(2).split(".")
  return formatNumber(Number(fixed[0])) + "." + fixed[1] + " " + code
}

// Unit conversions read better rounded (Raycast-style): 6 significant digits.
function formatMeasure(v) {
  return formatNumber(Number(v.toPrecision(6)))
}

// ---------------------------------------------------------------- top level

var NUM_RE = "([-+]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:e[+-]?\\d+)?|[-+]?\\.\\d+)"

function splitTarget(q) {
  // "<lhs> to|in|as|= <rhs>" — split at the LAST connector so "5 in to cm" works.
  var m = q.match(/^(.*\S)\s+(?:to|in|into|as|=|->|→)\s+(\S.*)$/i)
  return m ? { lhs: m[1], rhs: m[2] } : { lhs: q, rhs: "" }
}

function parseQuantity(text) {
  // number followed by unit text, e.g. "32F", "5 km", "1.5 cups", "$20", "20 usd"
  var t = String(text || "").trim()
  var m = t.match(new RegExp("^" + NUM_RE + "\\s*(.+)$", "i"))
  if (m) return { value: parseFloat(m[1].replace(/,/g, "")), unit: m[2].trim() }
  var p = t.match(new RegExp("^([^\\d\\s.+-]{1,3})\\s*" + NUM_RE + "$", "i")) // prefix symbol: $20, €5
  if (p) return { value: parseFloat(p[2].replace(/,/g, "")), unit: p[1] }
  return null
}

function tryUnits(q) {
  var parts = splitTarget(q)
  var qty = parseQuantity(parts.lhs)
  if (!qty) return null
  var from = lookupUnit(qty.unit)
  if (!from) return null
  var to = parts.rhs ? lookupUnit(parts.rhs) : unitByName(DEFAULT_TARGET[from.name])
  if (!to || to.dim !== from.dim) return null
  var out = convertUnit(qty.value, from, to)
  if (out === null || !isFinite(out)) return null
  return {
    kind: "unit",
    input: formatNumber(qty.value) + " " + from.name,
    inputLabel: capitalize(from.dim),
    result: formatMeasure(out) + " " + to.name,
    resultLabel: unitWord(to),
    copy: formatMeasure(out).replace(/,/g, "")
  }
}

function tryCurrency(q, rates) {
  if (!rates || !rates.rates) return null
  var parts = splitTarget(q)
  var qty = parseQuantity(parts.lhs)
  if (!qty) return null
  var from = lookupCurrency(qty.unit, rates)
  if (!from) return null
  var to = parts.rhs ? lookupCurrency(parts.rhs, rates) : (from === "USD" ? (rates.home && rates.home !== "USD" ? rates.home : "EUR") : "USD")
  if (!to) return null
  var out = convertCurrency(qty.value, from, to, rates)
  if (out === null) return null
  return {
    kind: "currency",
    input: formatMoney(qty.value, from),
    inputLabel: "Currency",
    result: formatMoney(out, to),
    resultLabel: rates.date ? "Rates from " + rates.date : "Exchange rate",
    copy: String(Number(out.toFixed(2)))
  }
}

function tryBase(q) {
  var m = q.match(/^(.+?)\s+(?:to|in|as)\s+(hex|hexadecimal|bin|binary|oct|octal|dec|decimal)$/i)
  if (!m) return null
  var r = evalExpression(m[1])
  if (!r || r.value !== Math.floor(r.value)) return null
  var target = m[2].toLowerCase()
  var v = r.value
  var out = target.indexOf("hex") === 0 ? "0x" + v.toString(16).toUpperCase()
    : target.indexOf("bin") === 0 ? "0b" + v.toString(2)
    : target.indexOf("oct") === 0 ? "0o" + v.toString(8)
    : String(v)
  return { kind: "base", input: m[1].trim(), inputLabel: "Number", result: out, resultLabel: capitalize(target), copy: out }
}

function tryMath(q) {
  var r = evalExpression(q)
  if (!r) return null
  // A bare literal ("42") is not a calculation; hex/bin literals are (0xff → 255).
  var tokens = tokenize(q)
  var literalBase = tokens.length === 1 && tokens[0].base
  if (!r.usedOperator && !literalBase) return null
  return {
    kind: "math",
    input: q.trim(),
    inputLabel: "Expression",
    result: formatNumber(r.value),
    resultLabel: numberWords(r.value),
    copy: plain(r.value)
  }
}

function evaluate(query, rates) {
  // Accept question phrasing: "what is 20% of 300?", "convert 5 km to mi", "how many cm in 6 ft"
  var q = String(query || "").trim().replace(/^=\s*/, "")
    .replace(/^(what\s+is|what's|whats|calculate|calc|convert|how\s+much\s+is)\s+/i, "")
    .replace(/\s*[?=]+$/, "")
  var howMany = q.match(/^how\s+many\s+(.+?)\s+(?:in|are\s+in)\s+(.+)$/i)
  if (howMany) q = howMany[2] + " to " + howMany[1]
  if (!q || q.length > 200) return null
  if (!/[0-9π]/.test(q) && !/^(pi|e|tau|phi)$/i.test(q)) return null
  return tryBase(q) || tryCurrency(q, rates) || tryUnits(q) || tryMath(q)
}

// ---------------------------------------------------------------- helpers

function capitalize(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1) }

function unitWord(u) {
  var a = u.aliases
  for (var i = 0; i < a.length; i++) if (a[i].length > 3 && !/\d|²|³/.test(a[i])) return capitalize(a[i].replace(/s$/, "")) + "s"
  return capitalize(u.dim)
}

var ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
var SCALES = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]]

function numberWords(v) {
  // Raycast shows the answer in words under integers; keep it to sane sizes.
  if (!isFinite(v) || v !== Math.floor(v) || Math.abs(v) >= 1e15) return ""
  if (v < 0) return "Minus " + numberWords(-v).toLowerCase()
  function words(n) {
    if (n < 20) return ONES[n]
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "")
    if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + words(n % 100) : "")
    for (var i = 0; i < SCALES.length; i++) {
      var s = SCALES[i]
      if (n >= s[0]) return words(Math.floor(n / s[0])) + " " + s[1] + (n % s[0] ? " " + words(n % s[0]) : "")
    }
    return ""
  }
  return capitalize(words(v))
}
