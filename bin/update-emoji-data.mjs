#!/usr/bin/env node
// Explicit maintainer action only. The picker never downloads anything at runtime.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const version = '18.0.0';
const base = `https://cdn.jsdelivr.net/npm/emojibase-data@${version}/`;
const files = ['en/data.json', 'en/shortcodes/cldr.json', 'en/shortcodes/github.json', 'meta/groups.json', 'LICENSE'];
const sources = [];
async function get(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 4000000) throw new Error('Oversized emoji source');
  sources.push({ url: base + path, sha256: createHash('sha256').update(text).digest('hex') });
  return path === 'LICENSE' ? text : JSON.parse(text);
}
const [data, cldr, github, groups, license] = await Promise.all(files.map(get));
const rows = [], seen = new Set();
function add(entry, parent) {
  if (!entry.emoji || !entry.hexcode || !entry.label) throw new Error('Invalid emoji entry');
  // Standalone regional indicators are not RGI emoji; composed flags are included.
  if (entry.group === undefined || seen.has(entry.hexcode)) return;
  seen.add(entry.hexcode);
  const aliases = [...new Set([cldr[entry.hexcode] || [], github[entry.hexcode] || []].flat())];
  rows.push({ id: entry.hexcode, emoji: entry.emoji, label: entry.label,
    group: groups.groups[entry.group].replaceAll('-', ' '),
    subgroup: groups.subgroups[entry.subgroup].replaceAll('-', ' '),
    tags: [...new Set([...(parent?.tags || []), ...(entry.tags || []), ...(entry.emoticon ? [entry.emoticon] : [])])],
    aliases, order: entry.order, tone: entry.tone || 0 });
  for (const skin of entry.skins || []) add(skin, entry);
}
for (const entry of data) add(entry);
rows.sort((a, b) => a.order - b.order);
if (rows.length < 3900 || rows.length > 6000) throw new Error(`Unexpected emoji count: ${rows.length}`);
const dir = new URL('../plugin/data/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('emojis.json', dir), JSON.stringify(rows) + '\n');
await writeFile(new URL('emoji-sources.json', dir), JSON.stringify({ package: 'emojibase-data', version,
  description: 'English Unicode/CLDR labels, community tags, CLDR and GitHub shortcodes; all skin-tone sequences.',
  count: rows.length, sources: sources.sort((a, b) => a.url.localeCompare(b.url)) }, null, 2) + '\n');
await writeFile(new URL('../EMOJIBASE-LICENSE', dir), license);
console.log(`Bundled ${rows.length} emoji from emojibase-data ${version}`);
