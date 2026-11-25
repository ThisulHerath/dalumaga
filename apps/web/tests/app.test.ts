import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App.js';
test('office screen exposes the API check', () => {
  assert.match(renderToStaticMarkup(createElement(App)), /Check API connection/);
});
