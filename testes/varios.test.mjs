// Testes do "lançar vários" e da regra do fechamento do cartão.
// Rode com: node testes/varios.test.mjs
import {
  lerValor, lerData, categoriaPeloNome, formaPeloNome,
  dataDepoisDoFechamento, aplicarFechamento, problemasDaLinha, linhaParaLancamento,
} from '../app/js/varios.js';

let passou = 0, falhou = 0;
const teste = (nome, fn) => {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
};
const igual = (a, b, oque) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${oque}\n         esperado: ${y}\n         obtido:   ${x}`);
};
const C = 'Cartão de Crédito';
const outubro = { ano: 2026, mes: 10 };

console.log('\nvalor do jeito que a pessoa digita');
teste('inteiro, vírgula, ponto, milhar, cifrão', () => {
  igual([lerValor('30'), lerValor('2,79'), lerValor('2.79'), lerValor('1.234,56'), lerValor('R$ 12')],
        [30, 2.79, 2.79, 1234.56, 12], 'todos viram número');
});
teste('o que não é número fica nulo, e zero também', () => {
  igual([lerValor(''), lerValor('abc'), lerValor('0'), lerValor('-5')], [null, null, null, null],
        'nada de lançamento de zero ou negativo');
});

console.log('\ndata do jeito que a pessoa digita');
teste('dia sozinho é do mês da tela', () => igual(lerData('28', outubro), '2026-10-28', 'dia 28 de outubro'));
teste('dia/mês e dia/mês/ano', () => {
  igual([lerData('3/11', outubro), lerData('29/10/2026', outubro), lerData('29/10/26', outubro)],
        ['2026-11-03', '2026-10-29', '2026-10-29'], 'as três formas');
});
teste('data impossível não vira outra calada', () => {
  igual([lerData('31/02', outubro), lerData('32', outubro), lerData('10/13', outubro)], [null, null, null],
        '31 de fevereiro não é 3 de março');
});

console.log('\no que dá pra adivinhar');
const historico = [
  { descricao: 'Tiktok', categoria: 'Lazer', formaPgto: C },
  { descricao: 'tiktok ', categoria: 'Lazer', formaPgto: C },
  { descricao: 'Tiktok', categoria: 'Outros', formaPgto: 'Pix' },
];
teste('categoria e forma mais usadas para o nome', () => {
  igual([categoriaPeloNome(historico, 'TIKTOK'), formaPeloNome(historico, 'Tiktok')], ['Lazer', C],
        'ignora maiúscula e espaço, fica com a mais comum');
});
teste('nome novo não inventa nada', () => igual(categoriaPeloNome(historico, 'Padaria'), '', 'vazio'));

console.log('\no fechamento do cartão');
teste('crédito do dia do fechamento em diante vai pro dia 1º seguinte', () => {
  igual([dataDepoisDoFechamento('2026-10-28', C, 28), dataDepoisDoFechamento('2026-10-29', C, 28)],
        ['2026-11-01', '2026-11-01'], 'dia 28 e 29 → 1º de novembro');
});
teste('antes do fechamento, fica onde está', () => igual(dataDepoisDoFechamento('2026-10-27', C, 28), null, 'dia 27 fica'));
teste('virada do ano', () => igual(dataDepoisDoFechamento('2026-12-30', C, 28), '2027-01-01', 'dezembro vai pra janeiro'));
teste('fora do crédito, nunca mexe', () => igual(dataDepoisDoFechamento('2026-10-29', 'Pix', 28), null, 'Pix fica'));
teste('sem dia configurado, nunca mexe', () => igual(dataDepoisDoFechamento('2026-10-29', C, ''), null, 'desligado'));
teste('a data de verdade vai para a observação, uma vez só', () => {
  const x = { data: '2026-10-29', formaPgto: C, observacao: 'presente' };
  igual(aplicarFechamento(x, 28), true, 'mexeu');
  igual([x.data, x.observacao], ['2026-11-01', 'presente · comprado em 29/10'], 'data nova, nota junto');
  igual(aplicarFechamento(x, 28), false, 'aplicar de novo não mexe — o dia 1º é antes do fechamento');
});

console.log('\numa linha da planilha');
teste('linha vazia não é problema, linha pela metade é', () => {
  igual(problemasDaLinha({}, outubro), { vazia: true, faltando: [] }, 'vazia');
  igual(problemasDaLinha({ nome: 'Claro', data: '28' }, outubro).faltando, ['valor'], 'falta o valor');
});
teste('vira lançamento com status pela forma e o fechamento aplicado', () => {
  const ctx = { tipo: 'despesas', base: outubro, hojeIso: '2026-10-29', diaFechamento: 28 };
  const a = linhaParaLancamento({ data: '29', nome: 'Claro', valor: '30', forma: C, categoria: 'Serviço' }, ctx);
  igual([a.item.data, a.item.status, a.item.valor, a.movido], ['2026-11-01', 'Pendente', 30, true], 'crédito');
  const b = linhaParaLancamento({ data: '29', nome: 'Padaria', valor: '8,50', forma: 'Pix' }, ctx);
  igual([b.item.data, b.item.status, b.movido], ['2026-10-29', 'Pago', false], 'Pix já saiu da conta');
});
teste('receita: futura fica pendente, passada já entrou', () => {
  const ctx = { tipo: 'receitas', base: outubro, hojeIso: '2026-10-29', diaFechamento: 28 };
  igual(linhaParaLancamento({ data: '5', nome: 'Salário', valor: '3000' }, ctx).item.status, 'Recebido', 'passada');
  igual(linhaParaLancamento({ data: '30', nome: 'Freela', valor: '500' }, ctx).item.status, 'Pendente', 'futura');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
