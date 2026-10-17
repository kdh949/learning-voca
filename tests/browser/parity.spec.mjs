import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import * as core from '@learning-voca/learning-core';
import contracts from '@learning-voca/contracts';
import { observeCases } from '../grading-cases.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../../content/fixtures/grading.json', import.meta.url), 'utf8'));

test('실제 Chromium과 Node의 채점·힌트·재연습 결과가 같다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#results')).not.toHaveText('검증 실행 중');
  const browserResults = JSON.parse(await page.locator('#results').textContent());
  const nodeResults = { grading: observeCases(core, contracts, fixtures) };
  expect(browserResults).toEqual(nodeResults);
  expect(errors).toEqual([]);
});
