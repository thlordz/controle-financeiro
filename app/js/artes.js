// GERADO por ferramentas/gerar-artes.mjs — não edite à mão.
//
// Cada tema aponta para os arquivos que estão em
// app/img/temas/<tema>/. Quem monta o papel de parede com eles é
// fundos.js; quem lê os bytes é o cf:arte do Electron (ou o fetch,
// no Android e no navegador).
//
// Sem arquivos, o tema cai no desenho vetorial de sempre.

export const ARTES = {};

/** Caminho relativo à página, do jeito que o <img> e o fetch pedem. */
export function caminhoDaArte(tema, arquivo) {
  return `img/temas/${tema}/${arquivo}`;
}
