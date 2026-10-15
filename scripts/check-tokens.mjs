import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const tokens = JSON.parse(readFileSync('design/tokens/foundry.json', 'utf8'));
const css = readFileSync('app/globals.css', 'utf8');
for (const [name, token] of Object.entries(tokens.color)) {
  const property = ['background', 'foreground'].includes(name) ? name : `color-${name}`;
  assert.ok(css.includes(`--${property}: ${token.value};`), `${property} differs from existing portal CSS; review the design baseline`);
}
console.log('Token colors match the existing portal.');
