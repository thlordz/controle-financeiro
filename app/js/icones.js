// =========================================================
// Biblioteca de ícones.
//
// São desenhos SVG escritos à mão, no mesmo traço arredondado
// do resto da interface. Ficam embutidos no HTML de propósito:
// o app roda sem internet (pendrive, Electron e Android), então
// não dá para depender de uma fonte de ícones baixada de fora, e
// um pacote inteiro pesaria muito mais que os poucos desenhos
// realmente usados aqui.
//
// Todos usam "currentColor": herdam a cor de quem os contém e
// acompanham sozinhos as paletas desbloqueáveis.
// =========================================================

export const ICONES = {
  // ----- campos do formulário -----
  calendario: '<rect x="3.2" y="5" width="17.6" height="15.5" rx="2.6"/><path d="M3.2 10h17.6"/><path d="M8 3.2v3.4"/><path d="M16 3.2v3.4"/>',
  dinheiro: '<path d="M12 3.2v17.6"/><path d="M16.2 6.6H9.9a2.7 2.7 0 0 0 0 5.4h4.2a2.7 2.7 0 0 1 0 5.4H7.4"/>',
  etiqueta: '<path d="M11.2 3.4H5.2a1.8 1.8 0 0 0-1.8 1.8v6a1.8 1.8 0 0 0 .53 1.27l7.3 7.3a1.8 1.8 0 0 0 2.55 0l6-6a1.8 1.8 0 0 0 0-2.55l-7.3-7.3a1.8 1.8 0 0 0-1.27-.52z"/><path d="M7.6 7.6h.01"/>',
  texto: '<path d="M4.5 6.4h15"/><path d="M4.5 12h15"/><path d="M4.5 17.6h9"/>',
  pasta: '<path d="M3.4 7.4A1.9 1.9 0 0 1 5.3 5.5h3.9l2 2.6h7.5a1.9 1.9 0 0 1 1.9 1.9v7.5a1.9 1.9 0 0 1-1.9 1.9H5.3a1.9 1.9 0 0 1-1.9-1.9z"/>',
  cartao: '<rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.6"/><path d="M2.6 10h18.8"/><path d="M6.5 14.6h3.6"/>',
  repetir: '<path d="M3.6 10.4a8.4 8.4 0 0 1 14.2-4.2l2.6 2.6"/><path d="M20.4 4.6v4.2h-4.2"/><path d="M20.4 13.6a8.4 8.4 0 0 1-14.2 4.2l-2.6-2.6"/><path d="M3.6 19.4v-4.2h4.2"/>',
  clipe: '<path d="M20.6 11.6 12 20.2a5.1 5.1 0 0 1-7.2-7.2l8.8-8.8a3.4 3.4 0 0 1 4.8 4.8l-8.8 8.8a1.7 1.7 0 0 1-2.4-2.4l8.1-8.1"/>',
  nota: '<path d="M5 4.4h14v15.2H5z"/><path d="M8.4 8.6h7.2"/><path d="M8.4 12.4h7.2"/><path d="M8.4 16.2h4"/>',
  pessoa: '<path d="M18.6 20v-1.8a4 4 0 0 0-4-4H9.4a4 4 0 0 0-4 4V20"/><circle cx="12" cy="7.4" r="3.9"/>',
  perdoar: '<path d="M12 20.2 4.6 13a4.6 4.6 0 1 1 7.4-5.3A4.6 4.6 0 1 1 19.4 13z"/>',
  alvo: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  hashtag: '<path d="M9.4 3.8 7.6 20.2"/><path d="M16.4 3.8l-1.8 16.4"/><path d="M3.8 8.6h16.4"/><path d="M3.2 15.4h16.4"/>',
  destino: '<path d="M4.4 12h15.2"/><path d="M13.6 6l6 6-6 6"/>',
  parcelas: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M9 5v14"/><path d="M15 5v14"/>',
  check: '<path d="M4.5 12.6 9.4 17.5 19.5 7.2"/>',
  alerta: '<path d="M12 3.6 21 19.5H3z"/><path d="M12 10v4"/><path d="M12 16.8h.01"/>',

  // ----- cabeçalho dos modais -----
  grafico: '<path d="M4.5 19.5V12"/><path d="M9.8 19.5V6.5"/><path d="M15.2 19.5v-5"/><path d="M20.5 19.5V9"/>',
  subir: '<path d="M12 19.5V5.2"/><path d="M6 11.2 12 5l6 6.2"/>',
  descer: '<path d="M12 4.5v14.3"/><path d="M18 12.8 12 19l-6-6.2"/>'
};

/** Devolve o SVG pronto de um ícone, ou string vazia se o nome não existir. */
export function icone(nome, classe = '') {
  const d = ICONES[nome];
  if (!d) return '';
  return `<svg${classe ? ` class="${classe}"` : ''} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${d}</svg>`;
}
