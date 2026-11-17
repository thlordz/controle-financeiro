// =========================================================
// Conferir a fatura sozinho — a parte que não depende de tela.
//
// A pessoa anexa o CSV que o Nubank dá, e aqui ele é posto lado a
// lado com os lançamentos de crédito do app. O resultado não muda
// nada: só separa em grupos o que bate, o que falta lançar, o que tem
// diferença e o que precisa de um olhar. Quem aplica é a tela, um
// toque de cada vez.
//
// As regras de casar vêm das conferências feitas à mão, mês a mês:
//   - valor exato, data perto (o banco e a pessoa nem sempre anotam o
//     mesmo dia);
//   - parcela anda mais: o banco põe a parcela 5/12 no dia em que a
//     fatura abriu, não no dia da compra — por isso a janela é larga e
//     o número da parcela tem de bater;
//   - o IOF de compra internacional às vezes vem somado na compra, no
//     app, e separado no banco;
//   - cobrança e devolução do mesmo valor se anulam;
//   - "Pagamento recebido" é o pagamento da fatura anterior, não gasto.
// =========================================================

import { ehCredito, dataCurta } from './varios.js';

const DIA = 864e5;
const texto = (s) => String(s ?? '').trim().toLowerCase();
const centavos = (n) => Math.round(Number(n) * 100);
const iguais = (a, b) => centavos(a) === centavos(b);
const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DIA;
const doisDigitos = (n) => String(n).padStart(2, '0');

const JANELA = 6;
const JANELA_PARCELA = 45;

/* ---------------- ler o arquivo ---------------- */

/** Uma linha de CSV, respeitando aspas ("1,87" é um campo só). */
export function camposDaLinha(linha) {
  const campos = [];
  let atual = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else aspas = !aspas;
    } else if (c === ',' && !aspas) { campos.push(atual); atual = ''; }
    else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/**
 * Valor como o banco escreve: "1,87", "- 1.045,22", "1.87", "-10".
 * Diferente da planilha, aqui o sinal importa: negativo é dinheiro
 * que voltou.
 */
export function valorDoBanco(bruto) {
  let t = String(bruto ?? '').replace(/r\$|\s/gi, '');
  if (!t) return null;
  const negativo = t.startsWith('-');
  t = t.replace(/^[-+]/, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return negativo ? -n : n;
}

/**
 * Descobre que arquivo é e lê. A fatura do Nubank vem como
 * `date,title,amount`; o extrato da conta, como
 * `Data,Valor,Identificador,Descrição`.
 */
export function lerArquivoDoBanco(conteudo) {
  const linhas = String(conteudo ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { tipo: null, linhas: [] };
  const cabeca = camposDaLinha(linhas[0]).map(texto);
  if (cabeca[0] === 'date' && cabeca.includes('title') && cabeca.includes('amount')) {
    const iTitulo = cabeca.indexOf('title'), iValor = cabeca.indexOf('amount');
    const lidas = [];
    for (const l of linhas.slice(1)) {
      const c = camposDaLinha(l);
      const valor = valorDoBanco(c[iValor]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0]) || valor === null) continue;
      lidas.push({ n: lidas.length, data: c[0], titulo: c[iTitulo], valor });
    }
    return { tipo: 'fatura', linhas: lidas };
  }
  if (cabeca[0] === 'data' && cabeca[1] === 'valor') return { tipo: 'conta', linhas: [] };
  return { tipo: null, linhas: [] };
}

/* ---------------- nomes ---------------- */

/** "Parcela 5/12" do banco, "(1/4)" ou "Parcela (5/12)" do app. */
export function parcelaDe(s) {
  const t = String(s ?? '');
  const r = /parcela\s*\(?\s*(\d+)\s*\/\s*(\d+)/i.exec(t) || /\((\d+)\s*\/\s*(\d+)\)/.exec(t);
  return r ? { n: Number(r[1]), de: Number(r[2]) } : null;
}

const semParcela = (s) => String(s ?? '').replace(/\s*-\s*parcela\s*\d+\s*\/\s*\d+\s*$/i, '').trim();

/** A chave que identifica o mesmo título do banco, mês após mês. */
export const chaveDoTitulo = (titulo) =>
  texto(semParcela(titulo)).normalize('NFKD').replace(/[^a-z0-9]/g, '');

const PALAVRAS_VAZIAS = new Set(['compra', 'debito', 'parcela', 'ebn', 'google', 'mercado', 'dl', 'pg', 'ifd', 'com', 'br']);
const palavras = (s) => new Set(String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w)));

/** Quantas palavras de verdade os dois nomes têm em comum. */
function parecidos(a, b) {
  const A = palavras(a), B = palavras(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n;
}

// Prefixos de maquininha que o banco põe antes do nome da loja. Os
// que não estão aqui ficam como vieram — o app aprende com o tempo.
const CONHECIDOS = [
  [/^ifd\s*\*/i, 'iFood'],
  [/^mercado\s*livre|^mercadolivre|^mercado\s*\*\s*mercadolivre/i, 'Mercado Livre'],
  [/uber/i, 'Uber'],
];

/** "Ebn *Tiktok - Parcela 1/4" → "Tiktok". O palpite de quando não há nada aprendido. */
export function nomeDoTitulo(titulo) {
  const t = semParcela(titulo);
  for (const [r, nome] of CONHECIDOS) if (r.test(t)) return nome;
  const depois = t.includes('*') ? t.slice(t.lastIndexOf('*') + 1).trim() : t;
  const usar = /[a-z]{3,}/i.test(depois) ? depois : t;
  return usar.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/* ---------------- a fatura ---------------- */

/** O mês do app que essa fatura representa: o da compra mais recente. */
function mesDaFatura(compras) {
  const ultima = compras.map((l) => l.data).sort().pop();
  const [a, m] = ultima.split('-').map(Number);
  const fim = new Date(a, m, 0).getDate();
  return { ano: a, mes: m, de: `${a}-${doisDigitos(m)}-01`, ate: `${a}-${doisDigitos(m)}-${doisDigitos(fim)}` };
}

/**
 * O dia em que a fatura abriu. O Nubank põe as parcelas antigas (2/x
 * em diante) no primeiro dia da fatura — é a pista mais firme que o
 * arquivo dá. Sem parcela antiga, não dá para saber: devolve null.
 */
function aberturaDaFatura(compras) {
  const datas = compras.filter((l) => { const p = parcelaDe(l.titulo); return p && p.n >= 2; })
    .map((l) => l.data).sort();
  return datas[0] || null;
}

/**
 * Casa cada linha do banco com um lançamento. Guloso, mas na ordem
 * certa: para cada linha, entre os candidatos de mesmo valor dentro da
 * janela, fica com o de nome mais parecido e, empatando, o de data
 * mais perto.
 */
function casar(banco, candidatos, usados, aprendidos) {
  const pares = [];
  for (const b of banco) {
    const p = parcelaDe(b.titulo);
    const janela = p ? JANELA_PARCELA : JANELA;
    let opcoes = candidatos.filter((x) => !usados.has(x.id) && iguais(x.valor, b.valor) && dias(x.data, b.data) <= janela);
    if (p) {
      // Parcela com outro número é outra parcela, por mais perto que esteja.
      const numero = (x) => parcelaDe(`${x.descricao} ${x.observacao || ''}`)?.n;
      const mesma = opcoes.filter((x) => numero(x) === p.n);
      opcoes = mesma.length ? mesma : opcoes.filter((x) => !numero(x) && dias(x.data, b.data) <= JANELA);
    }
    if (!opcoes.length) continue;
    const nota = (x) => parecidos(b.titulo, x.descricao) + (aprendidos(b.titulo)?.nome === texto(x.descricao) ? 3 : 0);
    opcoes.sort((x, y) => nota(y) - nota(x) || dias(x.data, b.data) - dias(y.data, b.data));
    usados.add(opcoes[0].id);
    pares.push({ banco: b, item: opcoes[0] });
  }
  return pares;
}

/** A forma de crédito que a pessoa mais usa — "Cartão de Crédito", no caso do Thiago. */
function formaDoCartao(despesas) {
  const conta = new Map();
  for (const x of despesas) if (ehCredito(x.formaPgto)) conta.set(x.formaPgto, (conta.get(x.formaPgto) || 0) + 1);
  let melhor = 'Cartão de Crédito', vezes = 0;
  for (const [f, n] of conta) if (n > vezes) { melhor = f; vezes = n; }
  return melhor;
}

/**
 * O coração: compara as linhas da fatura com o app.
 *
 * `opcoes.nomesDoBanco` é o que o app já aprendeu ({ chave: { nome,
 * categoria } }); `opcoes.diaFechamento`, o dia configurado.
 */
export function conferirFatura(dados, linhas, opcoes = {}) {
  const despesas = dados.despesas || [];
  const pagamentos = linhas.filter((l) => l.valor < 0 && /^pagamento recebido/i.test(l.titulo));
  const creditos = linhas.filter((l) => l.valor < 0 && !pagamentos.includes(l));
  let compras = linhas.filter((l) => l.valor > 0).sort((a, b) => a.data.localeCompare(b.data) || a.n - b.n);
  if (!compras.length) return null;
  const quantas = compras.length;

  const mes = mesDaFatura(compras);
  const inicio = compras[0].data, fim = compras[compras.length - 1].data;
  const totalBanco = (compras.reduce((t, l) => t + centavos(l.valor), 0)
    + creditos.reduce((t, l) => t + centavos(l.valor), 0)) / 100;

  const explicados = [];
  const perguntas = [];

  // O que o app já aprendeu, mais o que dá para aprender com os pares
  // deste mesmo arquivo — preenchido depois do primeiro passe.
  const deste = new Map();
  const guardados = opcoes.nomesDoBanco || {};
  const aprendidos = (titulo) => {
    const k = chaveDoTitulo(titulo);
    if (deste.has(k)) return deste.get(k);
    const g = guardados[k];
    return g ? { nome: texto(g.nome), nomeOriginal: g.nome, categoria: g.categoria || '' } : null;
  };

  // Cobrança e devolução do mesmo valor: se anulam.
  for (const c of creditos.slice()) {
    const par = compras.filter((l) => iguais(l.valor, -c.valor))
      .sort((a, b) => parecidos(c.titulo, b.titulo) - parecidos(c.titulo, a.titulo) || dias(a.data, c.data) - dias(b.data, c.data))[0];
    if (!par) continue;
    compras = compras.filter((l) => l !== par);
    creditos.splice(creditos.indexOf(c), 1);
    explicados.push({ texto: `${par.titulo}: cobrou e devolveu`, banco: [par, c] });
  }

  const doMes = (x) => x.data >= mes.de && x.data <= mes.ate;
  const vivos = despesas.filter((x) => ehCredito(x.formaPgto) && texto(x.status) !== 'estornado');
  const usados = new Set();

  // 1º passe: o que está no mês da fatura, no app.
  const pares = casar(compras, vivos.filter(doMes), usados, aprendidos);
  // 2º passe: o que o banco diz que é desta fatura, mas no app ficou
  // em outro mês — a compra do dia 27 quando a fatura virou no 27.
  let livres = compras.filter((b) => !pares.some((p) => p.banco === b));
  const foraDoMes = casar(livres, vivos.filter((x) => !doMes(x) && x.data >= inicio && x.data <= fim), usados, aprendidos);

  for (const { banco, item } of [...pares, ...foraDoMes]) {
    const k = chaveDoTitulo(banco.titulo);
    if (!deste.has(k)) deste.set(k, { nome: texto(item.descricao), nomeOriginal: item.descricao.trim(), categoria: item.categoria || '' });
  }

  livres = compras.filter((b) => ![...pares, ...foraDoMes].some((p) => p.banco === b));
  let sobrando = vivos.filter((x) => doMes(x) && !usados.has(x.id));

  // IOF somado na compra, no app.
  for (const iof of livres.filter((l) => /^iof/i.test(l.titulo))) {
    let achou = null;
    for (const compra of livres) {
      if (compra === iof || dias(compra.data, iof.data) > 1) continue;
      const item = sobrando.find((x) => centavos(x.valor) === centavos(compra.valor) + centavos(iof.valor) && dias(x.data, compra.data) <= JANELA);
      if (item) { achou = { compra, item }; break; }
    }
    if (!achou) continue;
    livres = livres.filter((l) => l !== iof && l !== achou.compra);
    sobrando = sobrando.filter((x) => x !== achou.item);
    usados.add(achou.item.id);
    explicados.push({ texto: `${achou.item.descricao.trim()}: o IOF está somado no app`, banco: [achou.compra, iof], itens: [achou.item] });
  }

  // Diferença pequena de valor: o mesmo gasto, anotado com centavos trocados.
  const diferencas = [];
  for (const b of livres.slice()) {
    const tolerancia = Math.max(10, Math.round(centavos(b.valor) * 0.02));
    const pb = parcelaDe(b.titulo)?.n;
    const item = sobrando
      .filter((x) => !iguais(x.valor, b.valor) && Math.abs(centavos(x.valor) - centavos(b.valor)) <= tolerancia
        && dias(x.data, b.data) <= JANELA && parcelaDe(`${x.descricao} ${x.observacao || ''}`)?.n === pb
        && (parecidos(b.titulo, x.descricao) > 0 || aprendidos(b.titulo)?.nome === texto(x.descricao)))
      .sort((x, y) => Math.abs(x.valor - b.valor) - Math.abs(y.valor - b.valor))[0];
    if (!item) continue;
    livres = livres.filter((l) => l !== b);
    sobrando = sobrando.filter((x) => x !== item);
    usados.add(item.id);
    diferencas.push({ tipo: 'valor', banco: b, item, para: b.valor });
  }
  for (const { banco, item } of foraDoMes) {
    diferencas.push({ tipo: 'mes', banco, item, para: banco.data >= mes.de ? banco.data : mes.de });
  }

  // Aguardando que já está no banco: hora de virar Pendente.
  const aguardando = pares.filter((p) => texto(p.item.status) === 'aguardando').map((p) => p.item);

  // O que falta lançar, já com nome, categoria e data adivinhados.
  const forma = formaDoCartao(despesas);
  const faltam = livres.map((b) => {
    const sabido = aprendidos(b.titulo);
    const p = parcelaDe(b.titulo);
    let nome = sabido?.nomeOriginal || nomeDoTitulo(b.titulo);
    if (p) nome = `${nome} (${p.n}/${p.de})`;
    const antes = b.data < mes.de;
    return {
      banco: b, nome, valor: b.valor, forma,
      categoria: sabido?.categoria || '',
      data: antes ? mes.de : b.data,
      obs: antes ? `comprado em ${dataCurta(b.data)}` : '',
    };
  });

  // No app e não no banco: depois da última data do arquivo é só
  // porque ainda não chegou; antes disso, merece um olhar.
  const naoChegou = sobrando.filter((x) => x.data > fim);
  const semPar = sobrando.filter((x) => x.data <= fim);
  if (naoChegou.length) {
    explicados.push({ texto: `Depois de ${dataCurta(fim)}: ainda não chegou no banco`, itens: naoChegou });
  }
  for (const x of semPar) perguntas.push({ tipo: 'sobra', item: x });
  for (const c of creditos) perguntas.push({ tipo: 'devolucao', banco: c });
  if (pagamentos.length) {
    explicados.push({ texto: 'Pagamento da fatura anterior: não é gasto', banco: pagamentos });
  }

  // O dia em que a fatura vira, se o arquivo der pista.
  const abriu = aberturaDaFatura(compras);
  const diaAbriu = abriu ? Number(abriu.slice(8, 10)) : 0;
  const fechamento = diaAbriu && diaAbriu !== Number(opcoes.diaFechamento)
    ? { abriu, dia: diaAbriu } : null;

  // O total do app conta o que é desta fatura: tudo do mês, menos o que
  // ainda não chegou. A parcela que o app pôs no dia 20 já está no banco.
  const totalApp = vivos.filter((x) => doMes(x) && !naoChegou.includes(x)).reduce((t, x) => t + centavos(x.valor), 0) / 100;

  return {
    mes, inicio, fim,
    totalBanco, totalApp,
    quantas,
    batem: quantas - faltam.length - diferencas.length,
    pares: [...pares, ...foraDoMes],
    aguardando, faltam, diferencas, perguntas, explicados, fechamento,
  };
}

/**
 * O que aprender depois que a pessoa confirmou: título do banco →
 * nome e categoria que ela usa. Vai para a configuração, que viaja
 * entre aparelhos. Devolve quantos mudaram.
 */
export function aprenderNomes(guardados, pares) {
  let mudou = 0;
  for (const { titulo, nome, categoria } of pares) {
    const k = chaveDoTitulo(titulo);
    const limpo = String(nome || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
    if (!k || !limpo) continue;
    const antes = guardados[k];
    if (antes && antes.nome === limpo && antes.categoria === (categoria || '')) continue;
    guardados[k] = { nome: limpo, categoria: categoria || '' };
    mudou++;
  }
  return mudou;
}

