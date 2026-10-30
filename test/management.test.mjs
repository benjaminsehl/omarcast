import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadQmlJs } from './helpers.mjs';
const Search = loadQmlJs('../plugin/lib/Search.js');
const make = (kind, route) => Search.prepare({ id: kind === 'app' ? 'app:test' : 'omarchy:' + route,
  kind, route, title: 'Browser', path: route.replaceAll('.', ' › ') });

test('ordinary search ranks use above install above remove, despite removal history', () => {
  const rows = [make('omarchy', 'remove.browser'), make('omarchy', 'install.browser'), make('app', '')];
  const history = { 'omarchy:remove.browser': { count: 10000, last: Date.now() } };
  assert.deepEqual(Array.from(Search.rank(rows, 'browser', history, 10), r => r.id),
    ['app:test', 'omarchy:install.browser', 'omarchy:remove.browser']);
  assert.equal(Search.defaultBias(rows[0], 'browser'), 0.2);
  assert.equal(Search.defaultBias(rows[1], 'browser'), 0.55);
});

test('explicit intent restores normal category ranking and no items are hidden', () => {
  for (const category of ['install', 'remove']) {
    const row = make('omarchy', category + '.browser');
    assert.equal(Search.defaultBias(row, category + ' browser'), 1);
    assert.equal(Search.rank([row], category + ' browser', {}, 10).length, 1);
    assert.equal(Search.rank([row], 'menu/browser', {}, 10).length, 0); // action is not a submenu
    assert.equal(Search.rank([row], 'omarchy/browser', {}, 10).length, 1);
  }
});

test('management classification uses identity, covers categories and nested CLI routes', () => {
  for (const category of ['install', 'remove']) {
    for (const kind of ['omarchy', 'omarchy-menu']) {
      assert.equal(Search.managementKind(make(kind, category)), category);
      assert.equal(Search.managementKind(make(kind, category + '.development.bun')), category);
    }
    assert.equal(Search.managementKind({ kind: 'omarchy-cli', command: 'omarchy pkg ' + category }), category);
    assert.equal(Search.managementKind({ kind: 'omarchy-cli', title: 'omarchy ' + category + ' browser' }), category);
  }
  assert.equal(Search.managementKind({ kind: 'app', title: 'Remove Background', route: 'remove' }), '');
  assert.equal(Search.managementKind({ kind: 'omarchy', route: 'setup.browser', title: 'Install browser' }), '');
  assert.equal(Search.managementKind({ kind: 'omarchy', route: 'remover.browser' }), '');
});

test('removal red persists through selection and match highlights, text stays plain', () => {
  const qml = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
  assert.ok(qml.includes('readonly property bool isRemoval: Search.managementKind(row) === "remove"'));
  assert.ok(qml.includes('readonly property color textColor: isRemoval ? Commons.Color.urgent : hasCursor'));
  assert.ok(qml.includes('readonly property color highlightColor: isRemoval ? Commons.Color.urgent : hasCursor'));
  assert.ok(qml.includes('color: rowItem.textColor'));
  assert.ok(qml.includes('matchColor: rowItem.highlightColor'));
});
