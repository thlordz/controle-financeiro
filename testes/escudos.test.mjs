// Testes dos escudos de sequência. Rode com: node testes/escudos.test.mjs
import {
  registrarAcesso, escudosDisponiveis, escudosGanhos, diasDaSequencia,
  calcularSequencia, inicioDoCiclo, linhaDoTempo, historicoDePlantas,
  DIAS_POR_ESCUDO, MAX_ESCUDOS, DIAS_ATE_MORRER
} from '../app/js/planta.js';
import { paraISO, hoje } from '../app/js/util.js';

let passou = 0, falhou = 0;
const teste = (nome, fn) => {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
};
const igual = (a, b, oque) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${oque}\n         esperado: ${y}\n         obtido:   ${x}`);
};

/** O dia de N dias atrás, no fuso local (toISOString viraria o dia à noite). */
function dia(atras) {
  const d = hoje();
  d.setDate(d.getDate() - atras);
  return paraISO(d);
}

/** Dias seguidos, de `deAtras` até `ateAtras` dias atrás (inclusive). */
function corrida(deAtras, ateAtras) {
  const saida = [];
  for (let o = deAtras; o >= ateAtras; o--) saida.push(dia(o));
  return saida;
}

const hojeISO = dia(0);
const base = (extra = {}) => ({
  logAcesso: [], diasProtegidos: [], escudoBonus: 0,
  recordes: { melhorSequencia: 0, plantasPerdidas: 0 }, cicloInicio: '', ...extra
});

console.log('\nganhar escudo');

teste('um escudo a cada 10 dias, com teto', () => {
  igual(escudosGanhos(9), 0, '9 dias: nenhum');
  igual(escudosGanhos(10), 1, '10 dias: um');
  igual(escudosGanhos(29), 2, '29 dias: dois');
  igual(Math.min(MAX_ESCUDOS, escudosGanhos(90)), 3, 'o teto é 3');
  igual(DIAS_POR_ESCUDO, 10, 'dez dias por escudo');
});

teste('10 dias seguidos dão 1 escudo', () => {
  const d = base({ logAcesso: corrida(9, 0) });
  igual(escudosDisponiveis(d), 1, 'devia ter um escudo');
});

teste('presente da atualização entra no estoque', () => {
  const d = base({ logAcesso: corrida(2, 0), escudoBonus: 2 });
  igual(escudosDisponiveis(d), 2, 'os dois de presente');
});

teste('o estoque não passa de 3', () => {
  const d = base({ logAcesso: corrida(59, 0), escudoBonus: 2 });
  igual(escudosDisponiveis(d), MAX_ESCUDOS, 'no máximo 3');
});

console.log('\ngastar escudo');

teste('um dia perdido é coberto e a sequência continua', () => {
  // 11 dias seguidos até anteontem, ontem não entrou, e entra hoje.
  const d = base({ logAcesso: corrida(12, 2) });
  igual(escudosDisponiveis(d), 1, 'devia ter 1 escudo guardado');

  const r = registrarAcesso(d);
  igual(r.escudosQuebrados, 1, 'devia gastar um escudo');
  igual(r.streak, 13, 'a sequência devia continuar, contando o dia coberto');
  igual(d.diasProtegidos.length, 1, 'o dia perdido vira dia coberto');
  igual(r.morreu, false, 'a planta não morre');
});

teste('sem escudo, a sequência quebra como antes', () => {
  const d = base({ logAcesso: corrida(5, 2) });
  igual(escudosDisponiveis(d), 0, 'não devia ter escudo');
  const r = registrarAcesso(d);
  igual(r.escudosQuebrados, 0, 'não gastou nada');
  igual(r.streak, 0, 'a sequência quebrou');
  igual(d.diasProtegidos.length, 0, 'nada foi coberto');
});

teste('dois dias perdidos com dois escudos: cobre os dois', () => {
  const d = base({ logAcesso: corrida(24, 3) });
  igual(escudosDisponiveis(d), 2, 'devia ter 2 escudos');
  const r = registrarAcesso(d);
  igual(r.escudosQuebrados, 2, 'gasta os dois');
  igual(r.streak, 25, 'a sequência segue inteira');
});

teste('três dias perdidos com um escudo só: não cobre nada', () => {
  const d = base({ logAcesso: corrida(14, 4) });
  igual(escudosDisponiveis(d), 1, 'um escudo');
  const r = registrarAcesso(d);
  igual(r.escudosQuebrados, 0, 'escudo não cobre pela metade');
  igual(d.diasProtegidos.length, 0, 'nenhum dia coberto');
});

teste('gastou no meio, só repõe no próximo múltiplo de 10', () => {
  const d = base({ logAcesso: corrida(12, 2) });
  registrarAcesso(d);
  igual(escudosDisponiveis(d), 0, 'o de 10 foi gasto e o de 20 ainda não veio');
});

console.log('\nmorte da planta');

teste('planta morta zera os escudos', () => {
  const d = base({ logAcesso: corrida(40, 16), escudoBonus: 2 });
  const r = registrarAcesso(d);
  igual(r.morreu, true, 'a planta devia morrer');
  igual(d.diasProtegidos, [], 'os dias cobertos somem com o ciclo');
  igual(d.escudoBonus, 0, 'o presente some junto');
  igual(escudosDisponiveis(d), 0, 'bolso vazio');
});

console.log('\ncartão, calendário e histórico contam a mesma história');

teste('o dia coberto aparece marcado no calendário', () => {
  const d = base({ logAcesso: corrida(12, 2) });
  registrarAcesso(d);
  const t = linhaDoTempo(d);
  igual(t.get(dia(1))?.protegido, true, 'o dia perdido devia estar marcado');
  igual(t.get(hojeISO)?.sequencia, 13, 'e a sequência de hoje é 13');
});

teste('o dia coberto não parte o histórico em dois ciclos', () => {
  const d = base({ logAcesso: corrida(12, 2) });
  registrarAcesso(d);
  igual(historicoDePlantas(d).length, 1, 'devia continuar uma planta só');
});

teste('cartão e calendário batem em todo dia', () => {
  const d = base({ logAcesso: corrida(26, 2) });
  registrarAcesso(d);
  const todos = diasDaSequencia(d);
  const t = linhaDoTempo(d);
  for (let i = 0; i < todos.length; i++) {
    const ate = todos.slice(0, i + 1);
    igual(calcularSequencia(ate, inicioDoCiclo(ate)), t.get(todos[i]).sequencia,
          `divergiram em ${todos[i]}`);
  }
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
