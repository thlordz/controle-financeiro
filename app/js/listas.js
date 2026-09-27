// =========================================================
// Renderização das listas de Receitas, Despesas, Devedores
// e Investimento.
//
// Cada tela repete a estrutura da aba correspondente da
// planilha: totais no topo (que seguem o filtro, como o
// SUBTOTAL(103) das fórmulas), botões de ação e a tabela.
// =========================================================

import { moeda, formatarData, paraData, texto } from './util.js';
import { statusDevedor } from './calculos.js';
import { noMes, listaInvestimento, semAcento } from './dominio.js';

/** Escapa texto vindo dos dados antes de jogar no HTML. */
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Classe de cor do selo de status. */
function classeStatus(status) {
  switch (texto(status)) {
    case 'recebido':
    case 'pago': return 'selo--verde';
    case 'pendente': return 'selo--ambar';
    case 'aguardando': return 'selo--azul';
    case 'atrasado': return 'selo--vermelho';
    case 'perdoado': return 'selo--cinza';
    case 'aporte': return 'selo--verde';
    case 'retirada': return 'selo--vermelho';
    case 'rendimento': return 'selo--azul';
    default: return 'selo--cinza';
  }
}

/**
 * Célula do comprovante: um clipe que abre o anexo, sem passar pela
 * edição. Fica estreita de propósito — a tabela não pode ganhar
 * largura a ponto de precisar rolar de lado.
 */
function temAnexo(item) {
  const a = item.comprovante;
  return Boolean(a && typeof a === 'object' && a.dados);
}

/** Classe da célula de anexo — no celular a célula vazia some. */
function classeAnexo(item) {
  return temAnexo(item) ? 'col-anexo' : 'col-anexo col-anexo--vazio';
}

function anexo(item) {
  if (!temAnexo(item)) return '<span class="anexo-vazio" aria-hidden="true">—</span>';
  return `<button type="button" class="anexo-clipe" data-anexo data-id="${esc(item.id)}"
    title="Abrir comprovante" aria-label="Abrir comprovante">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 11.5l-8.8 8.8a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.3-2.3l8.3-8.3"/>
    </svg>
  </button>`;
}

/**
 * Primeira célula da linha: a checkbox de seleção mora aqui, flutuando
 * sobre a margem esquerda, em vez de ocupar uma coluna só dela. Ela
 * aparece no hover (ou quando está marcada) e tem uma área de clique
 * bem maior que o quadradinho.
 */
function celulaInicio(id, conteudo) {
  return `<td class="celula-inicio nowrap">
    <label class="selecionar" title="Selecionar">
      <input type="checkbox" class="linha-check" data-id="${esc(id)}" aria-label="Selecionar linha">
    </label>
    <span class="celula-inicio__texto">${conteudo}</span>
  </td>`;
}

/** Descrição da linha, com a observação em letra menor logo abaixo. */
function descricao(texto, observacao) {
  return `${esc(texto)}${observacao ? `<span class="obs">${esc(observacao)}</span>` : ''}`;
}

function selo(status) {
  if (!status) return '';
  return `<span class="selo ${classeStatus(status)}">${esc(status)}</span>`;
}

/**
 * Selo clicável: muda o status sem abrir o formulário de edição.
 * `id` liga o clique à linha; passar `interativo: false` (ex: devedor
 * perdoado) deixa o selo só de leitura.
 */
function seloClicavel(status, id, interativo = true) {
  if (!status) return '';
  if (!interativo) return `<span class="selo ${classeStatus(status)}">${esc(status)}</span>`;
  return `<button type="button" class="selo selo--clicavel ${classeStatus(status)}"
    data-status data-id="${esc(id)}" title="Toque para mudar o status">${esc(status)}</button>`;
}

/**
 * As formas em que um valor pode ser digitado na busca: com e sem
 * separador de milhar, com vírgula ou com ponto nos centavos. Sem isto,
 * procurar por "128,99" não achava o lançamento de R$ 128,99, porque a
 * comparação era feita contra o número cru (128.99).
 */
function textoDoValor(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '';
  const comMilhar = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const semMilhar = comMilhar.replace(/\./g, '');
  return `${comMilhar}|${semMilhar}|${semMilhar.replace(',', '.')}`;
}

/** Filtra pelo mês/ano e pelo texto da busca. */
export function filtrar(lista, { ano, mes, busca, campoData, campos, filtroExtra }) {
  let saida = lista;

  if (ano && mes) saida = saida.filter((x) => noMes(x[campoData], ano, mes));
  if (filtroExtra) saida = saida.filter(filtroExtra);

  const termo = semAcento(busca || '').trim();
  if (termo) {
    // Para o campo de valor, o "R$" e os espaços que a pessoa colar
    // junto não contam.
    const termoValor = termo.replace(/r\$|\s/g, '');
    const combina = (x, c) => (c === 'valor'
      ? Boolean(termoValor) && textoDoValor(x[c]).includes(termoValor)
      : semAcento(x[c]).includes(termo));
    saida = saida.filter((x) => campos.some((c) => combina(x, c)));
  }

  return saida.slice().sort((a, b) =>
    String(b[campoData] || '').localeCompare(String(a[campoData] || '')));
}

function vazio(mensagem) {
  return `<tr><td class="tabela__vazio" colspan="99">${mensagem}</td></tr>`;
}

function moldura(colunas, corpo) {
  return `<div class="tabela-rolagem">
    <table class="tabela">
      <thead><tr>${colunas.map((c) =>
        `<th class="${c.classe || ''}">${c.rotulo}</th>`).join('')}</tr></thead>
      <tbody>${corpo}</tbody>
    </table>
  </div>`;
}

// ---------------------------------------------------------
// Receitas
// ---------------------------------------------------------

export function tabelaReceitas(lista) {
  const colunas = [
    { rotulo: 'Data' }, { rotulo: 'Status' }, { rotulo: 'Valor', classe: 'num' },
    { rotulo: 'Descrição' }, { rotulo: 'Categoria' },
    { rotulo: 'Origem', classe: 'opcional' },
    { rotulo: 'Anexo', classe: 'col-anexo' }, { rotulo: 'Fixa', classe: 'opcional' }
  ];

  if (lista.length === 0) return moldura(colunas, vazio('Nenhuma receita neste mês.'));

  const linhas = lista.map((r) => `
    <tr data-id="${esc(r.id)}" tabindex="0">
      ${celulaInicio(r.id, formatarData(paraData(r.data)))}
      <td>${seloClicavel(r.status, r.id)}</td>
      <td class="num forte">${moeda(r.valor)}</td>
      <td>${descricao(r.descricao, r.observacao)}</td>
      <td class="fraco">${esc(r.categoria)}</td>
      <td class="fraco opcional">${esc(r.origem)}</td>
      <td class="${classeAnexo(r)}">${anexo(r)}</td>
      <td class="fraco opcional">${texto(r.fixa) === 'sim' ? 'Sim' : '—'}</td>
    </tr>`).join('');

  return moldura(colunas, linhas);
}

// ---------------------------------------------------------
// Despesas
// ---------------------------------------------------------

export function tabelaDespesas(lista) {
  const colunas = [
    { rotulo: 'Data' }, { rotulo: 'Status' }, { rotulo: 'Valor', classe: 'num' },
    { rotulo: 'Descrição' }, { rotulo: 'Categoria' },
    { rotulo: 'Forma de pgto.' },
    { rotulo: 'Anexo', classe: 'col-anexo' }, { rotulo: 'Fixa', classe: 'opcional' }
  ];

  if (lista.length === 0) return moldura(colunas, vazio('Nenhuma despesa neste mês.'));

  const linhas = lista.map((d) => `
    <tr data-id="${esc(d.id)}" tabindex="0">
      ${celulaInicio(d.id, formatarData(paraData(d.data)))}
      <td>${seloClicavel(d.status, d.id)}</td>
      <td class="num forte">${moeda(d.valor)}</td>
      <td>${descricao(d.descricao, d.observacao)}</td>
      <td class="fraco">${esc(d.categoria)}</td>
      <td class="fraco">${esc(d.formaPgto)}</td>
      <td class="${classeAnexo(d)}">${anexo(d)}</td>
      <td class="fraco opcional">${texto(d.fixa) === 'sim' ? 'Sim' : '—'}</td>
    </tr>`).join('');

  return moldura(colunas, linhas);
}

// ---------------------------------------------------------
// Devedores
// ---------------------------------------------------------

export function tabelaDevedores(lista) {
  const colunas = [
    { rotulo: 'Vencimento' }, { rotulo: 'Status' }, { rotulo: 'Valor', classe: 'num' },
    { rotulo: 'Nome' }, { rotulo: 'Tipo' }, { rotulo: 'Pagou em' },
    { rotulo: 'Forma', classe: 'opcional' },
    { rotulo: 'Anexo', classe: 'col-anexo' }, { rotulo: 'Recorrente', classe: 'opcional' }
  ];

  if (lista.length === 0) return moldura(colunas, vazio('Nenhum devedor neste mês.'));

  const linhas = lista.map((v) => {
    const st = statusDevedor(v);
    return `
    <tr data-id="${esc(v.id)}" tabindex="0">
      ${celulaInicio(v.id, formatarData(paraData(v.pgtoPrevisto)))}
      <td>${seloClicavel(st, v.id, st !== 'Perdoado')}</td>
      <td class="num forte">${moeda(v.valor)}</td>
      <td>${descricao(v.nome, v.observacao)}</td>
      <td class="fraco">${esc(v.tipo)}</td>
      <td class="fraco">${v.pagouEm === '-' ? 'Perdoado' : (formatarData(paraData(v.pagouEm)) ? 'Pago em ' + formatarData(paraData(v.pagouEm)) : '—')}</td>
      <td class="fraco opcional">${esc(v.formaPgto) || '—'}</td>
      <td class="${classeAnexo(v)}">${anexo(v)}</td>
      <td class="fraco opcional">${texto(v.recorrente) === 'sim' ? 'Sim' : '—'}</td>
    </tr>`;
  }).join('');

  return moldura(colunas, linhas);
}

// ---------------------------------------------------------
// Investimento
// ---------------------------------------------------------

export function tabelaInvestimento(lista) {
  const colunas = [
    { rotulo: 'Data' }, { rotulo: 'Categoria' }, { rotulo: 'Valor', classe: 'num' },
    { rotulo: 'Descrição' }, { rotulo: 'Origem', classe: 'opcional' }
  ];

  if (lista.length === 0) {
    return moldura(colunas, vazio('Nenhum lançamento de investimento neste mês.'));
  }

  const rotuloOrigem = {
    despesas: 'Despesas', receitas: 'Receitas', '': 'lançado aqui'
  };

  const linhas = lista.map((i) => `
    <tr data-id="${esc(i.id)}" data-origem="${esc(i.origemAba)}" data-origem-id="${esc(i.origemId)}" tabindex="0">
      <td class="nowrap">${formatarData(paraData(i.data))}</td>
      <td>${selo(i.categoria)}</td>
      <td class="num forte ${i.valor < 0 ? 'negativo' : 'positivo'}">${moeda(i.valor)}</td>
      <td>${descricao(i.descricao, '')}</td>
      <td class="fraco opcional">${rotuloOrigem[i.origemAba] ?? '—'}</td>
    </tr>`).join('');

  return moldura(colunas, linhas);
}

export { listaInvestimento };
