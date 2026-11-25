import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

// 1. Verify all 4 distinct design systems exist in platform.css
const css = fs.readFileSync(path.join(srcDir, 'styles', 'platform.css'), 'utf8');
assert.ok(css.includes('.theme-child'), 'Missing Child World design system (.theme-child)');
assert.ok(css.includes('.theme-parent'), 'Missing Parent Portal design system (.theme-parent)');
assert.ok(css.includes('.theme-admin'), 'Missing Enterprise Admin design system (.theme-admin)');
assert.ok(css.includes('.studio-ide'), 'Missing Game Studio IDE design system (.studio-ide)');

// 2. Verify Child View enforces isolated sandboxed iframe and never renders raw game source files
const childJs = fs.readFileSync(path.join(srcDir, 'views', 'childView.js'), 'utf8');
assert.ok(childJs.includes('sandbox="allow-scripts"'), 'Child game iframe must enforce sandbox="allow-scripts"');
assert.ok(childJs.includes('/play-bundle'), 'Child game player must load compiled play-bundle');
assert.ok(!childJs.includes('/api/v1/game-studio'), 'Child view must never call game-studio endpoints');

// 3. Verify Admin View includes all 17 required Admin navigation sections & Game Studio + Storybook Studio
const adminJs = fs.readFileSync(path.join(srcDir, 'views', 'adminView.js'), 'utf8');
for (const section of [
  'overview',
  'game-studio',
  'games-library',
  'storybook-studio',
  'books-library',
  'cartoon-studio',
  'video-library',
  'learning-center',
  'categories',
  'languages',
  'users',
  'parents',
  'children',
  'rewards',
  'reports',
  'analytics',
  'settings',
]) {
  assert.ok(adminJs.includes(`'${section}'`), `Missing Admin section: ${section}`);
}

console.log('✓ All frontend architecture, security sandbox, and 4-design-system checks passed!');
