import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the actual QML navigation functions and key handler, not a duplicate
// implementation. Native TextInput editing is represented by an unaccepted key.
const source = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
function qmlFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}
const keyStart = source.indexOf('Keys.onPressed: function(event) {') + 'Keys.onPressed: '.length;
const keyEnd = source.indexOf('\n            }\n          }', keyStart) + '\n            }'.length;
assert.ok(keyStart >= 0 && keyEnd > keyStart);

function harness({ view = 'menu', menuRoute = 'setup.default.browser', text = '' } = {}) {
  let focused = 0, cancelled;
  const Qt = { Key_Backspace: 16777219, ControlModifier: 1, AltModifier: 2, MetaModifier: 4,
    callLater: fn => fn() };
  const input = { text, cursorPosition: text.length, selectionStart: text.length,
    selectionEnd: text.length, preeditText: '', forceActiveFocus: () => { focused++; } };
  const root = { view, menuRoute, query: text, opened: true, actionsOpen: false, shell: null,
    menuTree: { items: {
      'setup.default.browser': { parent: 'setup.default' },
      'setup.default': { parent: 'setup' }, setup: { parent: 'root' }
    } }, rebuild() {}, loadProvider() {},
    finishPick: value => { cancelled = value; },
    choosePick() { throw new Error('Going back must cancel, not toggle a selection'); } };
  const context = vm.createContext({ root, input, Qt, filesDebounce: { restart() {} } });
  for (const name of ['openMenu', 'setQuery', 'dismiss', 'popView', 'backspacePill']) {
    vm.runInContext(qmlFunction(name), context);
    root[name] = context[name];
  }
  const handler = vm.runInContext('(' + source.slice(keyStart, keyEnd) + ')', context);
  return { root, input, Qt, focused: () => focused, cancelled: () => cancelled,
    press(extra = {}) {
      const event = { key: Qt.Key_Backspace, modifiers: 0, isAutoRepeat: false, accepted: false, ...extra };
      handler(event);
      return event;
    } };
}

test('empty-search Backspace removes one submenu level per fresh press', () => {
  const h = harness();
  assert.equal(h.press().accepted, true);
  assert.equal(h.root.menuRoute, 'setup.default');
  assert.equal(h.root.view, 'menu');
  assert.equal(h.press().accepted, true);
  assert.equal(h.root.menuRoute, 'setup');
  assert.equal(h.press().accepted, true);
  assert.equal(h.root.view, 'root');
  assert.equal(h.root.menuRoute, 'root');
  assert.equal(h.root.opened, true);
  assert.equal(h.focused(), 3);
  assert.equal(h.press().accepted, false); // no pill left; do not dismiss
});

test('Backspace at the beginning removes the pill while preserving search text', () => {
  const h = harness({ text: 'firefox' });
  h.input.cursorPosition = h.input.selectionStart = h.input.selectionEnd = 0;
  assert.equal(h.press().accepted, true);
  assert.equal(h.root.menuRoute, 'setup.default');
  assert.equal(h.root.query, 'firefox');
  assert.equal(h.input.text, 'firefox');
  assert.equal(h.input.cursorPosition, 0);
});

test('ordinary character deletion is left to TextInput, including the last character', () => {
  const h = harness({ text: 'x' });
  assert.equal(h.press().accepted, false);
  assert.equal(h.root.menuRoute, 'setup.default.browser');
  h.input.text = h.root.query = '';
  h.input.cursorPosition = h.input.selectionStart = h.input.selectionEnd = 0;
  assert.equal(h.press().accepted, true); // next fresh press removes the pill
});

test('selected text is deleted normally instead of removing the pill', () => {
  const h = harness({ text: 'selected' });
  h.input.cursorPosition = h.input.selectionStart = 0;
  assert.equal(h.press().accepted, false);
  assert.equal(h.root.menuRoute, 'setup.default.browser');
});

for (const [name, modifiers] of [['Control', 1], ['Alt', 2], ['Meta', 4]]) {
  test(name + '+Backspace does not remove a pill', () => {
    const h = harness();
    assert.equal(h.press({ modifiers }).accepted, false);
    assert.equal(h.root.menuRoute, 'setup.default.browser');
  });
}

test('IME preedit is left to TextInput', () => {
  const h = harness();
  h.input.preeditText = 'に';
  assert.equal(h.press().accepted, false);
  assert.equal(h.root.menuRoute, 'setup.default.browser');
});

test('holding Backspace to clear text does not eat the remaining pills', () => {
  const h = harness();
  assert.equal(h.press({ isAutoRepeat: true }).accepted, false);
  assert.equal(h.root.menuRoute, 'setup.default.browser');
  assert.equal(h.press().accepted, true);
  assert.equal(h.root.menuRoute, 'setup.default');
  assert.equal(h.press({ isAutoRepeat: true }).accepted, false);
  assert.equal(h.root.menuRoute, 'setup.default');
});

test('command-view pills can be removed and return focus to search', () => {
  const h = harness({ view: 'clipboard', menuRoute: 'root' });
  assert.equal(h.press().accepted, true);
  assert.equal(h.root.view, 'root');
  assert.equal(h.focused(), 1);
});

test('a picker pill cancels without choosing or toggling a multi-selection', () => {
  const h = harness({ view: 'pick' });
  h.root.pickMultiple = true;
  assert.equal(h.press().accepted, true);
  assert.equal(h.cancelled(), null);
  assert.equal(h.root.opened, false);
  assert.equal(h.focused(), 0);
});

test('clicking a pill uses the same parent navigation and restores input focus', () => {
  const h = harness();
  h.root.popView();
  assert.equal(h.root.menuRoute, 'setup.default');
  assert.equal(h.focused(), 1);
});
