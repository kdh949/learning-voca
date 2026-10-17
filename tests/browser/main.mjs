import * as core from '@learning-voca/learning-core';
import contracts from '@learning-voca/contracts';
import fixtures from '../../content/fixtures/grading.json';
import { observeCases } from '../grading-cases.mjs';

try {
  document.querySelector('#results').textContent = JSON.stringify({
    grading: observeCases(core, contracts, fixtures),
  });
} catch (error) {
  document.querySelector('#results').textContent = JSON.stringify({ error: String(error) });
}
