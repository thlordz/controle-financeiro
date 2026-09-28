// =========================================================
// Atualização automática, lado do computador.
//
// Como funciona, em uma frase: uma vez por dia o app pergunta ao
// GitHub qual é a versão mais nova, baixa em silêncio o que mudou, e
// troca os arquivos na hora de fechar — para que a próxima vez que a
// pessoa abrir já seja a versão nova.
//
// Trocar na saída, e não na entrada, é o que evita o susto: ninguém
// vê o app reiniciar sozinho no meio de um lançamento.
//
// O repositório é privado, então tudo passa por um token de leitura
// que é gravado no pacote na hora da publicação (app/token-leitura.txt).
// Sem esse arquivo — rodando do código-fonte, por exemplo — a
// atualização simplesmente não existe, e o app funciona igual.
// =========================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const crypto = require('crypto');

const REPO = 'thlordz/controle-financeiro';
// De quanto em quanto tempo olhar de novo enquanto o app fica aberto.
// A primeira conferência acontece logo depois de abrir, sempre: ela
// custa alguns kilobytes, e é o download que é caro.
const ESPERA_ENTRE_BUSCAS = 60 * 60 * 1000;

/** Onde os arquivos baixados esperam até a hora da troca. */
const NOME_PASTA = '.atualizacao';

let emAndamento = false;
let prontoParaTrocar = null; // { versao, arquivos: [{nome, destino, baixado}] }

// ------------------------------------------------------------------
// Token
// ------------------------------------------------------------------

function token() {
  try {
    const arquivo = path.join(__dirname, '..', 'app', 'token-leitura.txt');
    return fs.readFileSync(arquivo, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Rede
// ------------------------------------------------------------------

/**
 * Um pedido ao GitHub. O `aceitar` muda o que vem de volta: a ficha
 * em JSON ou o arquivo em si.
 *
 * O desvio (302) precisa de cuidado: o GitHub manda o arquivo de um
 * outro servidor, que recusa o pedido se o cabeçalho de autorização
 * for junto. Por isso o segundo pedido vai limpo.
 */
function buscar(url, aceitar, comToken = true) {
  return new Promise((aceite, recuse) => {
    const cabecalhos = {
      'Accept': aceitar,
      'User-Agent': 'Controle-Financeiro',
    };
    if (comToken) cabecalhos.Authorization = `Bearer ${token()}`;

    const pedido = https.get(url, { headers: cabecalhos }, (resposta) => {
      const codigo = resposta.statusCode || 0;

      if (codigo >= 300 && codigo < 400 && resposta.headers.location) {
        resposta.resume();
        aceite(buscar(resposta.headers.location, aceitar, false));
        return;
      }
      if (codigo !== 200) {
        resposta.resume();
        recuse(new Error(`GitHub respondeu ${codigo} em ${url}`));
        return;
      }

      const pedacos = [];
      resposta.on('data', (p) => pedacos.push(p));
      resposta.on('end', () => aceite(Buffer.concat(pedacos)));
    });

    pedido.on('error', recuse);
    pedido.setTimeout(60000, () => pedido.destroy(new Error('demorou demais')));
  });
}

/** Baixa um anexo pelo número, direto para um arquivo. */
async function baixarAnexo(numero, destino) {
  const bytes = await buscar(
    `https://api.github.com/repos/${REPO}/releases/assets/${numero}`,
    'application/octet-stream'
  );
  fs.writeFileSync(destino, bytes);
  return bytes.length;
}

function soma(caminho) {
  return crypto.createHash('sha256').update(fs.readFileSync(caminho)).digest('hex');
}

// ------------------------------------------------------------------
// Versões
// ------------------------------------------------------------------

/** Lê a versão do próprio app, do mesmo arquivo que a tela mostra. */
function versaoInstalada() {
  try {
    const texto = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'js', 'versao.js'), 'utf8'
    );
    const achado = texto.match(/export const VERSAO = '([^']+)'/);
    return achado ? achado[1] : '0';
  } catch {
    return '0';
  }
}

/** Compara "3.10" e "3.9" pelo número, não pelo alfabeto. */
function maisNovaQue(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// ------------------------------------------------------------------
// Busca e download
// ------------------------------------------------------------------

function pastaDeEspera(pastaBase) {
  return path.join(pastaBase, NOME_PASTA);
}

function podeEscrever(pasta) {
  try {
    fs.mkdirSync(pasta, { recursive: true });
    const teste = path.join(pasta, '.teste');
    fs.writeFileSync(teste, 'x');
    fs.unlinkSync(teste);
    return true;
  } catch {
    return false;
  }
}

/**
 * Procura versão nova e baixa o que faltar.
 *
 * Devolve `{ versao }` quando ficou tudo pronto para trocar, ou null.
 * Nunca lança: uma atualização que falha não pode atrapalhar o app.
 */
async function procurar(pastaBase) {
  if (emAndamento || !token()) return null;
  emAndamento = true;
  try {
    const release = JSON.parse(
      (await buscar(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        'application/vnd.github+json'
      )).toString('utf8')
    );

    const fichaManifesto = (release.assets || []).find((a) => a.name === 'atualizacao.json');
    if (!fichaManifesto) return null;

    const manifesto = JSON.parse(
      (await buscar(
        `https://api.github.com/repos/${REPO}/releases/assets/${fichaManifesto.id}`,
        'application/octet-stream'
      )).toString('utf8')
    );

    if (!maisNovaQue(manifesto.versao, versaoInstalada())) return null;

    const plataforma = process.platform === 'win32' ? 'windows' : 'linux';
    const pacotes = (manifesto.plataformas || {})[plataforma] || [];
    if (pacotes.length === 0) return null;

    const espera = pastaDeEspera(pastaBase);
    if (!podeEscrever(espera)) return null;

    // Só baixa o que ainda não está na pasta de espera com a soma certa.
    // Assim uma queda de internet no meio não obriga a recomeçar tudo,
    // e um arquivo que não mudou de versão para versão não vem de novo.
    for (const pacote of pacotes) {
      const destino = path.join(espera, pacote.nome);
      let jaTenho = false;
      try {
        jaTenho = fs.existsSync(destino) && soma(destino) === pacote.soma;
      } catch { jaTenho = false; }

      if (!jaTenho) {
        await baixarAnexo(pacote.anexo, destino);
        if (soma(destino) !== pacote.soma) {
          // Chegou corrompido. Apaga e desiste desta rodada; na próxima
          // tentativa ele baixa de novo.
          fs.unlinkSync(destino);
          return null;
        }
      }
    }

    fs.writeFileSync(
      path.join(espera, 'pronto.json'),
      JSON.stringify({ versao: manifesto.versao, pacotes }, null, 1),
      'utf8'
    );
    prontoParaTrocar = { versao: manifesto.versao, pacotes, espera };
    return { versao: manifesto.versao };
  } catch (e) {
    console.warn('Atualização: não deu certo desta vez —', e.message);
    return null;
  } finally {
    emAndamento = false;
  }
}

/** Confere se sobrou uma atualização pronta de uma sessão anterior. */
function retomar(pastaBase) {
  try {
    const espera = pastaDeEspera(pastaBase);
    const ficha = JSON.parse(fs.readFileSync(path.join(espera, 'pronto.json'), 'utf8'));
    if (!maisNovaQue(ficha.versao, versaoInstalada())) {
      fs.rmSync(espera, { recursive: true, force: true });
      return null;
    }
    prontoParaTrocar = { versao: ficha.versao, pacotes: ficha.pacotes, espera };
    return { versao: ficha.versao };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// A troca, na hora de fechar
// ------------------------------------------------------------------

/**
 * Linux: o app é um arquivo só. Renomear por cima é seguro mesmo com
 * ele rodando, porque o sistema segura o arquivo antigo aberto até o
 * programa terminar — quem abrir depois pega o novo.
 */
function trocarLinux(espera) {
  const alvo = process.env.APPIMAGE;
  if (!alvo) return false;
  const novo = path.join(espera, 'Controle-Financeiro.AppImage');
  if (!fs.existsSync(novo)) return false;
  // Em pendrive formatado em exFAT não existe bit de execução e o
  // chmod reclama. Não é motivo para desistir da troca.
  try { fs.chmodSync(novo, 0o755); } catch { /* sistema de arquivos sem permissões */ }
  fs.renameSync(novo, alvo);
  return true;
}

/**
 * Windows: o programa em si não muda mais (foi para isso que o
 * empacotamento saiu), então o que precisa ser trocado é a pasta
 * `resources/app`. Ela está em uso agora, e o Windows não deixa
 * apagar arquivo aberto — por isso quem faz a troca é um ajudante que
 * espera este processo morrer.
 */
function trocarWindows(espera, pastaDoPrograma) {
  const pacote = path.join(espera, 'app.tar.gz');
  if (!fs.existsSync(pacote)) return false;

  const recursos = path.join(pastaDoPrograma, 'resources');
  const roteiro = path.join(espera, 'trocar.cmd');
  const linhas = [
    '@echo off',
    'setlocal',
    `set ESPERA=${espera}`,
    `set RECURSOS=${recursos}`,
    ':aguardar',
    'ping -n 2 127.0.0.1 >nul',
    `tasklist /fi "PID eq ${process.pid}" | find "${process.pid}" >nul && goto aguardar`,
    'if not exist "%ESPERA%\\descompactado\\app" goto fim',
    'if exist "%RECURSOS%\\app.velho" rmdir /s /q "%RECURSOS%\\app.velho"',
    'if exist "%RECURSOS%\\app" move "%RECURSOS%\\app" "%RECURSOS%\\app.velho" >nul',
    'move "%ESPERA%\\descompactado\\app" "%RECURSOS%\\app" >nul',
    'if exist "%RECURSOS%\\app.velho" rmdir /s /q "%RECURSOS%\\app.velho"',
    'rmdir /s /q "%ESPERA%" >nul 2>&1',
    ':fim',
    'endlocal',
  ];
  fs.writeFileSync(roteiro, linhas.join('\r\n'), 'utf8');

  // O pacote é aberto aqui, ainda com o app vivo, porque o ajudante é
  // um .cmd e não sabe descompactar. Ele só move pastas.
  const destino = path.join(espera, 'descompactado');
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  abrirTarGz(pacote, destino);

  spawn('cmd.exe', ['/c', roteiro], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}

/**
 * Abre um .tar.gz sem depender de programa externo.
 *
 * O formato é simples de propósito: blocos de 512 bytes, o primeiro
 * deles descrevendo o arquivo (nome no começo, tamanho em octal no
 * byte 124), e o conteúdo logo em seguida.
 */
function abrirTarGz(pacote, destino) {
  const zlib = require('zlib');
  const dados = zlib.gunzipSync(fs.readFileSync(pacote));

  let i = 0;
  while (i + 512 <= dados.length) {
    const cabecalho = dados.subarray(i, i + 512);
    const nome = cabecalho.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!nome) break; // dois blocos vazios marcam o fim

    const tamanho = parseInt(
      cabecalho.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8
    );
    const tipo = String.fromCharCode(cabecalho[156] || 48);
    i += 512;

    // Nunca deixar um nome escapar da pasta de destino.
    const caminho = path.join(destino, nome);
    if (!caminho.startsWith(destino)) throw new Error(`caminho suspeito no pacote: ${nome}`);

    if (tipo === '5') {
      fs.mkdirSync(caminho, { recursive: true });
    } else if (tipo === '0' || tipo === '\0' || tipo === '48') {
      fs.mkdirSync(path.dirname(caminho), { recursive: true });
      fs.writeFileSync(caminho, dados.subarray(i, i + tamanho));
    }
    i += Math.ceil(tamanho / 512) * 512;
  }
}

/**
 * Chamado quando o app está fechando. Vale a pena falhar em silêncio:
 * se a troca não der certo, o app continua na versão antiga e tenta
 * de novo na próxima vez.
 */
function trocarAgora(pastaDoPrograma) {
  if (!prontoParaTrocar) return false;
  try {
    const { espera } = prontoParaTrocar;
    const trocou = process.platform === 'win32'
      ? trocarWindows(espera, pastaDoPrograma)
      : trocarLinux(espera);
    if (trocou && process.platform !== 'win32') {
      fs.rmSync(espera, { recursive: true, force: true });
    }
    return trocou;
  } catch (e) {
    console.warn('Atualização: a troca falhou —', e.message);
    return false;
  }
}

function temAtualizacaoPronta() {
  return prontoParaTrocar ? { versao: prontoParaTrocar.versao } : null;
}

module.exports = {
  procurar,
  retomar,
  trocarAgora,
  temAtualizacaoPronta,
  versaoInstalada,
  maisNovaQue,
  abrirTarGz,
  ESPERA_ENTRE_BUSCAS,
};
