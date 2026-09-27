// Testes do histórico de plantas. Rode com: node testes/historico.test.mjs
import { historicoDePlantas, linhaDoTempo, DIAS_ATE_MORRER,
         inicioDoCiclo, calcularSequencia } from '../app/js/planta.js';
import { readFileSync } from 'fs';
import { lerArquivoReal } from './arquivoReal.mjs';

let passou = 0, falhou = 0;
const teste = (nome, fn) => {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
};
const igual = (a, b, oque) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${oque}\n         esperado: ${y}\n         obtido:   ${x}`);
};

console.log('\nhistórico de plantas');

teste('sem acessos, sem histórico', () => {
  igual(historicoDePlantas({ logAcesso: [] }), [], 'devia vir vazio');
});

teste('um ciclo só, ainda vivo', () => {
  const h = historicoDePlantas({ logAcesso: ['2026-09-01', '2026-09-02', '2026-09-03'] });
  igual(h.length, 1, 'um ciclo');
  igual(h[0].atual, true, 'está vivo');
  igual(h[0].diasDeAcesso, 3, 'três dias');
  igual(h[0].melhorSequencia, 3, 'sequência de três');
  igual(h[0].estagio.chave, 'brotando', 'chegou a brotar');
});

teste(`ausência de ${DIAS_ATE_MORRER} dias parte o histórico em dois`, () => {
  const h = historicoDePlantas({ logAcesso: [
    '2026-07-01', '2026-07-02',
    '2026-08-01', '2026-08-02', '2026-08-03'
  ] });
  igual(h.length, 2, 'dois ciclos');
  igual(h[1].morreu, true, 'o mais antigo morreu');
  igual(h[1].inicio, '2026-07-01', 'começo do que morreu');
  igual(h[1].fim, '2026-07-02', 'fim do que morreu');
  igual(h[0].atual, true, 'o mais novo está vivo');
  igual(h[0].inicio, '2026-08-01', 'começo do atual');
});

teste('ausência curta NÃO mata a planta', () => {
  const h = historicoDePlantas({ logAcesso: ['2026-09-01', '2026-09-10'] });
  igual(h.length, 1, 'continua sendo um ciclo só');
  igual(h[0].melhorSequencia, 1, 'mas a sequência quebrou');
});

teste('melhor sequência dentro do ciclo, com buracos', () => {
  const h = historicoDePlantas({ logAcesso: [
    '2026-09-01', '2026-09-02', '2026-09-03',   // 3 seguidos
    '2026-09-06',
    '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'  // 4 seguidos
  ] });
  igual(h[0].melhorSequencia, 4, 'a maior corrida é 4');
  igual(h[0].diasDeAcesso, 8, 'oito dias de acesso');
  igual(h[0].duracao, 11, 'onze dias entre o primeiro e o último');
});

teste('vem do mais novo para o mais antigo', () => {
  const h = historicoDePlantas({ logAcesso: [
    '2026-06-01', '2026-07-01', '2026-08-01'
  ] });
  igual(h.map((c) => c.inicio), ['2026-08-01', '2026-07-01', '2026-06-01'], 'ordem invertida');
  igual(h.map((c) => c.numero), [3, 2, 1], 'numeradas na ordem de nascimento');
});

teste('estágio final reflete a melhor sequência', () => {
  const dez = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  igual(historicoDePlantas({ logAcesso: dez })[0].estagio.chave, 'florescendo', 'dez dias = florescendo');
});

console.log('\nlinha do tempo (o que o calendário desenha)');

teste('cada dia guarda a sequência daquele dia', () => {
  const t = linhaDoTempo({ logAcesso: ['2026-09-01', '2026-09-02', '2026-09-03'] });
  igual([...t.values()].map((d) => d.sequencia), [1, 2, 3], 'sequência crescendo dia a dia');
  igual(t.get('2026-09-01').estagio.chave, 'semente', 'primeiro dia é semente');
  igual(t.get('2026-09-03').estagio.chave, 'brotando', 'no terceiro já brotou');
});

teste('buraco curto zera a sequência sem matar', () => {
  const t = linhaDoTempo({ logAcesso: ['2026-09-01', '2026-09-02', '2026-09-06'] });
  igual(t.get('2026-09-06').sequencia, 1, 'recomeça do 1');
  igual(t.get('2026-09-06').ciclo, 1, 'mas é a mesma planta');
  igual(t.get('2026-09-06').recomecou, false, 'ninguém morreu');
  igual(t.get('2026-09-06').diasSemEntrar, 3, 'três dias sem entrar');
});

teste('buraco longo mata e a planta seguinte nasce', () => {
  const t = linhaDoTempo({ logAcesso: ['2026-07-01', '2026-08-01'] });
  igual(t.get('2026-08-01').ciclo, 2, 'segunda planta');
  igual(t.get('2026-08-01').recomecou, true, 'marcada como recomeço');
  igual(t.get('2026-08-01').sequencia, 1, 'do zero');
});

teste('dia sem acesso não aparece no mapa', () => {
  const t = linhaDoTempo({ logAcesso: ['2026-09-01', '2026-09-03'] });
  igual(t.has('2026-09-02'), false, 'o dia pulado não existe');
  igual(t.size, 2, 'só os dias de acesso');
});

console.log('\ncom o arquivo de verdade');

teste('o log real produz um histórico coerente', () => {
  const d = lerArquivoReal().dados;
  const h = historicoDePlantas(d);
  igual(h.length >= 1, true, 'devia ter ao menos um ciclo');
  igual(h[0].atual, true, 'o primeiro da lista é o vivo');
  const soma = h.reduce((n, c) => n + c.diasDeAcesso, 0);
  igual(soma, (d.logAcesso || []).length, 'todo dia do log tem de estar em algum ciclo');
  console.log(`         (${h.length} ciclo(s), ${soma} dias de acesso no total)`);
});

teste('a linha do tempo cobre exatamente os dias do log real', () => {
  const d = lerArquivoReal().dados;
  const t = linhaDoTempo(d);
  igual(t.size, new Set(d.logAcesso || []).size, 'um registro por dia de acesso');
  const ultimo = [...(d.logAcesso || [])].sort().pop();
  igual(Boolean(t.get(ultimo)?.estagio), true, 'o último dia tem estágio');
  console.log(`         (último dia ${ultimo}: ${t.get(ultimo).estagio.nome}, ` +
              `sequência ${t.get(ultimo).sequencia})`);
});

console.log('\no cartão e o calendário contam a mesma história');

teste('início do ciclo sai do log, não do campo guardado', () => {
  const log = ['2026-08-14', '2026-08-31', '2026-09-03', '2026-09-04', '2026-09-05'];
  igual(inicioDoCiclo(log), '2026-08-31', 'a única ausência longa é 14/08 -> 31/08');
  igual(inicioDoCiclo([]), '', 'sem log, sem ciclo');
  igual(inicioDoCiclo(['2026-09-05']), '2026-09-05', 'um dia só: o ciclo é ele');
});

teste('cicloInicio vindo de fora não encolhe a planta', () => {
  // O caso real: o celular limpo mandou cicloInicio = 05/09, mas o log
  // não tem buraco desde 03/09. O cartão dizia Semente e o calendário,
  // Brotando — os dois têm de dizer a mesma coisa.
  const d = { cicloInicio: '2026-09-05',
              logAcesso: ['2026-08-31', '2026-09-03', '2026-09-04', '2026-09-05'] };
  const cartao = calcularSequencia(d.logAcesso, inicioDoCiclo(d.logAcesso));
  const calendario = linhaDoTempo(d).get('2026-09-05').sequencia;
  igual(cartao, 3, 'o cartão devia mostrar 3 dias seguidos');
  igual(calendario, cartao, 'e o calendário, o mesmo número');
});

teste('em todo dia do log real o cartão bate com o calendário', () => {
  const d = lerArquivoReal().dados;
  const log = [...(d.logAcesso || [])].filter(Boolean).sort();
  const t = linhaDoTempo(d);
  for (let i = 0; i < log.length; i++) {
    const ate = log.slice(0, i + 1);
    const cartao = calcularSequencia(ate, inicioDoCiclo(ate));
    igual(cartao, t.get(log[i]).sequencia, `divergiram em ${log[i]}`);
  }
  console.log(`         (${log.length} dias conferidos, um a um)`);
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
