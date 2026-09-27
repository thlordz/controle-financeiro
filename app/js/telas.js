// =========================================================
// Comportamento das quatro telas de lista.
// Cada uma reproduz os botões da aba correspondente da planilha.
// =========================================================

import { moeda, paraISO, hoje, nomeDoMes, formatarData, paraData, texto } from './util.js';
import { statusDevedor } from './calculos.js';
import {
  STATUS_RECEITA, STATUS_DESPESA, CATEGORIAS_RECEITA, CATEGORIAS_DESPESA,
  FORMAS_PGTO, TIPOS_DEVEDOR, FORMAS_DEVEDOR,
  CATEGORIAS_PARCELA_RECEITA, CATEGORIAS_PARCELA_DESPESA,
  novoId, criarRegistro, atualizarRegistro, removerRegistro, carimbar, agora,
  totaisReceitas, totaisDespesas, totaisDevedores,
  copiarFixasReceitas, copiarFixasDespesas, copiarRecorrentesDevedores,
  adicionarParcelas, listaInvestimento, totalInvestido,
  saldoInvestidoSimulado, simularInvestimento, mesesAteFimDoAno, mesAnterior
} from './dominio.js';
import { filtrar, tabelaReceitas, tabelaDespesas, tabelaDevedores, tabelaInvestimento } from './listas.js';
import { abrirFormulario, confirmar, avisar, lerNumero, ligarMascaraValor, verComprovante } from './formulario.js';
import { icone } from './icones.js';

const $ = (id) => document.getElementById(id);

/** Estado de filtro de cada tela (o mês vem do estado global). */
const filtros = {
  receitas: { busca: '', todosMeses: false },
  despesas: { busca: '', soFatura: false, todosMeses: false },
  devedores: { busca: '', soAtrasados: false, todosMeses: false },
  investimento: { busca: '', todosMeses: false }
};

// ---------------------------------------------------------
// Seleção em massa (checkbox nas linhas)
//
// Vive só enquanto a tela não se redesenha por outro motivo (mudou o
// mês, a busca, ou os dados) — marcar/desmarcar uma linha não passa
// por lá, só atualiza a barra; qualquer outra mudança limpa a seleção.
// ---------------------------------------------------------

const selecao = { receitas: new Set(), despesas: new Set(), devedores: new Set() };
const CICLO_STATUS_RECEITA = { pendente: 'Recebido', recebido: 'Pendente' };

/** A despesa foi paga no cartão de crédito? */
const noCredito = (d) => texto(d.formaPgto).includes('crédito');

/**
 * Próxima situação ao tocar no selo da despesa.
 *
 * "Aguardando" é uma situação só do cartão de crédito: é a compra que
 * ainda vai ser cobrada mas não entrou na fatura atual (ela soma na
 * "Total prevista", não na "Fatura atual"). Fora do crédito isso não
 * quer dizer nada, então o ciclo pula de Pago direto para Pendente.
 *
 * Sair de "Aguardando" é sempre permitido: um lançamento antigo marcado
 * assim numa forma de pagamento que não é crédito ficaria preso.
 */
function proximoStatusDespesa(d) {
  const atual = texto(d.status);
  if (atual === 'aguardando') return 'Pendente';
  if (atual === 'pendente') return 'Pago';
  return noCredito(d) ? 'Aguardando' : 'Pendente';
}

function resumoSelecao(tipo) {
  let soma = 0, n = 0;
  for (const item of ctx.dados[tipo]) {
    if (selecao[tipo].has(item.id)) { soma += Number(item.valor) || 0; n++; }
  }
  // O que está marcado mas não aparece na tabela agora — buscar, marcar
  // e depois limpar a busca deixa a marcação de pé, então vale avisar.
  const naTela = document.querySelectorAll(`#lista-${tipo} .linha-check:checked`).length;
  return { n, soma, fora: Math.max(0, n - naTela) };
}

/**
 * Tira da seleção só o que não existe mais nos dados. Antes a seleção
 * era zerada a cada redesenho, e como digitar na busca redesenha a
 * tabela, a marcação sumia assim que o filtro mudava.
 */
function podarSelecao(tipo) {
  const existentes = new Set(ctx.dados[tipo].map((x) => x.id));
  for (const id of [...selecao[tipo]]) {
    if (!existentes.has(id)) selecao[tipo].delete(id);
  }
}

const ELEMENTOS_BARRA = {
  receitas: ['barraSelecaoReceitas', 'barraSelecaoReceitasTexto'],
  despesas: ['barraSelecaoDespesas', 'barraSelecaoDespesasTexto'],
  devedores: ['barraSelecaoDevedores', 'barraSelecaoDevedoresTexto']
};

function atualizarBarraSelecao(tipo) {
  const [idBarra, idTexto] = ELEMENTOS_BARRA[tipo];
  const barra = $(idBarra);
  if (!barra) return;
  const { n, soma, fora } = resumoSelecao(tipo);
  barra.hidden = n === 0;
  if (n > 0) {
    $(idTexto).textContent = `${plural(n, 'selecionado', 'selecionados')} · soma ${moeda(soma)}` +
      (fora > 0 ? ` · ${fora} fora do filtro` : '');
  }
}

/** Liga os checkboxes de uma tabela recém-renderizada à seleção daquela tela. */
/**
 * A checkbox só aparece no hover da linha; marcada, ela fica à vista.
 * Marcar e desmarcar passa sempre por aqui — foi esquecer isso no
 * "Limpar seleção" que deixava a caixinha vazia aparecendo em todas as
 * linhas depois de limpar.
 */
function refletirMarcacao(cb) {
  cb.closest('.selecionar')?.classList.toggle('selecionar--ativa', cb.checked);
}

function ligarSelecao(idContainer, tipo) {
  $(idContainer).querySelectorAll('.linha-check').forEach((cb) => {
    cb.checked = selecao[tipo].has(cb.dataset.id);
    refletirMarcacao(cb);
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) selecao[tipo].add(cb.dataset.id);
      else selecao[tipo].delete(cb.dataset.id);
      refletirMarcacao(cb);
      atualizarBarraSelecao(tipo);
    });
  });
  atualizarBarraSelecao(tipo);
}

function limparSelecao(tipo) {
  selecao[tipo].clear();
  document.querySelectorAll(`#lista-${tipo} .linha-check`).forEach((cb) => {
    cb.checked = false;
    refletirMarcacao(cb);
  });
  atualizarBarraSelecao(tipo);
}

/** Aplica um novo status a todas as linhas marcadas de uma vez. */
function mudarStatusEmMassa(tipo, novoStatus) {
  if (selecao[tipo].size === 0) return;

  // Cada linha mexida precisa de carimbo novo, senão a sincronia não
  // enxerga a mudança e ela nunca sai deste aparelho.
  if (tipo === 'devedores') {
    for (const v of ctx.dados.devedores) {
      if (!selecao.devedores.has(v.id) || v.pagouEm === '-') continue;
      v.pagouEm = novoStatus === 'Pago' ? paraISO(hoje()) : '';
      carimbar(v);
    }
  } else {
    for (const item of ctx.dados[tipo]) {
      if (selecao[tipo].has(item.id)) {
        item.status = novoStatus;
        carimbar(item);
      }
    }
  }
  selecao[tipo].clear();
  ctx.aoMudarDados();
}

function alternarStatusReceita(id) {
  const r = ctx.dados.receitas.find((x) => x.id === id);
  if (!r) return;
  r.status = CICLO_STATUS_RECEITA[texto(r.status)] || 'Pendente';
  carimbar(r);
  ctx.aoMudarDados();
}

function alternarStatusDespesa(id) {
  const d = ctx.dados.despesas.find((x) => x.id === id);
  if (!d) return;
  d.status = proximoStatusDespesa(d);
  carimbar(d);
  ctx.aoMudarDados();
}

function alternarStatusDevedor(id) {
  const v = ctx.dados.devedores.find((x) => x.id === id);
  if (!v || v.pagouEm === '-') return;
  v.pagouEm = v.pagouEm ? '' : paraISO(hoje());
  carimbar(v);
  ctx.aoMudarDados();
}

let ctx = null; // { dados, ano, mes, salvar, aoMudarDados }

export function configurar(contexto) {
  ctx = contexto;
}

/** Valores distintos já usados num campo, mais recentes primeiro — vira sugestão de autocompletar. */
function sugestoesDe(lista, campo, limite = 30) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  const saida = [];
  for (let i = lista.length - 1; i >= 0 && saida.length < limite; i--) {
    const v = String(lista[i]?.[campo] ?? '').trim();
    if (!v || vistos.has(v)) continue;
    vistos.add(v);
    saida.push(v);
  }
  return saida;
}

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

// Cada situação tem a sua cor, a mesma dos selos da lista — o botão
// escolhido no formulário fica igual ao selo que vai aparecer na linha.
const CORES_STATUS = {
  Pago: 'verde', Recebido: 'verde', Pendente: 'ambar', Aguardando: 'azul'
};

/** Transforma a lista de status em botões coloridos da escolha segmentada. */
const opcoesStatus = (lista) =>
  lista.map((s) => ({ valor: s, rotulo: s, cor: CORES_STATUS[s] }));

/** Diz se a lista está mostrando o mês selecionado ou o histórico inteiro. */
const sufixoPeriodo = (tela) => (filtros[tela].todosMeses ? ' — todos os meses' : '');

// ---------------------------------------------------------
// Receitas
// ---------------------------------------------------------

// Os campos vêm em três blocos: primeiro o que a receita é, depois
// como classificá-la, e por último o que se anexa a ela. Cada um tem
// ícone e uma linha explicando para que serve — era essa explicação
// que antes ficava escondida no "title" do campo.
const CAMPOS_RECEITA = [
  { nome: 'data', rotulo: 'Data', icone: 'calendario', grupo: 'Lançamento',
    tipo: 'data', obrigatorio: true, largura: 'meia',
    dica: 'O dia manda a receita para o mês correspondente.' },
  { nome: 'valor', rotulo: 'Valor', icone: 'dinheiro', grupo: 'Lançamento',
    tipo: 'valor', obrigatorio: true, largura: 'meia',
    dica: 'Digite só os números — os centavos entram sozinhos.' },
  { nome: 'descricao', rotulo: 'Descrição', icone: 'texto', grupo: 'Lançamento',
    tipo: 'texto', obrigatorio: true, exemplo: 'ex: Salário',
    dica: 'É o nome que aparece na lista. Ele se completa com o que você já usou antes.',
    sugestoes: () => sugestoesDe(ctx?.dados?.receitas, 'descricao') },
  { nome: 'status', rotulo: 'Situação', icone: 'check', grupo: 'Lançamento',
    tipo: 'opcoes', obrigatorio: true, opcoes: opcoesStatus(STATUS_RECEITA),
    dica: 'Recebido já entrou na conta. Pendente ainda está por vir.' },

  { nome: 'categoria', rotulo: 'Categoria', icone: 'pasta', grupo: 'Classificação',
    tipo: 'select', opcoes: CATEGORIAS_RECEITA, largura: 'meia',
    dica: 'De onde vem esse dinheiro.' },
  { nome: 'origem', rotulo: 'Origem', icone: 'pessoa', grupo: 'Classificação',
    tipo: 'texto', largura: 'meia', exemplo: 'ex: Trabalho',
    dica: 'Quem pagou: a empresa, o cliente, a pessoa.',
    sugestoes: () => sugestoesDe(ctx?.dados?.receitas, 'origem') },
  { nome: 'fixa', rotulo: 'Receita fixa', rotuloCurto: 'Fixa', icone: 'repetir',
    grupo: 'Classificação', tipo: 'checkbox',
    dica: 'Se repete todo mês. O botão "Copiar fixas" traz só estas para o mês seguinte.' },

  { nome: 'comprovante', rotulo: 'Comprovante', icone: 'clipe', grupo: 'Complementos',
    tipo: 'arquivo' },
  { nome: 'observacao', rotulo: 'Observação', icone: 'nota', grupo: 'Complementos',
    tipo: 'area', exemplo: 'Uma nota para você lembrar depois…',
    dica: 'Aparece em letra menor embaixo da descrição, na lista.' }
];

export function renderizarReceitas() {
  const lista = filtrar(ctx.dados.receitas, {
    ano: filtros.receitas.todosMeses ? null : ctx.ano,
    mes: filtros.receitas.todosMeses ? null : ctx.mes,
    busca: filtros.receitas.busca,
    campoData: 'data', campos: ['descricao', 'categoria', 'origem', 'observacao', 'status', 'valor']
  });

  const t = totaisReceitas(lista);
  $('totalRecebidoReceitas').textContent = moeda(t.recebido);
  $('totalPendenteReceitas').textContent = moeda(t.pendente);
  $('lista-receitas').innerHTML = tabelaReceitas(lista);
  $('contagem-receitas').textContent =
    `${plural(lista.length, 'receita', 'receitas')}${sufixoPeriodo('receitas')} · toque numa linha para editar`;

  $('btnReceitaTodosMeses').classList.toggle('ligado', filtros.receitas.todosMeses);
  podarSelecao('receitas');
  ligarLinhas('lista-receitas', (id) => editarReceita(id), alternarStatusReceita, 'receitas');
  ligarSelecao('lista-receitas', 'receitas');
}

async function editarReceita(id) {
  const r = ctx.dados.receitas.find((x) => x.id === id);
  if (!r) return;

  const res = await abrirFormulario({
    titulo: 'Editar receita', icone: 'subir', sub: r.descricao || 'Receita',
    campos: CAMPOS_RECEITA, valores: r, aoRemover: true, layout: 'ficha'
  });
  if (!res) return;

  if (res.__remover) {
    if (!await confirmar(`Excluir a receita "${r.descricao}"?`, { rotuloOk: 'Excluir', perigo: true })) return;
    removerRegistro(ctx.dados, 'receitas', id);
    return ctx.aoMudarDados();
  }

  if (!await validarRetirada({ ...r, ...res })) return;
  atualizarRegistro(r, res);
  ctx.aoMudarDados();
}

/**
 * Lançamento novo, no formulário em linha. Com "Salvar e novo" ele
 * reabre já com a data e o status do anterior, para lançar vários
 * seguidos como se fosse descendo pelas linhas da planilha.
 */
async function novaReceita(iniciais = {}, titulo = 'Nova receita', repetir = true) {
  let valores = { data: paraISO(dataPadrao()), status: 'Pendente', fixa: 'Não', ...iniciais };

  for (;;) {
    const res = await abrirFormulario({
      titulo, icone: 'subir', sub: 'Dinheiro que entra',
      campos: CAMPOS_RECEITA, valores, layout: 'ficha', repetir
    });
    if (!res) return false;

    const { __novo, ...dados } = res;
    const nova = carimbar({ ...dados, id: novoId('r', ctx.dados.receitas) });
    if (!await validarRetirada(nova)) return false;
    ctx.dados.receitas.push(nova);
    ctx.aoMudarDados();

    if (!__novo) return true;
    valores = { data: dados.data, status: dados.status, fixa: 'Não' };
  }
}

/**
 * Porte de ValidarSaldoInvestimento(): uma receita de categoria
 * "Investimento" marcada como recebida é uma retirada, e não pode
 * deixar o saldo investido negativo.
 */
async function validarRetirada(receita) {
  const saldo = saldoInvestidoSimulado(ctx.dados, receita);
  if (saldo === null || saldo >= 0) return true;

  await avisar(
    `Essa retirada deixaria o saldo investido negativo (ficaria ${moeda(saldo)}). ` +
    'Lance um valor menor ou igual ao saldo disponível.',
    'Retirada bloqueada'
  );
  return false;
}

// ---------------------------------------------------------
// Despesas
// ---------------------------------------------------------

// Mesma divisão em três blocos das receitas. A forma de pagamento
// ganhou destaque porque é ela que decide se a despesa entra na
// fatura do cartão no painel de Início.
const CAMPOS_DESPESA = [
  { nome: 'data', rotulo: 'Data', icone: 'calendario', grupo: 'Lançamento',
    tipo: 'data', obrigatorio: true, largura: 'meia',
    dica: 'O dia manda a despesa para o mês correspondente.' },
  { nome: 'valor', rotulo: 'Valor', icone: 'dinheiro', grupo: 'Lançamento',
    tipo: 'valor', obrigatorio: true, largura: 'meia',
    dica: 'Digite só os números — os centavos entram sozinhos.' },
  { nome: 'descricao', rotulo: 'Descrição', icone: 'texto', grupo: 'Lançamento',
    tipo: 'texto', obrigatorio: true, exemplo: 'ex: Mercado',
    dica: 'É o nome que aparece na lista. Ele se completa com o que você já usou antes.',
    sugestoes: () => sugestoesDe(ctx?.dados?.despesas, 'descricao') },
  { nome: 'status', rotulo: 'Situação', icone: 'check', grupo: 'Lançamento',
    tipo: 'opcoes', obrigatorio: true, vazio: false, opcoes: opcoesStatus(STATUS_DESPESA),
    dica: '<strong>Pago</strong> — o dinheiro já saiu da conta. ' +
      '<strong>Pendente</strong> — ainda vai sair, e no cartão já está na fatura fechada. ' +
      '<strong>Aguardando</strong> — é só para cartão de crédito: a compra ainda vai ser cobrada, ' +
      'mas não entrou na fatura atual. Ela soma em “Falta pagar” e em “Total prevista”, ' +
      'e fica de fora da “Fatura atual”.' },

  { nome: 'categoria', rotulo: 'Categoria', icone: 'pasta', grupo: 'Classificação',
    tipo: 'select', opcoes: CATEGORIAS_DESPESA, largura: 'meia',
    dica: 'Em que tipo de gasto isso entra.' },
  { nome: 'formaPgto', rotulo: 'Forma de pagamento', rotuloCurto: 'Forma de pgto.',
    icone: 'cartao', grupo: 'Classificação', tipo: 'select', opcoes: FORMAS_PGTO, largura: 'meia',
    dica: 'No cartão de crédito, a despesa também soma na fatura do painel — ' +
      'e só nele a situação “Aguardando” faz sentido.' },
  { nome: 'fixa', rotulo: 'Despesa fixa', rotuloCurto: 'Fixa', icone: 'repetir',
    grupo: 'Classificação', tipo: 'checkbox',
    dica: 'Se repete todo mês (aluguel, internet…). O botão "Copiar fixas" traz só estas para o mês seguinte.' },

  { nome: 'comprovante', rotulo: 'Comprovante', icone: 'clipe', grupo: 'Complementos',
    tipo: 'arquivo' },
  { nome: 'observacao', rotulo: 'Observação', icone: 'nota', grupo: 'Complementos',
    tipo: 'area', exemplo: 'Uma nota para você lembrar depois…',
    dica: 'Aparece em letra menor embaixo da descrição, na lista.' }
];

export function renderizarDespesas() {
  const lista = filtrar(ctx.dados.despesas, {
    ano: filtros.despesas.todosMeses ? null : ctx.ano,
    mes: filtros.despesas.todosMeses ? null : ctx.mes,
    busca: filtros.despesas.busca,
    campoData: 'data', campos: ['descricao', 'categoria', 'formaPgto', 'observacao', 'status', 'valor'],
    filtroExtra: filtros.despesas.soFatura
      ? noCredito
      : null
  });

  const t = totaisDespesas(lista);
  $('totalPagoDespesas').textContent = moeda(t.pago);
  $('totalPendenteDespesas').textContent = moeda(t.pendente);
  $('lista-despesas').innerHTML = tabelaDespesas(lista);
  $('contagem-despesas').textContent =
    `${plural(lista.length, 'despesa', 'despesas')}${sufixoPeriodo('despesas')}${filtros.despesas.soFatura ? ' · só cartão de crédito' : ''} · toque numa linha para editar`;

  $('btnDespesaFatura').classList.toggle('ligado', filtros.despesas.soFatura);
  $('btnDespesaTodosMeses').classList.toggle('ligado', filtros.despesas.todosMeses);
  podarSelecao('despesas');
  ligarLinhas('lista-despesas', (id) => editarDespesa(id), alternarStatusDespesa, 'despesas');
  ligarSelecao('lista-despesas', 'despesas');
}

async function editarDespesa(id) {
  const d = ctx.dados.despesas.find((x) => x.id === id);
  if (!d) return;

  const res = await abrirFormulario({
    titulo: 'Editar despesa', icone: 'descer', sub: d.descricao || 'Despesa',
    campos: CAMPOS_DESPESA, valores: d, aoRemover: true, layout: 'ficha'
  });
  if (!res) return;

  if (res.__remover) {
    if (!await confirmar(`Excluir a despesa "${d.descricao}"?`, { rotuloOk: 'Excluir', perigo: true })) return;
    removerRegistro(ctx.dados, 'despesas', id);
    return ctx.aoMudarDados();
  }

  atualizarRegistro(d, res);
  ctx.aoMudarDados();
}

async function novaDespesa(iniciais = {}, titulo = 'Nova despesa', repetir = true) {
  let valores = { data: paraISO(dataPadrao()), status: 'Pendente', fixa: 'Não', ...iniciais };

  for (;;) {
    const res = await abrirFormulario({
      titulo, icone: 'descer', sub: 'Dinheiro que sai',
      campos: CAMPOS_DESPESA, valores, layout: 'ficha', repetir
    });
    if (!res) return false;

    const { __novo, ...dados } = res;
    criarRegistro(ctx.dados, 'despesas', dados);
    ctx.aoMudarDados();

    if (!__novo) return true;
    valores = { data: dados.data, status: dados.status, fixa: 'Não' };
  }
}

// ---------------------------------------------------------
// Devedores
// ---------------------------------------------------------

// O status do devedor não é digitado: sai de "Pagou em" e de
// "Perdoada". Por isso os dois moram juntos no bloco da quitação, com
// a explicação do efeito de cada um logo abaixo.
const CAMPOS_DEVEDOR = [
  { nome: 'nome', rotulo: 'Quem deve', icone: 'pessoa', grupo: 'A dívida',
    tipo: 'texto', obrigatorio: true, largura: 'meia',
    dica: 'O nome que aparece na lista.',
    sugestoes: () => sugestoesDe(ctx?.dados?.devedores, 'nome') },
  { nome: 'valor', rotulo: 'Valor', icone: 'dinheiro', grupo: 'A dívida',
    tipo: 'valor', obrigatorio: true, largura: 'meia',
    dica: 'Digite só os números — os centavos entram sozinhos.' },
  { nome: 'pgtoPrevisto', rotulo: 'Vencimento', rotuloCurto: 'Vencimento',
    icone: 'calendario', grupo: 'A dívida', tipo: 'data', obrigatorio: true, largura: 'meia',
    dica: 'Quando era para pagar. Passou dessa data sem pagar, vira "Atrasado".' },
  { nome: 'tipo', rotulo: 'Tipo', icone: 'pasta', grupo: 'A dívida',
    tipo: 'select', opcoes: TIPOS_DEVEDOR, largura: 'meia',
    dica: 'Do que se trata essa cobrança.' },

  { nome: 'pagouEm', rotulo: 'Pagou em', icone: 'check', grupo: 'Quitação',
    tipo: 'data', largura: 'meia',
    dica: 'Preencheu, vira "Pago". Deixe vazio enquanto não pagar.' },
  { nome: 'formaPgto', rotulo: 'Como pagou', rotuloCurto: 'Forma', icone: 'cartao',
    grupo: 'Quitação', tipo: 'select', opcoes: FORMAS_DEVEDOR, largura: 'meia',
    dica: 'Só interessa depois que a dívida foi paga.' },
  { nome: 'recorrente', rotulo: 'Cobrança recorrente', icone: 'repetir',
    grupo: 'Quitação', tipo: 'checkbox',
    dica: 'Se repete todo mês. O botão "Copiar recorrentes" traz só estas para o mês seguinte.' },
  { nome: 'perdoado', rotulo: 'Dívida perdoada', rotuloCurto: 'Perdoado', icone: 'perdoar',
    grupo: 'Quitação', tipo: 'checkbox',
    dica: 'Você desistiu de receber. Sai da conta do que falta, sem virar recebido.' },

  { nome: 'comprovante', rotulo: 'Comprovante', icone: 'clipe', grupo: 'Complementos',
    tipo: 'arquivo' },
  { nome: 'observacao', rotulo: 'Observação', icone: 'nota', grupo: 'Complementos',
    tipo: 'area', exemplo: 'Uma nota para você lembrar depois…',
    dica: 'Aparece em letra menor embaixo do nome, na lista.' }
];

/** O status é calculado, então a tela mostra só o resultado. */
function paraFormularioDevedor(v) {
  return { ...v, perdoado: v.pagouEm === '-' ? 'Sim' : 'Não', pagouEm: v.pagouEm === '-' ? '' : v.pagouEm };
}

function doFormularioDevedor(res) {
  const { perdoado, ...resto } = res;
  return { ...resto, pagouEm: perdoado === 'Sim' ? '-' : (res.pagouEm || '') };
}

export function renderizarDevedores() {
  const lista = filtrar(ctx.dados.devedores, {
    ano: filtros.devedores.todosMeses ? null : ctx.ano,
    mes: filtros.devedores.todosMeses ? null : ctx.mes,
    busca: filtros.devedores.busca,
    campoData: 'pgtoPrevisto', campos: ['nome', 'tipo', 'formaPgto', 'observacao', 'valor'],
    filtroExtra: filtros.devedores.soAtrasados
      ? (v) => texto(statusDevedor(v)) === 'atrasado'
      : null
  });

  const t = totaisDevedores(lista);
  $('totalRecebidoDevedores').textContent = moeda(t.recebido);
  $('totalPendenteDevedores').textContent = moeda(t.pendente);
  $('lista-devedores').innerHTML = tabelaDevedores(lista);
  $('contagem-devedores').textContent =
    `${plural(lista.length, 'devedor', 'devedores')}${sufixoPeriodo('devedores')}${filtros.devedores.soAtrasados ? ' · só atrasados' : ''} · toque numa linha para editar`;

  $('btnDevedorAtrasados').classList.toggle('ligado', filtros.devedores.soAtrasados);
  $('btnDevedorTodosMeses').classList.toggle('ligado', filtros.devedores.todosMeses);
  podarSelecao('devedores');
  ligarLinhas('lista-devedores', (id) => editarDevedor(id), alternarStatusDevedor, 'devedores');
  ligarSelecao('lista-devedores', 'devedores');
}

async function editarDevedor(id) {
  const v = ctx.dados.devedores.find((x) => x.id === id);
  if (!v) return;

  const res = await abrirFormulario({
    titulo: 'Editar cobrança',
    icone: 'pessoa',
    sub: v.nome || 'Devedor',
    campos: CAMPOS_DEVEDOR,
    valores: paraFormularioDevedor(v),
    aoRemover: true,
    layout: 'ficha'
  });
  if (!res) return;

  if (res.__remover) {
    if (!await confirmar(`Excluir o lançamento de "${v.nome}"?`, { rotuloOk: 'Excluir', perigo: true })) return;
    removerRegistro(ctx.dados, 'devedores', id);
    return ctx.aoMudarDados();
  }

  atualizarRegistro(v, doFormularioDevedor(res));
  ctx.aoMudarDados();
}

async function novoDevedor() {
  let valores = { pgtoPrevisto: paraISO(dataPadrao()), recorrente: 'Não', perdoado: 'Não' };

  for (;;) {
    const res = await abrirFormulario({
      titulo: 'Novo devedor', icone: 'pessoa', sub: 'Dinheiro que alguém te deve',
      campos: CAMPOS_DEVEDOR, valores, layout: 'ficha', repetir: true
    });
    if (!res) return;

    const { __novo, ...dados } = res;
    criarRegistro(ctx.dados, 'devedores', doFormularioDevedor(dados));
    ctx.aoMudarDados();

    if (!__novo) return;
    valores = { pgtoPrevisto: dados.pgtoPrevisto, recorrente: 'Não', perdoado: 'Não' };
  }
}

// ---------------------------------------------------------
// Investimento
// ---------------------------------------------------------

const CAMPOS_RENDIMENTO = [
  { nome: 'data', rotulo: 'Data', icone: 'calendario', tipo: 'data', obrigatorio: true, largura: 'meia',
    dica: 'Mês em que o rendimento foi creditado.' },
  { nome: 'valor', rotulo: 'Valor rendido', icone: 'grafico', tipo: 'valor', obrigatorio: true, largura: 'meia',
    dica: 'Só o que o dinheiro rendeu — o aporte é lançado em Despesas.' },
  { nome: 'descricao', rotulo: 'Descrição', icone: 'texto', tipo: 'texto', exemplo: 'ex: Rendimento',
    dica: 'Como esse rendimento aparece na lista.' }
];

export function renderizarInvestimento() {
  const completa = listaInvestimento(ctx.dados);
  // Mês próprio, como as células H2/I2 da planilha.
  const { ano, mes } = ctx.mesInvestimento();
  const lista = filtrar(completa, {
    ano: filtros.investimento.todosMeses ? null : ano,
    mes: filtros.investimento.todosMeses ? null : mes,
    busca: filtros.investimento.busca,
    campoData: 'data', campos: ['descricao', 'categoria', 'valor']
  });

  const guardado = completa.reduce((t, i) => t + i.valor, 0);
  const meta = Number(ctx.dados.config.metaInvestimento) || 0;
  const faltam = meta - guardado;

  $('totalInvestido').textContent = moeda(guardado);
  $('metaInvestimento').textContent = moeda(meta);
  $('faltamInvestimento').textContent = moeda(faltam);
  $('faltamInvestimento').className =
    'resumo__valor ' + (faltam <= 0 ? 'positivo' : 'ambar');

  const pct = meta > 0 ? Math.max(0, Math.min(100, (guardado / meta) * 100)) : 0;
  $('barraInvestimento').style.width = `${pct}%`;
  $('legendaInvestimento').textContent = meta > 0
    ? (faltam <= 0
        ? `Meta batida! ${pct.toFixed(0)}% da meta de ${moeda(meta)}.`
        : `${pct.toFixed(1)}% da meta de ${moeda(meta)}.`)
    : 'Defina uma meta para acompanhar o progresso.';

  $('lista-investimento').innerHTML = tabelaInvestimento(lista);
  $('contagem-investimento').textContent = filtros.investimento.todosMeses
    ? `${plural(lista.length, 'lançamento', 'lançamentos')} — todos os meses`
    : `${plural(lista.length, 'lançamento', 'lançamentos')} no mês · ${plural(completa.length, 'lançamento', 'lançamentos')} no total`;

  $('btnInvestimentoTodosMeses').classList.toggle('ligado', filtros.investimento.todosMeses);
  ligarLinhas('lista-investimento', (id, linha) => abrirLancamentoInvestimento(id, linha));
}

/**
 * Porte do Worksheet_BeforeDoubleClick: leva até o lançamento de
 * origem em Despesas/Receitas; rendimento é editado aqui mesmo.
 */
async function abrirLancamentoInvestimento(id, linha) {
  const origemAba = linha.dataset.origem;
  const origemId = linha.dataset.origemId;

  if (!origemAba) return editarRendimento(id);

  ctx.irParaTela(origemAba);
  setTimeout(() => {
    if (origemAba === 'despesas') editarDespesa(origemId);
    else editarReceita(origemId);
  }, 320);
}

async function editarRendimento(id) {
  const i = ctx.dados.investimento.find((x) => x.id === id);
  if (!i) return;

  const res = await abrirFormulario({
    titulo: 'Editar rendimento', icone: 'grafico', sub: 'Investimento',
    campos: CAMPOS_RENDIMENTO, valores: i, aoRemover: true
  });
  if (!res) return;

  if (res.__remover) {
    if (!await confirmar('Excluir este rendimento?', { rotuloOk: 'Excluir', perigo: true })) return;
    removerRegistro(ctx.dados, 'investimento', id);
    return ctx.aoMudarDados();
  }

  atualizarRegistro(i, res);
  ctx.aoMudarDados();
}

/** Porte de InvestimentoNovaLinhaRendimento(). */
async function novoRendimento() {
  const res = await abrirFormulario({
    titulo: 'Lançar rendimento',
    icone: 'grafico',
    sub: 'O que o dinheiro guardado rendeu',
    campos: CAMPOS_RENDIMENTO,
    valores: { data: paraISO(hoje()), descricao: 'Rendimento' }
  });
  if (!res) return;

  ctx.dados.investimento.push({
    ...res, id: novoId('i', ctx.dados.investimento), categoria: 'Rendimento',
    atualizadoEm: new Date().toISOString()
  });
  ctx.aoMudarDados();
}

/**
 * Porte de InvestimentoNovaLinhaDespesa(): um aporte é uma despesa
 * de categoria "Investimentos" já paga. O VBA criava a linha em
 * Despesas e mandava você preencher valor e forma de pagamento.
 */
async function novoAporte() {
  const criou = await novaDespesa(
    { data: paraISO(hoje()), status: 'Pago', categoria: 'Investimentos', descricao: '' },
    'Novo aporte', false
  );
  if (criou) await avisar('Aporte lançado em Despesas, com categoria "Investimentos".', 'Aporte registrado');
}

/**
 * Porte de InvestimentoNovaLinhaReceita(): uma retirada é uma receita
 * de categoria "Investimento" já recebida, com origem "Retirada".
 * Passa pela mesma checagem de saldo do ValidarSaldoInvestimento.
 */
async function novaRetirada() {
  const criou = await novaReceita(
    { data: paraISO(hoje()), status: 'Recebido', categoria: 'Investimento', origem: 'Retirada', descricao: '' },
    'Nova retirada', false
  );
  if (criou) await avisar('Retirada lançada em Receitas, com categoria "Investimento".', 'Retirada registrada');
}

async function definirMeta() {
  const res = await abrirFormulario({
    titulo: 'Meta de investimento',
    icone: 'alvo',
    campos: [{ nome: 'meta', rotulo: 'Quanto quer juntar', icone: 'alvo',
      tipo: 'valor', obrigatorio: true,
      dica: 'A barra de progresso da tela mede o quanto já foi guardado em relação a esse valor.' }],
    valores: { meta: ctx.dados.config.metaInvestimento }
  });
  if (!res) return;
  ctx.dados.config.metaInvestimento = res.meta;
  ctx.dados.config.atualizadoEm = agora();
  ctx.aoMudarDados();
}

// ---------------------------------------------------------
// Simulador — porte de Investimento_Simulador.frm
// ---------------------------------------------------------

function calcularSimulador() {
  const guardado = totalInvestido(ctx.dados);
  const mensal = lerNumero($('simValorMensal').value) || 0;
  const meses = Number($('simMeses').value) || 0;
  const r = simularInvestimento(mensal, meses, guardado);

  $('simTotalProjetado').textContent = moeda(r.totalProjetado);
  $('simTotalFinal').textContent = moeda(r.totalFinal);
  $('simRodape').textContent =
    `Somado ao que você já guardou (${moeda(guardado)}).`;
}

function abrirSimulador() {
  $('simValorMensal').value = '';
  $('simMeses').value = '0';
  calcularSimulador();
  $('modalSimulador').hidden = false;
  setTimeout(() => $('simValorMensal').focus(), 60);
}

// ---------------------------------------------------------
// Ações compartilhadas
// ---------------------------------------------------------

/** Data sugerida: hoje, se o mês visível for o mês atual; senão o dia 1º. */
function dataPadrao(mesProprio = null) {
  const { ano, mes } = mesProprio || { ano: ctx.ano, mes: ctx.mes };
  const h = hoje();
  if (h.getFullYear() === ano && h.getMonth() + 1 === mes) return h;
  return new Date(ano, mes - 1, 1);
}

/** Abre o comprovante de uma linha numa aba nova, sem passar pela edição. */
function abrirComprovante(tipo, id) {
  const item = ctx.dados[tipo]?.find((x) => x.id === id);
  const a = item?.comprovante;
  if (a && typeof a === 'object' && a.dados) verComprovante(a);
}

function ligarLinhas(idContainer, aoAbrir, aoAlternarStatus, tipo) {
  const container = $(idContainer);
  container.querySelectorAll('tbody tr[data-id]').forEach((linha) => {
    linha.addEventListener('click', () => aoAbrir(linha.dataset.id, linha));
    linha.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        aoAbrir(linha.dataset.id, linha);
      }
    });
  });

  container.querySelectorAll('[data-anexo]').forEach((botao) => {
    botao.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirComprovante(tipo, botao.dataset.id);
    });
  });

  // O rótulo em volta da checkbox tem área de clique grande; sem isto o
  // clique nas bordas dele cairia na linha e abriria a edição.
  container.querySelectorAll('.selecionar').forEach((marca) => {
    marca.addEventListener('click', (e) => e.stopPropagation());
  });

  if (aoAlternarStatus) {
    container.querySelectorAll('[data-status]').forEach((botao) => {
      botao.addEventListener('click', (e) => {
        e.stopPropagation();
        aoAlternarStatus(botao.dataset.id);
      });
    });
  }
}

/** Porte dos três botões "Copiar ... do mês anterior". */
async function copiarDoMesAnterior(tipo) {
  const anterior = mesAnterior(ctx.ano, ctx.mes);
  const rotulo = `${nomeDoMes(anterior.mes)} de ${anterior.ano}`;

  const nomes = {
    receitas: ['receitas fixas', copiarFixasReceitas],
    despesas: ['despesas fixas', copiarFixasDespesas],
    devedores: ['recorrentes', copiarRecorrentesDevedores]
  };
  const [nome, funcao] = nomes[tipo];

  if (!await confirmar(
    `Copiar as ${nome} de ${rotulo} para ${nomeDoMes(ctx.mes)} de ${ctx.ano}?`,
    { rotuloOk: 'Copiar' })) return;

  const n = funcao(ctx.dados, ctx.ano, ctx.mes);

  if (n === 0) {
    await avisar(`Nenhuma ${nome.replace(/s$/, '')} encontrada em ${rotulo}.`, 'Nada a copiar');
    return;
  }

  ctx.aoMudarDados();

  // Em Receitas/Despesas o VBA grava Status = "Pendente"; em Devedores o
  // status é calculado a partir da nova data, então não se anuncia nada.
  const comoPendentes = tipo === 'devedores'
    ? ''
    : ` como pendente${n === 1 ? '' : 's'}`;

  await avisar(
    `${n} ${n === 1 ? 'lançamento copiado' : 'lançamentos copiados'} de ${rotulo}${comoPendentes}.`,
    'Cópia concluída'
  );
}

/**
 * Porte de Despesa_AdicionarParcelas().
 *
 * No VBA a categoria vinha de ArrayCategorias(wsNome) e a forma de
 * pagamento de ArrayFormaPagamento() — listas diferentes conforme o
 * destino, e só Despesas ganhava um seletor de forma (Receitas pedia
 * a origem em texto livre). Aqui os dois campos se refazem quando o
 * destino muda.
 */
async function lancarParcelas(destinoPadrao) {
  /** Reconstrói categoria e forma/origem conforme o destino escolhido. */
  function ajustarAoDestino(raiz) {
    const destino = raiz.querySelector('#campo_destino');

    function aplicar() {
      // Os campos são reconsultados a cada chamada: trocar o controle
      // por outerHTML descarta o nó antigo, e uma referência guardada
      // apontaria para um elemento já fora do documento.
      const categoria = raiz.querySelector('#campo_categoria');
      const forma = raiz.querySelector('#campo_formaOuOrigem');
      const rotuloForma = raiz.querySelector('label[for="campo_formaOuOrigem"]');

      // O formulário pode ter sido fechado e remontado entre um evento
      // e outro; sem os campos no documento não há o que ajustar.
      if (!categoria || !forma || !rotuloForma || !forma.isConnected) return;

      const dicaForma = forma.closest('.campo').querySelector('.campo__dica');

      const emDespesas = destino.value === 'despesas';
      const lista = emDespesas ? CATEGORIAS_PARCELA_DESPESA : CATEGORIAS_PARCELA_RECEITA;
      const escolhida = categoria.value;

      categoria.innerHTML = '<option value="">—</option>' +
        lista.map((c) => `<option value="${c}"${c === escolhida ? ' selected' : ''}>${c}</option>`).join('');

      // O rótulo é remontado inteiro: escrever só o texto apagaria o
      // asterisco de campo obrigatório que mora dentro dele.
      rotuloForma.innerHTML = (emDespesas ? 'Forma de pagamento' : 'Origem') +
        '<span class="campo__obrigatorio" title="Preenchimento obrigatório">*</span>';
      const iconeForma = rotuloForma.parentElement.querySelector('.campo__icone');
      if (iconeForma) iconeForma.innerHTML = icone(emDespesas ? 'cartao' : 'pessoa');

      dicaForma.textContent = emDespesas
        ? 'Mesma lista da planilha.'
        : 'Texto livre, como no VBA (ex: Trabalho).';

      // Em Despesas vira seletor; em Receitas, texto livre.
      const valorAtual = forma.value;
      if (emDespesas && forma.tagName !== 'SELECT') {
        forma.outerHTML = `<select class="entrada" id="campo_formaOuOrigem" required>
          <option value="">—</option>
          ${FORMAS_PGTO.map((f) => `<option value="${f}">${f}</option>`).join('')}
        </select>`;
      } else if (!emDespesas && forma.tagName === 'SELECT') {
        forma.outerHTML = `<input class="entrada" id="campo_formaOuOrigem" type="text"
          autocomplete="off" placeholder="ex: Trabalho" value="${valorAtual.replace(/"/g, '&quot;')}" required>`;
      }
      const novo = raiz.querySelector('#campo_formaOuOrigem');
      if (novo.tagName === 'SELECT' && FORMAS_PGTO.includes(valorAtual)) novo.value = valorAtual;
    }

    destino.addEventListener('change', aplicar);
    aplicar();
  }

  const res = await abrirFormulario({
    titulo: 'Adicionar parcelas',
    icone: 'parcelas',
    sub: 'Uma compra dividida vira um lançamento por mês',
    rotuloConfirmar: 'Lançar parcelas',
    aoRenderizar: ajustarAoDestino,
    layout: 'ficha',
    campos: [
      { nome: 'destino', rotulo: 'Lançar em', icone: 'destino', grupo: 'Onde e quando',
        tipo: 'opcoes', vazio: false,
        opcoes: [{ valor: 'despesas', rotulo: 'Despesas' }, { valor: 'receitas', rotulo: 'Receitas' }],
        dica: 'Parcelas de uma compra vão em Despesas; de um recebimento dividido, em Receitas.' },
      { nome: 'dataInicial', rotulo: 'Data da 1ª parcela', icone: 'calendario', grupo: 'Onde e quando',
        tipo: 'data', obrigatorio: true, largura: 'meia',
        dica: 'As seguintes caem no mesmo dia dos meses à frente.' },
      { nome: 'quantidade', rotulo: 'Quantas parcelas', icone: 'hashtag', grupo: 'Onde e quando',
        tipo: 'inteiro', obrigatorio: true, min: 1, largura: 'meia',
        dica: 'Cada uma vira um lançamento separado, numerado.' },

      { nome: 'valorParcela', rotulo: 'Valor de cada parcela', icone: 'dinheiro', grupo: 'Valor e classificação',
        tipo: 'valor', obrigatorio: true, largura: 'meia',
        dica: 'O valor de UMA parcela, não o total da compra.' },
      { nome: 'categoria', rotulo: 'Categoria', icone: 'pasta', grupo: 'Valor e classificação',
        tipo: 'select', obrigatorio: true, largura: 'meia', opcoes: [] },
      { nome: 'descricao', rotulo: 'Descrição', icone: 'texto', grupo: 'Valor e classificação',
        tipo: 'texto', obrigatorio: true, exemplo: 'ex: nome da loja / origem',
        dica: 'O app acrescenta a numeração da parcela no fim.' },
      { nome: 'formaOuOrigem', rotulo: 'Forma de pagamento', icone: 'cartao', grupo: 'Valor e classificação',
        tipo: 'texto', obrigatorio: true, largura: 'meia',
        dica: 'Mesma lista da planilha.' },
      { nome: 'observacao', rotulo: 'Observação adicional', icone: 'nota', grupo: 'Valor e classificação',
        tipo: 'texto' }
    ],
    valores: { destino: destinoPadrao, dataInicial: paraISO(dataPadrao()), quantidade: 1 }
  });
  if (!res) return;

  if (res.valorParcela <= 0) {
    await avisar('Informe um valor de parcela maior que zero.', 'Valor inválido');
    return;
  }
  if (res.quantidade < 1) {
    await avisar('Informe uma quantidade de parcelas válida.', 'Quantidade inválida');
    return;
  }

  const n = adicionarParcelas(ctx.dados, res);
  ctx.aoMudarDados();
  await avisar(
    `${n} parcela${n === 1 ? '' : 's'} de ${moeda(res.valorParcela)} adicionada${n === 1 ? '' : 's'} em ${res.destino === 'despesas' ? 'Despesas' : 'Receitas'}.`,
    'Parcelas lançadas'
  );
}

// ---------------------------------------------------------
// Ligações de eventos
// ---------------------------------------------------------

export function ligarEventosTelas() {
  // --- Receitas ---
  $('btnReceitaInserir').addEventListener('click', () => novaReceita());
  $('btnReceitaCopiarFixas').addEventListener('click', () => copiarDoMesAnterior('receitas'));
  $('btnReceitaParcelas').addEventListener('click', () => lancarParcelas('receitas'));
  $('btnReceitaTodosMeses').addEventListener('click', () => {
    filtros.receitas.todosMeses = !filtros.receitas.todosMeses;
    renderizarReceitas();
  });
  $('btnReceitaLimpar').addEventListener('click', () => {
    filtros.receitas.busca = '';
    filtros.receitas.todosMeses = false;
    $('busca-receitas').value = '';
    renderizarReceitas();
  });
  $('busca-receitas').addEventListener('input', (e) => {
    filtros.receitas.busca = e.target.value;
    renderizarReceitas();
  });
  $('btnSelecaoReceitasRecebido').addEventListener('click', () => mudarStatusEmMassa('receitas', 'Recebido'));
  $('btnSelecaoReceitasPendente').addEventListener('click', () => mudarStatusEmMassa('receitas', 'Pendente'));
  $('btnSelecaoReceitasLimpar').addEventListener('click', () => limparSelecao('receitas'));

  // --- Despesas ---
  $('btnDespesaInserir').addEventListener('click', () => novaDespesa());
  $('btnDespesaCopiarFixas').addEventListener('click', () => copiarDoMesAnterior('despesas'));
  $('btnDespesaParcelas').addEventListener('click', () => lancarParcelas('despesas'));
  $('btnDespesaFatura').addEventListener('click', () => {
    filtros.despesas.soFatura = !filtros.despesas.soFatura;
    renderizarDespesas();
  });
  $('btnDespesaTodosMeses').addEventListener('click', () => {
    filtros.despesas.todosMeses = !filtros.despesas.todosMeses;
    renderizarDespesas();
  });
  $('btnDespesaLimpar').addEventListener('click', () => {
    filtros.despesas.busca = '';
    filtros.despesas.soFatura = false;
    filtros.despesas.todosMeses = false;
    $('busca-despesas').value = '';
    renderizarDespesas();
  });
  $('busca-despesas').addEventListener('input', (e) => {
    filtros.despesas.busca = e.target.value;
    renderizarDespesas();
  });
  $('btnSelecaoDespesasPago').addEventListener('click', () => mudarStatusEmMassa('despesas', 'Pago'));
  $('btnSelecaoDespesasPendente').addEventListener('click', () => mudarStatusEmMassa('despesas', 'Pendente'));
  $('btnSelecaoDespesasLimpar').addEventListener('click', () => limparSelecao('despesas'));

  // --- Devedores ---
  $('btnDevedorInserir').addEventListener('click', () => novoDevedor());
  $('btnDevedorCopiarRecorrentes').addEventListener('click', () => copiarDoMesAnterior('devedores'));
  $('btnDevedorAtrasados').addEventListener('click', () => {
    filtros.devedores.soAtrasados = !filtros.devedores.soAtrasados;
    renderizarDevedores();
  });
  $('btnDevedorTodosMeses').addEventListener('click', () => {
    filtros.devedores.todosMeses = !filtros.devedores.todosMeses;
    renderizarDevedores();
  });
  $('btnDevedorLimpar').addEventListener('click', () => {
    filtros.devedores.busca = '';
    filtros.devedores.soAtrasados = false;
    filtros.devedores.todosMeses = false;
    $('busca-devedores').value = '';
    renderizarDevedores();
  });
  $('busca-devedores').addEventListener('input', (e) => {
    filtros.devedores.busca = e.target.value;
    renderizarDevedores();
  });
  $('btnSelecaoDevedoresPago').addEventListener('click', () => mudarStatusEmMassa('devedores', 'Pago'));
  $('btnSelecaoDevedoresPendente').addEventListener('click', () => mudarStatusEmMassa('devedores', 'Pendente'));
  $('btnSelecaoDevedoresLimpar').addEventListener('click', () => limparSelecao('devedores'));

  // --- Investimento ---
  $('btnInvestimentoRendimento').addEventListener('click', novoRendimento);
  $('btnInvestimentoAporte').addEventListener('click', novoAporte);
  $('btnInvestimentoRetirada').addEventListener('click', novaRetirada);
  $('btnInvestimentoMeta').addEventListener('click', definirMeta);
  $('btnInvestimentoSimulador').addEventListener('click', abrirSimulador);
  $('btnInvestimentoTodosMeses').addEventListener('click', () => {
    filtros.investimento.todosMeses = !filtros.investimento.todosMeses;
    renderizarInvestimento();
  });
  $('btnInvestimentoLimpar').addEventListener('click', () => {
    filtros.investimento.busca = '';
    filtros.investimento.todosMeses = false;
    $('busca-investimento').value = '';
    renderizarInvestimento();
  });
  $('busca-investimento').addEventListener('input', (e) => {
    filtros.investimento.busca = e.target.value;
    renderizarInvestimento();
  });

  // --- Simulador ---
  ligarMascaraValor($('simValorMensal'));
  $('simValorMensal').addEventListener('input', calcularSimulador);
  $('simMeses').addEventListener('input', calcularSimulador);
  $('btnSimAteFimAno').addEventListener('click', () => {
    $('simMeses').value = mesesAteFimDoAno();
    calcularSimulador();
  });
  const fecharSim = () => { $('modalSimulador').hidden = true; };
  $('btnFecharSimulador').addEventListener('click', fecharSim);
  $('btnFecharSimulador2').addEventListener('click', fecharSim);
  $('modalSimulador').addEventListener('click', (e) => {
    if (e.target === $('modalSimulador')) fecharSim();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modalSimulador').hidden) fecharSim();
  });
}

/** Redesenha a tela visível. */
export function renderizarTela(nome) {
  switch (nome) {
    case 'receitas': return renderizarReceitas();
    case 'despesas': return renderizarDespesas();
    case 'devedores': return renderizarDevedores();
    case 'investimento': return renderizarInvestimento();
  }
}
