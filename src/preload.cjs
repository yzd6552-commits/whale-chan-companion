const {contextBridge,ipcRenderer} = require('electron');
const channels = ['state','persona-toggle','persona-feedback','persona-feedback-delete','persona-configure','persona-approve','persona-reject','persona-rule-lock','persona-rule-delete','persona-restore','persona-preview','persona-generate','profile-preview','profile-generate','profile-toggle','profile-approve','profile-reject','profile-remove','profile-edit','answer','confirm-answers','memory-save','memory-delete','conversation-new','conversation-delete','conversation-remember','preview','send','stop','retry','settings-save','test-connection','key-delete','export','open-data','reset'];
contextBridge.exposeInMainWorld('companion', {
  call: (channel,...args) => {if (!channels.includes(channel)) return Promise.reject(new Error('不支持的操作')); return ipcRenderer.invoke(channel,...args);},
  onState: fn => ipcRenderer.on('state-changed',(_,data) => fn(data)),
  onStream: fn => ipcRenderer.on('chat-stream',(_,data) => fn(data)),
  onStage: fn => ipcRenderer.on('generation-stage',(_,stage) => fn(stage))
});
