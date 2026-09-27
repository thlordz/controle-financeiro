// Testes da junção. Rode com:  node testes/juntar.test.mjs
//
// Esta pasta não é empacotada (o electron-builder só leva app/,
// electron/, build-assets/icone-256.png e package.json).

import { juntar } from '../app/js/juntar.js';
import { calcularSequencia } from '../app/js/planta.js';
import { readFileSync } from 'fs';
import { lerArquivoReal } from './arquivoReal.mjs';

let passou = 0, falhou = 0;
function teste(nome, fn) {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
}
function igual(a, b, oque) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${oque}\n         esperado: ${y}\n         obtido:   ${x}`);
}

const T = {
  velho: '2026-09-01T10:00:00.000Z',
  meio:  '2026-09-02T10:00:00.000Z',
  novo:  '2026-09-03T10:00:00.000Z'
};
const base = (extra = {}) => ({
  config: {}, personalizacao: { tema: 'padrao' },
  receitas: [], despesas: [], devedores: [], investimento: [],
  removidos: [], logAcesso: [], recordes: {}, ...extra
});
const ids = (r, tipo = 'despesas') => r.dados[tipo].map((x) => x.id).sort();

console.log('\njunção de lançamentos');

teste('lançamento só do outro lado entra', () => {
  const r = juntar(base(), base({ despesas: [{ id: 'd-a', valor: 10, atualizadoEm: T.novo }] }));
  igual(ids(r), ['d-a'], 'devia trazer d-a');
  igual(r.resumo.adicionados, 1, 'contagem de adicionados');
});

teste('lançamento só do meu lado permanece', () => {
  const r = juntar(base({ despesas: [{ id: 'd-a', valor: 10, atualizadoEm: T.novo }] }), base());
  igual(ids(r), ['d-a'], 'não podia sumir');
});

teste('os dois lados adicionaram coisas diferentes: fica tudo', () => {
  const r = juntar(
    base({ despesas: [{ id: 'd-pc', atualizadoEm: T.novo }] }),
    base({ despesas: [{ id: 'd-cel', atualizadoEm: T.novo }] })
  );
  igual(ids(r), ['d-cel', 'd-pc'], 'os dois têm de sobreviver');
});

teste('mesmo lançamento nos dois: vence o carimbo mais novo', () => {
  const r = juntar(
    base({ despesas: [{ id: 'd-a', valor: 10, atualizadoEm: T.velho }] }),
    base({ despesas: [{ id: 'd-a', valor: 99, atualizadoEm: T.novo }] })
  );
  igual(r.dados.despesas[0].valor, 99, 'o mais novo devia vencer');
});

teste('o meu é mais novo: o de fora não sobrescreve', () => {
  const r = juntar(
    base({ despesas: [{ id: 'd-a', valor: 10, atualizadoEm: T.novo }] }),
    base({ despesas: [{ id: 'd-a', valor: 99, atualizadoEm: T.velho }] })
  );
  igual(r.dados.despesas[0].valor, 10, 'o meu devia vencer');
});

teste('lançamento antigo sem carimbo não some', () => {
  const r = juntar(base({ despesas: [{ id: 'd537', valor: 10 }] }), base());
  igual(ids(r), ['d537'], 'dado legado tem de sobreviver');
});

console.log('\nexclusões');

teste('apagado de um lado fica apagado', () => {
  const r = juntar(
    base({ despesas: [{ id: 'd-a', atualizadoEm: T.velho }] }),
    base({ removidos: [{ tipo: 'despesas', id: 'd-a', em: T.novo }] })
  );
  igual(ids(r), [], 'devia continuar apagado');
  igual(r.resumo.apagados, 1, 'contagem de apagados');
});

teste('editado DEPOIS de apagado: volta', () => {
  const r = juntar(
    base({ despesas: [{ id: 'd-a', atualizadoEm: T.novo }] }),
    base({ removidos: [{ tipo: 'despesas', id: 'd-a', em: T.meio }] })
  );
  igual(ids(r), ['d-a'], 'a edição posterior devia trazer de volta');
});

teste('a marca de exclusão viaja para o outro lado', () => {
  const r = juntar(base({ removidos: [{ tipo: 'despesas', id: 'd-a', em: T.novo }] }), base());
  igual(r.dados.removidos.length, 1, 'a marca tem de ficar guardada');
});

teste('marca de exclusão muito antiga é podada', () => {
  const antiga = new Date(Date.now() - 400 * 86400000).toISOString();
  const r = juntar(base({ removidos: [{ tipo: 'despesas', id: 'd-x', em: antiga }] }), base());
  igual(r.dados.removidos.length, 0, 'peso morto devia sair');
});

console.log('\ncomprovantes (ficam no aparelho)');

teste('versão de fora não apaga o anexo daqui', () => {
  const r = juntar(
    base({ despesas: [{ id: 'd-a', valor: 10, atualizadoEm: T.velho,
                        comprovante: { nome: 'nota.png', dados: 'data:...' } }] }),
    base({ despesas: [{ id: 'd-a', valor: 99, atualizadoEm: T.novo }] })
  );
  igual(r.dados.despesas[0].valor, 99, 'o valor novo devia entrar');
  igual(r.dados.despesas[0].comprovante.nome, 'nota.png', 'o anexo local devia ficar');
});

console.log('\nfrequência, planta e preferências');

teste('dias de acesso são a união, sem repetir', () => {
  const r = juntar(base({ logAcesso: ['2026-09-01', '2026-09-02'] }),
                   base({ logAcesso: ['2026-09-02', '2026-09-03'] }));
  igual(r.dados.logAcesso, ['2026-09-01', '2026-09-02', '2026-09-03'], 'união ordenada');
});

teste('aparelho novo não zera a sequência de quem já vinha de longe', () => {
  // O recém-instalado marca o ciclo como hoje; o outro vem de agosto.
  const r = juntar(
    base({ cicloInicio: '2026-09-05', logAcesso: ['2026-09-05'], recordes: { plantasPerdidas: 0 } }),
    base({ cicloInicio: '2026-08-31',
           logAcesso: ['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04'],
           recordes: { plantasPerdidas: 0 } })
  );
  igual(r.dados.cicloInicio, '2026-08-31', 'devia manter o ciclo mais antigo');
  igual(r.dados.logAcesso.length, 6, 'e a união dos dias');
});

teste('planta que morreu de verdade move o ciclo para frente', () => {
  // Um lado ficou mais de duas semanas fora e voltou: a planta morreu,
  // e o log unido mostra o buraco. O ciclo tem de andar para frente.
  const r = juntar(
    base({ cicloInicio: '2026-08-01', logAcesso: ['2026-08-01', '2026-08-02'],
           recordes: { plantasPerdidas: 0 } }),
    base({ cicloInicio: '2026-09-04',
           logAcesso: ['2026-08-01', '2026-08-02', '2026-09-04'],
           recordes: { plantasPerdidas: 1 } })
  );
  igual(r.dados.cicloInicio, '2026-09-04', 'o ciclo novo devia vencer');
  igual(r.dados.recordes.plantasPerdidas, 1, 'e a perda ficar registrada');
});

teste('ciclo errado que veio na sincronia é corrigido pelo log', () => {
  // O caso real: o celular foi limpo e mandou cicloInicio = hoje. Os
  // dois lados dizem "05/09", mas o log unido não tem buraco nenhum
  // desde 03/09 — a planta está com 3 dias, não recém-plantada.
  const r = juntar(
    base({ cicloInicio: '2026-09-05',
           logAcesso: ['2026-08-31', '2026-09-03', '2026-09-04', '2026-09-05'] }),
    base({ cicloInicio: '2026-09-05', logAcesso: ['2026-09-05'] })
  );
  igual(r.dados.cicloInicio, '2026-08-31', 'o ciclo vem do log, não do campo');
  igual(calcularSequencia(r.dados.logAcesso, r.dados.cicloInicio), 3,
        'e a sequência sobrevive à sincronia');
});

teste('aparelho zerado recebe a configuração de fora', () => {
  // O caso real do Windows recém-zerado: config vazia dos dois lados
  // sem carimbo. No empate o lado de cá vencia, e o ajuste de saldo
  // não descia — os lançamentos vinham e o "quanto vai sobrar" saía
  // errado até reabrir.
  const nuvem = base({ config: { ajusteSaldo: 5242.7, metaInvestimento: 5000 },
                       despesas: [{ id: 'd-1', valor: 10, atualizadoEm: T.novo }] });
  const r = juntar(base(), nuvem);
  igual(r.dados.config.ajusteSaldo, 5242.7, 'o ajuste de saldo devia descer');
  igual(r.dados.despesas.length, 1, 'e o lançamento junto');
});

teste('quem tem lançamentos não perde a config para um aparelho vazio', () => {
  // O outro lado da mesma regra: o vazio não pode apagar o que é bom.
  const meu = base({ config: { ajusteSaldo: 900 },
                     despesas: [{ id: 'd-1', valor: 10, atualizadoEm: T.novo }] });
  const r = juntar(meu, base({ config: {} }));
  igual(r.dados.config.ajusteSaldo, 900, 'o ajuste daqui devia ficar');
});

teste('recordes ficam com o maior', () => {
  const r = juntar(base({ recordes: { melhorSequencia: 9, plantasPerdidas: 0 } }),
                   base({ recordes: { melhorSequencia: 3, plantasPerdidas: 2 } }));
  igual(r.dados.recordes, { melhorSequencia: 9, plantasPerdidas: 2 }, 'maior de cada');
});

teste('tema é de cada aparelho: não viaja', () => {
  const r = juntar(base({ personalizacao: { tema: 'masmorra' } }),
                   base({ personalizacao: { tema: 'neon' } }));
  igual(r.dados.personalizacao.tema, 'masmorra', 'o tema local devia ficar');
});

teste('ajuste de saldo mais novo vence', () => {
  const r = juntar(
    base({ config: { ajusteSaldo: 10, atualizadoEm: T.velho } }),
    base({ config: { ajusteSaldo: 55, atualizadoEm: T.novo } })
  );
  igual(r.dados.config.ajusteSaldo, 55, 'o mais novo devia vencer');
});

console.log('\npropriedades que a junção precisa ter');

teste('juntar duas vezes dá o mesmo (idempotente)', () => {
  const a = base({ despesas: [{ id: 'd-1', valor: 1, atualizadoEm: T.velho }] });
  const b = base({ despesas: [{ id: 'd-2', valor: 2, atualizadoEm: T.novo }],
                   removidos: [{ tipo: 'despesas', id: 'd-9', em: T.novo }] });
  const uma = juntar(a, b).dados;
  const duas = juntar(uma, b).dados;
  igual(ids({ dados: duas }), ids({ dados: uma }), 'a segunda junção não pode mudar nada');
});

teste('sem conflito, a ordem dos lados não importa', () => {
  const a = base({ despesas: [{ id: 'd-1', atualizadoEm: T.velho }] });
  const b = base({ despesas: [{ id: 'd-2', atualizadoEm: T.novo }] });
  igual(ids(juntar(a, b)), ids(juntar(b, a)), 'devia dar o mesmo conjunto');
});

console.log('\ncontra o arquivo de verdade');

teste('juntar o arquivo real com ele mesmo não perde nada', () => {
  const real = lerArquivoReal().dados;
  const r = juntar(real, real);
  for (const tipo of ['receitas', 'despesas', 'devedores', 'investimento']) {
    igual(r.dados[tipo].length, (real[tipo] || []).length, `${tipo} mudou de tamanho`);
  }
  igual(r.resumo, { adicionados: 0, atualizados: 0, apagados: 0 }, 'não devia mexer em nada');
});

teste('arquivo real + um lançamento novo do celular', () => {
  const real = lerArquivoReal().dados;
  const doCelular = { ...real, despesas: [...real.despesas,
    { id: 'd-celular-1', valor: 42, descricao: 'Café na rua', atualizadoEm: T.novo }] };
  const r = juntar(real, doCelular);
  igual(r.dados.despesas.length, real.despesas.length + 1, 'devia entrar exatamente um');
  igual(r.resumo.adicionados, 1, 'contagem');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
