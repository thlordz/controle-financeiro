// =========================================================
// Atualização automática.
//
// No computador, quem faz tudo é o processo principal do Electron:
// aqui só perguntamos se já tem versão nova esperando.
//
// No Android é diferente. O sistema nunca instala nada calado — ele
// sempre pergunta — então o melhor que dá para fazer é deixar o
// arquivo pronto sem a pessoa perceber e, na próxima vez que ela
// abrir o app, mostrar a pergunta uma única vez.
// =========================================================

import { VERSAO } from './versao.js';

const REPO = 'thlordz/controle-financeiro';
const ESPERA_ENTRE_BUSCAS = 20 * 60 * 60 * 1000; // 20 horas
const CHAVE_ULTIMA_BUSCA = 'cf:ultimaBuscaDeVersao';
const CHAVE_JA_OFERECIDA = 'cf:versaoJaOferecida';

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
 * Procura versão nova e baixa o APK, em silêncio. Só olha uma vez por
 * dia: quem abre o app cinco vezes no dia não gasta internet cinco
 * vezes.
 */
async function procurarNoAndroid(p) {
  const agora = Date.now();
  const ultima = Number(localStorage.getItem(CHAVE_ULTIMA_BUSCA) || 0);
  if (agora - ultima < ESPERA_ENTRE_BUSCAS) return null;

  const chave = await token();
  if (!chave) return null;
  localStorage.setItem(CHAVE_ULTIMA_BUSCA, String(agora));

  const release = await lerDoGitHub(p, chave, `/repos/${REPO}/releases/latest`);
  const ficha = (release.assets || []).find((a) => a.name === 'atualizacao.json');
  if (!ficha) return null;

  const manifesto = await lerDoGitHub(
    p, chave, `/repos/${REPO}/releases/assets/${ficha.id}`
  );
  if (!maisNovaQue(manifesto.versao, VERSAO)) return null;

  const pacote = (manifesto.plataformas?.android || [])[0];
  if (!pacote) return null;

  await p.baixarApk({
    url: `https://api.github.com/repos/${REPO}/releases/assets/${pacote.anexo}`,
    token: chave,
    soma: pacote.soma,
    versao: manifesto.versao,
  });
  return { versao: manifesto.versao };
}

/**
 * A rotina inteira do Android: primeiro oferece o que já está baixado,
 * depois sai procurando o que vier a seguir.
 *
 * A oferta acontece uma vez por versão. Se a pessoa disser não, o app
 * não insiste a cada abertura — o aviso continua nos Ajustes.
 */
async function cuidarDoAndroid(p) {
  try {
    const pronta = await p.pendente();
    if (pronta?.versao) {
      if (maisNovaQue(pronta.versao, VERSAO)) {
        if (localStorage.getItem(CHAVE_JA_OFERECIDA) !== pronta.versao) {
          localStorage.setItem(CHAVE_JA_OFERECIDA, pronta.versao);
          await p.instalar();
        }
        return;
      }
      // Já foi instalada: o arquivo não serve mais para nada.
      await p.esquecer();
    }
    await procurarNoAndroid(p);
  } catch (e) {
    console.warn('Atualização: não deu certo desta vez —', e?.message || e);
  }
}

/** Ligada na abertura do app. Não segura nada: roda por fora. */
export function cuidarDaAtualizacao() {
  const p = plugin();
  if (!p) return; // no computador quem cuida é o Electron
  setTimeout(() => cuidarDoAndroid(p), 4000);
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
