const {contextBridge,ipcRenderer} = require('electron');
const channels = ['state','answer','confirm-answers','memory-save','memory-delete','conversation-new','conversation-delete','conversation-remember','preview','send','stop','retry','settings-save','test-connection','key-delete','export','open-data','reset'];
contextBridge.exposeInMainWorld('companion', {
  call: (channel,...args) => {if (!channels.includes(channel)) return Promise.reject(new Error('不支持的操作')); return ipcRenderer.invoke(channel,...args);},
  onState: fn => ipcRenderer.on('state-changed',(_,data) => fn(data)),
  onStream: fn => ipcRenderer.on('chat-stream',(_,data) => fn(data)),
  onStage: fn => ipcRenderer.on('generation-stage',(_,stage) => fn(stage))
});
