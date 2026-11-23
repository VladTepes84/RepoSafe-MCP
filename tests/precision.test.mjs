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

// Expanded *synthetic-only* matrix: these cases are intentionally constructed
// from documented detector shapes. They do not measure field precision/recall,
// credential validity or whether a known public sample should be triaged.
const detectorCases = [
  ['private_key_block', '-----BEGIN OPENSSH PRIVATE KEY-----'],
  ['aws_access_key_id', 'AWS_ID=AKIA' + 'A'.repeat(16)],
  ['github_token', 'GITHUB_TOKEN=ghp_' + 'B'.repeat(36)],
  ['openai_key', 'OPENAI_API_KEY=sk-proj-' + 'C'.repeat(36)],
  ['anthropic_key', 'ANTHROPIC_API_KEY=sk-ant-' + 'D'.repeat(36)],
  ['stripe_secret', 'STRIPE_SECRET=sk_live_' + 'S'.repeat(32)],
  ['google_api_key', 'GOOGLE_API_KEY=AIza' + 'G'.repeat(35)],
  ['slack_token', 'SLACK_TOKEN=xoxb-' + '1234567890'.repeat(4)],
  ['sendgrid_api_key', 'SENDGRID_API_KEY=SG.' + 'S'.repeat(22) + '.' + 'G'.repeat(43)],
  ['npm_access_token', 'NPM_TOKEN=npm_' + 'N'.repeat(36)],
  ['jwt_token', 'JWT=' + [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 'fixture-subject', scope: 'test' })).toString('base64url'),
    'aB7cD2eF4gH6iJ8kL0mN3pQ5rS7tV9wX1yZ2',
  ].join('.')],
  ['gitlab_token', 'GITLAB_TOKEN=glpat-' + 'F'.repeat(24)],
  ['huggingface_token', 'HF_TOKEN=hf_' + 'H'.repeat(38)],
  ['digitalocean_token', 'DO_TOKEN=dop_v1_' + 'D'.repeat(48)],
  ['twilio_api_key_sid', 'SK' + 'a'.repeat(32)],
  ['slack_webhook', 'https://hooks.slack.com/services/' + 'T'.repeat(12) + '/' + 'B'.repeat(12) + '/' + 'S'.repeat(28)],
  ['discord_webhook', 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(42)],
  ['azure_storage_key', 'AccountKey=' + 'AZa0+/'.repeat(14) + '=='],
  ['gcp_service_account_private_key', '"private_key": "-----BEGIN PRIVATE KEY-----'],
  ['generic_secret_assignment', 'PASSWORD=complexUnsafePassword123'],
  ['structured_config_secret', 'spring.datasource.password=syntheticPassword123', 'application.properties'],
  ['npmrc_auth_token', '//registry.npmjs.org/:_authToken=syntheticNpmTokenValue12345678'],
  ['postgres_connection_password', 'DATABASE_URL=postgresql://app:syntheticPassword123@localhost:5432/db'],
  ['database_uri_password', 'CACHE_URL=redis://app:syntheticPassword123@localhost:6379/0'],
  ['high_entropy_bearer', 'Authorization: Bearer aB9zE2cM7pX4kY3rG6dL8wQ5uV1sT0nF'],
];
const benignMatrix = [
  'PASSWORD=example',
  'API_KEY=your_key_here',
  'NPM_TOKEN=your_token_here',
  'POSTGRES_URL=postgresql://demo:changeme@localhost/app',
  'MYSQL_URL=mysql://demo:changeme@localhost/app',
  'MONGODB_URL=mongodb+srv://demo:your_password@db.invalid/app',
  'REDIS_URL=redis://localhost:6379/0',
  'AMQP_URL=amqps://queue.example.invalid',
  'AccountKey=placeholder',
  'glpat-short',
  'hf_notlong',
  'SKshort',
  'https://hooks.slack.com/services/EXAMPLE/DEMO/placeholder',
  'https://discord.com/api/webhooks/000/placeholder',
  'const uri = "mysql://user@localhost:3306";',
  '//registry.npmjs.org/:_authToken=your_token_here',
  'Authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'JWT=example.jwt.placeholder',
  '-----BEGIN PUBLIC KEY-----',
  'const example="postgresql://demo:changeme@localhost:5432/app"',
  'AWS_ID=AKIA' + 'A'.repeat(15),
  'GH_TOKEN=ghp_short',
  'STRIPE_SECRET=sk_test_' + 'S'.repeat(32),
];

test('per-rule synthetic quality matrix tracks expected hits, extra alerts and redaction', () => {
  assert.equal(new Set(detectorCases.map(([rule]) => rule)).size, detectorCases.length,
    'Every expected rule must occur exactly once in the matrix');
  const counts = new Map(detectorCases.map(([rule]) => [rule, { tp: 0, fp: 0, fn: 0, duplicates: 0 }]));
  let unexpected = 0;
  for (const [rule, source, file = 'synthetic-positive.txt'] of detectorCases) {
    const findings = checkSecrets(source, file, 1);
    const hits = findings.filter(f => f.rule === rule);
    const bucket = counts.get(rule);
    if (hits.length) bucket.tp++;
    else bucket.fn++;
    bucket.duplicates += Math.max(0, hits.length - 1);
    for (const finding of findings) {
      if (finding.rule === rule) continue;
      unexpected++;
      if (counts.has(finding.rule)) counts.get(finding.rule).fp++;
    }
    const serialized = JSON.stringify(findings);
    assert.ok(!serialized.includes(source), 'Synthetic source must not be serialized: ' + rule);
    assert.ok(findings.every(f => !('snippet' in f) && !('value' in f)),
      'No report field may contain matched values: ' + rule);
  }
  for (const source of benignMatrix) {
    for (const finding of checkSecrets(source, 'synthetic-benign.txt', 1)) {
      if (counts.has(finding.rule)) counts.get(finding.rule).fp++;
      else unexpected++;
    }
  }
  const perRule = [...counts.entries()].map(([rule, values]) => ({ rule, ...values }));
  const total = perRule.reduce((acc, entry) => {
    for (const key of ['tp', 'fp', 'fn', 'duplicates']) acc[key] += entry[key];
    return acc;
  }, { tp: 0, fp: 0, fn: 0, duplicates: 0 });
  // Print only rule identifiers and counts; never source strings or credential-like data.
  console.log('RepoSafe per-rule synthetic regression: ' + JSON.stringify({
    scope: 'constructed-fixtures-only-not-field-accuracy',
    positiveCases: detectorCases.length, benignCases: benignMatrix.length,
    total, perRule,
  }));
  assert.equal(total.fn, 0, 'An expected synthetic detector rule missed its fixture');
  assert.equal(total.fp, 0, 'Unexpected matches or benign fixture alerts were observed');
  assert.equal(total.duplicates, 0, 'A rule emitted duplicate findings on one synthetic input');
  assert.equal(unexpected, 0, 'A positive fixture triggered an unrelated detector');
});
