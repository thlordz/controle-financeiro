// =========================================================
// Motor de cálculo do painel
// Porte fiel de Início_Módulo.bas -> Sub AtualizarPainel()
// e da fórmula da coluna Status da tabela Devedores.
// =========================================================

import { paraData, hoje, texto, diferencaEmDias } from './util.js';

/**
 * Status do devedor. Porte da fórmula da coluna A de Devedores:
 * =SE(Pgto. Previsto="";"";SE(Pagou em="-";"Perdoado";
 *    SE(Pagou em<>"";"Pago";SE(Pgto. Previsto>=HOJE();"Pendente";"Atrasado"))))
 */
export function statusDevedor(dev, referencia = hoje()) {
  if (!dev.pgtoPrevisto) return '';
  if (dev.pagouEm === '-') return 'Perdoado';
  if (dev.pagouEm) return 'Pago';
  const previsto = paraData(dev.pgtoPrevisto);
  if (!previsto) return '';
  return diferencaEmDias(previsto, referencia) >= 0 ? 'Pendente' : 'Atrasado';
}

/** Primeiro e último dia do mês, como DateSerial(ano,mes,1) e DateSerial(ano,mes+1,0). */
export function intervaloDoMes(ano, mes) {
  return {
    dtInicio: new Date(ano, mes - 1, 1),
    dtFim: new Date(ano, mes, 0)
  };
}

function dentroDoIntervalo(iso, dtInicio, dtFim) {
  const d = paraData(iso);
  if (!d) return false;
  return d >= dtInicio && d <= dtFim;
}

/**
 * Calcula todos os valores do painel de Início para o mês/ano indicados.
 * As chaves mantêm o nome da célula original da planilha para rastreabilidade.
 */
export function calcularPainel(dados, ano, mes) {
  const { dtInicio, dtFim } = intervaloDoMes(ano, mes);

  const receitas = dados.receitas || [];
  const despesas = dados.despesas || [];
  const devedores = dados.devedores || [];

  // Ajuste acumulado do saldo (O3), mexido só pelo botão "Reajustar".
  const ajusteSaldo = Number(dados.config?.ajusteSaldo) || 0;

  // --- RECEITAS (do mês) ---
  let receitaMes = 0;
  let receitaRecebida = 0;
  let receitaPendente = 0;

  for (const r of receitas) {
    if (!dentroDoIntervalo(r.data, dtInicio, dtFim)) continue;
    const valor = Number(r.valor) || 0;
    receitaMes += valor;
    if (texto(r.status) === 'recebido') receitaRecebida += valor;
    else receitaPendente += valor;
  }

  // --- DESPESAS (do mês) ---
  let despesaMes = 0;
  let despesaPaga = 0;
  let despesaPendente = 0;
  let faturaConfirmada = 0; // B13: cartão de crédito só Pendente
  let faturaPaga = 0;       // C15: cartão de crédito já Pago
  let faturaTotal = 0;      // B15: cartão de crédito Pendente + Aguardando

  for (const d of despesas) {
    if (!dentroDoIntervalo(d.data, dtInicio, dtFim)) continue;
    const valor = Number(d.valor) || 0;
    const status = texto(d.status);
    const forma = String(d.formaPgto || '');

    // Despesa do mês: todas (inclui Aguardando)
    despesaMes += valor;

    if (status === 'pago') despesaPaga += valor;
    if (status === 'pendente' || status === 'aguardando') despesaPendente += valor;

    // Fatura do cartão: só Cartão de Crédito
    if (forma.toLowerCase().includes('crédito')) {
      if (status === 'pendente') faturaConfirmada += valor;
      if (status === 'pago') faturaPaga += valor;
      if (status === 'pendente' || status === 'aguardando') faturaTotal += valor;
    }
  }

  // --- DEVEDORES (do mês) ---
  const referencia = hoje();
  let devedoresPagos = 0;
  let devedoresPendentes = 0;

  for (const v of devedores) {
    if (!dentroDoIntervalo(v.pgtoPrevisto, dtInicio, dtFim)) continue;
    const valor = Number(v.valor) || 0;
    if (texto(statusDevedor(v, referencia)) === 'pago') devedoresPagos += valor;
    else devedoresPendentes += valor;
  }

  // --- HISTÓRICO COMPLETO (para o saldo em conta) ---
  let receitaTotalRecebida = 0;
  for (const r of receitas) {
    if (texto(r.status) === 'recebido') receitaTotalRecebida += Number(r.valor) || 0;
  }

  let despesaTotalPaga = 0;
  for (const d of despesas) {
    if (texto(d.status) === 'pago') despesaTotalPaga += Number(d.valor) || 0;
  }

  let devedoresTotalPagos = 0;
  for (const v of devedores) {
    if (texto(statusDevedor(v, referencia)) === 'pago') devedoresTotalPagos += Number(v.valor) || 0;
  }

  const saldoConta =
    ajusteSaldo + receitaTotalRecebida + devedoresTotalPagos - despesaTotalPaga;

  const possGastar =
    saldoConta + receitaPendente + devedoresPendentes - despesaPendente;

  return {
    saldoConta,                                              // B5
    receitasDoMes: receitaMes + devedoresPagos + devedoresPendentes, // B8
    recebido: receitaRecebida + devedoresPagos,              // B10
    faltaReceber: receitaPendente + devedoresPendentes,      // C10
    possoGastar: possGastar,                                 // E5
    despesasDoMes: despesaMes,                               // E8
    pago: despesaPaga,                                       // E10
    faltaPagar: despesaPendente,                             // F10
    faturaAtual: faturaConfirmada,                           // B13
    faturaTotalPrevista: faturaTotal,                        // B15
    faturaPaga,                                              // C15
    rotuloPossoGastar: possGastar < 0 ? 'QUANTO ESTOU DEVENDO:' : 'QUANTO VAI SOBRAR:',
    devendo: possGastar < 0
  };
}
