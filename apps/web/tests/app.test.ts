import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App.js';
test('office screen has accessible sign in labels', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /Username/);
  assert.match(html, /Password/);
});
