// Testes da conferência da fatura pelo arquivo do banco.
// Rode com: node testes/importar.test.mjs
import {
  camposDaLinha, valorDoBanco, lerArquivoDoBanco, parcelaDe, chaveDoTitulo,
  nomeDoTitulo, conferirFatura, aprenderNomes,
} from '../app/js/importar.js';

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
let seq = 0;
const d = (data, descricao, valor, extra = {}) =>
  ({ id: 'd' + (++seq), data, descricao, valor, formaPgto: C, status: 'Pendente', categoria: 'Lazer', ...extra });

console.log('\nler o arquivo');
teste('aspas seguram a vírgula do valor', () => {
  igual(camposDaLinha('2026-11-16,Ebn *Tiktok,"1,87"'), ['2026-11-16', 'Ebn *Tiktok', '1,87'], 'três campos');
});
teste('valor do banco guarda o sinal', () => {
  igual([valorDoBanco('1,87'), valorDoBanco('- 1.045,22'), valorDoBanco('1.87'), valorDoBanco('abc')],
        [1.87, -1045.22, 1.87, null], 'sinal e milhar');
});
teste('fatura e conta são reconhecidas pelo cabeçalho', () => {
  const f = lerArquivoDoBanco('﻿date,title,amount\n2026-11-16,Pg *Nio Fibra,"109,90"\n');
  igual([f.tipo, f.linhas[0].titulo, f.linhas[0].valor], ['fatura', 'Pg *Nio Fibra', 109.9], 'fatura');
  igual(lerArquivoDoBanco('Data,Valor,Identificador,Descrição\n').tipo, 'conta', 'conta');
  igual(lerArquivoDoBanco('qualquer,coisa\n').tipo, null, 'outro');
});

console.log('\nnomes');
teste('parcela do banco e do app', () => {
  igual(parcelaDe('Educa Mais Brasil - Parcela 5/12'), { n: 5, de: 12 }, 'banco');
  igual(parcelaDe('Mercado Livre  (1/3)'), { n: 1, de: 3 }, 'app no nome');
  igual(parcelaDe('Parcela (5/12) - Valor total'), { n: 5, de: 12 }, 'app na observação');
  igual(parcelaDe('comprado em 27/10'), null, 'data não é parcela');
});
teste('a chave ignora maiúscula, espaço e parcela', () => {
  igual(chaveDoTitulo('Ebn *Tiktok'), chaveDoTitulo('EBN*TIKTOK - Parcela 2/3'), 'mesma chave');
});
teste('palpite de nome tira o prefixo da maquininha', () => {
  igual([nomeDoTitulo('Ebn *Tiktok'), nomeDoTitulo('Pg *Nio Fibra'), nomeDoTitulo('Ifd*Vall Salgados'),
         nomeDoTitulo('Dl *Uberrides'), nomeDoTitulo('Bmb *21977468247')],
        ['Tiktok', 'Nio Fibra', 'iFood', 'Uber', 'Bmb *21977468247'], 'nomes');
});

console.log('\nconferir');
const fatura = (linhas) => lerArquivoDoBanco('date,title,amount\n' + linhas.join('\n')).linhas;

teste('tudo batendo, com parcela no dia em que a fatura abriu', () => {
  const dados = { despesas: [
    d('2026-11-16', 'Nio Fibra', 109.9),
    d('2026-11-02', 'Curso', 29.3, { observacao: 'Parcela (5/12)' }),
  ] };
  const r = conferirFatura(dados, fatura(['2026-11-16,Pg *Nio Fibra,"109,90"', '2026-10-27,Curso - Parcela 5/12,"29,30"']), {});
  igual([r.batem, r.quantas, r.faltam.length, r.totalBanco, r.totalApp], [2, 2, 0, 139.2, 139.2], 'bate');
});
teste('parcela com número diferente não casa', () => {
  const dados = { despesas: [d('2026-11-02', 'Curso', 29.3, { observacao: 'Parcela (4/12)' })] };
  const r = conferirFatura(dados, fatura(['2026-10-27,Curso - Parcela 5/12,"29,30"', '2026-11-16,Algo,"1,00"']), {});
  igual([r.faltam.length, r.perguntas.length], [2, 1], 'faltam duas, sobra uma');
});
teste('falta lançar: nome e categoria aprendidos dos outros pares', () => {
  const dados = { despesas: [d('2026-11-10', 'Tiktok', 1.69, { categoria: 'Lazer' })] };
  const r = conferirFatura(dados, fatura(['2026-11-10,Ebn *Tiktok,"1,69"', '2026-11-12,EBN *TIKTOK,"5,59"']), {});
  igual(r.faltam.map((f) => [f.nome, f.categoria, f.data, f.valor, f.forma]),
        [['Tiktok', 'Lazer', '2026-11-12', 5.59, C]], 'palpite');
});
teste('falta lançar: compra antes do mês vai pro dia 1º com a data de verdade na nota', () => {
  const dados = { despesas: [d('2026-11-10', 'Uber', 10)] };
  const r = conferirFatura(dados, fatura(['2026-10-28,Tim*Tim,"10,00"', '2026-11-10,Dl *Uberrides,"10,00"']), {});
  igual(r.faltam.map((f) => [f.nome, f.data, f.obs]), [['Tim', '2026-11-01', 'comprado em 28/10']], 'dia 1º');
});
teste('falta lançar: parcela nova leva o (1/4) no nome', () => {
  const r = conferirFatura({ despesas: [] }, fatura(['2026-11-14,Ebn*Playstati - Parcela 1/4,"137,49"']), {});
  igual(r.faltam[0].nome, 'Playstati (1/4)', 'nome com parcela');
});
teste('nome guardado de outros meses vale', () => {
  const guardados = { [chaveDoTitulo('Ebn *Playstati')]: { nome: 'Playstation', categoria: 'Lazer' } };
  const r = conferirFatura({ despesas: [] }, fatura(['2026-11-14,Ebn*Playstati,"65,90"']), { nomesDoBanco: guardados });
  igual([r.faltam[0].nome, r.faltam[0].categoria], ['Playstation', 'Lazer'], 'aprendido');
});
teste('diferença de centavo vira correção', () => {
  const dados = { despesas: [d('2026-11-08', 'Tiktok', 1.69)] };
  const r = conferirFatura(dados, fatura(['2026-11-08,Ebn *Tiktok,"1,68"']), {});
  igual(r.diferencas.map((x) => [x.tipo, x.item.valor, x.para]), [['valor', 1.69, 1.68]], 'valor');
});
teste('lançado em outubro, mas o banco pôs nesta fatura', () => {
  const dados = { despesas: [d('2026-10-27', 'Mercado Livre', 22.7), d('2026-11-05', 'Uber', 10)] };
  const r = conferirFatura(dados, fatura(['2026-10-27,Mercadolivre*Mercadol,"22,70"', '2026-11-05,Uber,"10,00"']), {});
  igual(r.diferencas.map((x) => [x.tipo, x.para]), [['mes', '2026-11-01']], 'passar pro dia 1º');
});
teste('IOF somado no app', () => {
  const dados = { despesas: [d('2026-11-04', 'Claude', 118.4)] };
  const r = conferirFatura(dados, fatura(['2026-11-05,Anthropic* Claude Sub,"114,40"', '2026-11-05,IOF de compra internacional,"4,00"']), {});
  igual([r.faltam.length, r.perguntas.length, r.batem], [0, 0, 2], 'explicado');
});
teste('cobrou e devolveu se anulam', () => {
  const r = conferirFatura({ despesas: [] }, fatura(['2026-11-10,Google One,"4,50"', '2026-11-11,Google One,"- 4,50"']), {});
  igual([r.faltam.length, r.perguntas.length, r.totalBanco], [0, 0, 0], 'anulou');
});
teste('devolução sem par vira pergunta; pagamento é ignorado', () => {
  const r = conferirFatura({ despesas: [d('2026-11-03', 'X', 5)] },
    fatura(['2026-11-03,X,"5,00"', '2026-11-02,Pagamento recebido,"- 1.045,22"', '2026-11-04,Estorno loja,"- 9,90"']), {});
  igual(r.perguntas.map((p) => p.tipo), ['devolucao'], 'só a devolução');
  igual(r.totalBanco, -4.9, 'pagamento fora da soma');
});
teste('aguardando que já veio no banco', () => {
  const dados = { despesas: [d('2026-11-16', 'Nio Fibra', 109.9, { status: 'Aguardando' })] };
  const r = conferirFatura(dados, fatura(['2026-11-16,Pg *Nio Fibra,"109,90"']), {});
  igual(r.aguardando.map((x) => x.descricao), ['Nio Fibra'], 'virar pendente');
});
teste('depois da última data do arquivo é "ainda não chegou"; antes, é pergunta', () => {
  const dados = { despesas: [d('2026-11-05', 'Uber', 10), d('2026-11-08', 'Sumiu', 3), d('2026-11-23', 'Spotify', 40.9)] };
  const r = conferirFatura(dados, fatura(['2026-11-05,Uber,"10,00"', '2026-11-16,Algo,"1,00"']), {});
  igual(r.perguntas.map((p) => p.item.descricao), ['Sumiu'], 'pergunta');
  igual(r.explicados[0].itens.map((x) => x.descricao), ['Spotify'], 'não chegou');
});
teste('estornado no app não entra', () => {
  const dados = { despesas: [d('2026-11-05', 'Uber', 10, { status: 'Estornado' })] };
  const r = conferirFatura(dados, fatura(['2026-11-05,Uber,"10,00"']), {});
  igual(r.faltam.length, 1, 'falta');
});
teste('o dia em que a fatura abriu sai das parcelas antigas', () => {
  const r = conferirFatura({ despesas: [] },
    fatura(['2026-10-27,Curso - Parcela 5/12,"29,30"', '2026-11-14,Ps - Parcela 1/4,"10,00"']), { diaFechamento: 28 });
  igual(r.fechamento, { abriu: '2026-10-27', dia: 27 }, 'dia 27');
  const igualzinho = conferirFatura({ despesas: [] }, fatura(['2026-10-27,Curso - Parcela 5/12,"29,30"']), { diaFechamento: 27 });
  igual(igualzinho.fechamento, null, 'já está certo');
});

console.log('\naprender');
teste('guarda nome sem a parcela e conta o que mudou', () => {
  const g = {};
  igual(aprenderNomes(g, [{ titulo: 'Ebn*Playstati - Parcela 1/4', nome: 'Playstation (1/4)', categoria: 'Lazer' }]), 1, 'um novo');
  igual(g[chaveDoTitulo('Ebn*Playstati')], { nome: 'Playstation', categoria: 'Lazer' }, 'guardado');
  igual(aprenderNomes(g, [{ titulo: 'EBN*PLAYSTATI', nome: 'Playstation', categoria: 'Lazer' }]), 0, 'igual não conta');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
