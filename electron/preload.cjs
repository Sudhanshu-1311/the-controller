const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controllerDesktop', {
  getIdentity: () => ipcRenderer.invoke('desktop:identity'),
  getSettings: () => ipcRenderer.invoke('desktop:settings'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  setCredentials: (value) => ipcRenderer.invoke('desktop:credentials', value),
  authGoogle: () => ipcRenderer.invoke('desktop:auth:google'),
  clearCredentials: () => ipcRenderer.invoke('desktop:credentials:clear'),
  updateSettings: (value) => ipcRenderer.invoke('desktop:settings:update', value),
  startAgent: () => ipcRenderer.invoke('desktop:agent:start'),
  capturePrimaryScreen: (includeAudio) => ipcRenderer.invoke('desktop:capture:primary', includeAudio === true),
  prepareDisplayCapture: (displayId, includeAudio) => ipcRenderer.invoke('desktop:capture:prepare', { displayId, includeAudio: includeAudio === true }),
  getDisplays: () => ipcRenderer.invoke('desktop:displays'),
  captureDisplay: (id, includeAudio) => ipcRenderer.invoke('desktop:capture:display', { id, includeAudio: includeAudio === true }),
  selectTransferFiles: () => ipcRenderer.invoke('desktop:files:select'),
  readTransferFileChunk: (id, offset, length) => ipcRenderer.invoke('desktop:files:read', id, offset, length),
  releaseTransferFile: (id) => ipcRenderer.invoke('desktop:files:release', id),
  beginFileReceive: (request) => ipcRenderer.invoke('desktop:files:receive:begin', request),
  writeFileReceiveChunk: (request) => ipcRenderer.invoke('desktop:files:receive:chunk', request),
  finishFileReceive: (id) => ipcRenderer.invoke('desktop:files:receive:finish', id),
  cancelFileReceive: (id) => ipcRenderer.invoke('desktop:files:receive:cancel', id),
  authorizeRemoteInput: (allowed) => ipcRenderer.invoke('desktop:input:authorize', allowed),
  sendRemoteInputEvent: (input) => ipcRenderer.invoke('desktop:input:event', input),
  releaseRemoteInput: () => ipcRenderer.invoke('desktop:input:release'),
  authorizeClipboard: (allowed) => ipcRenderer.invoke('desktop:clipboard:authorize', allowed),
  readClipboardText: () => ipcRenderer.invoke('desktop:clipboard:read'),
  writeClipboardText: (value) => ipcRenderer.invoke('desktop:clipboard:write', value),
  openSection: (value) => ipcRenderer.invoke('desktop:section', value),
  hideWindow: () => ipcRenderer.invoke('desktop:window:hide'),
  showWindow: () => ipcRenderer.invoke('desktop:window:show'),
  signInWithGoogle: () => ipcRenderer.invoke('desktop:auth:google'),
  exit: () => ipcRenderer.invoke('desktop:exit'),

  checkForUpdates: () => ipcRenderer.invoke('desktop:update:check'),
  downloadUpdate: () => ipcRenderer.invoke('desktop:update:download'),
  installUpdate: () => ipcRenderer.invoke('desktop:update:install'),

  onUpdateStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:update:status', listener);
    return () => ipcRenderer.removeListener('desktop:update:status', listener);
  },

  onState: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('agent:state', listener);
    return () => ipcRenderer.removeListener('agent:state', listener);
  },

  acknowledgeSignal: (signalId) => ipcRenderer.send('desktop:signal:ack', signalId),

  onSignal: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('agent:signal', listener);
    return () => ipcRenderer.removeListener('agent:signal', listener);
  },

  onSettings: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('agent:settings', listener);
    return () => ipcRenderer.removeListener('agent:settings', listener);
  },

  onOpenSection: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('ui:open-section', listener);
    return () => ipcRenderer.removeListener('ui:open-section', listener);
  },

  onSystemEvent: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:system-event', listener);
    return () => ipcRenderer.removeListener('desktop:system-event', listener);
  },
});