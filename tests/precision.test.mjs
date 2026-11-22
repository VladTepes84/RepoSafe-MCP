import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSecrets } from '../dist/scanner.js';

// All values are deliberately synthetic, non-live fixtures. These are regression
// metrics on a curated toy corpus, NOT real-world detector precision or recall.
const positives = [
  ['aws_access_key_id', 'AWS_ID=AKIA' + 'A'.repeat(16)],
  ['github_token', 'GITHUB_TOKEN=ghp_' + 'B'.repeat(36)],
  ['openai_key', 'OPENAI_KEY=sk-proj-' + 'C'.repeat(36)],
  ['anthropic_key', 'ANTHROPIC_API_KEY=sk-ant-' + 'D'.repeat(36)],
  ['npm_access_token', 'NPM_TOKEN=npm_' + 'E'.repeat(36)],
  ['slack_token', 'SLACK_TOKEN=xoxb-' + '1234567890'.repeat(4)],
  ['gitlab_token', 'GITLAB_TOKEN=glpat-' + 'F'.repeat(24)],
  ['postgres_connection_password', 'DATABASE_URL=postgresql://app:syntheticPassword123@localhost:5432/db'],
  ['database_uri_password', 'CACHE_URL=redis://app:syntheticPassword123@localhost:6379/0'],
  ['generic_secret_assignment', 'PASSWORD=synthetic_unknown_secret_value_1234'],
];
const negatives = [
  'password=${PASSWORD}',
  'password=change_me_before_deploy',
  'GITHUB_TOKEN=${GITHUB_TOKEN}',
  'OPENAI_KEY=process.env.OPENAI_KEY',
  'NPM_TOKEN=example_token_value',
  'postgresql://localhost:5432/db',
  'Authorization: Bearer placeholder',
  'api_key=your_api_key_here',
  'const environment = { secret: undefined }',
  'Do not paste a real token into this repository.',
];

test('synthetic detector corpus has no expected-rule misses and no benign-fixture alarms', () => {
  let truePositive = 0, falseNegative = 0, falsePositive = 0;
  for (const [expectedRule, line] of positives) {
    const actual = checkSecrets(line, 'synthetic-positive.txt', 1);
    if (actual.some(x => x.rule === expectedRule)) truePositive++;
    else falseNegative++;
    assert.ok(!JSON.stringify(actual).includes(line), 'Matched source text must never be serialized');
  }
  for (const line of negatives) {
    const actual = checkSecrets(line, 'synthetic-benign.txt', 1);
    if (actual.length > 0) falsePositive++;
  }
  assert.equal(falseNegative, 0, 'Known positive fixture was missed');
  assert.equal(falsePositive, 0, 'Benign fixture generated a false alarm');
  assert.equal(truePositive, positives.length);
  // Metrics intentionally limited to labeled synthetic examples, not real-world rates.
  const metrics = {
    scope: 'synthetic-fixtures-only',
    positives: positives.length,
    benign: negatives.length,
    truePositive, falsePositive, falseNegative,
    syntheticPrecision: truePositive / (truePositive + falsePositive),
    syntheticRecall: truePositive / (truePositive + falseNegative),
  };
  assert.equal(metrics.syntheticPrecision, 1);
  assert.equal(metrics.syntheticRecall, 1);
  console.log('RepoSafe detector fixture regression: ' + JSON.stringify(metrics));
});
