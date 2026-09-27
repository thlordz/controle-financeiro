// =========================================================
// Recompensas por frequência.
//
// A planta de Log_Modulo mostra a sequência atual e morre quando
// você some por muito tempo. Aqui é o outro lado: o total de dias
// de acesso vira progresso permanente. A planta morre e recomeça do
// zero; o que já foi desbloqueado fica para sempre.
// =========================================================

import { TEMAS } from './temas.js';
import { FUNDOS, TEMA_FUNDO, aplicarFundo } from './fundos.js';

export { TEMAS, FUNDOS };

/**
 * Cores de destaque — só valem para o tema Base ("padrao"): nos demais
 * temas a cor já vem junto do tema (é o "acento" definido em temas.js),
 * então essa vitrine nem aparece. Um punhado de cores, não a paleta
 * inteira — é o tema base "livre", não mais um eixo de progressão à parte.
 */
export const CORES = [
  { id: 'verde', nome: 'Do tema', dias: 0, amostra: null },
  { id: 'azul', nome: 'Azul', dias: 2, claro: '#2563a8', escuro: '#74b0f5' },
  { id: 'roxo', nome: 'Roxo', dias: 3, claro: '#7040c0', escuro: '#b48cf5' },
  { id: 'ciano', nome: 'Ciano', dias: 7, claro: '#0d7f92', escuro: '#4fd8ec' },
  { id: 'rosa', nome: 'Rosa', dias: 14, claro: '#c02d78', escuro: '#ff8ec0' },
  { id: 'ambar', nome: 'Âmbar', dias: 26, claro: '#a06a08', escuro: '#f5c04a' }
];

/** Famílias tipográficas. */
export const FONTES = [
  { id: 'serifada', nome: 'Serifada', dias: 0,
    titulo: '"Iowan Old Style","Palatino Linotype",Palatino,"URW Palladio L","P052","Book Antiqua",Georgia,"Noto Serif","Liberation Serif",serif',
    texto: 'Charter,"Bitstream Charter","Charis SIL",Cambria,Georgia,"Noto Serif","DejaVu Serif","Liberation Serif","Times New Roman",serif' },
  { id: 'humanista', nome: 'Humanista', dias: 5,
    titulo: '"Optima","Gill Sans","Gill Sans MT","Trebuchet MS","Noto Sans",system-ui,sans-serif',
    texto: '"Segoe UI",Roboto,"Helvetica Neue","Noto Sans",system-ui,-apple-system,sans-serif' },
  { id: 'mono', nome: 'Monoespaçada', dias: 10,
    titulo: '"Cascadia Code","JetBrains Mono","DejaVu Sans Mono",Consolas,ui-monospace,monospace',
    texto: '"Cascadia Code","JetBrains Mono","DejaVu Sans Mono",Consolas,ui-monospace,monospace' },
  { id: 'condensada', nome: 'Condensada', dias: 26,
    titulo: '"Oswald","Archivo Narrow","Liberation Sans Narrow","Arial Narrow",Impact,sans-serif',
    texto: '"Segoe UI",Roboto,"Noto Sans",system-ui,sans-serif' },
  { id: 'arredondada', nome: 'Arredondada', dias: 36,
    titulo: '"Nunito","Quicksand","Comfortaa","Trebuchet MS","Noto Sans",system-ui,sans-serif',
    texto: '"Nunito","Quicksand","Trebuchet MS","Noto Sans",system-ui,sans-serif' },
  { id: 'elegante', nome: 'Elegante', dias: 50,
    titulo: '"Didot","Bodoni MT","Playfair Display","Times New Roman",Georgia,serif',
    texto: 'Cambria,Georgia,"Noto Serif","Liberation Serif","Times New Roman",serif' }
];

/** Patentes por total de dias — o rótulo do seu progresso. */
const PATENTES = [
  { dias: 0, nome: 'Recém-chegado' },
  { dias: 3, nome: 'Curioso' },
  { dias: 7, nome: 'Explorador' },
  { dias: 14, nome: 'Aventureiro' },
  { dias: 21, nome: 'Veterano' },
  { dias: 30, nome: 'Mestre' },
  { dias: 45, nome: 'Lenda' },
  { dias: 60, nome: 'Interdimensional' },
  { dias: 80, nome: 'Rick C-137' },
  { dias: 100, nome: 'Vingador' },
  { dias: 120, nome: 'Titã' },
  { dias: 150, nome: 'Eternidade' }
];

/** Marcos de sequência — dependem de constância, não de acúmulo. */
export const MARCOS = [
  { dias: 3, nome: 'Três seguidos', emoji: '🔥' },
  { dias: 7, nome: 'Uma semana', emoji: '⚡' },
  { dias: 14, nome: 'Duas semanas', emoji: '💎' },
  { dias: 30, nome: 'Um mês inteiro', emoji: '👑' },
  { dias: 60, nome: 'Dois meses', emoji: '🛸' },
  { dias: 100, nome: 'Cem dias', emoji: '🏆' }
];

// ---------------------------------------------------------
// Progresso
// ---------------------------------------------------------

/** Total de dias distintos registrados no log de acesso. */
export function diasDeAcesso(dados) {
  return new Set(dados?.logAcesso || []).size;
}

/** Todos os itens desbloqueáveis, numa lista só, em ordem de custo. */
export function catalogo() {
  return [
    ...TEMAS.map((t) => ({ ...t, grupo: 'tema' })),
    ...CORES.map((c) => ({ ...c, grupo: 'cor' })),
    ...FONTES.map((f) => ({ ...f, grupo: 'fonte' })),
    ...FUNDOS.map((f) => ({ ...f, grupo: 'fundo' }))
  ].sort((a, b) => a.dias - b.dias);
}

const ROTULO_GRUPO = { tema: 'Tema', cor: 'Cor', fonte: 'Fonte', fundo: 'Fundo' };

/** Situação atual: patente, próximo desbloqueio e quanto falta. */
export function progresso(dados) {
  const dias = diasDeAcesso(dados);

  const patente = [...PATENTES].reverse().find((p) => dias >= p.dias);
  const indice = PATENTES.indexOf(patente);
  const proximaPatente = PATENTES[indice + 1] || null;

  const proximo = catalogo().find((i) => i.dias > dias) || null;

  const base = patente.dias;
  const alvo = proximaPatente ? proximaPatente.dias : patente.dias;
  const pct = proximaPatente ? Math.min(100, ((dias - base) / (alvo - base)) * 100) : 100;

  return {
    dias,
    patente: patente.nome,
    nivel: indice + 1,
    totalNiveis: PATENTES.length,
    proximaPatente,
    pct,
    proximo: proximo
      ? { ...proximo, rotuloGrupo: ROTULO_GRUPO[proximo.grupo], faltam: proximo.dias - dias }
      : null,
    desbloqueados: catalogo().filter((i) => i.dias <= dias).length,
    total: catalogo().length
  };
}

/** Um item já foi conquistado? */
export function liberado(item, dias) {
  return item.dias <= dias;
}

// ---------------------------------------------------------
// Aplicação visual
// ---------------------------------------------------------

const TOKENS = {
  fundo: '--fundo', cartao: '--fundo-cartao', suave: '--fundo-suave',
  borda: '--borda', texto: '--texto', textoSuave: '--texto-suave',
  textoFraco: '--texto-fraco', acento: '--verde', acentoClaro: '--verde-claro',
  sobreAcento: '--sobre-verde', vermelho: '--vermelho', vermelhoClaro: '--vermelho-claro',
  ambar: '--ambar', ambarClaro: '--ambar-claro', azul: '--azul', azulClaro: '--azul-claro'
};

/** O app está no modo escuro? */
function estaEscuro() {
  const marcado = document.documentElement.dataset.tema;
  if (marcado === 'escuro') return true;
  if (marcado === 'claro') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Clareia (fator > 0) ou escurece (fator < 0) uma cor #rrggbb. */
function sombrear(hex, fator) {
  const n = parseInt(hex.slice(1), 16);
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(fator > 0 ? v + (255 - v) * fator : v * (1 + fator)));
  return '#' + canais.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/** Lê um token do CSS já resolvido, para os fundos combinarem com o tema. */
function tokenAtual(nome, alternativa) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || alternativa;
}

/**
 * Escreve a personalização escolhida nas variáveis do CSS e desenha
 * o fundo. Chamar de novo sempre que o modo claro/escuro mudar.
 */
export function aplicar(personalizacao = {}, dias = Infinity) {
  const raiz = document.documentElement;
  const escuro = estaEscuro();

  // Só vale o que já foi conquistado — protege contra um arquivo de
  // dados editado à mão pedindo um item ainda bloqueado.
  const escolher = (lista, id, padrao) => {
    const item = lista.find((x) => x.id === id);
    return item && liberado(item, dias) ? item : lista.find((x) => x.id === padrao);
  };

  const tema = escolher(TEMAS, personalizacao.tema, 'padrao');
  const ehBase = tema.id === 'padrao';
  const cor = escolher(CORES, personalizacao.cor, 'verde');
  const fonte = escolher(FONTES, personalizacao.fonte, 'serifada');
  // Fora do tema Base, o fundo já vem junto do tema — não é mais uma
  // escolha solta da vitrine, nem passa pelo desbloqueio por dias
  // (ver TEMA_FUNDO em fundos.js; os desenhos aí não são "itens", são
  // parte do próprio tema, que já está desbloqueado).
  const fundo = ehBase
    ? escolher(FUNDOS, personalizacao.fundo, 'liso')
    : { id: TEMA_FUNDO[tema.id] || 'liso', nome: tema.nome, dias: 0 };

  Object.values(TOKENS).forEach((t) => raiz.style.removeProperty(t));

  const paleta = escuro ? tema.escuro : tema.claro;
  if (paleta) {
    for (const [chave, valor] of Object.entries(paleta)) {
      if (TOKENS[chave]) raiz.style.setProperty(TOKENS[chave], valor);
    }
  }

  // A cor de destaque só existe no tema Base — nos demais, o acento já
  // é o do tema, sem sobreposição por cima.
  if (ehBase && cor.id !== 'verde') {
    const c = escuro ? cor.escuro : cor.claro;
    raiz.style.setProperty('--verde', c);
    raiz.style.setProperty('--verde-claro', sombrear(c, escuro ? -0.78 : 0.86));
    raiz.style.setProperty('--sobre-verde', escuro ? sombrear(c, -0.72) : '#ffffff');
  }

  raiz.style.setProperty('--fonte-titulo', fonte.titulo);
  raiz.style.setProperty('--fonte-texto', fonte.texto);

  raiz.dataset.paleta = tema.id;
  raiz.dataset.fundo = fundo.id;

  // O desenho do fundo usa as cores já resolvidas acima.
  aplicarFundo(fundo.id, {
    acento: tokenAtual('--verde', '#12805c'),
    acentoClaro: tokenAtual('--verde-claro', '#e6f5ef'),
    borda: tokenAtual('--borda', '#dde3ea'),
    textoFraco: tokenAtual('--texto-fraco', '#94a3b8'),
    textoSuave: tokenAtual('--texto-suave', '#64748b'),
    cartao: tokenAtual('--fundo-cartao', '#ffffff'),
    azul: tokenAtual('--azul', '#2563a8'),
    ambar: tokenAtual('--ambar', '#b4740b'),
    vermelho: tokenAtual('--vermelho', '#c8353c')
  }, ehBase ? (personalizacao.imagemFundo || '') : '');

  return { tema, cor, fonte, fundo, ehBase };
}
