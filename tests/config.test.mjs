import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClientConfig } from '../scripts/config.mjs';
const mac = { platform: 'darwin', home: '/Users/tester', root: '/Users/tester/projects/demo', node: '/opt/homebrew/bin/node', serverPath: '/Users/tester/RepoSafe-MCP/dist/server.js' };
const win = { platform: 'win32', home: 'C:\\Users\\tester', root: 'C:\\Users\\tester\\projects\\demo', node: 'C:\\Program Files\\nodejs\\node.exe', serverPath: 'C:\\Users\\tester\\RepoSafe-MCP\\dist\\server.js', appdata:'C:\\Users\\tester\\AppData\\Roaming' };
const linux = { platform: 'linux', home: '/home/tester', root: '/home/tester/projects/demo', node: '/usr/bin/node', serverPath: '/home/tester/RepoSafe-MCP/dist/server.js' };
for(const env of [mac,win,linux]){
  for(const client of ['cursor','claude','vscode','codex']){
    test(`${env.platform} ${client}: exact host config shape and paths`,()=>{
      const config=makeClientConfig({ ...env, client, copilotHome: '', xdgConfigHome: '' });
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


test('generator JSON mode is parseable and never claims real GUI or protocol tests',async()=>{
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'reposafe-config-json-'));
  try {
    const {spawnSync}=await import('node:child_process');
    const args=['scripts/config.mjs','--client','cursor','--root',root,'--json'];
    const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:8000});
    assert.equal(r.status,0,r.stderr);
    const data=JSON.parse(r.stdout);
    assert.equal(data.client,'cursor');
    assert.equal(data.writesFiles,false);
    assert.equal(data.verifiedProtocol,false);
    assert.equal(data.verifiedGUI,false);
    assert.ok(data.content.includes('mcpServers'));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('Copilot portable configuration honors COPILOT_HOME on Unix and Windows', () => {
  const unix = makeClientConfig({ ...mac, client: 'vscode', copilotHome: '/Users/tester/AlternateCopilot' });
  assert.equal(unix.file, '/Users/tester/AlternateCopilot/mcp-config.json');
  const windows = makeClientConfig({ ...win, client: 'vscode', copilotHome: 'C:\\Users\\tester\\OtherCopilot' });
  assert.equal(windows.file, 'C:\\Users\\tester\\OtherCopilot\\mcp-config.json');
  assert.throws(() => makeClientConfig({ ...mac, client: 'vscode', copilotHome: 'relative/copilot' }), /COPILOT_HOME/);
  assert.throws(() => makeClientConfig({ ...mac, client: 'vscode', copilotHome: '/' }), /COPILOT_HOME/);
});

test('Claude Desktop Linux follows XDG_CONFIG_HOME and otherwise ~/.config', () => {
  const standard = makeClientConfig({ ...linux, client: 'claude', xdgConfigHome: '' });
  assert.equal(standard.file, '/home/tester/.config/Claude/claude_desktop_config.json');
  const custom = makeClientConfig({ ...linux, client: 'claude', xdgConfigHome: '/home/tester/.xdg-config' });
  assert.equal(custom.file, '/home/tester/.xdg-config/Claude/claude_desktop_config.json');
  assert.throws(() => makeClientConfig({ ...linux, client: 'claude', xdgConfigHome: 'relative/path' }), /XDG_CONFIG_HOME/);
});
