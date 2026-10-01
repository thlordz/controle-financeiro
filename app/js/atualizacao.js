// =========================================================
// Atualização automática.
//
// No computador, quem faz tudo é o processo principal do Electron:
// aqui só perguntamos se já tem versão nova esperando.
//
// No Android, nada acontece sozinho. Já foi assim: o app baixava o
// APK calado e, na abertura seguinte, mandava a pergunta do
// instalador. Na prática aquilo não funcionou — o Android ainda exige
// que a pessoa libere "instalar apps desconhecidos" na mão, e quando
// ela não libera o ciclo trava sem dizer nada. Thiago pediu para
// tirar o automático, e ficou só isto: o app confere o número da
// versão e, se tiver saído uma nova, escreve isso nos Ajustes. Baixar
// e instalar passou a ser um toque dele, nunca uma decisão minha.
// =========================================================

// Onde fica anotado o número que vimos lá fora, para os Ajustes
// mostrarem sem ter de perguntar ao GitHub de novo.
const CHAVE_VERSAO_LA_FORA = 'cf:versaoLaFora';

import { VERSAO } from './versao.js';

const REPO = 'thlordz/controle-financeiro';
// Conferir a versão é um pedido de alguns kilobytes; baixar é que
// custa. Então a conferência acontece TODA vez que o app abre, e o
// download só quando o número é diferente do instalado.
//
// Os dez minutos abaixo não são para economizar rede: são para o caso
// de alguém abrir e fechar o app em sequência. Antes eram vinte horas,
// e por isso uma versão publicada de manhã só aparecia no dia
// seguinte — foi o que aconteceu no lançamento da 4.0.
const ESPERA_ENTRE_BUSCAS = 10 * 60 * 1000;
const CHAVE_ULTIMA_BUSCA = 'cf:ultimaBuscaDeVersao';

function plugin() {
  return window.Capacitor?.Plugins?.ControleAtualizacao || null;
}

/** Compara "3.10" e "3.9" pelo número, não pelo alfabeto. */
export function maisNovaQue(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * O token de leitura do repositório. Ele é gravado no pacote na hora
 * da publicação; rodando do código-fonte ele não existe, e aí a
 * atualização automática simplesmente não acontece.
 */
async function token() {
  try {
    const resposta = await fetch('token-leitura.txt', { cache: 'no-store' });
    if (!resposta.ok) return null;
    const texto = (await resposta.text()).trim();
    return texto || null;
  } catch {
    return null;
  }
}

/**
 * Devolve `{ versao }` se existe uma atualização baixada esperando a
 * hora de entrar, ou null. Nunca lança: aviso de atualização não pode
 * derrubar a tela de Ajustes.
 */
export async function atualizacaoEsperando() {
  try {
    if (window.cfAPI?.atualizacao) {
      return await window.cfAPI.atualizacao();
    }
    const p = plugin();
    if (p) {
      const r = await p.pendente();
      return r && r.versao ? r : null;
    }
  } catch {
    /* sem novidade */
  }
  return null;
}

// ------------------------------------------------------------------
// Android
// ------------------------------------------------------------------

async function lerDoGitHub(p, chave, caminho) {
  const r = await p.baixarTexto({ url: `https://api.github.com${caminho}`, token: chave });
  return JSON.parse(r.texto);
}

/**
 * Só OLHA: pergunta ao GitHub qual é a versão lá fora e devolve o
 * pacote correspondente, sem baixar nada. São alguns kilobytes.
 *
 * A separação entre olhar e baixar é o coração da mudança: antes as
 * duas coisas moravam na mesma função, e por isso conferir a versão
 * já significava trazer três megabytes e armar um instalador.
 */
async function olharNoAndroid(p, agoraMesmo = false) {
  const agora = Date.now();
  const ultima = Number(localStorage.getItem(CHAVE_ULTIMA_BUSCA) || 0);
  if (!agoraMesmo && agora - ultima < ESPERA_ENTRE_BUSCAS) return null;

  const chave = await token();
  if (!chave) return null;
  localStorage.setItem(CHAVE_ULTIMA_BUSCA, String(agora));

  const release = await lerDoGitHub(p, chave, `/repos/${REPO}/releases/latest`);
  const ficha = (release.assets || []).find((a) => a.name === 'atualizacao.json');
  if (!ficha) return null;

  const manifesto = await lerDoGitHub(
    p, chave, `/repos/${REPO}/releases/assets/${ficha.id}`
  );
  const pacote = (manifesto.plataformas?.android || [])[0];
  if (!pacote) return null;

  localStorage.setItem(CHAVE_VERSAO_LA_FORA, manifesto.versao);
  if (!maisNovaQue(manifesto.versao, VERSAO)) return null;
  return { versao: manifesto.versao, pacote, chave };
}

/**
 * Baixa e abre o instalador. Só é chamada por um toque na tela — a
 * abertura do app nunca chega aqui.
 */
export async function baixarEInstalar() {
  const p = plugin();
  if (!p) return { ok: false, recado: 'Aqui no computador eu me atualizo sozinho.' };
  try {
    const pronta = await p.pendente();
    if (pronta?.versao && maisNovaQue(pronta.versao, VERSAO)) {
      await p.instalar();
      return { ok: true, recado: 'Abri o instalador do Android.' };
    }
    const achado = await olharNoAndroid(p, true);
    if (!achado) return { ok: false, recado: 'Você já está na mais nova.' };

    await p.baixarApk({
      url: `https://api.github.com/repos/${REPO}/releases/assets/${achado.pacote.anexo}`,
      token: achado.chave,
      soma: achado.pacote.soma,
      versao: achado.versao,
    });
    await p.instalar();
    return { ok: true, recado: `Baixei a ${achado.versao} e abri o instalador.` };
  } catch (e) {
    return { ok: false, recado: `Não consegui: ${e?.message || e}` };
  }
}

/** O número que vimos lá fora na última conferida, ou ''. */
export function versaoLaFora() {
  try { return localStorage.getItem(CHAVE_VERSAO_LA_FORA) || ''; } catch { return ''; }
}

/** Tem versão nova esperando um toque? */
export function temVersaoNova() {
  const lf = versaoLaFora();
  return Boolean(lf && maisNovaQue(lf, VERSAO));
}

/**
 * Ligada na abertura do app. No Android ela agora só confere o
 * número; no computador quem cuida de tudo é o Electron.
 */
export function cuidarDaAtualizacao() {
  const p = plugin();
  if (!p) return;
  setTimeout(() => {
    olharNoAndroid(p).catch((e) =>
      console.warn('Atualização: não deu para conferir —', e?.message || e));
  }, 4000);
}

/**
 * Procurar na hora, sem esperar a vez.
 *
 * Existe porque a espera automática é longa de propósito (não faz
 * sentido bater no GitHub a cada abertura), mas quem acabou de saber
 * que saiu versão nova não quer esperar horas.
 *
 * Devolve: 'baixando' quando achou e está trazendo, 'emdia' quando
 * não há nada novo, 'pronta' quando já havia uma baixada esperando,
 * ou 'semrede' quando não deu para perguntar.
 */
export async function procurarAgora() {
  const p = plugin();

  // No computador quem procura é o processo principal do Electron.
  if (window.cfAPI?.procurarAtualizacao) {
    try {
      const r = await window.cfAPI.procurarAtualizacao();
      return r?.versao ? 'baixando' : 'emdia';
    } catch { return 'semrede'; }
  }

  if (!p) return 'emdia';
  try {
    const pronta = await p.pendente();
    if (pronta?.versao && maisNovaQue(pronta.versao, VERSAO)) return 'pronta';
    // No Android, procurar é só olhar. Baixar é decisão de quem toca
    // no botão, e ela tem um botão só para isso.
    const achou = await olharNoAndroid(p, true);
    return achou ? 'tem' : 'emdia';
  } catch {
    return 'semrede';
  }
}

/** Abre o instalador do que já foi baixado. Usado pelo botão dos Ajustes. */
export async function instalarAgora() {
  const p = plugin();
  if (!p) return false;
  try {
    await p.instalar();
    return true;
  } catch {
    return false;
  }
}
