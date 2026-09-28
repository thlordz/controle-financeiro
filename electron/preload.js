// =========================================================
// Ponte segura entre a interface e o processo principal.
// A interface só enxerga estas funções — sem acesso ao Node.
// =========================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfAPI', {
  obterArquivo: () => ipcRenderer.invoke('cf:obterArquivo'),
  escolherArquivo: () => ipcRenderer.invoke('cf:escolherArquivo'),
  criarArquivo: (dados) => ipcRenderer.invoke('cf:criarArquivo', dados),
  lerDados: () => ipcRenderer.invoke('cf:lerDados'),
  salvarDados: (dados) => ipcRenderer.invoke('cf:salvarDados', dados),
  desvincular: () => ipcRenderer.invoke('cf:desvincular'),
  salvarComo: (arquivo) => ipcRenderer.invoke('cf:salvarComo', arquivo),
  http: (pedido) => ipcRenderer.invoke('cf:http', pedido),
  arte: (caminho) => ipcRenderer.invoke('cf:arte', caminho),
  atualizacao: () => ipcRenderer.invoke('cf:atualizacao'),
  procurarAtualizacao: () => ipcRenderer.invoke('cf:procurarAtualizacao')
});
