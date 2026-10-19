#!/usr/bin/env node
// Opt-in live smoke test; previews never request keyboard focus. No app, menu
// action or shortcut is executed. Scratch picker commands write only to tmpdir.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shell = (...args) => execFileSync('omarchy-shell', ['shell', ...args], { encoding: 'utf8', timeout: 5000 }).trim();
const call = (method, arg = '{}') => shell('call', 'sehl.omarcast', method, arg);
const open = payload => shell('summon', 'omarchy.menu', JSON.stringify({ ...payload, preview: true }));
function waitForFile(path) {
  if (existsSync(path)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { watcher.close(); reject(new Error('Timed out: ' + path)); }, 5000);
    const watcher = watch(join(path, '..'), () => {
      if (existsSync(path)) { clearTimeout(timer); watcher.close(); resolve(); }
    });
    if (existsSync(path)) { clearTimeout(timer); watcher.close(); resolve(); }
  });
}

test('live running apps expose a switch target without activating it', t => {
  try {
    open({ query: 'app/' });
    let row;
    for (const name of ['Signal', 'Slack', 'Google Chrome', 'Firefox', 'Chromium', 'Foot', 'Alacritty', 'Kitty', 'Herdr', 'Obsidian']) {
      const status = JSON.parse(call('status', JSON.stringify({ query: 'app/' + name })));
      row = status.results.find(r => r.title === name && r.running);
      if (row) break;
    }
    if (!row) return t.skip('No recognized running application in this desktop session');
    open({ query: 'app/' + row.title });
    const actual = JSON.parse(call('status')).results.find(r => r.id === row.id);
    assert.equal(actual.running, true);
    assert.ok(actual.location.length > 0);
    assert.equal(actual.accessory, 'Application · Switch to → ' + actual.location);
    const clients = JSON.parse(execFileSync('hyprctl', ['clients', '-j'], { encoding: 'utf8' }));
    assert.ok(clients.some(c => c.address === actual.targetAddress && c.mapped !== false));
  } finally { shell('hide', 'sehl.omarcast'); }
});

test('live clone routes, visible app/fac matches, stock pickers and shortcut action picker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omarcast-test-'));
  let shortcutProcess;
  try {
    call('refresh');
    const plugins = JSON.parse(shell('listPlugins'));
    assert.ok(plugins.some(p => p.id === 'sehl.omarcast'));
    assert.equal(plugins.find(p => p.id === 'omarchy.menu').enabled, false);
    const matches = JSON.parse(call('status', '{"query":"app/fac"}'));
    const example = matches.results.some(row => row.title === 'Factorio') ? 'Factorio'
      : JSON.parse(call('status', '{"query":"app/"}')).results[0].title;
    const term = example === 'Factorio' ? 'fac' : example;
    open({ query: 'app/' + term });
    const status = JSON.parse(call('status'));
    assert.equal(status.opened, true);
    assert.equal(status.results[0].title, example);
    assert.equal(status.results[0].kind, 'app');
    if (example === 'Factorio') assert.deepEqual(status.results[0].titleMatch, [0, 1, 2]);
    else assert.ok(status.results[0].titleMatch.length > 0);
    assert.deepEqual(status.results[0].kindMatch, [0, 1, 2]);
    assert.ok(status.results.every(row => row.kind === 'app' && row.titleMatch.length > 0));
    shell('hide', 'sehl.omarcast');
    open({ query: 'stheme' });
    const theme = JSON.parse(call('status')).results[0];
    assert.equal(theme.id, 'omarchy:style.theme');
    assert.equal(theme.displayTitle, 'Style › Theme');
    assert.ok(Math.abs(theme.score - 4.1081809301110965) < 1e-12);
    assert.equal(theme.titleMatch.map(at => theme.displayTitle[at]).join('').toLowerCase(), 'stheme');
    shell('hide', 'sehl.omarcast');

    open({ menu: 'setup.default' });
    assert.equal(JSON.parse(call('status')).menuRoute, 'setup.default');
    call('popView');
    assert.equal(JSON.parse(call('status')).menuRoute, 'setup');
    call('popView');
    const rootStatus = JSON.parse(call('status'));
    assert.equal(rootStatus.view, 'root');
    assert.equal(rootStatus.menuRoute, 'root');
    assert.equal(rootStatus.opened, true);
    shell('hide', 'sehl.omarcast');

    const cancelledSelection = join(dir, 'cancelled.selection'), cancelledDone = join(dir, 'cancelled.done');
    open({ mode: 'select', prompt: 'Cancel test', options: ['Alpha'], multiple: true,
      selected: ['Alpha'], selectionFile: cancelledSelection, doneFile: cancelledDone });
    call('popView');
    await waitForFile(cancelledDone);
    assert.equal(existsSync(cancelledSelection), false);
    assert.equal(JSON.parse(call('status')).opened, false);

    async function picker(name, payload, action, expected) {
      const selectionFile = join(dir, name + '.selection'), doneFile = join(dir, name + '.done');
      open({ ...payload, selectionFile, doneFile });
      action();
      await waitForFile(doneFile);
      assert.equal(readFileSync(selectionFile, 'utf8').trimEnd(), expected);
    }
    await picker('select', { mode: 'select', prompt: 'Test', options: ['Alpha', 'Beta'] },
      () => call('choosePick', 'Beta'), 'Beta');
    await picker('input', { mode: 'input', prompt: 'Test' },
      () => call('choosePick', 'literal "quotes"; $HOME'), 'literal "quotes"; $HOME');
    await picker('multiple', { mode: 'select', prompt: 'Test', options: ['Alpha', 'Beta'], multiple: true, selected: ['Beta'] },
      () => { call('choosePick', 'Alpha'); call('applyPicker'); }, '["Alpha","Beta"]');

    const changed = join(dir, 'changed.json');
    const done = join(dir, 'immediate.done');
    open({ mode: 'select', prompt: 'Test', options: ['Alpha', 'Beta'], multiple: true, selected: ['Alpha'],
      selectionFile: join(dir, 'immediate.selection'), doneFile: done,
      onChange: [process.execPath, '-e', 'require("node:fs").writeFileSync(process.argv[1],process.argv[2]);console.log(process.argv[2])', changed] });
    call('choosePick', 'Beta');
    await waitForFile(changed);
    assert.deepEqual(JSON.parse(readFileSync(changed, 'utf8')), ['Alpha', 'Beta']);
    shell('hide', 'sehl.omarcast');
    await waitForFile(done);

    const failed = join(dir, 'failed'), failureDone = join(dir, 'failure.done');
    open({ mode: 'select', prompt: 'Test rollback', options: ['Alpha', 'Beta'], multiple: true, selected: ['Alpha'],
      selectionFile: join(dir, 'failure.selection'), doneFile: failureDone,
      onChange: [process.execPath, '-e', 'require("node:fs").writeFileSync(process.argv[1],"failed");process.exit(1)', failed] });
    call('choosePick', 'Beta');
    await waitForFile(failed);
    await new Promise(resolve => setTimeout(resolve, 100)); // let the compositor consume process exit
    assert.deepEqual(JSON.parse(call('status')).picker.selected, ['Alpha']);
    shell('hide', 'sehl.omarcast');
    await waitForFile(failureDone);

    // Run the actual Super+K command, adding only preview:true to its picker
    // transport so this test cannot steal the operator's keyboard focus.
    const bin = join(dir, 'bin'), ready = join(dir, 'shortcuts.ready');
    mkdirSync(bin);
    const real = execFileSync('bash', ['-c', 'command -v omarchy-shell'], { encoding: 'utf8' }).trim();
    writeFileSync(join(bin, 'omarchy-shell'), `#!${process.execPath}\n` +
      `const fs=require('node:fs'),cp=require('node:child_process');const a=process.argv.slice(2);` +
      `if(a[0]==='shell'&&a[1]==='summon'&&a[2]==='omarchy.menu'){a[3]=JSON.stringify({...JSON.parse(a[3]),preview:true});` +
      `cp.execFileSync(${JSON.stringify(real)},a);fs.writeFileSync(${JSON.stringify(ready)},a[3]);}` +
      `else cp.execFileSync(${JSON.stringify(real)},a,{stdio:'inherit'});\n`, { mode: 0o755 });
    shortcutProcess = spawn('omarchy-menu-keybindings', [], { env: { ...process.env, PATH: bin + ':' + process.env.PATH }, stdio: 'ignore' });
    const exited = once(shortcutProcess, 'exit');
    await waitForFile(ready);
    const payload = JSON.parse(readFileSync(ready, 'utf8'));
    assert.ok(payload.options.length > 200);
    assert.equal(JSON.parse(call('status')).view, 'pick');
    shell('hide', 'sehl.omarcast'); // cancel; never dispatch a real shortcut
    await Promise.race([exited, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Shortcut picker did not cancel')), 5000);
      timer.unref();
    })]);
    assert.equal(JSON.parse(call('status')).opened, false);
    console.log('Live app/fac, stheme, pill navigation, picker cancellation/contracts and Super+K picker passed.');
  } finally {
    shell('hide', 'sehl.omarcast');
    if (shortcutProcess && shortcutProcess.exitCode === null) shortcutProcess.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
