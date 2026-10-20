import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadQmlJs } from './helpers.mjs';

const R = loadQmlJs('../plugin/lib/RunningApps.js');
const S = loadQmlJs('../plugin/lib/Sources.js');
const app = { kind: 'app', id: 'app:signal', appId: 'signal.desktop', title: 'Signal', startupClass: 'Signal' };
const win = { kind: 'window', address: '0xabc', appClass: 'Signal', workspaceName: '3', focusOrder: 1 };
const plain = value => JSON.parse(JSON.stringify(value));

const source = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
function qmlFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start, name);
  const firstLine = source.slice(start, source.indexOf('\n', start));
  return firstLine.endsWith('}') ? firstLine : source.slice(start, end);
}
function harness() {
  const calls = [];
  const root = { launchApp: row => calls.push(['launch', row.appId]),
    recordUse() {}, focusWindow: row => calls.push(['focus', row.address]),
    kindLabel: row => row.kind === 'app' ? 'Application' : 'Window' };
  const context = vm.createContext({ root });
  for (const name of ['act', 'actionsFor', 'rowAccessory']) {
    vm.runInContext(qmlFunction(name), context);
    root[name] = context[name];
  }
  return { root, calls };
}

test('desktop ID and StartupWMClass associations are exact and case-insensitive', () => {
  assert.equal(R.matches(app, win), true);
  assert.equal(R.matches({ appId: 'org.example.App.desktop' }, { appClass: 'org.example.App' }), true);
  assert.equal(R.matches({ appId: 'org.example.App' }, { appClass: 'different', desktopId: 'org.example.App.desktop' }), true);
  assert.equal(R.matches(app, { appClass: 'google-chrome', title: 'Signal' }), false);
  assert.equal(R.matches(app, { appClass: 'signal-helper' }), false);
});

test('Chrome browser, app windows and app profiles are never conflated', () => {
  const browser = { appId: 'google-chrome', startupClass: 'google-chrome' };
  const slack = { appId: 'slack-work', startupClass: 'chrome-app.slack.com__client-Work' };
  const work = { appClass: slack.startupClass, desktopId: 'google-chrome' };
  assert.equal(R.matches(slack, work), true);
  assert.equal(R.matches(browser, work), false);
  assert.equal(R.matches(slack, { appClass: 'chrome-app.slack.com__client-Default' }), false);
  assert.equal(R.matches(slack, { appClass: 'google-chrome' }), false);
  assert.equal(R.matches(browser, { appClass: 'crx_other', desktopId: 'google-chrome' }), false);
});

test('the most recently focused window wins; ties are deterministic', () => {
  const recent = { ...win, address: '0xdef', focusOrder: 0 };
  assert.equal(R.findWindow(app, [win, recent]), recent);
  assert.equal(R.findWindow(app, [{ ...win, focusOrder: -1 }, recent]), recent);
  assert.equal(R.findWindow(app, [{ ...recent, focusOrder: 1 }, win]), win);
  assert.equal(R.findWindow(app, [{ ...win, address: 'invalid' }]), null);
});

test('snapshots retain workspace names and MRU order, excluding unmapped clients', () => {
  const rows = S.windowRows(JSON.stringify([
    { address: win.address, class: 'Signal', workspace: { name: '3' }, focusHistoryID: 2, mapped: true },
    { address: '0xdef', class: 'Signal', workspace: { name: '4' }, focusHistoryID: 0, mapped: true },
    { address: '0x111', class: 'Signal', mapped: false },
  ]));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].workspaceName, '4');
  assert.equal(rows[0].focusOrder, 0);
});

test('running annotations do not mutate source rows and disappear after closing', () => {
  const [running] = R.annotate([app], [win], {}, false);
  assert.equal(running.runningWindow, win);
  assert.equal(running.runningLocation, 'Desktop 3');
  assert.equal(app.runningWindow, undefined);
  const [closed] = R.annotate([app], [], {}, false);
  assert.equal(closed.runningWindow, null);
  assert.equal(closed.runningLocation, '');
});

test('adopted desktop labels come from the provider, never the home suffix', () => {
  const parked = { ...win, workspaceName: 'origin-monitor-Other display:9' };
  const labels = { [parked.workspaceName]: 'Desktop 2' };
  assert.equal(R.workspaceLabel(parked, labels, true), 'Desktop 2');
  assert.equal(R.workspaceLabel(parked, {}, true), 'Desktop…');
  assert.equal(R.workspaceLabel({ workspaceName: 'special:scratchpad' }, {}, false), 'Scratchpad');
  assert.equal(R.workspaceLabel({ workspaceName: 'special:scratchpad' }, {}, true), 'Scratchpad');
});

test('label providers accept only bounded JSON string labels and argv arrays', () => {
  assert.deepEqual(plain(R.parseLabels('{"3":"Desktop 3","4":{},"5":12}')), { 3: 'Desktop 3' });
  for (const raw of ['invalid', 'null', '[]', '"x"', ' '.repeat(262145)]) assert.deepEqual(plain(R.parseLabels(raw)), {});
  assert.deepEqual(plain(R.parseLabels('{"__proto__":"Plain text"}')), { ['__proto__']: 'Plain text' });
  assert.deepEqual(plain(R.labelsCommand({ workspaceLabelsCommand: ['labels', '--json'] })), ['labels', '--json']);
  for (const command of ['sh -c unsafe', [], [1], ['']]) assert.deepEqual(plain(R.labelsCommand({ workspaceLabelsCommand: command })), []);
});

test('the actual application primary action switches instead of launching', () => {
  const h = harness();
  const [row] = R.annotate([app], [win], {}, false);
  const actions = h.root.actionsFor(row);
  assert.equal(actions[0].title, 'Switch to → Desktop 3');
  actions[0].run();
  assert.deepEqual(h.calls, [['focus', win.address]]);
  assert.equal(h.root.rowAccessory(row), 'Application · Switch to → Desktop 3');
  assert.equal(actions[2].title, 'Launch Application');
  actions[2].run();
  assert.deepEqual(h.calls[1], ['launch', app.appId]);
});

test('the actual application primary action still launches non-running apps', () => {
  const h = harness();
  const [row] = R.annotate([app], [], {}, false);
  const actions = h.root.actionsFor(row);
  assert.equal(actions[0].title, 'Open Application');
  actions[0].run();
  assert.deepEqual(h.calls, [['launch', app.appId]]);
  assert.equal(h.root.rowAccessory(row), 'Application');
});

test('focus expressions contain no interpolated workspace names or unchecked addresses', () => {
  assert.equal(R.focusExpression('0xabc"; os.execute("bad")'), '');
  const expression = R.focusExpression('0xabc');
  assert.match(expression, /hl.get_window/);
  assert.ok(expression.indexOf('workspace =') < expression.indexOf('window ='));
  assert.ok(expression.includes('w.workspace.name'));
});

// This portable test checks the actual generated Lua without focusing a desktop.
// Skip only if Lua is not installed; the QML/action tests above always run.
let hasLua = false;
try { execFileSync('lua', ['-v'], { stdio: 'ignore' }); hasLua = true; } catch {}
test('Lua resolves moved targets live and a closed target cannot create a workspace', { skip: !hasLua }, () => {
  const expression = R.focusExpression('0xabc');
  execFileSync('lua', ['-'], { input: `
    local target = { workspace = { name = 'moved desktop', special = false } }
    local calls = {}
    hl = { get_window = function(s) assert(s == 'address:0xabc'); return target end,
      dsp = { focus = function(opts) return opts end },
      dispatch = function(opts) calls[#calls+1] = opts end }
    local focus = ${expression}
    focus()
    assert(#calls == 2 and calls[1].workspace == 'name:moved desktop' and calls[2].window == 'address:0xabc')
    target = nil; focus(); assert(#calls == 2)
    target = { workspace = { name = 'special:scratchpad', special = true } }
    focus(); assert(#calls == 3 and calls[3].window == 'address:0xabc')
  ` });
});
