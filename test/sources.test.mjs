// Run: node test/sources.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { loadQmlJs } from "./helpers.mjs";

const Sources = loadQmlJs("../plugin/lib/Sources.js");
const Search = loadQmlJs("../plugin/lib/Search.js");
const omarchy = process.env.OMARCHY_PATH || "/usr/share/omarchy";

const menu = Sources.menuRows(readFileSync(`${omarchy}/default/omarchy/omarchy-menu.jsonc`, "utf8"), "{}");
assert.ok(menu.length > 100, "menu rows");
const theme = menu.find((r) => r.id === "omarchy:style.theme");
assert.equal(theme.kind, "omarchy");
assert.equal(theme.subtitle, "Style");
const font = menu.find((r) => r.id === "omarchy:style.font");
assert.equal(font.kind, "omarchy-menu");
console.log("ok   menu rows:", menu.length);

const cli = Sources.cliRows(execFileSync("omarchy", ["commands", "--json"], { encoding: "utf8" }));
assert.ok(cli.length > 50);
console.log("ok   cli rows:", cli.length);

const wins = Sources.windowRows(execFileSync("hyprctl", ["clients", "-j"], { encoding: "utf8" }));
console.log("ok   window rows:", wins.length, wins[0] && wins[0].subtitle);

const links = Sources.quicklinks('[{"keyword":"gh","name":"My GH","url":"https://x/{query}"}]');
const hit = Sources.matchQuicklink(links, "gh omarchy menu");
assert.equal(hit.link.name, "My GH");
assert.equal(Sources.fillUrl(hit.link.url, hit.query), "https://x/omarchy%20menu");
assert.equal(Sources.looksLikeUrl("omarchy.org"), "https://omarchy.org");
assert.equal(Sources.looksLikeUrl("file.txt"), "https://file.txt"); // acceptable: TLD-ish
assert.equal(Sources.looksLikeUrl("1.5"), "");
assert.equal(Sources.looksLikeUrl("hello world"), "");
console.log("ok   quicklinks");

const zones = execFileSync("timedatectl", ["list-timezones"], { encoding: "utf8" }).split("\n").filter(Boolean);
assert.equal(Sources.timePlace("time in tokyo"), "tokyo");
assert.equal(Sources.timePlace("new york time"), "new york");
assert.equal(Sources.timePlace("tokyo"), "");
assert.equal(Sources.findZone(zones, "tokyo"), "Asia/Tokyo");
assert.equal(Sources.findZone(zones, "new york"), "America/New_York");
assert.equal(Sources.findZone(zones, "sf"), "America/Los_Angeles");
console.log("ok   time zones");

const rows = menu.concat(cli).map(Search.prepare);
const top = Search.rank(rows, "theme", {}, 5).map((r) => r.title);
assert.equal(top[0], "Theme");
const lock = Search.rank(rows, "lock", {}, 3).map((r) => r.id);
assert.ok(lock.includes("omarchy:system.lock"), lock.join(","));
console.log("ok   ranking", top.join(" | "));
console.log("\nall passed");

// Fuzzy matching must not pick up scattered letters.
const noise = Search.rank([Search.prepare({ id: "x", kind: "omarchy", title: "With desktop + microphone audio" })], "theme", {}, 5);
assert.equal(noise.length, 0, "scattered subsequence should not match");
const fuzzy = Search.rank([Search.prepare({ id: "y", kind: "app", title: "Thunderbird" })], "thndr", {}, 5);
assert.equal(fuzzy.length, 1, "mostly-consecutive subsequence should match");
console.log("ok   fuzzy precision");

// Menu tree / routes
const tree = Sources.menuTree(readFileSync(`${omarchy}/default/omarchy/omarchy-menu.jsonc`, "utf8"), "{}");
const topLevel = Sources.menuChildren(tree, "root").map((i) => i.label);
assert.equal(JSON.stringify(topLevel.slice(0, 3)), JSON.stringify(["Apps", "Learn", "Trigger"]));
assert.equal(Sources.resolveRoute(tree, "power-menu"), "system");
assert.equal(Sources.resolveRoute(tree, "go"), "root");
assert.equal(Sources.resolveRoute(tree, "settings"), "setup");
assert.equal(Sources.menuPath(tree, "setup.default.browser"), "Setup › Defaults › Browser");
assert.ok(Sources.menuDescendants(tree, "setup").some((i) => i.id === "setup.default.browser.firefox"));
const gs = Sources.guardScript(tree, (s) => `'${s}'`);
assert.ok(gs.includes("printf 'c\\t%s\\n' 'setup.default.browser.firefox'"));
assert.equal(Sources.pickOption("\tLabel\tsub", 0).value, "Label\tsub");
assert.equal(Sources.pickOption("Plain", 1).label, "Plain");
const prov = Sources.providerRows("style.font", "fonts", "A\tA\tB\nB\tB\tB\n", (s) => `'${s}'`);
assert.equal(prov.length, 2); assert.equal(prov[1].isChecked, true); assert.equal(prov[0].action, "omarchy-font-set 'A'");
console.log("ok   menu tree, routes, guards, providers, pickers");
