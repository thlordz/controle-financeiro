// =========================================================
// Regras de negócio das quatro listas.
// Porte de Receita_Módulo, Despesas_Módulo, Devedores_Módulo
// e Investimento_Módulo.
// =========================================================

import { paraData, paraISO, texto, MESES } from './util.js';
import { statusDevedor, intervaloDoMes } from './calculos.js';

// ---------------------------------------------------------
// Listas de opções (validação de dados da planilha)
// ---------------------------------------------------------

export const STATUS_RECEITA = ['Recebido', 'Pendente'];
export const STATUS_DESPESA = ['Pago', 'Pendente', 'Aguardando'];

export const CATEGORIAS_RECEITA =
  ['Renda fixa', 'Renda extra', 'Presente', 'Investimento', 'Empréstimo'];

export const CATEGORIAS_DESPESA =
  ['Moradia', 'Transporte', 'Alimentação', 'Saúde', 'Serviço', 'Vestuário',
   'Educação', 'Lazer', 'Imprevistos', 'Investimentos', 'Empréstimo', 'Outros'];

export const FORMAS_PGTO =
  ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Pix', 'Poupança'];

export const TIPOS_DEVEDOR = ['Empréstimo', 'Streaming', 'Venda', 'Serviço', 'Outros'];
export const FORMAS_DEVEDOR = ['Pix', 'Dinheiro', 'Abatido'];

export const SIM_NAO = ['Sim', 'Não'];

// Categorias oferecidas no lançamento de parcelas — ArrayCategorias() do VBA,
// que é mais enxuta que a lista completa de validação da planilha.
export const CATEGORIAS_PARCELA_RECEITA = ['Renda fixa', 'Renda extra', 'Presente'];
export const CATEGORIAS_PARCELA_DESPESA = CATEGORIAS_DESPESA;

// ---------------------------------------------------------
// Utilidades
// ---------------------------------------------------------

/** Gera um id que ainda não existe na lista. */
/**
 * Identificador de um lançamento novo.
 *
 * Era sequencial (`d1`, `d2`, … pelo tamanho da lista), o que só
 * funciona enquanto UM lugar cria lançamentos. Com o mesmo arquivo em
 * dois aparelhos, os dois criariam `d540` para gastos diferentes e a
 * junção trataria como o mesmo lançamento — um apagaria o outro em
 * silêncio. Agora o id carrega o momento e um sorteio, então dois
 * aparelhos nunca colidem.
 *
 * Os ids antigos continuam válidos: nada é renumerado.
 */
export function novoId(prefixo, lista = []) {
  const usados = new Set(lista.map((x) => x.id));
  let id;
  do {
    const momento = Date.now().toString(36);
    const sorteio = Math.random().toString(36).slice(2, 8);
    id = `${prefixo}-${momento}-${sorteio}`;
  } while (usados.has(id));
  return id;
}

/** Momento atual em ISO, a unidade de tempo da sincronização. */
// O maior carimbo que este aparelho já viu — o próprio ou um que
// desceu do banco. Serve de piso para os carimbos novos.
let maiorCarimbo = 0;

/**
 * Registra um carimbo visto, venha de onde vier.
 *
 * Chamado ao ler os dados e ao baixar do banco. É o que ensina a este
 * aparelho o "agora" do resto do mundo.
 */
export function anotarCarimbo(iso) {
  const t = Date.parse(iso || '');
  if (Number.isFinite(t) && t > maiorCarimbo) maiorCarimbo = t;
}

/**
 * O instante de agora — nunca anterior ao que já foi visto.
 *
 * O relógio do aparelho é a única régua que temos para decidir qual
 * alteração é a mais nova, e ele pode estar errado. Num celular com a
 * data atrasada, toda alteração nasceria "velha": o banco recusa a
 * subida (só aceita carimbo maior que o guardado) e, na descida, a
 * versão antiga vence a nova. Na prática a pessoa muda o saldo, e
 * dias depois ele volta sozinho ao valor anterior.
 *
 * Avançar um milissegundo além do maior carimbo conhecido resolve
 * isso sem depender do relógio estar certo: o que foi editado por
 * último aqui é, para o banco, o mais novo.
 */
export function agora() {
  const t = Math.max(Date.now(), maiorCarimbo + 1);
  maiorCarimbo = t;
  return new Date(t).toISOString();
}

/**
 * Carimba o lançamento como alterado agora. É esse carimbo que diz,
 * na junção, qual das duas versões é a mais nova.
 */
export function carimbar(item) {
  item.atualizadoEm = agora();
  return item;
}

/** Guarda que um lançamento foi apagado, para ele não voltar do outro aparelho. */
export function registrarRemocao(dados, tipo, id) {
  if (!Array.isArray(dados.removidos)) dados.removidos = [];
  dados.removidos = dados.removidos.filter((r) => !(r.tipo === tipo && r.id === id));
  dados.removidos.push({ tipo, id, em: agora() });
}

/** Dias que uma marca de exclusão é guardada antes de virar peso morto. */
export const DIAS_GUARDA_REMOCAO = 180;

/**
 * Poda marcas de exclusão antigas. Sem isso a lista cresceria para
 * sempre — inclusive no aparelho de quem nunca sincroniza, para quem
 * ela não serve para nada.
 */
export function podarRemovidos(dados) {
  if (!Array.isArray(dados.removidos)) { dados.removidos = []; return; }
  const limite = Date.now() - DIAS_GUARDA_REMOCAO * 86400000;
  dados.removidos = dados.removidos.filter((r) => {
    const em = Date.parse(r?.em || '');
    return Number.isFinite(em) && em >= limite;
  });
}

/** Cria um lançamento já carimbado e o guarda na lista. */
export function criarRegistro(dados, tipo, campos) {
  const item = carimbar({ ...campos, id: novoId(PREFIXO[tipo], dados[tipo]) });
  dados[tipo].push(item);
  return item;
}

/** Aplica mudanças num lançamento existente, recarimbando. */
export function atualizarRegistro(item, campos) {
  Object.assign(item, campos);
  return carimbar(item);
}

/** Apaga um lançamento e deixa a marca da exclusão. */
export function removerRegistro(dados, tipo, id) {
  dados[tipo] = dados[tipo].filter((x) => x.id !== id);
  registrarRemocao(dados, tipo, id);
}

/** Prefixo de id de cada lista. */
export const PREFIXO = {
  receitas: 'r', despesas: 'd', devedores: 'v', investimento: 'i'
};

/** Último dia do mês (equivale a Day(DateSerial(ano, mes + 1, 0))). */
export function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Mesma data em outro mês, sem estourar o fim do mês.
 * Porte de ProximoMes() do Despesas_Módulo.
 */
export function proximoMes(dataBase, mesesAFrente) {
  let mes = dataBase.getMonth() + 1 + mesesAFrente;
  const ano = dataBase.getFullYear() + Math.floor((mes - 1) / 12);
  mes = ((mes - 1) % 12) + 1;
  const dia = Math.min(dataBase.getDate(), ultimoDiaDoMes(ano, mes));
  return new Date(ano, mes - 1, dia);
}

/** Mesmo dia, no mês/ano indicados, limitado ao último dia do mês. */
function mesmaDiaNoMes(isoOrigem, ano, mes) {
  const d = paraData(isoOrigem);
  if (!d) return null;
  const dia = Math.min(d.getDate(), ultimoDiaDoMes(ano, mes));
  return paraISO(new Date(ano, mes - 1, dia));
}

/** A data ISO cai dentro do mês/ano indicados? */
export function noMes(iso, ano, mes) {
  const d = paraData(iso);
  return Boolean(d) && d.getFullYear() === ano && d.getMonth() + 1 === mes;
}

/** Mês/ano imediatamente anterior. */
export function mesAnterior(ano, mes) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

// ---------------------------------------------------------
// Totais dos cabeçalhos
//
// Na planilha eles usam SUBTOTAL(103, ...), ou seja, somam só as
// linhas visíveis — por isso aqui recebem a lista já filtrada.
// ---------------------------------------------------------

const soma = (lista, teste) =>
  lista.reduce((t, x) => (teste(x) ? t + (Number(x.valor) || 0) : t), 0);

export function totaisReceitas(lista) {
  return {
    pendente: soma(lista, (r) => texto(r.status) === 'pendente'),
    recebido: soma(lista, (r) => texto(r.status) === 'recebido')
  };
}

export function totaisDespesas(lista) {
  return {
    pendente: soma(lista, (d) => ['pendente', 'aguardando'].includes(texto(d.status))),
    pago: soma(lista, (d) => texto(d.status) === 'pago')
  };
}

export function totaisDevedores(lista) {
  return {
    pendente: soma(lista, (v) => ['pendente', 'atrasado'].includes(texto(statusDevedor(v)))),
    recebido: soma(lista, (v) => texto(statusDevedor(v)) === 'pago')
  };
}

// ---------------------------------------------------------
// Copiar lançamentos do mês anterior
// ---------------------------------------------------------

/**
 * Quem já está lá, para não vir de novo.
 *
 * Copiar os fixos é um botão, e botão se aperta duas vezes — por
 * dúvida, por engano, por toque repetido no celular. Antes a segunda
 * vez trazia tudo outra vez: dez despesas viravam vinte, e desfazer
 * era apagar uma a uma. A cópia é sempre a mesma coisa (mesma
 * descrição, mesmo valor, mesmo dia), então reconhecer o que já veio
 * é simples, e a operação passa a poder ser repetida à vontade.
 */
function jaEstaNoMes(lista, campoData, ano, mes, molde, chave) {
  const alvo = mesmaDiaNoMes(molde[campoData], ano, mes);
  return lista.some((x) =>
    x[campoData] === alvo &&
    Number(x.valor) === Number(molde.valor) &&
    texto(x[chave]) === texto(molde[chave]));
}

/**
 * Porte de Receita_CopiarFixasMesAnterior().
 * Copia as receitas marcadas como fixas do mês anterior, sempre
 * como "Pendente". Devolve quantas foram criadas.
 */
export function copiarFixasReceitas(dados, ano, mes) {
  const origem = fixasReceitasACopiar(dados, ano, mes);

  for (const r of origem) {
    dados.receitas.push(carimbar({
      ...r,
      id: novoId('r', dados.receitas),
      data: mesmaDiaNoMes(r.data, ano, mes),
      status: 'Pendente'
    }));
  }
  return origem.length;
}

/** As que viriam, se o botão fosse apertado agora. */
export function fixasReceitasACopiar(dados, ano, mes) {
  const anterior = mesAnterior(ano, mes);
  return (dados.receitas || []).filter(
    (r) => texto(r.fixa) === 'sim' && noMes(r.data, anterior.ano, anterior.mes)
        && !jaEstaNoMes(dados.receitas, 'data', ano, mes, r, 'descricao')
  );
}

/**
 * Porte de Despesa_CopiarFixasMesAnterior().
 * Copia só valor, descrição, categoria e forma de pagamento — o VBA
 * deliberadamente não leva comprovante nem observação.
 */
export function copiarFixasDespesas(dados, ano, mes) {
  const origem = fixasDespesasACopiar(dados, ano, mes);

  for (const d of origem) {
    dados.despesas.push(carimbar({
      id: novoId('d', dados.despesas),
      data: mesmaDiaNoMes(d.data, ano, mes),
      status: 'Pendente',
      valor: d.valor,
      descricao: d.descricao,
      categoria: d.categoria,
      formaPgto: d.formaPgto,
      comprovante: '',
      fixa: 'Sim',
      observacao: ''
    }));
  }
  return origem.length;
}

/** As que viriam, se o botão fosse apertado agora. */
export function fixasDespesasACopiar(dados, ano, mes) {
  const anterior = mesAnterior(ano, mes);
  return (dados.despesas || []).filter(
    (d) => texto(d.fixa) === 'sim' && noMes(d.data, anterior.ano, anterior.mes)
        && !jaEstaNoMes(dados.despesas, 'data', ano, mes, d, 'descricao')
  );
}

/**
 * Porte de Devedores_CopiarRecorrentesMesAnterior().
 * Copia a linha inteira, move o vencimento e zera pagamento,
 * forma e comprovante — o status se recalcula sozinho.
 */
export function copiarRecorrentesDevedores(dados, ano, mes) {
  const origem = recorrentesACopiar(dados, ano, mes);

  for (const v of origem) {
    dados.devedores.push(carimbar({
      ...v,
      id: novoId('v', dados.devedores),
      pgtoPrevisto: mesmaDiaNoMes(v.pgtoPrevisto, ano, mes),
      pagouEm: '',
      formaPgto: '',
      comprovante: ''
    }));
  }
  return origem.length;
}

/** Os que viriam, se o botão fosse apertado agora. */
export function recorrentesACopiar(dados, ano, mes) {
  const anterior = mesAnterior(ano, mes);
  return (dados.devedores || []).filter(
    (v) => texto(v.recorrente) === 'sim'
        && noMes(v.pgtoPrevisto, anterior.ano, anterior.mes)
        && !jaEstaNoMes(dados.devedores, 'pgtoPrevisto', ano, mes, v, 'nome')
  );
}

// ---------------------------------------------------------
// Parcelas — porte de Despesa_AdicionarParcelas()
// ---------------------------------------------------------

/**
 * Cria N parcelas mensais em Despesas ou Receitas.
 * `spec`: { destino, descricao, categoria, formaOuOrigem, dataInicial,
 *           quantidade, valorParcela, observacao }
 */
export function adicionarParcelas(dados, spec) {
  const emDespesas = spec.destino === 'despesas';
  const lista = emDespesas ? dados.despesas : dados.receitas;
  const dtInicial = paraData(spec.dataInicial);
  const criadas = [];

  for (let i = 1; i <= spec.quantidade; i++) {
    let obs = `Parcela (${i}/${spec.quantidade})`;
    if (spec.observacao?.trim()) obs += ` - ${spec.observacao.trim()}`;

    const base = {
      id: novoId(emDespesas ? 'd' : 'r', lista.concat(criadas)),
      data: paraISO(proximoMes(dtInicial, i - 1)),
      status: 'Pendente',
      valor: spec.valorParcela,
      descricao: spec.descricao,
      categoria: spec.categoria,
      comprovante: '',
      observacao: obs
    };

    criadas.push(carimbar(emDespesas
      ? { ...base, formaPgto: spec.formaOuOrigem, fixa: '' }
      : { ...base, origem: spec.formaOuOrigem, fixa: '' }));
  }

  lista.push(...criadas);
  return criadas.length;
}

// ---------------------------------------------------------
// Investimento
//
// A lista não é digitada: é reconstruída a partir de Despesas
// (categoria "Investimentos", já pagas) e Receitas (categoria
// "Investimento", já recebidas). Só os rendimentos moram aqui.
// Porte de Investimento_AtualizarListaEGrafico().
// ---------------------------------------------------------

export function listaInvestimento(dados) {
  const itens = [];

  for (const d of dados.despesas) {
    if (texto(d.categoria) === 'investimentos' && texto(d.status) === 'pago') {
      itens.push({
        id: `ap:${d.id}`,
        data: d.data,
        valor: Number(d.valor) || 0,
        descricao: d.descricao,
        categoria: 'Aporte',
        origemAba: 'despesas',
        origemId: d.id
      });
    }
  }

  for (const r of dados.receitas) {
    if (texto(r.categoria) === 'investimento' && texto(r.status) === 'recebido') {
      itens.push({
        id: `rt:${r.id}`,
        data: r.data,
        valor: -(Number(r.valor) || 0),
        descricao: r.descricao,
        categoria: 'Retirada',
        origemAba: 'receitas',
        origemId: r.id
      });
    }
  }

  // Rendimentos são lançados direto na aba Investimento.
  for (const i of dados.investimento) {
    if (texto(i.categoria) !== 'rendimento') continue;
    itens.push({
      id: i.id,
      data: i.data,
      valor: Number(i.valor) || 0,
      descricao: i.descricao,
      categoria: 'Rendimento',
      origemAba: '',
      origemId: ''
    });
  }

  itens.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return itens;
}

/** Quanto já foi guardado — porte da fórmula de Investimento!D2. */
export function totalInvestido(dados) {
  return listaInvestimento(dados).reduce((t, i) => t + i.valor, 0);
}

/**
 * Porte de ValidarSaldoInvestimento(): uma retirada não pode
 * deixar o saldo investido negativo.
 * Devolve o saldo que sobraria, ou null se a operação não mexe
 * no investimento.
 */
export function saldoInvestidoSimulado(dados, receitaAlterada) {
  if (texto(receitaAlterada.categoria) !== 'investimento') return null;
  if (texto(receitaAlterada.status) !== 'recebido') return null;

  const outras = dados.receitas.filter((r) => r.id !== receitaAlterada.id);
  const copia = { ...dados, receitas: [...outras, receitaAlterada] };
  return totalInvestido(copia);
}

/** Simulador de investimento — porte de CalcularInvestimento(). */
export function simularInvestimento(valorMensal, meses, valorGuardado) {
  const totalProjetado = (Number(valorMensal) || 0) * (Number(meses) || 0);
  return { totalProjetado, totalFinal: totalProjetado + valorGuardado };
}

/** Meses restantes até o fim do ano — porte de btnAteFimAno_Click(). */
export function mesesAteFimDoAno(referencia = new Date()) {
  return 12 - (referencia.getMonth() + 1);
}

// ---------------------------------------------------------
// Busca — porte de frmBuscaLancamentos
// ---------------------------------------------------------

/** Remove acentos, como RemoverAcentos() do VBA. */
export function semAcento(t) {
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export { MESES, statusDevedor, intervaloDoMes };
