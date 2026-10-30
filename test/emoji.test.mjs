import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadQmlJs } from './helpers.mjs';
const Emoji = loadQmlJs('../plugin/lib/Emoji.js');
const data = JSON.parse(readFileSync(new URL('../plugin/data/emojis.json', import.meta.url)));
const entries = Emoji.prepare(data);
const search = q => Emoji.search(entries, q, {});

test('complete bundled Unicode catalog, including sequences and newest emoji', () => {
  assert.ok(entries.length >= 3900);
  assert.equal(new Set(entries.map(e => e.emoji)).size, entries.length);
  assert.equal(search('').length, entries.length, 'browsing is not capped at 150');
  for (const label of ['fingerprint', 'face with bags under eyes', 'harp', 'flag: Japan']) {
    assert.equal(search(label)[0].title, label);
  }
  assert.ok(data.some(e => e.group === 'flags'));
  assert.ok(data.some(e => e.group === 'symbols'));
});

test('intent, CLDR/community keywords, GitHub and CLDR shortcodes', () => {
  for (const [q, expected] of [
    ['thumbsup', '👍'], [':+1:', '👍'], ['+1', '👍'], ['-1', '👎'], [':-1:', '👎'],
    ['tada', '🎉'], ['congratulations', '🎉'], ['thank you', '🙏'],
    ['ship', '🚢'], ['rofl', '🤣'], ['mind_blown', '🤯'],
    ['melting face', '🫠'], ['flag japan', '🇯🇵'], ['rocket', '🚀'],
    ['👍🏽', '👍🏽']
  ]) {
    assert.ok(search(q).slice(0, 5).some(r => r.emoji === expected), q);
  }
});

test('typos, token order, colon shortcodes, diacritics, skin tones', () => {
  assert.equal(search('rocekt')[0].emoji, '🚀');
  assert.equal(search(':rocket:')[0].emoji, '🚀');
  assert.equal(search('café')[0].emoji, '☕');
  assert.ok(search('dark medium thumbs up').some(r => r.emoji === '👍🏾'));
  assert.equal(search('thumbs up')[0].emoji, '👍');
  assert.ok(search('family').some(r => r.emoji.includes('\u200d')));
  assert.equal(search('notawordxyz').length, 0);
});

test('usage orders empty-query recents, relevance still wins, stable IDs', () => {
  const history = { 'emoji:1F680': { count: 2, last: Date.now() } };
  const browse = Emoji.search(entries, '', history);
  assert.equal(browse[0].emoji, '🚀');
  assert.equal(browse[0]._section, 'Recently used');
  assert.equal(Emoji.search(entries, 'thumbs up', history)[0].emoji, '👍');
  assert.ok(browse.every(r => r.id.startsWith('emoji:')));
});

test('UI reads bundled data and safely uses existing paste/copy actions', () => {
  const qml = readFileSync(new URL('../plugin/Omarcast.qml', import.meta.url), 'utf8');
  assert.ok(qml.includes('Qt.resolvedUrl("data/emojis.json")'));
  assert.ok(!qml.includes('/shell/plugins/emojis/emojis.json'));
  assert.ok(qml.includes('root.recordUse(row.id); root.paste(row.emoji)'));
  assert.ok(qml.includes('root.recordUse(row.id); root.copy(row.emoji)'));
});
