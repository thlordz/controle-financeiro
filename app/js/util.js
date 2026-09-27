// =========================================================
// Utilitários gerais
// Porte das funções auxiliares de Início_Módulo.bas
// =========================================================

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** Equivalente a NumeroDoMes(): devolve 1..12, ou 0 se não encontrar. */
export function numeroDoMes(nomeMes) {
  const alvo = String(nomeMes || '').trim().toLowerCase();
  const i = MESES.findIndex((m) => m.toLowerCase() === alvo);
  return i + 1;
}

/** Equivalente a NomeDoMes(). */
export function nomeDoMes(numero) {
  return numero >= 1 && numero <= 12 ? MESES[numero - 1] : '';
}

/** Converte "YYYY-MM-DD" em Date local (evita o deslocamento de fuso do ISO). */
export function paraData(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Data de hoje, sem horas. */
export function hoje() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Date -> "YYYY-MM-DD". */
export function paraISO(data) {
  const p = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

/** Date -> "dd/mm/aaaa". */
export function formatarData(data) {
  if (!data) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(data.getDate())}/${p(data.getMonth() + 1)}/${data.getFullYear()}`;
}

/** Diferença em dias inteiros entre duas datas (a - b). */
export function diferencaEmDias(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

const FORMATADOR_MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

/** Formata em Real brasileiro. */
export function moeda(valor) {
  return FORMATADOR_MOEDA.format(Number(valor) || 0);
}

/** Comparação de texto sem diferenciar maiúsculas, como LCase(Trim(...)) do VBA. */
export function texto(valor) {
  return String(valor ?? '').trim().toLowerCase();
}

/** Soma protegida contra ruído de ponto flutuante acumulado. */
export function arredondar(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}
