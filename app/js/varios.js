// =========================================================
// Lançar vários de uma vez — a parte que não depende de tela.
//
// A tela de "lançar vários" é uma planilha: você digita, aperta
// Enter, vai para o próximo campo. Para isso ser rápido de verdade,
// o que a pessoa digita precisa ser aceito do jeito que ela digita
// ("30", "2,79", "2.79"; "28", "28/10"), e o que dá para adivinhar
// precisa vir adivinhado — a categoria sai do nome, o status sai da
// forma de pagamento.
//
// E a regra do fechamento do cartão mora aqui também, porque ela vale
// para os três jeitos de lançar: o formulário, as parcelas e a
// planilha.
// =========================================================

const texto = (s) => String(s ?? '').trim().toLowerCase();
const doisDigitos = (n) => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${doisDigitos(m)}-${doisDigitos(d)}`;
const ultimoDia = (a, m) => new Date(a, m, 0).getDate();

/**
 * Valor como a pessoa digitar: "30", "2,79", "2.79", "1.234,56",
 * "R$ 12". Devolve null se não for número — a linha fica marcada como
 * incompleta em vez de virar um lançamento de zero reais.
 */
export function lerValor(bruto) {
  let t = String(bruto ?? '').replace(/r\$|\s/gi, '');
  if (!t) return null;
  // Os dois separadores juntos: o último é o decimal.
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return n > 0 ? n : null;
}

/**
 * Data como a pessoa digitar: "28" (dia do mês que está na tela),
 * "28/10", "28/10/2026", ou "2026-10-28". `base` é { ano, mes } com mês
 * de 1 a 12. Devolve null para data impossível — 31 de fevereiro não
 * vira 3 de março calado.
 */
export function lerData(bruto, base) {
  const t = String(bruto ?? '').trim();
  if (!t) return null;
  let a, m, d;
  let r;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [, a, m, d] = r.map(Number);
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) {
    [, d, m, a] = r.map(Number);
    if (a < 100) a += 2000;
  } else if ((r = /^(\d{1,2})[/.-](\d{1,2})$/.exec(t))) { [, d, m] = r.map(Number); a = base.ano; }
  else if ((r = /^(\d{1,2})$/.exec(t))) { d = Number(r[1]); m = base.mes; a = base.ano; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > ultimoDia(a, m)) return null;
  return iso(a, m, d);
}

/** "2026-10-28" → "28/10". */
export const dataCurta = (s) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';

/**
 * A categoria que essa pessoa costuma dar para esse nome.
 *
 * Olha os lançamentos do mesmo tipo com o mesmo nome (sem diferença de
 * maiúscula e espaço) e fica com a categoria mais usada. "Tiktok"
 * vira Lazer porque é o que você sempre pôs; um nome novo fica vazio.
 */
export function categoriaPeloNome(lista, nome) {
  const alvo = texto(nome);
  if (!alvo) return '';
  const conta = new Map();
  for (const x of lista || []) {
    if (texto(x.descricao) !== alvo || !x.categoria) continue;
    conta.set(x.categoria, (conta.get(x.categoria) || 0) + 1);
  }
  let melhor = '', vezes = 0;
  for (const [c, n] of conta) if (n > vezes) { melhor = c; vezes = n; }
  return melhor;
}

/** A forma mais usada com esse nome — "Tiktok" no seu caso é crédito. */
export function formaPeloNome(lista, nome) {
  const alvo = texto(nome);
  if (!alvo) return '';
  const conta = new Map();
  for (const x of lista || []) {
    if (texto(x.descricao) !== alvo || !x.formaPgto) continue;
    conta.set(x.formaPgto, (conta.get(x.formaPgto) || 0) + 1);
  }
  let melhor = '', vezes = 0;
  for (const [c, n] of conta) if (n > vezes) { melhor = c; vezes = n; }
  return melhor;
}

/* ---------------- o fechamento do cartão ----------------
   Compra no crédito do dia do fechamento em diante cai na fatura
   seguinte. Do jeito que o Thiago controla a fatura — por mês, como na
   planilha —, isso quer dizer: lançar no dia 1º do mês seguinte. Ele
   sabia a regra e esquecia de aplicar; agora é o app que lembra.

   O dia de verdade não some: vai para a observação. E o dia de
   fechamento é fixo por enquanto — o do Nubank às vezes anda um ou
   dois dias, e isso é assunto para depois.
   ------------------------------------------------------- */
export const ehCredito = (forma) => texto(forma).includes('crédito');

/**
 * Se a compra no crédito caiu do fechamento em diante, devolve a data
 * nova (dia 1º do mês seguinte); senão, null. Sem dia de fechamento
 * configurado, nunca muda nada.
 */
export function dataDepoisDoFechamento(dataIso, forma, diaFechamento) {
  const dia = Number(diaFechamento);
  if (!dia || !dataIso || !ehCredito(forma)) return null;
  const [a, m, d] = dataIso.split('-').map(Number);
  if (d < dia) return null;
  return m === 12 ? iso(a + 1, 1, 1) : iso(a, m + 1, 1);
}

/** A nota que guarda o dia de verdade, sem repetir se já estiver lá. */
export function notaDaCompra(obs, dataIso) {
  const nota = `comprado em ${dataCurta(dataIso)}`;
  const atual = String(obs || '').trim();
  if (atual.toLowerCase().includes('comprado em')) return atual;
  return atual ? `${atual} · ${nota}` : nota;
}

/**
 * Aplica a regra num lançamento já montado. Devolve se mexeu, para a
 * tela poder avisar.
 */
export function aplicarFechamento(item, diaFechamento) {
  const nova = dataDepoisDoFechamento(item.data, item.formaPgto, diaFechamento);
  if (!nova) return false;
  item.observacao = notaDaCompra(item.observacao, item.data);
  item.data = nova;
  return true;
}

/* ---------------- uma linha da planilha ---------------- */

/**
 * O que falta numa linha para ela virar lançamento. Linha toda vazia
 * não é incompleta: é só a linha nova esperando.
 */
export function problemasDaLinha(linha, base) {
  const vazia = !String(linha.nome || '').trim() && !String(linha.valor || '').trim();
  if (vazia) return { vazia: true, faltando: [] };
  const faltando = [];
  if (!String(linha.nome || '').trim()) faltando.push('nome');
  if (lerValor(linha.valor) === null) faltando.push('valor');
  if (!lerData(linha.data, base)) faltando.push('data');
  return { vazia: false, faltando };
}

/**
 * A linha vira o objeto de lançamento, igual ao que o formulário cria.
 * O status sai da forma: no crédito fica pendente (vai para a fatura),
 * o resto já saiu da conta. Receita futura fica pendente.
 */
export function linhaParaLancamento(linha, { tipo, base, hojeIso, diaFechamento }) {
  const data = lerData(linha.data, base);
  const valor = lerValor(linha.valor);
  const item = {
    data, valor,
    descricao: String(linha.nome || '').trim(),
    categoria: String(linha.categoria || '').trim(),
    observacao: String(linha.obs || '').trim(),
    fixa: 'Não',
  };
  if (tipo === 'receitas') {
    item.origem = String(linha.forma || '').trim();
    item.status = data <= hojeIso ? 'Recebido' : 'Pendente';
    return { item, movido: false };
  }
  item.formaPgto = linha.forma || '';
  item.status = ehCredito(item.formaPgto) ? 'Pendente' : 'Pago';
  const movido = aplicarFechamento(item, diaFechamento);
  return { item, movido };
}
