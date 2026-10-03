// =========================================================
// A sincronia vista de fora: quem a dispara, quem a observa.
//
// `sincronia.js` sabe o que subir e o que baixar, mas não sabe de
// onde vêm os dados nem o que fazer com o resultado. Este arquivo é a
// cola: monta o cliente do Turso com o endereço e o token guardados
// neste aparelho, chama uma rodada, guarda a marca de última visita e
// avisa quem estiver olhando.
//
// Ele existe porque a cola NÃO existia. No redesenho da 4.0 o app.js
// passou a chamar `sincronizar(dados)` — a função pede
// `{ cliente, dados, desde }` —, então o cliente nunca era criado, o
// token colado nos Ajustes nunca era lido e nada subia. O erro caía
// num `console.warn`, e por quatro versões a sincronia esteve morta
// sem ninguém ver. Daí a regra deste arquivo: **falha de sincronia
// nunca é silenciosa**. Automática ou não, ela vira estado visível.
// =========================================================

import { criarCliente } from './turso.js';
import {
  sincronizar, lerConfiguracao, gravarConfiguracao, estaLigada,
} from './sincronia.js';

/** Preenchidos pelo app.js, que é quem tem os dados na mão. */
let pegarDados = () => null;
let aplicarDados = async () => {};

export function configurarSincronia(ganchos) {
  if (ganchos.pegarDados) pegarDados = ganchos.pegarDados;
  if (ganchos.aplicarDados) aplicarDados = ganchos.aplicarDados;
}

/* ---------------- estado observável ---------------- */

const ouvintes = new Set();
let rodando = false;
let repetirDepois = false;
let recado = '';
let tomDoRecado = '';   // '', 'bom' ou 'ruim'

/** A tela se inscreve para pintar o estado sem ficar perguntando. */
export function quandoSincroniaMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function anunciar() {
  const e = estadoDaSincronia();
  for (const fn of ouvintes) {
    try { fn(e); } catch { /* um ouvinte quebrado não derruba os outros */ }
  }
}

function dizer(texto, tom = '') {
  recado = texto;
  tomDoRecado = tom;
  anunciar();
}

export function estadoDaSincronia() {
  const { em } = lerConfiguracao();
  return { ligada: estaLigada(), rodando, em, recado, tom: tomDoRecado };
}

/** "há 3 min", "há 2 h", "há 5 dias". */
export function contarTempo(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/* ---------------- o cliente ---------------- */

function clienteDaSincronia() {
  const { url, token } = lerConfiguracao();
  return criarCliente({ url, token });
}

/**
 * Confere endereço e token sem escrever nada no banco.
 *
 * Vale a viagem: antes, quem colava um token errado só descobria
 * muito depois, quando percebia que o outro aparelho não via nada.
 */
export async function testarConexao(url, token) {
  const cliente = criarCliente({ url, token });
  if (!cliente) return { ok: false, erro: 'Falta o endereço ou o token.' };
  try {
    await cliente.testar();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: emPortugues(e) };
  }
}

/* ---------------- uma rodada ---------------- */

/**
 * `silenciosa` é o caso automático: ele não abre aviso na tela, mas
 * continua deixando o recado registrado para a seção Banco mostrar.
 * Devolve `{ ok, recado }` para quem quiser reagir.
 */
export async function sincronizarAgora({ silenciosa = false } = {}) {
  // Um pedido que chega no meio de uma rodada não pode ser descartado:
  // ele quase sempre é uma alteração que acabou de ser feita, e
  // descartá-lo significava a alteração ficar aqui até a próxima.
  // Agora ele fica anotado e a rodada se repete ao terminar.
  if (rodando) {
    repetirDepois = true;
    return { ok: false, recado: 'Já estou sincronizando; repito em seguida.' };
  }

  const cliente = clienteDaSincronia();
  if (!cliente) {
    dizer('Falta o endereço do banco ou o token.', 'ruim');
    return { ok: false, recado };
  }

  const dados = pegarDados();
  if (!dados) {
    dizer('Ainda estou abrindo o app, tenta daqui a pouco.', 'ruim');
    return { ok: false, recado };
  }

  rodando = true;
  dizer('Sincronizando…');

  try {
    const { marca } = lerConfiguracao();
    const r = await sincronizar({ cliente, dados, desde: marca });

    // A marca só avança depois que tudo deu certo: se a subida falhar
    // no meio, a próxima rodada refaz em vez de pular o que não subiu.
    gravarConfiguracao({ marca: r.marca, em: new Date().toISOString() });

    await aplicarDados(r.dados);

    const { adicionados, atualizados, apagados, enviados,
            reetiquetados, resgatados } = r.resumo;
    const partes = [];
    if (adicionados) partes.push(`${adicionados} chegaram`);
    if (atualizados) partes.push(`${atualizados} mudaram`);
    if (apagados) partes.push(`${apagados} sumiram`);
    if (enviados) partes.push(`${enviados} subiram`);
    if (reetiquetados) partes.push(`${reetiquetados} reetiquetados`);
    // Este merece nome próprio: é lançamento que estava no banco e
    // tinha ficado invisível aqui. Ver "resgatei 5" é diferente de
    // ver "5 chegaram".
    if (resgatados) partes.push(`resgatei ${resgatados} que faltavam`);
    dizer(partes.length ? `Pronto · ${partes.join(', ')}.` : 'Tudo em dia, nada novo.', 'bom');
    return { ok: true, recado, silenciosa };
  } catch (e) {
    dizer(emPortugues(e), 'ruim');
    return { ok: false, recado, silenciosa };
  } finally {
    rodando = false;
    anunciar();
    if (repetirDepois) {
      repetirDepois = false;
      sincronizarAgora({ silenciosa: true });
    }
  }
}

/**
 * "Failed to fetch" não diz nada para quem está olhando o celular.
 * Os erros que aparecem de verdade são três: não chegou na internet,
 * o token não serve, ou o banco reclamou de alguma coisa.
 */
function emPortugues(e) {
  const m = String(e?.message || e || '');
  if (/failed to fetch|networkerror|load failed|timeout|ERR_/i.test(m)) {
    return 'Não cheguei no banco. Confere a internet.';
  }
  if (/401|403|unauthor|forbidden/i.test(m)) {
    return 'O token não foi aceito. Pega um novo no Turso e cola de novo.';
  }
  if (/404|not found/i.test(m)) {
    return 'Esse endereço não existe mais. Confere no Turso.';
  }
  return `Não rolou: ${m.slice(0, 120)}`;
}

/* ---------------- quando sincronizar sozinho ---------------- */

/**
 * Terminou de salvar, apagar ou trocar um status? Sobe agora.
 *
 * A espera era de um segundo e meio, para juntar uma rajada numa
 * subida só. Na prática ela só atrasava: quem salva um lançamento e
 * fecha o app em seguida via a alteração ficar para trás, e quem
 * trocava um status no celular não via mudar no computador. Quem
 * chama isto é sempre uma ação ACABADA, não uma tecla — então quase
 * não há rajada para juntar.
 *
 * Os 300 ms que sobraram existem só para o toque duplo: dois selos
 * trocados em sequência viram uma subida, não duas.
 */
const ESPERA = 300;
let agendada = null;

export function agendarSincronia() {
  if (!estaLigada()) return;
  clearTimeout(agendada);
  agendada = setTimeout(() => {
    agendada = null;
    sincronizarAgora({ silenciosa: true });
  }, ESPERA);
}

/**
 * De olho no que os outros aparelhos fazem.
 *
 * Subir na hora resolve metade do problema: a alteração sai daqui
 * depressa. A outra metade é chegar — e para chegar, este aparelho
 * precisa perguntar. Com o app aberto na tela, ele pergunta de minuto
 * em minuto; escondido, não pergunta nada, para não gastar bateria
 * com uma tela que ninguém está vendo.
 */
const ESPERA_ENTRE_OLHADAS = 60 * 1000;
let relogio = null;

function olharDeVezEmQuando() {
  clearInterval(relogio);
  relogio = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!estaLigada() || rodando) return;
    sincronizarAgora({ silenciosa: true });
  }, ESPERA_ENTRE_OLHADAS);
}

/**
 * Sair do app no meio da espera deixaria a mudança parada aqui até a
 * próxima abertura — foi assim que um lançamento feito no celular
 * "não foi" para o computador. Ao esconder a tela, despacha na hora.
 */
function despacharPendente() {
  if (!agendada) return;
  clearTimeout(agendada);
  agendada = null;
  sincronizarAgora({ silenciosa: true });
}

/**
 * Os gestos: puxar para baixo no celular e F5 no computador fazem a
 * mesma coisa. O puxão só é armado com a sincronia ligada — oferecer
 * o gesto a quem não tem banco seria promessa vazia.
 */
export function ligarGestosDeSincronia({ aoPuxar = () => {}, aoSoltar = () => {} } = {}) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { despacharPendente(); return; }
    // Voltar ao app é o momento em que ele mais provavelmente está
    // desatualizado: alguma coisa aconteceu no outro aparelho
    // enquanto este estava guardado no bolso.
    if (estaLigada()) sincronizarAgora({ silenciosa: true });
  });
  window.addEventListener('pagehide', despacharPendente);
  olharDeVezEmQuando();

  const LIMITE = 70;
  const RESISTENCIA = 0.45;
  let inicioY = null;
  let puxada = 0;

  document.addEventListener('touchstart', (e) => {
    if (!estaLigada() || rodando) return;
    if (window.scrollY > 0 || e.touches.length !== 1) return;
    // Não sequestra o gesto dentro de algo que rola ou desliza sozinho.
    if (e.target.closest('.folha, .modal, .fichas, .entrada, #lista .acoes')) return;
    inicioY = e.touches[0].clientY;
    puxada = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (inicioY === null) return;
    const delta = e.touches[0].clientY - inicioY;
    if (delta <= 0 || window.scrollY > 0) { inicioY = null; aoSoltar(); return; }
    e.preventDefault();
    puxada = Math.min(delta * RESISTENCIA, LIMITE + 24);
    aoPuxar(puxada, puxada >= LIMITE);
  }, { passive: false });

  const soltar = () => {
    if (inicioY === null) return;
    const disparar = puxada >= LIMITE;
    inicioY = null;
    puxada = 0;
    aoSoltar();
    if (disparar) sincronizarAgora();
  };
  document.addEventListener('touchend', soltar, { passive: true });
  document.addEventListener('touchcancel', soltar, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F5' || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (estaLigada()) sincronizarAgora();
  });
}
