// Testes do ajuste de saldo em conta. Rode com:
//   node testes/ajusteSaldo.test.mjs
//
// Nasceram de uma queixa concreta: "às vezes coloco 0,00 e não
// contabiliza, e depois de um tempo volta para o valor que estava
// antes". Zero é o valor mais perigoso que existe num sistema assim,
// porque em JavaScript ele é "falso" — qualquer `|| ` ou `if (valor)`
// no caminho o transforma em outra coisa sem avisar.

import { juntar } from '../app/js/juntar.js';
import { calcularPainel } from '../app/js/calculos.js';

// `armazenamento.js` cria o seu objeto assim que é carregado e toca em
// `window` e `localStorage`. Fora do navegador isso quebra, então
// damos a ele o mínimo que precisa e carregamos depois.
globalThis.window = { addEventListener() {}, location: { href: '' } };
globalThis.localStorage = {
  guardado: new Map(),
  getItem(k) { return this.guardado.has(k) ? this.guardado.get(k) : null; },
  setItem(k, v) { this.guardado.set(k, String(v)); },
  removeItem(k) { this.guardado.delete(k); },
};
const { normalizar } = await import('../app/js/armazenamento.js');

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
  novo:  '2026-09-03T10:00:00.000Z',
};

const arquivo = (config, extra = {}) => ({
  config, personalizacao: { tema: 'padrao' },
  receitas: [], despesas: [], devedores: [], investimento: [],
  removidos: [], logAcesso: [], recordes: {}, ...extra
});

// Um lançamento qualquer, só para o arquivo não ser considerado vazio:
// a junção tem uma regra especial para aparelho zerado.
const comLancamento = (config) => arquivo(config, {
  despesas: [{ id: 'd-1', valor: 10, data: '2026-09-10', status: 'Pago', atualizadoEm: T.velho }],
});

console.log('\najuste de saldo em zero');

teste('zerar o ajuste sobrevive à normalização', () => {
  const d = normalizar({ config: { ajusteSaldo: 0, atualizadoEm: T.novo } });
  igual(d.config.ajusteSaldo, 0, 'o zero virou outra coisa');
});

teste('zerar o ajuste não vira o saldo inicial antigo', () => {
  // O caso que me preocupava: `ajusteSaldo` definido como 0 e um
  // `saldoInicial` velho por perto.
  const d = normalizar({ config: { ajusteSaldo: 0, saldoInicial: 5242.71, atualizadoEm: T.novo } });
  igual(d.config.ajusteSaldo, 0, 'o zero foi trocado pelo saldo inicial');
});

teste('ajuste zerado vence o valor antigo do outro aparelho', () => {
  const aqui  = comLancamento({ ajusteSaldo: 0,       atualizadoEm: T.novo });
  const outro = comLancamento({ ajusteSaldo: 5242.71, atualizadoEm: T.velho });
  const r = juntar(aqui, outro);
  igual(r.dados.config.ajusteSaldo, 0, 'o valor velho voltou por cima do zero');
});

teste('ajuste zerado vence mesmo com a ordem invertida', () => {
  const aqui  = comLancamento({ ajusteSaldo: 5242.71, atualizadoEm: T.velho });
  const outro = comLancamento({ ajusteSaldo: 0,       atualizadoEm: T.novo });
  const r = juntar(aqui, outro);
  igual(r.dados.config.ajusteSaldo, 0, 'o zero que veio de fora foi ignorado');
});

teste('ajuste zerado sobrevive a um ciclo completo', () => {
  // Grava, normaliza (como quem reabre o app) e junta com o que estava
  // no banco — que é o caminho onde o valor "voltava sozinho".
  const salvo = normalizar(comLancamento({ ajusteSaldo: 0, atualizadoEm: T.novo }));
  const texto = JSON.stringify(salvo);
  const relido = normalizar(JSON.parse(texto));
  const doBanco = comLancamento({ ajusteSaldo: 5242.71, atualizadoEm: T.velho });
  const r = juntar(relido, doBanco);
  igual(r.dados.config.ajusteSaldo, 0, 'o zero se perdeu no caminho');
});

console.log('\nquando o aparelho está zerado');

teste('aparelho sem lançamento não impõe o seu ajuste ao outro', () => {
  const vazio = arquivo({ ajusteSaldo: 0, atualizadoEm: T.novo });
  const cheio = comLancamento({ ajusteSaldo: 5242.71, atualizadoEm: T.velho });
  const r = juntar(vazio, cheio);
  igual(r.dados.config.ajusteSaldo, 5242.71, 'o aparelho vazio apagou o ajuste do outro');
});

teste('MAS um zero deliberado num aparelho com lançamentos vale', () => {
  const aqui  = comLancamento({ ajusteSaldo: 0, atualizadoEm: T.novo });
  const vazio = arquivo({ ajusteSaldo: 999, atualizadoEm: T.novo });
  const r = juntar(aqui, vazio);
  igual(r.dados.config.ajusteSaldo, 0, 'o zero deliberado foi descartado');
});

console.log('\no saldo que a tela mostra');

teste('ajuste zero dá saldo igual à diferença dos lançamentos', () => {
  const d = normalizar(comLancamento({ ajusteSaldo: 0, atualizadoEm: T.novo }));
  const p = calcularPainel(d, 2026, 9);
  igual(p.saldoConta, -10, 'saldo com ajuste zero');
});

teste('reajustar para zero produz o ajuste que zera o saldo', () => {
  const d = normalizar(comLancamento({ ajusteSaldo: 100, atualizadoEm: T.velho }));
  const antes = calcularPainel(d, 2026, 9).saldoConta;
  // É o que o app faz no confirmarReajuste: soma a diferença.
  d.config.ajusteSaldo = (Number(d.config.ajusteSaldo) || 0) + (0 - antes);
  const depois = calcularPainel(d, 2026, 9).saldoConta;
  igual(Math.abs(depois) < 0.005, true, `devia zerar, deu ${depois}`);
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
