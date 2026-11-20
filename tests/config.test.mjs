import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClientConfig } from '../scripts/config.mjs';
const mac = { platform: 'darwin', home: '/Users/tester', root: '/Users/tester/projects/demo', node: '/opt/homebrew/bin/node', serverPath: '/Users/tester/RepoSafe-MCP/dist/server.js' };
const win = { platform: 'win32', home: 'C:\\Users\\tester', root: 'C:\\Users\\tester\\projects\\demo', node: 'C:\\Program Files\\nodejs\\node.exe', serverPath: 'C:\\Users\\tester\\RepoSafe-MCP\\dist\\server.js', appdata:'C:\\Users\\tester\\AppData\\Roaming' };
for(const env of [mac,win]){
  for(const client of ['cursor','claude','vscode','codex']){
    test(`${env.platform} ${client}: exact host config shape and paths`,()=>{
      const config=makeClientConfig({ ...env, client });
      assert.ok(config.file.includes(client === 'codex' ? 'config.toml' : '.json'));
      assert.equal(config.config.env.REPOSAFE_ROOT,env.root);
      if(config.format==='json') {
        const entry=JSON.parse(config.content).mcpServers.reposafe;
        assert.equal(entry.command, env.node);
        assert.deepEqual(entry.args, [env.serverPath]);
        assert.equal(entry.env.REPOSAFE_ROOT,env.root);
        if(client==='vscode') assert.equal(entry.type,'stdio');
      } else {
        assert.ok(config.content.includes('[mcp_servers.reposafe]'));
      }
    });
  }
}
test('generator refuses relative roots even if config client name is valid',()=>{
  assert.throws(()=>makeClientConfig({...mac,client:'cursor',root:'../relative'}),/absolute/);
});
