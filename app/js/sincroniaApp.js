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
  sincronizar, baixar, garantirTabela,
  lerConfiguracao, gravarConfiguracao, estaLigada,
} from './sincronia.js';
import { agora, registrarRemocao } from './dominio.js';

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

/* ---------------- espelhar o banco ---------------- */

/**
 * Jogar fora o que está aqui e ficar com o que o banco tem.
 *
 * A sincronia normal é uma UNIÃO: ela traz o que falta e nunca tira o
 * que sobra. É o certo no dia a dia — some com um lançamento por
 * engano e ele volta do outro aparelho. Mas quando um aparelho
 * acumulou coisa que nunca esteve no banco, a união não conserta: os
 * dois números nunca mais se encontram.
 *
 * Esta função é a saída para isso, e é destrutiva de propósito: o que
 * está aqui e não está no banco **some**. Por isso quem chama tem de
 * perguntar antes, e oferecer um backup.
 */
export async function trazerTudoDoBanco() {
  const cliente = clienteDaSincronia();
  if (!cliente) return { ok: false, recado: 'Falta o endereço do banco ou o token.' };
  if (rodando) return { ok: false, recado: 'Espera a sincronia que está rodando terminar.' };

  rodando = true;
  dizer('Trazendo tudo do banco…');
  try {
    await garantirTabela(cliente);
    const { remoto, maisNovo } = await baixar(cliente, '');

    const quantos = ['receitas', 'despesas', 'devedores', 'investimento']
      .reduce((t, k) => t + (remoto[k] || []).length, 0);
    if (!quantos) {
      dizer('O banco está vazio. Não troquei nada.', 'ruim');
      return { ok: false, recado };
    }

    const daqui = pegarDados() || {};
    const antes = ['receitas', 'despesas', 'devedores', 'investimento']
      .reduce((t, k) => t + (daqui[k] || []).length, 0);

    // Fica exatamente o que o banco tem. As marcas de exclusão
    // antigas vão junto: elas falavam de ids deste aparelho, e este
    // aparelho acabou de deixar de existir.
    await aplicarDados({
      versao: daqui.versao || 1,
      config: Object.keys(remoto.config || {}).length ? remoto.config : (daqui.config || {}),
      receitas: remoto.receitas,
      despesas: remoto.despesas,
      devedores: remoto.devedores,
      investimento: remoto.investimento,
      logAcesso: remoto.logAcesso || [],
      recordes: remoto.recordes || {},
      cicloInicio: remoto.cicloInicio || '',
      diasProtegidos: remoto.diasProtegidos || [],
      escudoBonus: remoto.escudoBonus || 0,
      escudoBonusVersao: remoto.escudoBonusVersao || '',
      removidos: [],
      sincroniaIniciada: true,
      salvoEm: '',
    });

    gravarConfiguracao({ marca: maisNovo, em: new Date().toISOString() });
    const diferenca = quantos - antes;
    dizer(`Pronto: este aparelho agora tem os ${quantos} lançamentos do banco`
      + (diferenca ? ` (${diferenca > 0 ? '+' : ''}${diferenca}).` : '.'), 'bom');
    return { ok: true, recado, quantos };
  } catch (e) {
    dizer(emPortugues(e), 'ruim');
    return { ok: false, recado };
  } finally {
    rodando = false;
    anunciar();
  }
}

/**
 * O caminho contrário: o banco passa a ser uma cópia DESTE aparelho.
 *
 * É o conserto para o caso que mais dói — um aparelho certo e os
 * outros errados. Trazer tudo do banco não resolve ali, porque o
 * aparelho errado sobe o que tem de errado assim que abre, e aí o
 * banco também fica errado.
 *
 * Aqui quem manda é este aparelho: tudo que existe no banco e não
 * existe aqui vira uma exclusão, com carimbo de agora. Os outros
 * aparelhos recebem essas exclusões na sincronia seguinte e passam a
 * mostrar o mesmo que este. Nenhum dado é apagado à força em ninguém:
 * o que viaja é a marca, e ela segue a mesma regra de sempre.
 */
export async function mandarNoBanco() {
  const cliente = clienteDaSincronia();
  if (!cliente) return { ok: false, recado: 'Falta o endereço do banco ou o token.' };
  if (rodando) return { ok: false, recado: 'Espera a sincronia que está rodando terminar.' };

  const dados = pegarDados();
  if (!dados) return { ok: false, recado: 'Ainda estou abrindo o app.' };

  rodando = true;
  dizer('Deixando o banco igual a este aparelho…');
  try {
    await garantirTabela(cliente);

    const [r] = await cliente.executar(
      `SELECT tipo, id FROM registros WHERE removido = 0 AND tipo != 'estado'`);

    const LISTAS = ['receitas', 'despesas', 'devedores', 'investimento'];
    const daqui = {};
    for (const t of LISTAS) daqui[t] = new Set((dados[t] || []).map((x) => x?.id));

    let marcados = 0;
    for (const linha of r?.linhas || []) {
      if (!LISTAS.includes(linha.tipo)) continue;
      if (daqui[linha.tipo].has(linha.id)) continue;
      registrarRemocao(dados, linha.tipo, linha.id);
      marcados++;
    }

    // Tudo daqui sobe com carimbo de agora: assim nada deste aparelho
    // perde para uma versão mais nova que esteja lá.
    const momento = agora();
    for (const t of LISTAS) {
      for (const item of dados[t] || []) item.atualizadoEm = momento;
    }

    rodando = false;                 // a rodada abaixo precisa poder entrar
    const r2 = await sincronizarAgora({ silenciosa: true });
    if (!r2.ok) return r2;

    dizer(marcados
      ? `Pronto. Mandei apagar ${marcados} que não existem aqui; os outros aparelhos somem com eles na próxima sincronia.`
      : 'Pronto. O banco já estava igual a este aparelho.', 'bom');
    return { ok: true, recado, marcados };
  } catch (e) {
    dizer(emPortugues(e), 'ruim');
    return { ok: false, recado };
  } finally {
    rodando = false;
    anunciar();
  }
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
