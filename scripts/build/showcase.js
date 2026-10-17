#!/usr/bin/env node
/**
 * Compose the README visuals in docs/assets/ from the generated maps in dist/:
 *   hero.svg            banner: country → governorates → delegations → sectors
 *   lod-comparison.svg  the same coastline (Djerba) at every level of detail
 *   modes.svg           the eight modes side by side
 *
 *   node scripts/build/showcase.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, writeFile, escapeXML } from './lib.js';
import { project, FRAME } from '../../src/projection.js';
import catalog from '../../src/catalog.js';

const OUT = path.join(ROOT, 'docs/assets');
const read = (p, lod, mode) => fs.readFileSync(path.join(ROOT, 'dist/svg', p, `tunisia-${p}-${lod}-${mode}.svg`), 'utf8');
const count = (id) => catalog.partitions.find((p) => p.id === id).count;
const fmt = (n) => n.toLocaleString('en-US');

/** Inner markup of a generated map: its <style>, unit group, borders, outline and labels (titles stripped). */
function inner(svg, { keepStyle = true } = {}) {
  const body = svg.slice(svg.indexOf('<style>'), svg.lastIndexOf('</svg>'));
  let s = body.replace(/<title>[^<]*<\/title>/g, '').replace(/ data-[a-z0-9-]+="[^"]*"/g, '');
  if (!keepStyle) s = s.replace(/<style>[\s\S]*?<\/style>/, '');
  return s;
}

/** Scope a map's CSS to a wrapper id so several modes can live in one document. */
function scoped(svg, scope) {
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  const css = style
    .split('}')
    .filter((r) => r.trim())
    .map((rule) => {
      const [sel, decl] = rule.split('{');
      return `${sel.split(',').map((s) => (s.trim() === 'svg' ? `#${scope}` : `#${scope} ${s.trim()}`)).join(',')}{${decl}}`;
    })
    .join('');
  return { css, body: inner(svg, { keepStyle: false }) };
}

// ------------------------------------------------------------------ hero
{
  const W = 1600, H = 620, mapH = 520, mapW = (mapH * FRAME.width) / FRAME.height, gap = 18;
  const maps = [
    { p: 'country', lod: 'low', mode: 'plain', caption: 'Country' },
    { p: 'governorates', lod: 'low', mode: 'light', caption: `${count('governorates')} governorates` },
    { p: 'delegations', lod: 'low', mode: 'light', caption: `${count('delegations')} delegations` },
    { p: 'sectors', lod: 'low', mode: 'light', caption: `${fmt(count('sectors'))} sectors (imadas)` },
  ];
  const x0 = W - 40 - maps.length * mapW - (maps.length - 1) * gap;
  let css = '', panels = '';
  maps.forEach((m, i) => {
    const id = `hero-${i}`;
    const s = scoped(read(m.p, m.lod, m.mode), id);
    css += s.css;
    const x = x0 + i * (mapW + gap);
    panels += `<svg id="${id}" x="${x.toFixed(1)}" y="34" width="${mapW.toFixed(1)}" height="${mapH}" viewBox="0 0 ${FRAME.width} ${FRAME.height}">${s.body}</svg>`;
    panels += `<text x="${(x + mapW / 2).toFixed(1)}" y="${34 + mapH + 34}" class="cap">${escapeXML(m.caption)}</text>`;
  });
  css += '#hero-0 .unit{fill:#e2e8f0;stroke:#e2e8f0}';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">Map Tunisia — accurate open-source SVG maps of Tunisia, from the country outline down to 2,083 imadas</title>
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#16243f"/></linearGradient>
<radialGradient id="glow" cx=".78" cy=".35" r=".6"><stop offset="0" stop-color="#2a5a8c" stop-opacity=".45"/><stop offset="1" stop-color="#0b1220" stop-opacity="0"/></radialGradient></defs>
<style>.t{font-family:'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif}.cap{font:600 19px 'Inter','Segoe UI',Arial,sans-serif;fill:#94a3b8;text-anchor:middle}${css}</style>
<rect width="${W}" height="${H}" rx="28" fill="url(#bg)"/><rect width="${W}" height="${H}" rx="28" fill="url(#glow)"/>
<g class="t">
<text x="64" y="150" font-size="76" font-weight="800" fill="#f8fafc" letter-spacing="-1.5">Map Tunisia</text>
<text x="66" y="212" font-size="40" font-weight="700" fill="#8ecae6" font-family="'Noto Naskh Arabic','Segoe UI',Tahoma,sans-serif">خريطة تونس</text>
<text x="66" y="282" font-size="25" fill="#cbd5e1">The most accurate open-source</text>
<text x="66" y="316" font-size="25" fill="#cbd5e1">SVG maps of Tunisia.</text>
<g font-size="19" fill="#94a3b8">
<text x="66" y="380">6 nested partitions · 5 levels of detail · 8 modes</text>
<text x="66" y="410">${count('delegations')} delegations · ${fmt(count('sectors'))} imadas · zero gaps</text>
<text x="66" y="440">SVG · GeoJSON · TopoJSON · Arabic · French · English</text>
</g>
<text x="66" y="548" font-size="16" fill="#64748b">Map data © OpenStreetMap contributors (ODbL)</text>
<text x="66" y="574" font-size="16" fill="#64748b">Created by Alaa Taieb</text>
</g>
${panels}
</svg>
`;
  writeFile(path.join(OUT, 'hero.svg'), svg);
  console.log(`hero.svg ${(svg.length / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------ LOD comparison (Djerba)
{
  const [ax, ay] = project([10.62, 33.98]);
  const [bx, by] = project([11.12, 33.58]);
  const crop = { x: ax, y: ay, w: bx - ax, h: by - ay };
  const panel = 300, gap = 16, top = 16, W = 5 * panel + 4 * gap, H = panel + 70;
  const lods = catalog.lods;
  let out = '';
  lods.forEach((lod, i) => {
    const svg = read('governorates', lod.id, 'plain');
    const paths = [...svg.matchAll(/<path id="(TN-8[12])"[^>]* d="([^"]+)"/g)].map((m) => `<path d="${m[2]}"/>`).join('');
    const x = i * (panel + gap);
    out += `<svg x="${x}" y="${top}" width="${panel}" height="${panel}" viewBox="${crop.x.toFixed(2)} ${crop.y.toFixed(2)} ${crop.w.toFixed(2)} ${crop.h.toFixed(2)}" preserveAspectRatio="xMidYMid slice">`;
    out += `<rect x="${crop.x - 50}" y="${crop.y - 50}" width="${crop.w + 100}" height="${crop.h + 100}" fill="#dbeafe"/><g fill="#f8fafc" stroke="#475569" stroke-width="0.16" stroke-linejoin="round" fill-rule="evenodd">${paths}</g></svg>`;
    out += `<rect x="${x + 0.5}" y="${top + 0.5}" width="${panel - 1}" height="${panel - 1}" rx="10" fill="none" stroke="#cbd5e1"/>`;
    const tol = lod.toleranceMeters ? `≈ ${lod.toleranceMeters >= 1000 ? `${lod.toleranceMeters / 1000} km` : `${lod.toleranceMeters} m`}` : 'original';
    out += `<text x="${x + panel / 2}" y="${top + panel + 30}" class="h">${lod.id}</text><text x="${x + panel / 2}" y="${top + panel + 52}" class="s">${tol}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t"><title id="t">Djerba at the five levels of detail</title>
<style>.h{font:700 20px 'Inter','Segoe UI',Arial,sans-serif;fill:#1e293b;text-anchor:middle}.s{font:15px 'Inter','Segoe UI',Arial,sans-serif;fill:#64748b;text-anchor:middle}</style>${out}</svg>\n`;
  writeFile(path.join(OUT, 'lod-comparison.svg'), svg);
  console.log(`lod-comparison.svg ${(svg.length / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------ partitions
{
  const parts = [
    ['country', 'Country', '1'], ['regions', 'Regions', '7'], ['districts', 'Districts', '5'],
    ['governorates', 'Governorates', '24'], ['delegations', 'Delegations', fmt(count('delegations'))], ['sectors', 'Sectors', fmt(count('sectors'))],
  ];
  const mapH = 420, mapW = (mapH * FRAME.width) / FRAME.height, gap = 26;
  const W = parts.length * mapW + (parts.length - 1) * gap, H = mapH + 78;
  let css = '', body = '';
  parts.forEach(([p, title, n], i) => {
    const id = `p-${p}`;
    const s = scoped(read(p, 'low', p === 'country' ? 'plain' : 'light'), id);
    css += s.css;
    const x = i * (mapW + gap);
    body += `<svg id="${id}" x="${x.toFixed(1)}" y="0" width="${mapW.toFixed(1)}" height="${mapH}" viewBox="0 0 ${FRAME.width} ${FRAME.height}">${s.body}</svg>`;
    body += `<text x="${(x + mapW / 2).toFixed(1)}" y="${mapH + 34}" class="h">${title}</text><text x="${(x + mapW / 2).toFixed(1)}" y="${mapH + 62}" class="s">${n} unit${n === '1' ? '' : 's'}</text>`;
  });
  css += '#p-country .unit{fill:#8ecae6}';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H}" width="${W.toFixed(0)}" height="${H}" role="img" aria-labelledby="t"><title id="t">The six nested partitions of Map Tunisia</title>
<style>.h{font:700 21px 'Inter','Segoe UI',Arial,sans-serif;fill:#334155;text-anchor:middle}.s{font:17px 'Inter','Segoe UI',Arial,sans-serif;fill:#64748b;text-anchor:middle}${css}</style>${body}</svg>\n`;
  writeFile(path.join(OUT, 'partitions.svg'), svg);
  console.log(`partitions.svg ${(svg.length / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------ modes
{
  const modes = ['plain', 'outline', 'light', 'dark', 'labeled', 'labeled-ar', 'nested', 'interactive'];
  const mapH = 420, mapW = (mapH * FRAME.width) / FRAME.height, gap = 22, cols = 8;
  const W = cols * mapW + (cols - 1) * gap, H = mapH + 50;
  let css = '', body = '';
  modes.forEach((mode, i) => {
    const id = `m-${mode}`;
    const s = scoped(read('governorates', 'low', mode), id);
    css += s.css;
    const x = i * (mapW + gap);
    body += `<svg id="${id}" x="${x.toFixed(1)}" y="0" width="${mapW.toFixed(1)}" height="${mapH}" viewBox="0 0 ${FRAME.width} ${FRAME.height}">${s.body}</svg>`;
    body += `<text x="${(x + mapW / 2).toFixed(1)}" y="${mapH + 34}" class="h">${mode}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H}" width="${W.toFixed(0)}" height="${H}" role="img" aria-labelledby="t"><title id="t">The eight modes of Map Tunisia</title>
<style>.h{font:700 19px 'Inter','Segoe UI',Arial,sans-serif;fill:#475569;text-anchor:middle}${css}</style>${body}</svg>\n`;
  writeFile(path.join(OUT, 'modes.svg'), svg);
  console.log(`modes.svg ${(svg.length / 1024).toFixed(0)} KB`);
}
