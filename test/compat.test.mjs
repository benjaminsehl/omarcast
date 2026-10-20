import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadQmlJs } from './helpers.mjs';
const Search = loadQmlJs('../plugin/lib/Search.js');
const Sources = loadQmlJs('../plugin/lib/Sources.js');

test('the installed AppLibrary wrappers are unpacked into searchable apps', () => {
  const source = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
  const start = source.indexOf('  function refreshApps() {');
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start);
  const root = { appRows: [], appLibrary: {
    sortedEntries: () => [{ entry: { id: 'firefox', name: 'Firefox', icon: 'firefox', keywords: ['browser'] } }],
    refreshIcons() {}
  } };
  vm.runInNewContext(source.slice(start, end) + '\nrefreshApps()', { root, Search });
  assert.equal(root.appRows.length, 1);
  assert.equal(root.appRows[0].title, 'Firefox');
  assert.equal(Search.rank(root.appRows, 'fire', {}, 10)[0].appId, 'firefox');
});

test('stock multiple pickers preserve values, selection order and Apply order', () => {
  const options = ['icon\tAlpha\tstable-id', 'Beta', 'Gamma'];
  const selected = ['Gamma', 'Alpha\tstable-id', 'Gamma', 'missing'];
  assert.deepEqual(Array.from(Sources.pickerSelections(options, selected, false)), ['Alpha\tstable-id', 'Gamma']);
  assert.deepEqual(Array.from(Sources.pickerSelections(options, selected, true)), ['Gamma', 'Alpha\tstable-id']);
});

test('multiple choice toggles without dismissing, and Apply returns a JSON array', () => {
  const source = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
  const get = name => {
    const start = source.indexOf('  function ' + name + '(');
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  };
  let result, dismissed = false;
  const root = { pickMultiple: true, pickSelected: ['Alpha'], pickOptions: ['Alpha', 'Beta'],
    pickOnChange: [], rebuild() {}, finishPick: value => { result = value; },
    dismiss: () => { dismissed = true; } };
  const context = vm.createContext({ root, Sources });
  vm.runInContext(get('choosePick') + '\n' + get('applyPicker') + '\nchoosePick("Beta")', context);
  assert.deepEqual(Array.from(root.pickSelected), ['Alpha', 'Beta']);
  assert.equal(dismissed, false);
  vm.runInContext('applyPicker()', context);
  assert.deepEqual(JSON.parse(result), ['Alpha', 'Beta']);
  assert.equal(dismissed, true);
});
