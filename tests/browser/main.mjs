import * as core from '@learning-voca/learning-core';
import contracts from '@learning-voca/contracts';
import fixtures from '../../content/fixtures/grading.json';
import reviewFixture from '../../content/fixtures/review.json';
import { observeCases } from '../grading-cases.mjs';
import { observeSessionCases } from '../session-cases.mjs';

try {
  document.querySelector('#results').textContent = JSON.stringify({
    grading: observeCases(core, contracts, fixtures), session: observeSessionCases(core, contracts, fixtures, reviewFixture),
  });
} catch (error) {
  document.querySelector('#results').textContent = JSON.stringify({ error: String(error) });
}
