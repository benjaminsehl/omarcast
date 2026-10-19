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

test('real Omarchy menu, CLI and calculator still load', () => {
  const dir = process.env.OMARCHY_PATH || '/usr/share/omarchy';
  const menu = Sources.menuRows(readFileSync(dir + '/default/omarchy/omarchy-menu.jsonc', 'utf8'), '{}');
  const cli = Sources.cliRows(execFileSync('omarchy', ['commands', '--json'], { encoding: 'utf8' }));
  assert.ok(menu.length > 100);
  assert.ok(cli.length > 100);
  const rows = menu.concat(cli).map(Search.prepare);
  assert.equal(Search.rank(rows, 'theme', {}, 10)[0].title, 'Theme');
  const first = Search.rank(rows, 'stheme', {}, 10)[0];
  assert.equal(first.id, 'omarchy:style.theme');
  assert.equal(Search.displayText(first, 'stheme'), 'Style › Theme');
  assert.equal(Calc.evaluate('1+1').result, '2');
});
