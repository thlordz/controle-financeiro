// Testes da exportação para conferir com o banco.
// Rode com: node testes/exportar.test.mjs
import { movimentos, extratoCsv, relatorioTexto } from '../app/js/exportar.js';

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
const dados = {
  config: { ajusteSaldo: 1000 },
  despesas: [
    { data: '2026-10-05', valor: 250, descricao: 'Mercado', formaPgto: C, status: 'Pendente' },
    { data: '2026-10-06', valor: 70.95, descricao: 'TikTok Shop', formaPgto: C, status: 'Estornado' },
    { data: '2026-10-07', valor: 80, descricao: 'Padaria', formaPgto: 'Pix', status: 'Pago' },
    { data: '2026-10-08', valor: 40, descricao: 'Luz', formaPgto: 'Pix', status: 'Pendente' },
    { data: '2026-11-02', valor: 99, descricao: 'Fora do período', formaPgto: 'Pix', status: 'Pago' },
  ],
  receitas: [
    { data: '2026-10-05', valor: 3000, descricao: 'Salário', origem: 'Empresa', status: 'Recebido' },
    { data: '2026-10-25', valor: 500, descricao: 'Freela', status: 'Pendente' },
  ],
  devedores: [
    { nome: 'Mãe', valor: 200, pgtoPrevisto: '2026-10-29', pagouEm: '2026-10-22', formaPgto: 'Pix' },
    { nome: 'João', valor: 50, pgtoPrevisto: '2026-10-10' },
  ],
};
const periodo = { de: '2026-10-01', ate: '2026-10-31' };
const descricoes = (l) => l.map((m) => m.descricao).sort();

console.log('\no que entra em cada modo');

teste('fatura: só crédito, com o estornado junto', () => {
  igual(descricoes(movimentos(dados, { ...periodo, modo: 'fatura' })),
        ['Mercado', 'TikTok Shop'], 'o banco lista compra e estorno');
});

teste('conta: só o que já aconteceu, fora do crédito', () => {
  igual(descricoes(movimentos(dados, { ...periodo, modo: 'conta' })),
        ['Mãe me pagou', 'Padaria', 'Salário — Empresa'],
        'nem a luz pendente, nem o freela a receber, nem o João que não pagou');
});

teste('devedor entra pela data em que pagou, não pela previsão', () => {
  const mae = movimentos(dados, { ...periodo, modo: 'conta' }).find((m) => m.tipo === 'devedor');
  igual(mae.data, '2026-10-22', 'é nessa data que o Pix aparece no banco');
});

teste('o período corta', () => {
  const tudo = movimentos(dados, { ...periodo, modo: 'tudo' });
  igual(tudo.some((m) => m.descricao === 'Fora do período'), false, 'novembro não entra');
});

console.log('\no extrato');

teste('saída negativa, entrada positiva, vírgula decimal entre aspas', () => {
  const csv = extratoCsv(movimentos(dados, { ...periodo, modo: 'conta' }));
  const linhas = csv.trim().split('\n');
  igual(linhas[0], 'data,descricao,valor,forma,status,tipo,categoria,observacao', 'cabeçalho');
  igual(linhas.some((l) => l.includes('"Padaria","-80,00"')), true, 'gasto sai negativo');
  igual(linhas.some((l) => l.includes('"3000,00"')), true, 'salário entra positivo');
});

teste('aspas dentro da descrição não quebram a coluna', () => {
  const csv = extratoCsv([{ data: '2026-10-01', descricao: 'Loja "da esquina", centro', valor: -10,
    forma: 'Pix', status: 'Pago', tipo: 'despesa', categoria: '', observacao: '' }]);
  igual(csv.includes('"Loja ""da esquina"", centro"'), true, 'aspas dobradas, vírgula protegida');
});

console.log('\no relatório');

teste('estornado aparece mas não soma', () => {
  const r = relatorioTexto(dados, { ...periodo, modo: 'fatura' }, new Date(2026, 9, 24));
  igual(/Saídas \.+ −R\$ 250,00/.test(r), true, 'só o mercado soma');
  igual(r.includes('[ESTORNADO]'), true, 'mas ele está na lista');
});

teste('receita fica à parte das formas de pagamento', () => {
  const r = relatorioTexto(dados, { ...periodo, modo: 'conta' }, new Date(2026, 9, 24));
  igual(/Receitas \.+ R\$ 3\.000,00/.test(r), true, 'salário em Receitas');
  igual(/Pix \.+ R\$ 120,00/.test(r), true, 'Pix: −80 da padaria + 200 da mãe');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
