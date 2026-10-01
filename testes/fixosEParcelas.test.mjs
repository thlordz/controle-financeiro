// Testes da virada de mês e do parcelamento.
// Rode com:  node testes/fixosEParcelas.test.mjs
//
// Os dois casos que motivaram este arquivo apareceram numa auditoria
// pedida pelo Thiago, com os dados de verdade dele:
//
//   1. apertar "trazer os fixos" duas vezes trazia tudo duas vezes;
//   2. uma parcela que começava dia 31 pulava fevereiro e caía duas
//      vezes em março.
import {
  copiarFixasDespesas, copiarFixasReceitas, copiarRecorrentesDevedores,
  fixasDespesasACopiar, proximoMes,
} from '../app/js/dominio.js';

let passou = 0, falhou = 0;
const teste = (nome, fn) => {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
};
const igual = (a, b, oque) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${oque}\n         esperado: ${y}\n         obtido:   ${x}`);
};

const dados = (x = {}) => ({
  receitas: [], despesas: [], devedores: [], investimento: [],
  removidos: [], config: {}, ...x
});

console.log('\ntrazer os fixos do mês anterior');

teste('traz as fixas e só elas', () => {
  const d = dados({ despesas: [
    { id:'d1', data:'2026-09-05', valor:100, descricao:'Aluguel', fixa:'Sim', status:'Pago' },
    { id:'d2', data:'2026-09-07', valor:40,  descricao:'Pizza',   fixa:'Não', status:'Pago' },
  ]});
  igual(copiarFixasDespesas(d, 2026, 10), 1, 'só o aluguel era fixo');
  igual(d.despesas.length, 3, 'a nova entrou');
  const nova = d.despesas[2];
  igual(nova.data, '2026-10-05', 'mesmo dia, no mês novo');
  igual(nova.status, 'Pendente', 'nasce pendente');
  igual(nova.fixa, 'Sim', 'continua fixa, senão a corrente quebra no mês seguinte');
});

teste('apertar duas vezes não duplica', () => {
  const d = dados({ despesas: [
    { id:'d1', data:'2026-09-05', valor:100, descricao:'Aluguel', fixa:'Sim', status:'Pago' },
  ]});
  igual(copiarFixasDespesas(d, 2026, 10), 1, 'primeira vez traz');
  igual(copiarFixasDespesas(d, 2026, 10), 0, 'segunda vez não traz nada');
  igual(copiarFixasDespesas(d, 2026, 10), 0, 'nem a terceira');
  igual(d.despesas.length, 2, 'continua uma cópia só');
});

teste('uma fixa de valor diferente ainda vem', () => {
  const d = dados({ despesas: [
    { id:'d1', data:'2026-09-05', valor:100, descricao:'Aluguel', fixa:'Sim', status:'Pago' },
    { id:'d2', data:'2026-10-05', valor:120, descricao:'Aluguel', fixa:'Sim', status:'Pendente' },
  ]});
  // O aluguel de outubro existe, mas por outro valor: não é a cópia
  // deste, então o botão ainda tem o que fazer.
  igual(fixasDespesasACopiar(d, 2026, 10).length, 1, 'valor diferente não conta como já trazida');
});

teste('o dia 31 encolhe para o último dia do mês curto', () => {
  const d = dados({ despesas: [
    { id:'d1', data:'2026-01-31', valor:50, descricao:'Assinatura', fixa:'Sim', status:'Pago' },
  ]});
  copiarFixasDespesas(d, 2026, 2);
  igual(d.despesas[1].data, '2026-02-28', 'fevereiro de 2026 acaba no dia 28');
});

teste('comprovante e observação não viajam', () => {
  const d = dados({ despesas: [
    { id:'d1', data:'2026-09-05', valor:100, descricao:'Aluguel', fixa:'Sim',
      status:'Pago', comprovante:'recibo.jpg', observacao:'paguei no caixa' },
  ]});
  copiarFixasDespesas(d, 2026, 10);
  igual(d.despesas[1].comprovante, '', 'o comprovante é da conta antiga');
  igual(d.despesas[1].observacao, '', 'a observação também');
});

teste('receitas e devedores seguem a mesma regra', () => {
  const d = dados({
    receitas: [{ id:'r1', data:'2026-09-05', valor:3000, descricao:'Salário', fixa:'Sim', status:'Recebido' }],
    devedores: [{ id:'v1', pgtoPrevisto:'2026-09-10', valor:200, nome:'Mãe',
                  recorrente:'Sim', pagouEm:'2026-09-09' }],
  });
  igual(copiarFixasReceitas(d, 2026, 10), 1, 'a receita veio');
  igual(copiarFixasReceitas(d, 2026, 10), 0, 'e não vem de novo');
  igual(copiarRecorrentesDevedores(d, 2026, 10), 1, 'o devedor veio');
  igual(copiarRecorrentesDevedores(d, 2026, 10), 0, 'e não vem de novo');
  igual(d.devedores[1].pagouEm, '', 'o novo mês começa sem pagamento');
});

console.log('\ndatas das parcelas');

teste('parcela do dia 31 não pula fevereiro', () => {
  const inicio = new Date(2026, 0, 31);
  const datas = [];
  for (let i = 0; i < 4; i++) {
    const d = proximoMes(inicio, i);
    datas.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  igual(datas, ['2026-01-31','2026-02-28','2026-03-31','2026-04-30'],
        'uma parcela por mês, sempre dentro do mês');
});

teste('doze parcelas caem em doze meses diferentes', () => {
  const inicio = new Date(2026, 0, 30);
  const meses = new Set();
  for (let i = 0; i < 12; i++) {
    const d = proximoMes(inicio, i);
    meses.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  igual(meses.size, 12, 'nenhum mês ficou sem parcela e nenhum ficou com duas');
});

teste('a virada do ano funciona', () => {
  const d = proximoMes(new Date(2026, 10, 15), 3);   // novembro + 3
  igual([d.getFullYear(), d.getMonth(), d.getDate()], [2027, 1, 15], 'fevereiro de 2027');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
