// Testes do estorno. Rode com: node testes/estorno.test.mjs
//
// Estorno é compra que aconteceu e cujo dinheiro voltou. Ela fica no
// app — é ela que se confere na fatura, ao lado da linha de crédito —
// e não pode contar em soma nenhuma.
import { calcularPainel } from '../app/js/calculos.js';

let passou = 0, falhou = 0;
const teste = (nome, fn) => {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
};
const igual = (a, b, oque) => {
  if (Math.abs(a - b) > 0.001) throw new Error(`${oque}\n         esperado: ${b}\n         obtido:   ${a}`);
};

const credito = 'Cartão de Crédito';
const dados = (despesas) => ({
  receitas: [], devedores: [], config: { ajusteSaldo: 1000 }, despesas,
});

console.log('\nestorno não conta');

teste('some do total do mês', () => {
  const p = calcularPainel(dados([
    { data: '2026-10-05', valor: 100, status: 'Pago', formaPgto: 'Pix' },
    { data: '2026-10-06', valor: 70.95, status: 'Estornado', formaPgto: credito },
  ]), 2026, 10);
  igual(p.despesasDoMes, 100, 'só a de 100 conta');
});

teste('não sai do saldo em conta', () => {
  const p = calcularPainel(dados([
    { data: '2026-10-06', valor: 70.95, status: 'Estornado', formaPgto: credito },
  ]), 2026, 10);
  igual(p.saldoConta, 1000, 'o dinheiro voltou, o saldo é o mesmo');
});

teste('não entra na fatura, nem atual, nem prevista, nem paga', () => {
  const p = calcularPainel(dados([
    { data: '2026-10-05', valor: 250, status: 'Pendente', formaPgto: credito },
    { data: '2026-10-06', valor: 70.95, status: 'Estornado', formaPgto: credito },
  ]), 2026, 10);
  igual(p.faturaAtual, 250, 'fatura atual');
  igual(p.faturaTotalPrevista, 250, 'fatura prevista');
  igual(p.faturaPaga, 0, 'fatura paga');
});

teste('não entra no que falta pagar nem no que vai sobrar', () => {
  const p = calcularPainel(dados([
    { data: '2026-10-06', valor: 70.95, status: 'Estornado', formaPgto: credito },
  ]), 2026, 10);
  igual(p.faltaPagar, 0, 'nada a pagar');
  igual(p.possoGastar, 1000, 'sobra o saldo inteiro');
});

teste('o caso da fatura do Nubank: compra e estorno no mesmo dia', () => {
  // Lançados como no banco: a compra estornada, e o resto normal.
  const p = calcularPainel(dados([
    { data: '2026-10-17', valor: 70.95, status: 'Estornado', formaPgto: credito },
    { data: '2026-10-20', valor: 27.42, status: 'Pendente', formaPgto: credito },
  ]), 2026, 10);
  igual(p.faturaAtual, 27.42, 'só a parcela do adaptador');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
