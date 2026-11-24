// Test-only HTTPS substitute, loaded only in the integration-test child.
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';

function tarEntry(path, text) {
  const body = Buffer.from(text);
  const h = Buffer.alloc(512);
  const oct = (at, width, n) => h.write(n.toString(8).padStart(width - 1, '0') + '\0', at, width, 'ascii');
  h.write(path);
  oct(100, 8, 0o600); oct(108, 8, 0); oct(116, 8, 0);
  oct(124, 12, body.length); oct(136, 12, 0);
  h.fill(32, 148, 156); h[156] = 48; h.write('ustar\0', 257);
  oct(148, 8, h.reduce((sum, byte) => sum + byte, 0));
  return Buffer.concat([h, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}
const archive = (name) => gzipSync(Buffer.concat([
  tarEntry('repo-aaaa/README.md', '# Public synthetic snapshot\n'),
  tarEntry('repo-aaaa/LICENSE', 'MIT\n'),
  tarEntry('repo-aaaa/.gitignore', '.env\n'),
  tarEntry('repo-aaaa/' + name, 'Synthetic test content\n'),
  Buffer.alloc(1024),
]));
https.get = (options, callback) => {
  const req = new EventEmitter();
  req.setTimeout = () => req;
  req.destroy = err => { if (err) req.emit('error', err); return req; };
  queueMicrotask(() => {
    let data, status = 200;
    const path = options.path;
    const match = /^\/repos\/owner\/(repo|other)(\/commits\/main)?$/.exec(path);
    if (options.hostname === 'api.github.com' && match) {
      const sha = (match[1] === 'repo' ? 'a' : 'b').repeat(40);
      data = Buffer.from(JSON.stringify(match[2] ? { sha } : { private: false, size: 1, default_branch: 'main' }));
    } else if (options.hostname === 'codeload.github.com' && path === '/owner/repo/tar.gz/' + 'a'.repeat(40)) {
      data = archive('sample.txt');
    } else if (options.hostname === 'codeload.github.com' && path === '/owner/other/tar.gz/' + 'b'.repeat(40)) {
      data = archive('other.txt');
    } else { status = 404; data = Buffer.from('not found'); }
    const response = Readable.from([data]);
    response.statusCode = status;
    callback(response);
  });
  return req;
};
