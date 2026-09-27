// =========================================================
// Fundos desbloqueáveis.
//
// Os ilustrados são desenhos originais, montados em SVG na hora a
// partir das cores do tema em uso — por isso acompanham a paleta e
// funcionam sem internet, direto do pendrive.
//
// Há dois tipos aqui:
//
//   1. Os padrões soltos da vitrine (grade, pontos, estrelas...),
//      que só o tema Base usa.
//   2. As "cenas" dos temas: objetos desenhados em traço fino e
//      espalhados numa grade solta, como um papel de parede. Cada
//      objeto é uma peça de PECAS, desenhada numa caixa de -50 a 50
//      — quem posiciona, gira e dimensiona é a função cena().
//
// Os desenhos daqui são objetos e cenários do gênero, em traço.
// Quando um tema ganha figuras de verdade — arquivos jogados em
// app/img/temas/<tema>/ —, elas tomam o lugar do traço naquele tema:
// a mesma grade solta, mas com a imagem no lugar da peça vetorial.
// Sem arquivo nenhum, o tema continua no desenho de sempre.
//
// "Sua imagem" é o outro escape: você escolhe um arquivo do seu
// computador e ele fica guardado no próprio arquivo de dados.
// =========================================================

import { ARTES, caminhoDaArte } from './artes.js';

export const FUNDOS = [
  { id: 'liso', nome: 'Liso', dias: 0 },
  { id: 'gradiente', nome: 'Gradiente', dias: 3 },
  { id: 'grade', nome: 'Grade', dias: 10 },
  { id: 'pontos', nome: 'Pontilhado', dias: 18 },
  { id: 'estrelas', nome: 'Estrelas', dias: 30 },
  { id: 'portal', nome: 'Portais', dias: 44 },
  { id: 'circuito', nome: 'Circuito', dias: 50 },
  { id: 'cidade', nome: 'Skyline', dias: 58 },
  { id: 'ondas', nome: 'Topografia', dias: 64 },
  { id: 'hexagonos', nome: 'Favo', dias: 76 },
  { id: 'cosmos', nome: 'Cosmos', dias: 88 },
  { id: 'imagem', nome: 'Sua imagem', dias: 95 }
];

/** Envelopa um SVG num data URI aproveitável por background-image. */
function uri(largura, altura, conteudo) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" ` +
    `viewBox="0 0 ${largura} ${altura}">${conteudo}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Repetição pseudoaleatória estável, para os desenhos não "tremerem". */
function aleatorio(semente) {
  let s = semente;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Polígono regular de n lados, centrado na origem. */
function poligono(lados, raio, giro = -Math.PI / 2) {
  return Array.from({ length: lados }, (_, i) => {
    const a = giro + (Math.PI * 2 * i) / lados;
    return `${(Math.cos(a) * raio).toFixed(1)} ${(Math.sin(a) * raio).toFixed(1)}`;
  }).join(' L');
}

/** Marcas radiais em volta da origem — raios de roda, dentes, faíscas. */
function radiais(quantidade, de, ate, giro = 0) {
  return Array.from({ length: quantidade }, (_, i) => {
    const a = giro + (Math.PI * 2 * i) / quantidade;
    return `M${(Math.cos(a) * de).toFixed(1)} ${(Math.sin(a) * de).toFixed(1)}` +
      ` L${(Math.cos(a) * ate).toFixed(1)} ${(Math.sin(a) * ate).toFixed(1)}`;
  }).join(' ');
}

// ---------------------------------------------------------
// Peças
//
// Cada peça devolve o traçado de um objeto dentro de uma caixa que
// vai de -50 a 50 nos dois eixos, sem cor nem espessura: quem define
// isso é a cena, para a linha sair igual em todas elas.
// ---------------------------------------------------------

const PECAS = {

  // ---------------- Portal / laboratório ----------------

  // Redemoinho do portal: espiral fechada dentro de um anel picotado.
  espiral: () => {
    let d = 'M0 0';
    for (let i = 1; i <= 58; i++) {
      const a = i * 0.42;
      const raio = i * 0.66;
      d += ` L${(Math.cos(a) * raio).toFixed(1)} ${(Math.sin(a) * raio).toFixed(1)}`;
    }
    return `<path d="${d}"/><circle r="45" stroke-dasharray="7 10"/>`;
  },

  // Disco voador clássico: casco achatado, cúpula e luzes embaixo.
  nave: () => `
    <ellipse cy="6" rx="44" ry="10"/>
    <path d="M-21 3 a21 17 0 0 1 42 0"/>
    <path d="M-31 12 q31 16 62 0"/>
    <circle cx="-18" cy="16" r="3"/><circle cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`,

  // Pistola de dimensões: corpo, cano, cabo e a ampola de fluido.
  pistola: () => `
    <rect x="-26" y="-10" width="40" height="22" rx="5"/>
    <path d="M14 -4 h18 v12 h-18"/>
    <path d="M-14 12 l-5 22 h13 l5 -22"/>
    <rect x="-23" y="-27" width="15" height="17" rx="4"/>
    <path d="M-15 -27 v-6"/>`,

  // Erlenmeyer com um resto de alguma coisa borbulhando.
  frasco: () => `
    <path d="M-9 -30 h18"/>
    <path d="M-6 -30 v16 L-21 14 a7 7 0 0 0 6 10 h30 a7 7 0 0 0 6 -10 L6 -14 v-16"/>
    <path d="M-15 6 h30"/>
    <circle cx="-4" cy="14" r="3"/><circle cx="7" cy="18" r="2"/>`,

  // Galáxia espiral vista de cima, com o disco em volta.
  galaxia: () => `
    <ellipse rx="11" ry="5" transform="rotate(-25)"/>
    <path d="M9 -6 C 27 -15, 41 -2, 34 13"/>
    <path d="M-9 6 C -27 15, -41 2, -34 -13"/>
    <path d="M-3 -13 C 12 -28, 35 -25, 43 -8" stroke-dasharray="2 7"/>
    <path d="M3 13 C -12 28, -35 25, -43 8" stroke-dasharray="2 7"/>`,

  raio: () => `<path d="M6 -34 L-16 4 h13 L-6 34 L20 -6 H5 z"/>`,

  // ---------------- Caixa ----------------

  // A caixa com o botão vermelho em cima.
  caixa: () => `
    <rect x="-28" y="-12" width="56" height="34" rx="3"/>
    <path d="M-28 0 h56"/>
    <path d="M0 -12 v-7"/>
    <circle cy="-26" r="8"/><circle cy="-26" r="3"/>`,

  botao: () => `<circle r="27"/><circle r="18"/><circle r="8"/>`,

  // Ondas saindo de um ponto — alguém gritando de novo.
  ondasSom: () => `
    <circle cx="-26" r="6"/>
    <path d="M-8 -22 a26 26 0 0 1 0 44"/>
    <path d="M4 -30 a34 34 0 0 1 0 60"/>
    <path d="M16 -38 a44 44 0 0 1 0 76"/>`,

  bandeiraGolfe: () => `
    <path d="M-8 34 v-64"/>
    <path d="M-8 -30 L25 -20 L-8 -10"/>
    <path d="M-21 34 a13 6 0 0 1 26 0"/>`,

  tacoGolfe: () => `
    <path d="M6 -34 v54"/>
    <path d="M6 20 q-2 8 -10 8 h-16 q-5 0 -5 -7 h20"/>
    <path d="M2 -34 h9"/>
    <circle cx="26" cy="26" r="6"/>`,

  // ---------------- Pepino / esgoto ----------------

  pepino: () => `
    <path d="M-22 31 c-10 -10 -5 -26 7 -38 c12 -12 28 -15 34 -8 c6 8 1 23 -11 35 c-12 12 -24 16 -30 11 z"/>
    <path d="M-11 19 l6 -8 M-2 9 l6 -8 M7 -1 l6 -8 M-17 8 l5 -7 M4 21 l5 -7"/>`,

  pote: () => `
    <rect x="-22" y="-16" width="44" height="42" rx="7"/>
    <rect x="-27" y="-29" width="54" height="13" rx="4"/>
    <path d="M-14 -4 v18 M-6 -8 v22"/>`,

  esgoto: () => `
    <circle r="30"/>
    <path d="M-27 -12 h54 M-29 0 h58 M-27 12 h54"/>`,

  chaveInglesa: () => `
    <path d="M-10 30 L10 -12"/>
    <path d="M10 -12 a13 13 0 1 0 12 -18 l-6 12 -10 2 -4 -8 a13 13 0 0 0 8 12 z"/>
    <path d="M-16 34 a7 7 0 0 0 12 -6"/>`,

  // ---------------- Dimensão que deu errado ----------------

  tentaculo: () => `
    <path d="M-30 27 C -10 11, -19 -14, 2 -24 C 16 -31, 31 -22, 31 -8"/>
    <circle cx="-22" cy="19" r="3"/><circle cx="-12" cy="4" r="3"/>
    <circle cx="-2" cy="-13" r="3"/><circle cx="13" cy="-23" r="3"/>`,

  blobOlho: () => `
    <path d="M-27 -6 c-6 -19 12 -29 26 -23 c15 6 25 21 19 33 c-7 13 -27 17 -37 8 c-8 -6 -6 -12 -8 -18 z"/>
    <circle cx="2" cy="5" r="9"/><circle cx="2" cy="5" r="3"/>`,

  helice: () => `
    <path d="M-14 -34 C 14 -20, -14 -6, 14 8 C -6 20, 8 30, -2 36"/>
    <path d="M14 -34 C -14 -20, 14 -6, -14 8 C 6 20, -8 30, 2 36"/>
    <path d="M-11 -24 h22 M-12 -8 h24 M-10 8 h20 M-6 22 h12"/>`,

  // ---------------- Federação ----------------

  naveFed: () => `
    <path d="M0 -34 L16 6 L0 17 L-16 6 z"/>
    <path d="M-16 6 L-37 21 L-10 17 M16 6 L37 21 L10 17"/>
    <path d="M0 17 v14"/>
    <circle cy="-10" r="5"/>`,

  insignia: () => `
    <circle r="30"/>
    <path d="M-16 9 L0 -14 L16 9"/>
    <path d="M-16 19 L0 -4 L16 19"/>
    <path d="${radiais(4, 30, 37)}"/>`,

  planetaAnel: () => `
    <circle r="22"/>
    <ellipse rx="41" ry="12" transform="rotate(-20)"/>
    <path d="M-12 -8 a10 8 0 0 1 13 4"/>`,

  moeda: () => `
    <circle r="24"/><circle r="17"/>
    <path d="M-6 -8 h12 M0 -11 v22 M-6 8 h12"/>`,

  // ---------------- Cidadela ----------------

  torre: () => `
    <path d="M-16 34 v-30 l16 -14 l16 14 v30 z"/>
    <path d="M-16 4 h32 M-8 34 v-15 h16 v15"/>
    <path d="M0 -44 v10"/>`,

  engrenagem: () => `
    <circle r="20"/><circle r="8"/>
    <path d="${radiais(9, 20, 31)}"/>
    <circle r="31" stroke-dasharray="4 10"/>`,

  cupula: () => `
    <path d="M-38 24 a38 34 0 0 1 76 0"/>
    <path d="M-38 24 h76"/>
    <path d="M-21 24 v-16 h10 v16 M2 24 v-25 h12 v25"/>`,

  plataforma: () => `
    <path d="M-30 0 L0 -14 L30 0 L0 14 z"/>
    <path d="M-18 8 v15 M18 8 v15 M0 14 v19"/>`,

  // ---------------- Oficina / armadura ----------------

  reator: () => `
    <circle r="30"/><circle r="20"/><circle r="9"/>
    <path d="M0 -20 L17 10 L-17 10 z"/>
    <path d="${radiais(8, 30, 36)}"/>`,

  foguete: () => `
    <path d="M0 -38 c11 13 15 27 15 41 h-30 c0 -14 4 -28 15 -41 z"/>
    <path d="M-15 15 l-13 13 l11 2 M15 15 l13 13 l-11 2"/>
    <circle cy="-9" r="6"/>
    <path d="M-7 33 q7 13 14 0"/>`,

  parafuso: () => `<path d="M${poligono(6, 26)} z"/><circle r="9"/>`,

  // ---------------- Força bruta ----------------

  punho: () => `
    <path d="M-24 -9 q0 -13 12 -13 h21 q11 0 11 11 v28 q0 12 -14 12 h-17 q-13 0 -13 -12 z"/>
    <path d="M-12 -22 v13 M0 -22 v13 M12 -22 v13"/>
    <path d="M-24 5 h44"/>`,

  rachadura: () => `
    <path d="M-2 -36 L6 -14 L-6 -6 L8 10 L0 20 L10 36"/>
    <path d="M6 -14 L21 -20 M-6 -6 L-21 -2 M8 10 L23 8 M0 20 L-14 27"/>`,

  haltere: () => `
    <path d="M-34 -12 v24 M-24 -19 v38 M24 -19 v38 M34 -12 v24"/>
    <path d="M-24 0 h48"/>`,

  molecula: () => `
    <path d="M${poligono(6, 22)} z"/>
    <circle cy="-22" r="4"/><circle cx="19" cy="-11" r="4"/><circle cx="19" cy="11" r="4"/>
    <circle cy="22" r="4"/><circle cx="-19" cy="11" r="4"/><circle cx="-19" cy="-11" r="4"/>
    <path d="M0 -26 v-9 M22 13 l9 8"/>`,

  // ---------------- Estandarte ----------------

  estrela: () => {
    const p = Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const raio = i % 2 === 0 ? 30 : 13;
      return `${(Math.cos(a) * raio).toFixed(1)} ${(Math.sin(a) * raio).toFixed(1)}`;
    }).join(' L');
    return `<path d="M${p} z"/>`;
  },

  escudo: () => `
    <path d="M0 -31 L27 -21 v21 C27 16 15 29 0 35 C-15 29 -27 16 -27 0 v-21 z"/>
    <path d="M0 -31 v66 M-27 0 h54"/>`,

  chevron: () => `<path d="M-28 13 L0 -12 L28 13"/><path d="M-28 27 L0 2 L28 27"/>`,

  escudoRedondo: () => `
    <circle r="30"/><circle r="20"/><circle r="7"/>
    <path d="${radiais(8, 7, 20)}"/>`,

  // ---------------- Reino escondido ----------------

  lanca: () => `
    <path d="M0 35 v-41"/>
    <path d="M0 -35 c9 11 9 19 0 29 c-9 -10 -9 -18 0 -29 z"/>
    <path d="M-6 7 h12 M-5 19 h10"/>`,

  mascara: () => `
    <path d="M-20 -27 h40 q7 0 7 9 v24 q0 21 -27 27 q-27 -6 -27 -27 v-24 q0 -9 7 -9 z"/>
    <path d="M-14 -7 h11 M3 -7 h11"/>
    <path d="M-7 11 h14"/>`,

  cristal: () => `
    <path d="M0 -35 L15 -12 L9 31 L-9 31 L-15 -12 z"/>
    <path d="M-15 -12 h30 M0 -35 v66"/>`,

  hexEngaste: () => `<path d="M${poligono(6, 24)} z"/><circle r="7"/>`,

  // ---------------- Feitiçaria ----------------

  mandala: () => `
    <circle r="32"/><circle r="21"/>
    <path d="${radiais(16, 28, 36)}"/>
    <path d="M${poligono(3, 18)} z"/>`,

  anelFaisca: () => `
    <circle r="24" stroke-dasharray="9 6"/>
    <path d="${radiais(12, 27, 35)}"/>`,

  livro: () => `
    <path d="M0 -18 c-10 -8 -23 -8 -33 -4 v37 c10 -4 23 -4 33 4 z"/>
    <path d="M0 -18 c10 -8 23 -8 33 -4 v37 c-10 -4 -23 -4 -33 4 z"/>
    <path d="M0 -18 v37"/>`,

  ampulheta: () => `
    <path d="M-20 -31 h40 M-20 31 h40"/>
    <path d="M-16 -31 c0 16 16 23 16 31 c0 -8 16 -15 16 -31"/>
    <path d="M-16 31 c0 -16 16 -23 16 -31 c0 8 16 15 16 31"/>`,

  // ---------------- Reino dourado ----------------

  martelo: () => `
    <rect x="-24" y="-31" width="48" height="27" rx="4"/>
    <path d="M-12 -31 v27 M12 -31 v27"/>
    <path d="M0 -4 v35"/>
    <path d="M-7 31 h14"/>`,

  feixe: () => `<path d="M-34 35 L-9 -35 M-16 35 L9 -35 M2 35 L27 -35"/>`,

  // ---------------- Vitrine / neon ----------------

  predioNeon: () => `
    <path d="M-25 35 v-58 h34 v58"/>
    <path d="M-25 -9 h34 M-25 8 h34 M-25 22 h34"/>
    <path d="M-17 -23 v-9 M1 -23 v-9"/>
    <rect x="14" y="-30" width="15" height="41" rx="2"/>
    <path d="M18 -22 h7 M18 -12 h7 M18 -1 h7"/>`,

  placaNeon: () => `
    <rect x="-12" y="-32" width="24" height="57" rx="3"/>
    <path d="M-5 -24 h10 M-5 -12 h10 M-5 0 h10 M-5 12 h10"/>
    <path d="M0 -32 v-8"/>`,

  chuva: () => `<path d="M-24 -30 L-32 10 M-8 -34 L-16 6 M8 -30 L0 10 M24 -34 L16 6 M34 -24 L28 4"/>`,

  antena: () => `
    <path d="M-16 35 L0 -30 L16 35"/>
    <path d="M-11 12 h22 M-7 -4 h14"/>
    <path d="M0 -30 v-7"/>
    <path d="M-9 -33 a13 13 0 0 1 18 0"/>
    <path d="M-15 -39 a22 22 0 0 1 30 0"/>`,

  // ---------------- Terminal ----------------

  monitor: () => `
    <rect x="-32" y="-27" width="64" height="45" rx="6"/>
    <rect x="-24" y="-19" width="48" height="29" rx="3"/>
    <path d="M-8 18 v8 h16 v-8 M-19 26 h38"/>
    <path d="M-18 -11 h24 M-18 -2 h30"/>`,

  disquete: () => `
    <path d="M-26 -26 h44 l8 8 v44 h-52 z"/>
    <path d="M-14 -26 v18 h28 v-18"/>
    <path d="M-16 26 h32 v-17 h-32 z"/>`,

  teclado: () => `
    <rect x="-34" y="-15" width="68" height="31" rx="4"/>
    <path d="M-28 -6 h56 M-28 3 h56"/>
    <path d="M-14 11 h28"/>`,

  cursor: () => `<path d="M-22 -15 L-5 0 L-22 15"/><path d="M2 15 h22"/>`,

  // ---------------- Céu profundo ----------------

  satelite: () => `
    <rect x="-10" y="-13" width="20" height="26" rx="3"/>
    <path d="M-10 -5 h-27 v13 h27 M10 -5 h27 v13 h-27"/>
    <path d="M-30 -5 v13 M-22 -5 v13 M22 -5 v13 M30 -5 v13"/>
    <path d="M0 -13 v-11"/>`,

  cometa: () => `
    <circle cx="19" cy="-17" r="8"/>
    <path d="M11 -11 L-29 23 M15 -5 L-15 25 M5 -19 L-31 9"/>`,

  constelacao: () => `
    <path d="M-28 -18 L-6 -27 L11 -6 L30 -15 M-6 -27 L-2 5 L-24 21 M11 -6 L15 23"/>
    <circle cx="-28" cy="-18" r="3"/><circle cx="-6" cy="-27" r="3"/>
    <circle cx="11" cy="-6" r="3"/><circle cx="30" cy="-15" r="3"/>
    <circle cx="-2" cy="5" r="3"/><circle cx="-24" cy="21" r="3"/><circle cx="15" cy="23" r="3"/>`,

  // ---------------- Masmorra ----------------

  espada: () => `
    <path d="M0 -36 L6 -26 V15 H-6 V-26 z"/>
    <path d="M-16 17 h32"/>
    <path d="M0 17 v13"/>
    <circle cy="33" r="4"/>`,

  pocao: () => `
    <path d="M-6 -30 h12 v11 l12 16 v22 q0 8 -8 8 h-20 q-8 0 -8 -8 v-22 l12 -16 z"/>
    <path d="M-21 7 q21 8 42 0"/>
    <path d="M-9 -34 h18"/>`,

  d20: () => `
    <path d="M${poligono(6, 32, -Math.PI / 2)} z"/>
    <path d="M0 -32 L-17 7 L17 7 z"/>
    <path d="M-28 -16 L-17 7 M28 -16 L17 7 M-28 16 L-17 7 M28 16 L17 7 M0 32 L-17 7 M0 32 L17 7"/>`,

  tocha: () => `
    <path d="M-5 34 h10 l3 -34 h-16 z"/>
    <path d="M-11 0 h22"/>
    <path d="M0 -34 c11 11 11 19 0 27 c-11 -8 -11 -16 0 -27 z"/>`,

  bau: () => `
    <path d="M-28 31 v-19 h56 v19 z"/>
    <path d="M-28 12 a28 19 0 0 1 56 0"/>
    <path d="M-4 6 h8 v15 h-8 z"/>`,

  // ---------------- Fliperama ----------------

  // Controle de dois analógicos: corpo, cruz direcional e botões.
  controle: () => `
    <path d="M-38 -6 q-8 22 2 30 q9 7 14 -6 l4 -10 h36 l4 10 q5 13 14 6 q10 -8 2 -30 q-5 -14 -19 -14 h-38 q-14 0 -19 14"/>
    <path d="M-25 4 h14 M-18 -3 v14"/>
    <circle cx="16" cy="0" r="3.5"/><circle cx="27" cy="-8" r="3.5"/>`,

  // Manche de fliperama: base, haste e a bola em cima.
  manche: () => `
    <rect x="-32" y="18" width="64" height="16" rx="4"/>
    <path d="M0 18 v-22"/>
    <circle cy="-14" r="11"/>
    <circle cx="-18" cy="26" r="3.5"/><circle cx="18" cy="26" r="3.5"/>`,

  // Cartucho de console: etiqueta em cima e os contatos embaixo.
  cartucho: () => `
    <path d="M-28 -32 h56 v46 q0 6 -6 6 h-10 v12 h-24 v-12 h-10 q-6 0 -6 -6 z"/>
    <rect x="-19" y="-24" width="38" height="20" rx="3"/>
    <path d="M-13 26 v6 M-4 26 v6 M5 26 v6 M14 26 v6"/>`,

  // Moeda de ficha, de três quartos, com a fenda no meio.
  ficha: () => `
    <circle r="26"/><circle r="18"/>
    <path d="M-5 -8 h10 v16 h-10 z"/>`,

  // Naves de tiro vertical, em formação.
  naveTiro: () => `
    <path d="M0 -30 l12 26 l-4 12 h-16 l-4 -12 z"/>
    <path d="M-8 -2 l-18 12 v10 l14 -8 M8 -2 l18 12 v10 l-14 -8"/>
    <path d="M0 20 v14"/>`,

  // Peça de encaixe em L, como as que caem.
  bloco: () => `
    <rect x="-30" y="-30" width="20" height="20"/>
    <rect x="-30" y="-10" width="20" height="20"/>
    <rect x="-30" y="10" width="20" height="20"/>
    <rect x="-10" y="10" width="20" height="20"/>`,

  // Coração de vida desenhado em degraus, como em tela de pixel.
  coracaoPixel: () => `
    <path d="M-24 -12 v-8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v12 h-8 v8 h-8 v8 h-8 v8 h-8 v-8 h-8 v-8 h-8 v-12 z"/>`,

  // Gabinete de fliperama visto de frente.
  gabinete: () => `
    <path d="M-26 34 v-52 q0 -8 6 -12 h40 q6 4 6 12 v52 z"/>
    <rect x="-17" y="-24" width="34" height="22" rx="2"/>
    <path d="M-20 6 h40"/>
    <circle cx="-8" cy="16" r="3"/><circle cx="4" cy="16" r="3"/><circle cx="15" cy="16" r="3"/>`,
};

// ---------------------------------------------------------
// Cena
//
// Espalha as peças numa grade solta: uma por célula, com posição,
// giro e tamanho sorteados dentro de limites curtos. Como nenhuma
// peça encosta na borda do ladrilho, o fundo repete sem emenda.
//
// A espessura do traço é dividida pela escala do item, para todas as
// linhas saírem com a mesma grossura na tela, independente do tamanho
// do objeto — é isso que dá o ar de desenho a nanquim.
// ---------------------------------------------------------

const LADO = 780;
const COLUNAS = 4;

function cena(nomes, semente) {
  return (c) => {
    const r = aleatorio(semente);
    const celula = LADO / COLUNAS;
    const itens = [];
    let i = 0;

    for (let linha = 0; linha < COLUNAS; linha++) {
      for (let coluna = 0; coluna < COLUNAS; coluna++) {
        const peca = PECAS[nomes[i % nomes.length]];
        i++;
        if (!peca) continue;

        const escala = 0.78 + r() * 0.3;
        const giro = (r() * 40 - 20).toFixed(1);
        const x = coluna * celula + celula / 2 + (r() - 0.5) * celula * 0.3;
        const y = linha * celula + celula / 2 + (r() - 0.5) * celula * 0.3;
        // Um em cada cinco puxa a cor de acento, para o tema aparecer;
        // o resto fica no cinza fraco do texto, que some no fundo sem sumir.
        const destaque = r() < 0.2;

        itens.push(
          `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) ` +
          `rotate(${giro}) scale(${escala.toFixed(3)})" ` +
          `stroke="${destaque ? c.acento : c.textoFraco}" ` +
          `stroke-width="${(1.7 / escala).toFixed(2)}" ` +
          `opacity="${destaque ? '.5' : '.34'}">${peca(c)}</g>`
        );
      }
    }

    return {
      imagem: uri(LADO, LADO,
        `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${itens.join('')}</g>`),
      tamanho: `${LADO}px ${LADO}px`
    };
  };
}

// ---------------------------------------------------------
// Desenhos
//
// Cada função recebe as cores já resolvidas do tema:
//   { acento, acentoClaro, borda, textoFraco, textoSuave, cartao }
// ---------------------------------------------------------

const DESENHOS = {

  // ---- padrões soltos, da vitrine do tema Base ----

  grade: (c) => ({
    imagem: uri(34, 34,
      `<path d="M34 0H0v34" fill="none" stroke="${c.borda}" stroke-width="1"/>`),
    tamanho: '34px 34px'
  }),

  pontos: (c) => ({
    imagem: uri(20, 20, `<circle cx="2" cy="2" r="1.4" fill="${c.borda}"/>`),
    tamanho: '20px 20px'
  }),

  estrelas: (c) => {
    const r = aleatorio(7);
    const pontos = Array.from({ length: 46 }, () => {
      const x = (r() * 320).toFixed(1);
      const y = (r() * 320).toFixed(1);
      const raio = (0.7 + r() * 1.1).toFixed(2);
      const opacidade = (0.35 + r() * 0.6).toFixed(2);
      return `<circle cx="${x}" cy="${y}" r="${raio}" fill="${c.textoFraco}" opacity="${opacidade}"/>`;
    }).join('');
    return { imagem: uri(320, 320, pontos), tamanho: '320px 320px' };
  },

  // Redemoinhos concêntricos, como um portal aberto no ar.
  portal: (c) => {
    const anel = (cx, cy, escala) => Array.from({ length: 4 }, (_, i) => {
      const raio = (14 + i * 11) * escala;
      const largura = (2.5 - i * 0.35) * escala;
      const opacidade = (0.55 - i * 0.1).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${raio.toFixed(1)}" fill="none"
        stroke="${c.acento}" stroke-width="${largura.toFixed(2)}" opacity="${opacidade}"
        stroke-dasharray="${(raio * 1.7).toFixed(1)} ${(raio * 0.5).toFixed(1)}"/>`;
    }).join('') + `<circle cx="${cx}" cy="${cy}" r="${9 * escala}" fill="${c.acento}" opacity=".16"/>`;

    return {
      imagem: uri(520, 520, anel(110, 120, 1.35) + anel(390, 330, 0.95) + anel(230, 440, 0.6)),
      tamanho: '520px 520px'
    };
  },

  // Trilhas de placa de circuito, com ilhas de solda.
  circuito: (c) => {
    const t = `stroke="${c.borda}" stroke-width="1.6" fill="none"`;
    const ilha = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c.acento}" opacity=".45"/>`;
    return {
      imagem: uri(240, 240,
        `<path d="M20 20h60v44h52" ${t}/>
         <path d="M132 64v52h64" ${t}/>
         <path d="M20 96v76h48v48" ${t}/>
         <path d="M196 20v44h24" ${t}/>
         <path d="M68 172h72v-40" ${t}/>
         <path d="M196 116v64h-56" ${t}/>
         ${ilha(80, 64)}${ilha(132, 116)}${ilha(196, 64)}${ilha(68, 172)}${ilha(140, 132)}${ilha(196, 180)}`),
      tamanho: '240px 240px'
    };
  },

  // Silhueta de cidade, ancorada na base da tela.
  cidade: (c) => {
    const r = aleatorio(21);
    let x = 0;
    const predios = [];
    while (x < 900) {
      const largura = 26 + Math.floor(r() * 44);
      const altura = 40 + Math.floor(r() * 150);
      predios.push(`<rect x="${x}" y="${220 - altura}" width="${largura - 4}" height="${altura}"
        fill="${c.borda}" opacity=".55"/>`);
      // janelas acesas
      for (let jy = 220 - altura + 10; jy < 212; jy += 14) {
        for (let jx = x + 6; jx < x + largura - 10; jx += 12) {
          if (r() > 0.62) {
            predios.push(`<rect x="${jx}" y="${jy}" width="4" height="6"
              fill="${c.acento}" opacity=".5"/>`);
          }
        }
      }
      x += largura;
    }
    return {
      imagem: uri(900, 220, predios.join('')),
      tamanho: '900px 220px',
      posicao: 'bottom center',
      repetir: 'repeat-x'
    };
  },

  // Curvas de nível, como um mapa topográfico.
  ondas: (c) => {
    const linhas = Array.from({ length: 9 }, (_, i) => {
      const y = 24 + i * 34;
      const amp = 12 + (i % 3) * 7;
      return `<path d="M0 ${y} C 80 ${y - amp}, 160 ${y + amp}, 240 ${y}
        S 400 ${y - amp}, 480 ${y}" fill="none" stroke="${c.borda}"
        stroke-width="1.4" opacity=".8"/>`;
    }).join('');
    return { imagem: uri(480, 330, linhas), tamanho: '480px 330px' };
  },

  hexagonos: (c) => ({
    imagem: uri(56, 96,
      `<g fill="none" stroke="${c.borda}" stroke-width="1.3">
         <path d="M28 2 L52 16 V44 L28 58 L4 44 V16 Z"/>
         <path d="M0 50 L4 48"/><path d="M56 50 L52 48"/>
         <path d="M28 58 V72"/>
         <path d="M28 72 L52 86 M28 72 L4 86"/>
       </g>`),
    tamanho: '56px 96px'
  }),

  // Planetas e poeira estelar.
  cosmos: (c) => {
    const r = aleatorio(13);
    const estrelas = Array.from({ length: 70 }, () =>
      `<circle cx="${(r() * 640).toFixed(1)}" cy="${(r() * 640).toFixed(1)}"
        r="${(0.6 + r() * 1.2).toFixed(2)}" fill="${c.textoFraco}"
        opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`).join('');

    const planeta = (cx, cy, raio, cor, anel) => `
      <circle cx="${cx}" cy="${cy}" r="${raio}" fill="${cor}" opacity=".22"/>
      <circle cx="${cx}" cy="${cy}" r="${raio}" fill="none" stroke="${cor}"
        stroke-width="1.4" opacity=".5"/>
      ${anel ? `<ellipse cx="${cx}" cy="${cy}" rx="${raio * 1.8}" ry="${raio * 0.45}"
        fill="none" stroke="${cor}" stroke-width="1.6" opacity=".45"
        transform="rotate(-22 ${cx} ${cy})"/>` : ''}`;

    return {
      imagem: uri(640, 640,
        estrelas +
        planeta(110, 150, 46, c.acento, true) +
        planeta(500, 420, 30, c.textoSuave, false) +
        planeta(330, 560, 18, c.acento, false)),
      tamanho: '640px 640px'
    };
  },

  // ---- cenas dos temas ----

  cenaPortal: cena(['espiral', 'nave', 'pistola', 'frasco', 'galaxia', 'raio'], 5),
  cenaMeeseeks: cena(['caixa', 'botao', 'tacoGolfe', 'bandeiraGolfe', 'ondasSom'], 11),
  cenaPickle: cena(['pepino', 'pote', 'esgoto', 'chaveInglesa', 'frasco'], 23),
  cenaCronenberg: cena(['blobOlho', 'tentaculo', 'helice', 'frasco', 'pote'], 29),
  cenaFederacao: cena(['naveFed', 'insignia', 'planetaAnel', 'moeda', 'estrela', 'raio'], 37),
  cenaCidadela: cena(['torre', 'engrenagem', 'cupula', 'plataforma', 'nave', 'insignia'], 41),

  cenaFerro: cena(['reator', 'foguete', 'parafuso', 'engrenagem', 'raio'], 47),
  cenaHulk: cena(['punho', 'rachadura', 'haltere', 'molecula', 'frasco'], 53),
  cenaCapitao: cena(['escudoRedondo', 'estrela', 'escudo', 'chevron', 'punho'], 59),
  cenaWakanda: cena(['lanca', 'mascara', 'cristal', 'hexEngaste', 'molecula'], 61),
  cenaEstranho: cena(['mandala', 'anelFaisca', 'livro', 'ampulheta', 'espiral'], 67),
  cenaAsgard: cena(['martelo', 'feixe', 'torre', 'escudoRedondo', 'raio', 'cristal'], 71),
  cenaManopla: cena(['hexEngaste', 'cristal', 'estrela', 'parafuso', 'mandala'], 73),

  cenaArcade: cena(['controle', 'manche', 'cartucho', 'ficha', 'naveTiro', 'bloco', 'coracaoPixel', 'gabinete'], 101),
  cenaNeon: cena(['predioNeon', 'placaNeon', 'antena', 'monitor', 'cursor', 'chuva'], 79),
  cenaTerminal: cena(['monitor', 'disquete', 'teclado', 'cursor'], 83),
  cenaNebulosa: cena(['planetaAnel', 'satelite', 'cometa', 'constelacao', 'foguete', 'galaxia'], 89),
  cenaMasmorra: cena(['espada', 'escudo', 'pocao', 'd20', 'tocha', 'bau'], 97)
};

/**
 * Fundo automático de cada tema desbloqueável (grupo "Rick and Morty",
 * "Marvel", "Geek") — o tema já vem com a cena que combina com ele,
 * em vez do usuário escolher um fundo solto. Só o tema Base ("padrao")
 * continua com o fundo livre da vitrine.
 */
export const TEMA_FUNDO = {
  portal: 'cenaPortal',
  meeseeks: 'cenaMeeseeks',
  pickle: 'cenaPickle',
  cronenberg: 'cenaCronenberg',
  federacao: 'cenaFederacao',
  cidadela: 'cenaCidadela',
  homemDeFerro: 'cenaFerro',
  hulk: 'cenaHulk',
  capitao: 'cenaCapitao',
  wakanda: 'cenaWakanda',
  estranho: 'cenaEstranho',
  asgard: 'cenaAsgard',
  manopla: 'cenaManopla',
  arcade: 'cenaArcade',
  neon: 'cenaNeon',
  terminal: 'cenaTerminal',
  nebulosa: 'cenaNebulosa',
  masmorra: 'cenaMasmorra'
};

// ---------------------------------------------------------
// Arte dos temas
//
// A tela roda em file:// no Electron, e ali fetch e XHR são
// bloqueados — quem lê os arquivos é o processo principal, pelo
// cf:arte. No Android (https://localhost) e no navegador o fetch
// resolve sozinho. Os dois caminhos devolvem a mesma coisa: o
// arquivo já como data URI, que é o que o SVG do papel de parede
// sabe embutir.
//
// O resultado fica guardado: a leitura acontece uma vez por tema,
// e trocar de tela ou de cor não relê nada.
// ---------------------------------------------------------
const ARTE_LIDA = new Map();

function comoDataURI(blob) {
  return new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result || ''));
    leitor.onerror = () => erro(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

async function lerArte(caminho) {
  try {
    if (window.cfAPI?.arte) return await window.cfAPI.arte(caminho);
    const resposta = await fetch(caminho);
    if (!resposta.ok) return '';
    return await comoDataURI(await resposta.blob());
  } catch {
    return '';
  }
}

/** Data URIs das figuras de um tema, na ordem, sem as que falharam. */
export async function artesDoTema(tema) {
  const arquivos = ARTES[tema] || [];
  if (!arquivos.length) return [];
  if (ARTE_LIDA.has(tema)) return ARTE_LIDA.get(tema);

  const promessa = Promise.all(
    arquivos.map((a) => lerArte(caminhoDaArte(tema, a)))
  ).then((lista) => lista.filter(Boolean));

  ARTE_LIDA.set(tema, promessa);
  return promessa;
}

/**
 * Mesma grade solta da cena vetorial, mas com as figuras do tema.
 *
 * Cada figura entra uma única vez em <defs> e é reaproveitada com
 * <use>: sem isso, uma imagem que aparece em quatro casas da grade
 * seria embutida quatro vezes, e o papel de parede pesaria quatro
 * vezes mais do que precisa.
 */
function montarCenaDeArte(uris, semente = 11) {
  const r = aleatorio(semente);
  const celula = LADO / COLUNAS;

  const defs = uris.map((u, i) =>
    `<image id="a${i}" href="${u}" x="-50" y="-50" width="100" height="100" ` +
    `preserveAspectRatio="xMidYMid meet"/>`).join('');

  const itens = [];
  let i = 0;
  for (let linha = 0; linha < COLUNAS; linha++) {
    for (let coluna = 0; coluna < COLUNAS; coluna++) {
      const alvo = i % uris.length;
      i++;
      // A figura ocupa pouco mais da metade da casa: perto o bastante
      // para se reconhecer, longe o bastante para não encostar na
      // vizinha. O giro é pequeno porque personagem torto incomoda.
      const escala = (celula * (0.58 + r() * 0.16)) / 100;
      const giro = (r() * 16 - 8).toFixed(1);
      const x = coluna * celula + celula / 2 + (r() - 0.5) * celula * 0.24;
      const y = linha * celula + celula / 2 + (r() - 0.5) * celula * 0.24;

      itens.push(
        `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) ` +
        `rotate(${giro}) scale(${escala.toFixed(3)})">` +
        `<use href="#a${alvo}"/></g>`
      );
    }
  }

  return {
    imagem: uri(LADO, LADO,
      `<defs>${defs}</defs><g opacity="${OPACIDADE_ARTE}">${itens.join('')}</g>`),
    tamanho: `${LADO}px ${LADO}px`,
    posicao: 'top left',
    repetir: 'repeat'
  };
}

/** Quanto a figura desbota para não brigar com o texto por cima. */
const OPACIDADE_ARTE = 0.22;

/**
 * Devolve as propriedades de background para o fundo escolhido.
 * `cores` sai da paleta em uso; `imagemPropria` é o data URI que o
 * usuário escolheu, quando o fundo é "imagem".
 */
export function estiloDoFundo(id, cores, imagemPropria = '') {
  if (id === 'imagem') {
    if (!imagemPropria) return null;
    return {
      imagem: `url("${imagemPropria}")`,
      tamanho: 'cover',
      posicao: 'center center',
      repetir: 'no-repeat'
    };
  }

  if (id === 'gradiente') {
    return {
      imagem: `radial-gradient(120% 80% at 50% 0%, ${cores.acentoClaro} 0%, transparent 62%)`,
      tamanho: 'auto',
      posicao: 'top center',
      repetir: 'no-repeat'
    };
  }

  const desenho = DESENHOS[id];
  if (!desenho) return null;

  const r = desenho(cores);
  return {
    imagem: r.imagem,
    tamanho: r.tamanho,
    posicao: r.posicao || 'top left',
    repetir: r.repetir || 'repeat'
  };
}

/** Aplica (ou limpa) o fundo no elemento raiz. */
export function aplicarFundo(id, cores, imagemPropria = '') {
  const estilo = estiloDoFundo(id, cores, imagemPropria);
  const corpo = document.body;

  if (!estilo) {
    corpo.style.removeProperty('background-image');
    corpo.style.removeProperty('background-size');
    corpo.style.removeProperty('background-position');
    corpo.style.removeProperty('background-repeat');
    return;
  }

  corpo.style.backgroundImage = estilo.imagem;
  corpo.style.backgroundSize = estilo.tamanho;
  corpo.style.backgroundPosition = estilo.posicao;
  corpo.style.backgroundRepeat = estilo.repetir;
}
