import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App.js';
test('office screen labels the sample comparison', () => {
  assert.match(renderToStaticMarkup(createElement(App)), /Sample weight comparison/);
});
