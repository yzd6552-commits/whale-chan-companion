const fs = require('node:fs');
const path = require('node:path');
const {initialState, now} = require('./core.cjs');
function readValid(file) {
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state.version !== 1 || !state.answers || !Array.isArray(state.memories) || !Array.isArray(state.conversations) || !state.settings) throw new Error('数据格式不正确');
  return state;
}
class Store {
  constructor(dir) { this.dir = dir; this.file = path.join(dir,'journal.json'); this.backup = this.file + '.bak'; this.recovered = false; }
  load() {
    fs.mkdirSync(this.dir,{recursive:true, mode:0o700});
    if (!fs.existsSync(this.file)) {
      if (fs.existsSync(this.backup)) {
        try { const state = readValid(this.backup); this.recovered = true; return state; }
        catch { throw new Error('主数据文件缺失，备份也无法读取。已保留文件，请先备份数据目录后修复。'); }
      }
      return initialState();
    }
    try { return readValid(this.file); } catch {
      try {
        const data = readValid(this.backup);
        fs.copyFileSync(this.file, this.file + '.damaged-' + Date.now());
        fs.unlinkSync(this.file);
        this.recovered = true;
        return data;
      } catch { throw new Error('本地数据无法读取。已保留原文件，请备份数据目录后修复，软件不会覆盖它。'); }
    }
  }
  save(state) {
    state.updatedAt = now();
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state,null,2), {mode:0o600});
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file,this.backup);
    fs.renameSync(temp,this.file);
  }
}
module.exports = {Store};
