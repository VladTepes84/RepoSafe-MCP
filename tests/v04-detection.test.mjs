import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSecrets } from '../dist/scanner.js';

const db = [
  'mysql://reporter:syntheticPassword123@mysql.example.invalid/app',
  'mariadb://reporter:syntheticPassword123@db.example.invalid/app',
  'mongodb://reporter:syntheticPassword123@mongo.example.invalid/app',
  'mongodb+srv://reporter:syntheticPassword123@cluster.example.invalid/app',
  'redis://reporter:syntheticPassword123@redis.example.invalid:6379/0',
  'rediss://reporter:syntheticPassword123@redis.example.invalid:6379/0',
  'amqp://reporter:syntheticPassword123@queue.example.invalid/vhost',
  'amqps://reporter:syntheticPassword123@queue.example.invalid/vhost',
];
const known = [
  ['gitlab_token', 'glpat-' + 'G'.repeat(30)],
  ['huggingface_token', 'hf_' + 'H'.repeat(38)],
  ['digitalocean_token', 'dop_v1_' + 'D'.repeat(48)],
  ['digitalocean_token', 'doo_v1_' + 'E'.repeat(48)],
  ['twilio_api_key_sid', 'SK' + 'a'.repeat(32)],
  ['slack_webhook', 'https://hooks.slack.com/services/' + 'T'.repeat(12) + '/' + 'B'.repeat(12) + '/' + 'S'.repeat(28)],
  ['discord_webhook', 'https://discord.com/api/webhooks/123456789012345678/' + 'A'.repeat(42)],
  ['azure_storage_key', 'AccountKey=' + 'AZa0+/'.repeat(14) + '=='],
  ['gcp_service_account_private_key', '"private_key": "-----BEGIN PRIVATE KEY-----\\n' + 'F'.repeat(32)],
  ['github_token', 'ghp_' + 'A'.repeat(36)],
  ['anthropic_key', 'sk-ant-' + 'x'.repeat(40)],
  ['openai_key', 'sk-proj-' + 'x'.repeat(40)],
  ['stripe_secret', 'sk_live_' + 'a'.repeat(32)],
  ['google_api_key', 'AIza' + 'z'.repeat(35)],
  ['aws_access_key_id', 'AKIA' + 'Z'.repeat(16)],
  ['sendgrid_api_key', 'SG.' + 'P'.repeat(22) + '.' + 'Q'.repeat(43)],
  ['npm_access_token', 'npm_' + 'N'.repeat(36)],
  ['npmrc_auth_token', '_authToken=' + 'a'.repeat(40)],
  ['generic_secret_assignment', 'PASSWORD=complexUnsafePassword123'],
  ['postgres_connection_password', 'postgresql://user:secretphrase123@db.example.invalid/app'],
  ['jwt_token', [
    Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
    Buffer.from(JSON.stringify({sub:'demo-person',iat:1690000000})).toString('base64url'),
    'vAz0Qpf3r6L8wC2mN5T1aX7sG9Y4dE0b',
  ].join('.')],
  ['high_entropy_bearer', 'Authorization: Bearer Qn1Ad8Hk9Xy3Pm6Rf2Ct5Zv7Lb4Wu0Gs'],
];
for (const uri of db) {
  test('database URI synthetic positive: ' + uri.slice(0, uri.indexOf('://')), () => {
    const findings = checkSecrets('DATABASE_URL=' + uri, 'database.txt', 1);
    assert.ok(findings.some(f => f.rule === 'database_uri_password'), uri);
    assert.ok(!JSON.stringify(findings).includes('syntheticPassword123'));
  });
}
for (const [rule, value] of known) {
  test('synthetic provider fixture: ' + rule, () => {
    const findings = checkSecrets(value, 'synthetic.txt', 1);
    assert.ok(findings.some(f => f.rule === rule), rule);
    assert.ok(!JSON.stringify(findings).includes(value));
    assert.ok(findings.every(f => !Object.hasOwn(f,'snippet') && !Object.hasOwn(f,'value')));
  });
}
test('docs and placeholder corpus: 20 benign strings have no findings', () => {
  const benign = [
    'PASSWORD=example', 'API_KEY=your_key_here', 'NPM_TOKEN=your_token_here',
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
  ];
  assert.equal(benign.length,20);
  for (const line of benign) assert.deepEqual(checkSecrets(line,'README.md',1),[],line);
});
