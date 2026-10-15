// Run: node test/calc.test.mjs
import assert from "node:assert/strict";

import { loadQmlJs } from "./helpers.mjs";

const Calc = loadQmlJs("../plugin/lib/Calc.js");
const rates = { base: "USD", date: "2026-10-15", rates: { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 } };

const cases = [
  ["1+1", "2"],
  ["2 * (3 + 4)", "14"],
  ["2^10", "1,024"],
  ["10 / 4", "2.5"],
  ["sqrt(16)", "4"],
  ["2pi", "6.28318530718"],
  ["20% of 50", "10"],
  ["50 + 10%", "55"],
  ["2 * 20% of 300", "120"],
  ["what is 20% of 300?", "60"],
  ["convert 5 km to m", "5,000 m"],
  ["how many cm in 6 ft", "182.88 cm"],
  ["(1920 * 1080) / 2^10", "2,025"],
  ["5!", "120"],
  ["0xff", "255"],
  ["255 to hex", "0xFF"],
  ["10 to binary", "0b1010"],
  ["1,000 * 3", "3,000"],
  ["7 mod 3", "1"],
  ["32F", "0 °C"],
  ["32 f to c", "0 °C"],
  ["100c", "212 °F"],
  ["0 k to c", "-273.15 °C"],
  ["5 km", "3.10686 mi"],
  ["5 km to m", "5,000 m"],
  ["6 ft in cm", "182.88 cm"],
  ["5 in to cm", "12.7 cm"],
  ["10 kg to lb", "22.0462 lb"],
  ["1 gal to l", "3.78541 l"],
  ["1 GiB to MB", "1,073.74 MB"],
  ["1000000 usd to jpy", "150,000,000.00 JPY"],
  ["90 min to h", "1.5 h"],
  ["100 usd to eur", "90.00 EUR"],
  ["$20", "18.00 EUR"],
  ["10 eur", "11.11 USD"],
];

let failed = 0;
for (const [q, expected] of cases) {
  const r = Calc.evaluate(q, rates);
  const got = r && r.result;
  try {
    assert.equal(r && r.result, expected);
    console.log(`ok   ${q.padEnd(20)} → ${r.result}`);
  } catch {
    failed++;
    console.log(`FAIL ${q.padEnd(20)} → ${got}  (expected ${expected})`);
  }
}

// Non-calculations must not produce a card.
for (const q of ["firefox", "42", "omarchy theme", "f", "1password", "htop", "notes 2", "what is omarchy?", "how do i add a keybinding in hyprland?"]) {
  const r = Calc.evaluate(q, rates);
  if (r) { failed++; console.log(`FAIL ${q.padEnd(20)} should not calculate, got ${r.result}`); }
  else console.log(`ok   ${q.padEnd(20)} → (no card)`);
}

assert.equal(Calc.evaluate("1+1").resultLabel, "Two");
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
