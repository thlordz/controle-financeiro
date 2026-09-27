// =========================================================
// Processo principal do Electron.
// Pensado para rodar portátil a partir do pendrive: tanto o
// arquivo de dados quanto as preferências ficam ao lado do
// executável, não no perfil do usuário.
// =========================================================

const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const atualizador = require('./atualizador');
const fs = require('fs');
const path = require('path');

/** Pasta do executável — funciona no .exe portátil e no AppImage. */
function pastaBase() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
  if (!app.isPackaged) return path.join(__dirname, '..');
  return path.dirname(app.getPath('exe'));
}

const NOME_ARQUIVO = 'controle-financeiro.json';

/**
 * Procura a pasta `dados` a partir do executável, subindo até três
 * níveis. Isso deixa um pendrive servir os dois sistemas com um
 * arquivo só:
 *
 *   Pendrive/
 *   ├── Controle Financeiro.AppImage   (Linux)
 *   ├── dados/controle-financeiro.json ← um só, compartilhado
 *   └── Windows/Controle Financeiro.exe
 *
 * O .exe está um nível abaixo, mas encontra o mesmo arquivo.
 */
function procurarArquivoDados() {
  let pasta = pastaBase();
  for (let i = 0; i < 4; i++) {
    const candidato = path.join(pasta, 'dados', NOME_ARQUIVO);
    if (fs.existsSync(candidato)) return candidato;
    const acima = path.dirname(pasta);
    if (acima === pasta) break;
    pasta = acima;
  }
  return null;
}

const ARQUIVO_PREF = () => path.join(pastaBase(), 'preferencias.json');
const ARQUIVO_PADRAO = () =>
  procurarArquivoDados() || path.join(pastaBase(), 'dados', NOME_ARQUIVO);

function lerPreferencias() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_PREF(), 'utf8'));
  } catch {
    return {};
  }
}

function gravarPreferencias(pref) {
  try {
    fs.writeFileSync(ARQUIVO_PREF(), JSON.stringify(pref, null, 1), 'utf8');
  } catch (e) {
    console.error('Não foi possível gravar as preferências:', e.message);
  }
}

function caminhoDados() {
  const pref = lerPreferencias();
  return pref.arquivoDados || ARQUIVO_PADRAO();
}

/** Grava de forma atômica: escreve num temporário e renomeia. */
function gravarJson(caminho, conteudo) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const temporario = `${caminho}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(conteudo, null, 1), 'utf8');
  fs.renameSync(temporario, caminho);
}

let janela = null;

/**
 * Ícone da janela. No Windows ele vem gravado dentro do .exe, mas no
 * Linux quem manda é isto aqui — sem ele, a barra de tarefas mostra o
 * ícone genérico do Electron. Vem de dentro do pacote, então precisa
 * do nativeImage para ser lido de dentro do asar.
 */
function iconeDaJanela() {
  const imagem = nativeImage.createFromPath(
    path.join(__dirname, '..', 'build-assets', 'icone-256.png')
  );
  return imagem.isEmpty() ? undefined : imagem;
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1040,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    show: false,
    icon: iconeDaJanela(),
    backgroundColor: '#eef1f5',
    title: 'Controle Financeiro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  janela.removeMenu();
  janela.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  janela.once('ready-to-show', () => janela.show());

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
  cuidarDaAtualizacao();
});

/**
 * A rotina de atualização.
 *
 * Espera meio minuto antes da primeira busca para não disputar banda
 * com a sincronia logo na abertura, e depois só volta a olhar a cada
 * vinte horas — quem deixa o app aberto a semana toda também recebe.
 */
function cuidarDaAtualizacao() {
  atualizador.retomar(pastaBase());
  const olhar = () => atualizador.procurar(pastaBase());
  setTimeout(olhar, 30000).unref?.();
  setInterval(olhar, atualizador.ESPERA_ENTRE_BUSCAS).unref?.();
}

// A troca acontece com o app já fechando, para ninguém ver o programa
// reiniciar sozinho no meio de um lançamento.
app.on('will-quit', () => {
  atualizador.trocarAgora(path.dirname(app.getPath('exe')));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------- IPC ----------------------

ipcMain.handle('cf:atualizacao', () => atualizador.temAtualizacaoPronta());

ipcMain.handle('cf:obterArquivo', () => {
  const caminho = caminhoDados();
  return { caminho, existe: fs.existsSync(caminho) };
});

ipcMain.handle('cf:escolherArquivo', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolher o arquivo de dados',
    defaultPath: pastaBase(),
    filters: [{ name: 'Dados do Controle Financeiro', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return null;

  const pref = lerPreferencias();
  pref.arquivoDados = r.filePaths[0];
  gravarPreferencias(pref);
  return { caminho: r.filePaths[0] };
});

ipcMain.handle('cf:criarArquivo', async (_e, dadosIniciais) => {
  const r = await dialog.showSaveDialog(janela, {
    title: 'Criar arquivo de dados',
    defaultPath: path.join(pastaBase(), 'dados', 'controle-financeiro.json'),
    filters: [{ name: 'Dados do Controle Financeiro', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return null;

  gravarJson(r.filePath, dadosIniciais);
  const pref = lerPreferencias();
  pref.arquivoDados = r.filePath;
  gravarPreferencias(pref);
  return { caminho: r.filePath };
});

ipcMain.handle('cf:lerDados', () => {
  const caminho = caminhoDados();
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('cf:salvarDados', (_e, dados) => {
  gravarJson(caminhoDados(), dados);
  return true;
});

/**
 * POST para fora, feito pelo processo principal.
 *
 * A janela tem origem própria, então uma chamada de rede feita lá
 * passaria pelas regras de CORS do navegador. Aqui não existe
 * navegador no caminho: é o Node falando direto com o servidor.
 * Só serve para a sincronia, e o endereço vem da configuração que a
 * pessoa digitou.
 */
ipcMain.handle('cf:http', async (_e, { url, cabecalhos, corpo }) => {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify(corpo)
    });
    return { ok: r.ok, status: r.status, texto: await r.text() };
  } catch (erro) {
    return { ok: false, status: 0, texto: String(erro?.message || erro) };
  }
});

/**
 * Salvar arquivo com caixa de diálogo — é o que faz o backup e o
 * comprovante saírem do app pelo caminho que a pessoa escolher, em vez
 * de caírem calados na pasta de downloads.
 */
// ------------------------------------------------------------------
// Arte dos temas.
//
// A interface roda em file://, e ali o fetch e o XHR são bloqueados —
// não dá para a tela ler sozinha um PNG da pasta do app. Então quem
// lê é o processo principal, e devolve o arquivo já como data URI,
// pronto para entrar no SVG do papel de parede.
//
// Só sai coisa de dentro de app/img/temas/: o caminho é resolvido e
// conferido antes, para um nome com ".." não passear pelo disco.
// ------------------------------------------------------------------
const TIPOS_DE_ARTE = {
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif'
};

ipcMain.handle('cf:arte', (_e, relativo) => {
  const raiz = path.join(__dirname, '..', 'app', 'img', 'temas');
  const alvo = path.resolve(raiz, String(relativo || ''));
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return '';

  const tipo = TIPOS_DE_ARTE[path.extname(alvo).toLowerCase()];
  if (!tipo) return '';

  try {
    return `data:${tipo};base64,${fs.readFileSync(alvo).toString('base64')}`;
  } catch {
    return '';
  }
});

ipcMain.handle('cf:salvarComo', async (_e, { nome, bytes }) => {
  const extensao = String(nome || '').split('.').pop().toLowerCase();
  const r = await dialog.showSaveDialog(janela, {
    title: 'Salvar arquivo',
    defaultPath: nome || 'arquivo',
    filters: extensao && extensao !== nome
      ? [{ name: extensao.toUpperCase(), extensions: [extensao] }, { name: 'Todos', extensions: ['*'] }]
      : [{ name: 'Todos', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePath) return { caminho: '' };
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return { caminho: r.filePath };
});

ipcMain.handle('cf:desvincular', () => {
  const pref = lerPreferencias();
  delete pref.arquivoDados;
  gravarPreferencias(pref);
  return true;
});
