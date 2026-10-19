#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

function load(name) {
  const source = readFileSync(new URL('../plugin/lib/' + name + '.js', import.meta.url), 'utf8')
    .replace(/^\.pragma library\s*$/m, '');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context;
}
const Search = load('Search');
const Sources = load('Sources');
const Calc = load('Calc');
const row = (id, title, kind = 'app', extra = {}) => Search.prepare({ id, title, kind, ...extra });
const ids = rows => Array.from(rows, r => r.id);

// Values captured by running the real Ruby implementation with base_score=0:
// tobi/try be566829856ca6bd22963e38a28ffb5efa24c7de, lib/fuzzy.rb.
const reference = [
  ['Terminal', 't', 1.1111111111111112],
  ['xTerminal', 't', 0.2631578947368421],
  ['Open Terminal', 't', 0.14492753623188404],
  ['terminal', 'tr', 1.6348939119900352],
  ['foo bar', 'fb', 1.1764705882352942],
  ['Thunderbird', 'thndr', 4.363410586648365],
  ['clipboard history', 'ch', 0.3119498674770152],
  ['ab---cd', 'abcd', 3.697478991596639],
  ['foo-bar', 'fb', 1.1764705882352942],
  ['no match', 'xyz', 0]
];
for (const [text, query, expected] of reference) {
  test('try scoring parity: ' + JSON.stringify([text, query]), () => {
    assert.ok(Math.abs(Search.quicksilverScore(text, query) - expected) < 1e-12);
  });
}

test('first character beats later occurrences of the same character', () => {
  const rows = [row('middle', 'xTerminal'), row('word', 'Open Terminal'), row('first', 'Terminal')];
  assert.deepEqual(ids(Search.rank(rows, 't', {}, 10)), ['first', 'middle', 'word']);
});

test('ranking uses try scores, not overriding prefix or initials tiers', () => {
  const rows = [
    row('metadata', 'Browser', 'app', { keywords: ['term'] }),
    row('fuzzy', 'xterminal'), row('initials', 'Turbo Engine Remote Manager'),
    row('word', 'Open Terminal'), row('prefix', 'Terminal'), row('exact', 'term')
  ];
  assert.deepEqual(ids(Search.rank(rows, 'term', {}, 10)),
    ['exact', 'prefix', 'fuzzy', 'word', 'metadata', 'initials']);
});

test('frequent lower-quality matches and kind weights cannot override a name prefix', () => {
  const rows = [row('late', 'xTerminal', 'command', { weight: 100 }), row('first', 'Terminal', 'omarchy-cli')];
  const history = { late: { count: 100000, last: Date.now() } };
  assert.equal(Search.rank(rows, 't', history, 10)[0].id, 'first');
});

test('boundary, proximity, early position and shorter names receive bonuses', () => {
  assert.ok(Search.quicksilverScore('a-b', 'ab') > Search.quicksilverScore('axb', 'ab'));
  assert.ok(Search.quicksilverScore('abxx', 'ab') > Search.quicksilverScore('axxb', 'ab'));
  assert.ok(Search.quicksilverScore('abxxx', 'ab') > Search.quicksilverScore('xxxab', 'ab'));
  assert.ok(Search.quicksilverScore('Terminal', 't') > Search.quicksilverScore('Terminal emulation', 't'));
});

test('matching is case-insensitive, ordered, complete and deterministic', () => {
  assert.equal(Search.quicksilverScore('Terminal', 'TR'), Search.quicksilverScore('terminal', 'tr'));
  assert.equal(Search.quicksilverScore('Terminal', 'tz'), 0);
  assert.equal(Search.quicksilverScore('Terminal', 'rt'), 0);
  assert.equal(Search.quicksilverScore('Terminal', ''), 0);
  const tied = [row('z', 'Terminal'), row('a', 'Terminal')];
  assert.deepEqual(ids(Search.rank(tied, '  TERMINAL  ', {}, 10)), ['a', 'z']);
});

test('metadata is matched per field, never by concatenating unrelated fragments', () => {
  assert.equal(Search.textScore(row('x', 'Browser', 'app', { subtitle: 'tail', keywords: ['scale'] }), 'tailscale'), 0);
});

test('initials and useful sparse abbreviations are retained', () => {
  assert.ok(Search.textScore(row('clip', 'Clipboard History'), 'ch') > 0);
  assert.ok(Search.textScore(row('tb', 'Thunderbird'), 'thndr') > 0);
  const weak = row('weak', 'With desktop + microphone audio');
  const strong = row('strong', 'Theme');
  assert.equal(Search.rank([weak, strong], 'theme', {}, 10)[0].id, 'strong');
});

test('menu breadcrumb matching gives stheme the same score as tobi/try', () => {
  const menu = Sources.menuRows(JSON.stringify({
    style: { label: 'Style' }, 'style.theme': { label: 'Theme', action: 'theme' },
    'style.font': { label: 'Font' }, setup: { label: 'Setup' },
    'setup.default': { label: 'Defaults' }, 'setup.default.browser': { label: 'Browser' }
  }), '{}');
  const cli = [row('cli:hermes', 'omarchy install hermes cli', 'omarchy-cli')];
  const theme = menu.find(row => row.id === 'omarchy:style.theme');
  assert.equal(theme.path, 'Style › Theme');
  // Captured from the actual Ruby Fuzzy implementation, not our JS scorer.
  assert.ok(Math.abs(Search.textScore(theme, 'stheme') - 4.1081809301110965) < 1e-12);
  assert.ok(Math.abs(Search.textScore(cli[0], 'stheme') - 1.2149714883629374) < 1e-12);
  for (const [query, id] of [['stheme', 'omarchy:style.theme'], ['sfont', 'omarchy:style.font'], ['sdbr', 'omarchy:setup.default.browser']]) {
    assert.equal(Search.rank(menu.concat(cli), query, {}, 10)[0].id, id);
  }
  const match = Search.textMatch(theme, 'stheme', false);
  assert.equal(match.field, 'path');
  assert.equal(Search.displayText(theme, 'stheme'), 'Style › Theme');
  const positions = Search.matchPositions(match.text, 'stheme');
  assert.equal(Array.from(positions, at => match.text[at]).join('').toLowerCase(), 'stheme');
});



test('app/fac scopes to Application and fuzzy-matches the application name', () => {
  const rows = [row('action', 'Factorio', 'keybinding'), row('factorio', 'Factorio'),
    row('browser', 'Firefox', 'app', { keywords: ['Factory'] })];
  assert.deepEqual(ids(Search.rank(rows, 'app/fac', {}, 10)), ['factorio']);
  assert.deepEqual(ids(Search.rank(rows, 'APPLICATION/FAC', {}, 10)), ['factorio']);
  assert.deepEqual(ids(Search.rank(rows, 'app/', {}, 10)), ['factorio', 'browser']);
});

test('app/fac exposes both matching spans: [App]lication [Fac]torio', () => {
  const parsed = Search.parseQuery('app/fac');
  assert.equal(parsed.scope, 'app');
  assert.equal(parsed.text, 'fac');
  const marked = (text, query) => Array.from(Search.matchRuns(text, Search.matchPositions(text, query)),
    run => run.matched ? '[' + run.text + ']' : run.text).join('');
  assert.equal(marked('Application', parsed.scope), '[App]lication');
  assert.equal(marked('Factorio', parsed.text), '[Fac]torio');
  assert.equal(marked('Foo—Bar', 'fbar'), '[F]oo—[Bar]');
});

test('slash syntax does not interfere with arithmetic or URLs', () => {
  assert.equal(Search.parseQuery('10/2').scoped, false);
  assert.equal(Search.parseQuery('https://example.com/app/fac').scoped, false);
  assert.equal(Search.parseQuery('/tmp/file').scoped, false);
  assert.equal(Calc.evaluate('10/2').result, '5');
});

test('matched fragments remain plain text, including markup-looking app names', () => {
  const name = '<img src="https://example.com/x"> & Factorio';
  const runs = Search.matchRuns(name, Search.matchPositions(name, 'fac'));
  assert.equal(Array.from(runs, run => run.text).join(''), name);
  const component = readFileSync(new URL('../plugin/MatchText.qml', import.meta.url), 'utf8');
  assert.ok(component.includes('textFormat: Text.PlainText'));
  assert.ok(!component.includes('Text.RichText') && !component.includes('Text.StyledText'));
});

test('scoped root searches return only matching rows, never agent/web fallback cards', () => {
  const source = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
  const start = source.indexOf('  function rootRows() {');
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start);
  const root = { query: 'app/fac', history: {},
    allSearchRows: () => [row('factorio', 'Factorio'), row('action', 'Factorio', 'command')],
    sectioned: rows => rows };
  const result = vm.runInNewContext(source.slice(start, end) + '\nrootRows()', { root, Search });
  assert.deepEqual(ids(result), ['factorio']);
});

