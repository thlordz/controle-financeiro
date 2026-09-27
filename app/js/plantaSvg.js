// =========================================================
// Desenho da planta por estágio.
// Os estágios são os mesmos definidos no VBA (Log_Modulo):
// Semente / Brotando / Crescendo / Florescendo  (crescimento)
// Murchando / Seca / Abandonada                 (declínio)
// =========================================================

const VASO = `
  <path class="pl-vaso" d="M30 88h40l-4.5 20a4 4 0 0 1-4 3.4H38.5a4 4 0 0 1-4-3.4z"/>
  <rect class="pl-vaso-borda" x="26" y="80" width="48" height="10" rx="3.4"/>
  <ellipse class="pl-terra" cx="50" cy="81.5" rx="20" ry="3.4"/>
`;

function folha(x, y, rot, escala = 1, classe = 'pl-folha') {
  return `<ellipse class="${classe}" cx="0" cy="0" rx="${11 * escala}" ry="${5.4 * escala}"
    transform="translate(${x} ${y}) rotate(${rot})"/>`;
}

function flor(x, y, escala = 1) {
  const petalas = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse class="pl-flor" cx="0" cy="${-5 * escala}" rx="${3.2 * escala}" ry="${5 * escala}"
      transform="rotate(${a})"/>`)
    .join('');
  return `<g transform="translate(${x} ${y})">${petalas}
    <circle class="pl-miolo" cx="0" cy="0" r="${2.6 * escala}"/></g>`;
}

const DESENHOS = {
  semente: () => `
    ${VASO}
    <g class="planta__folhagem">
      <ellipse class="pl-semente" cx="50" cy="78" rx="4.4" ry="3.2"/>
      <path class="pl-caule" d="M50 79v-7"/>
      ${folha(45, 71, -28, .48)}
      ${folha(55, 71, 28, .48)}
    </g>`,

  brotando: () => `
    ${VASO}
    <g class="planta__folhagem">
      <path class="pl-caule" d="M50 80C50 68 50 60 50 53"/>
      ${folha(41, 65, -26, .72)}
      ${folha(59, 60, 26, .72)}
      ${folha(50, 51, 0, .58, 'pl-folha-escura')}
    </g>`,

  crescendo: () => `
    ${VASO}
    <g class="planta__folhagem">
      <path class="pl-caule" d="M50 80C50 66 51 52 50 38"/>
      ${folha(39, 68, -24, .88)}
      ${folha(61, 61, 24, .88)}
      ${folha(38, 52, -22, .78)}
      ${folha(62, 45, 22, .78)}
      ${folha(50, 36, 0, .66, 'pl-folha-escura')}
    </g>`,

  florescendo: () => `
    ${VASO}
    <g class="planta__folhagem">
      <path class="pl-caule" d="M50 80C50 64 51 46 50 28"/>
      <path class="pl-caule" d="M50 52c-6-4-11-6-14-11" stroke-width="2.4"/>
      <path class="pl-caule" d="M50 44c6-4 11-7 14-12" stroke-width="2.4"/>
      ${folha(38, 70, -24, .92)}
      ${folha(62, 63, 24, .92)}
      ${folha(40, 55, -22, .8)}
      ${folha(60, 48, 22, .8)}
      ${flor(50, 25, 1.25)}
      ${flor(35.5, 40, .95)}
      ${flor(64.5, 31, .95)}
    </g>`,

  murchando: () => `
    ${VASO}
    <g class="planta__folhagem">
      <path class="pl-caule-seco" d="M50 80c0-13 1-24 6-30c3-3 6-4 8-3"/>
      ${folha(40, 70, 40, .82, 'pl-folha-seca')}
      ${folha(61, 66, 58, .8, 'pl-folha-seca')}
      ${folha(45, 57, 46, .7, 'pl-folha-seca')}
      ${folha(64, 52, 62, .66, 'pl-folha-seca')}
      <ellipse class="pl-folha-seca" cx="29" cy="89" rx="6.4" ry="3" transform="rotate(-18 29 89)"/>
    </g>`,

  seca: () => `
    ${VASO}
    <g class="planta__folhagem">
      <path class="pl-caule-seco" d="M50 80c1-10 5-16 3-23"/>
      <path class="pl-caule-seco" d="M52 64c4-2 7-5 8-9" stroke-width="2.2"/>
      ${folha(63, 53, 58, .58, 'pl-folha-seca')}
      <ellipse class="pl-folha-seca" cx="28" cy="90" rx="6" ry="2.8" transform="rotate(-22 28 90)"/>
      <ellipse class="pl-folha-seca" cx="74" cy="93" rx="5.4" ry="2.6" transform="rotate(16 74 93)"/>
    </g>`,

  morta: () => `
    <path class="pl-vaso" d="M30 88h40l-4.5 20a4 4 0 0 1-4 3.4H38.5a4 4 0 0 1-4-3.4z" opacity=".55"/>
    <rect class="pl-vaso-borda" x="26" y="80" width="48" height="10" rx="3.4" opacity=".55"/>
    <ellipse class="pl-terra" cx="50" cy="81.5" rx="20" ry="3.4"/>
    <g class="planta__folhagem">
      <path class="pl-caule-seco" d="M50 80c0-5 1-8 0-11" stroke-width="2.4" opacity=".7"/>
      <path class="pl-teia" d="M40 64h20" stroke-width="2.6"/>
      <path class="pl-teia" d="M50 56v16" stroke-width="2.6"/>
      <ellipse class="pl-folha-seca" cx="26" cy="93" rx="5.6" ry="2.6" transform="rotate(-24 26 93)" opacity=".7"/>
      <ellipse class="pl-folha-seca" cx="75" cy="95" rx="5" ry="2.4" transform="rotate(18 75 95)" opacity=".7"/>
    </g>`,

  abandonada: () => `
    ${VASO}
    <g class="planta__folhagem">
      <path class="pl-caule-seco" d="M50 80c0-10 2-16 1-22"/>
      <path class="pl-caule-seco" d="M51 62l9-9" stroke-width="2"/>
      <path class="pl-caule-seco" d="M50 68l-8-6" stroke-width="2"/>
      <g class="pl-teia">
        <path d="M88 28H62"/>
        <path d="M88 28v26"/>
        <path d="M88 28L69 47"/>
        <path d="M88 36a8 8 0 0 0-8-8"/>
        <path d="M88 45a17 17 0 0 0-17-17"/>
        <path d="M88 54a26 26 0 0 0-26-26"/>
        <path d="M70 46l-9 8" stroke-dasharray="2 3"/>
      </g>
      <ellipse class="pl-folha-seca" cx="27" cy="92" rx="5.6" ry="2.6" transform="rotate(-24 27 92)"/>
    </g>`
};

/**
 * Regador da animação de rega, desenhado no mesmo sistema de
 * coordenadas da planta (viewBox 0 0 100 115), entrando pelo canto de
 * cima à direita. Fica escondido até a classe da animação entrar.
 */
export function svgDoRegador() {
  const gotas = [
    { x: 53, atraso: '0s' },
    { x: 57, atraso: '.13s' },
    { x: 50, atraso: '.26s' },
    { x: 55, atraso: '.4s' }
  ].map((g) => `<ellipse class="rega__gota" cx="${g.x}" cy="49" rx="1.5" ry="2.4"
      style="animation-delay:${g.atraso}"/>`).join('');

  return `<g class="rega" aria-hidden="true">
    <g class="rega__regador">
      <path class="rega__corpo" d="M70 27h20a3 3 0 0 1 3 3v13a7 7 0 0 1-7 7H74a7 7 0 0 1-7-7V30a3 3 0 0 1 3-3z"/>
      <path class="rega__alca" d="M74 27c0-6.5 4.4-10 9.5-10s9.5 3.5 9.5 10"/>
      <path class="rega__bico" d="M67 33 L56 39 L52 46 L59 46 L63 41 L67 39z"/>
    </g>
    <g class="rega__gotas">${gotas}</g>
  </g>`;
}

/**
 * Estrelinhas de "cresceu", espalhadas em volta da folhagem. Cada uma
 * pisca no seu tempo, para não parecerem um bloco só piscando.
 */
export function svgDasEstrelas() {
  const estrela = (x, y, r, atraso) => {
    const d = `M0 ${-r} Q ${r * 0.22} ${-r * 0.22} ${r} 0
               Q ${r * 0.22} ${r * 0.22} 0 ${r}
               Q ${-r * 0.22} ${r * 0.22} ${-r} 0
               Q ${-r * 0.22} ${-r * 0.22} 0 ${-r} z`;
    return `<path class="brilho__estrela" d="${d}"
      transform="translate(${x} ${y})" style="animation-delay:${atraso}"/>`;
  };

  return `<g class="brilho" aria-hidden="true">
    ${estrela(26, 44, 5.2, '0s')}
    ${estrela(74, 34, 6.4, '.1s')}
    ${estrela(52, 22, 4.6, '.2s')}
    ${estrela(18, 66, 4.2, '.3s')}
    ${estrela(82, 58, 5, '.38s')}
    ${estrela(42, 12, 3.6, '.46s')}
  </g>`;
}

/** Devolve o SVG completo da planta para o estágio indicado. */
/**
 * O escudo que protege a sequência, desenhado por cima do vaso.
 *
 * `quebrando` troca o escudo inteiro por duas metades que se afastam,
 * e é o que se vê quando ele foi gasto para cobrir um dia perdido.
 */
export function svgDoEscudo({ quebrando = false } = {}) {
  const contorno = 'M50 12 L82 24 V52 Q82 76 50 90 Q18 76 18 52 V24 Z';

  if (!quebrando) {
    return `<g class="escudo" aria-hidden="true">
      <path class="escudo__corpo" d="${contorno}"/>
      <path class="escudo__brilho" d="M50 12 L82 24 V52 Q82 76 50 90 Z"/>
    </g>`;
  }

  // Duas metades do mesmo contorno, recortadas pelo meio.
  return `<g class="escudo escudo--quebrando" aria-hidden="true">
    <defs>
      <clipPath id="metadeEsq"><rect x="0" y="0" width="50" height="100"/></clipPath>
      <clipPath id="metadeDir"><rect x="50" y="0" width="50" height="100"/></clipPath>
    </defs>
    <path class="escudo__corpo escudo__caco escudo__caco--esq" d="${contorno}" clip-path="url(#metadeEsq)"/>
    <path class="escudo__corpo escudo__caco escudo__caco--dir" d="${contorno}" clip-path="url(#metadeDir)"/>
    <path class="escudo__rachadura" d="M50 12 L46 40 L54 58 L50 90"/>
  </g>`;
}

/** O escudinho pequeno dos selos, do calendário e do cartão. */
export function svgDoEscudoMini() {
  return `<svg class="escudo-mini" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 12 L82 24 V52 Q82 76 50 90 Q18 76 18 52 V24 Z"/>
  </svg>`;
}

export function svgDaPlanta(chave) {
  const desenho = DESENHOS[chave] || DESENHOS.semente;
  return `<svg class="planta__vaso" viewBox="0 0 100 115" role="img" aria-hidden="true">
    ${desenho()}
  </svg>`;
}

/** Estágios em declínio, usados para trocar o fundo do cartão. */
export const ESTAGIOS_MURCHOS = ['murchando', 'seca', 'abandonada', 'morta'];
