const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const release = path.resolve('release');
const name = '鲸鱼娘';
const candidates = process.platform === 'darwin'
  ? [path.join(release,'mac',name+'.app','Contents','MacOS',name),path.join(release,'mac-arm64',name+'.app','Contents','MacOS',name)]
  : [path.join(release,'win-unpacked',name+'.exe')];
const executable = candidates.find(file => fs.existsSync(file));
if (!executable) throw new Error('Packaged app executable not found for '+process.platform+'/'+process.arch);
console.log('Testing packaged app:',process.platform,process.arch);
const result = spawnSync(executable,['--smoke-test'],{stdio:'inherit',timeout:120000});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('Packaged desktop test failed: '+result.status);
