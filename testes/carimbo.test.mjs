// Testes do carimbo monotônico. Rode com: node testes/carimbo.test.mjs
//
// O caso que motivou: um celular com o relógio atrasado. Toda edição
// nascia "velha", o banco recusava a subida e a versão antiga vencia
// na descida — o saldo voltava sozinho dias depois.
import { agora, anotarCarimbo, carimbar } from '../app/js/dominio.js';
import { comandosDeSubida } from '../app/js/sincronia.js';

let passou = 0, falhou = 0;
const teste = (nome, fn) => {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); }
};
const certo = (cond, oque) => { if (!cond) throw new Error(oque); };

const FUTURO = '2099-01-01T00:00:00.000Z';

console.log('\ncarimbo que não anda para trás');

teste('dois carimbos seguidos nunca empatam', () => {
  const a = agora(), b = agora(), c = agora();
  certo(a < b && b < c, `deviam ser crescentes: ${a}, ${b}, ${c}`);
});

teste('carimbo visto no futuro empurra os próximos', () => {
  anotarCarimbo(FUTURO);
  const depois = agora();
  certo(depois > FUTURO, `${depois} devia ser maior que ${FUTURO}`);
});

teste('uma edição depois de baixar vence o que veio do banco', () => {
  // O banco tem algo carimbado à frente do relógio deste aparelho.
  anotarCarimbo(FUTURO);
  const item = carimbar({ id: 'd-1', valor: 10 });
  certo(item.atualizadoEm > FUTURO, 'a edição local devia ser a mais nova');
});

teste('a configuração editada agora sobe mesmo com relógio atrasado', () => {
  anotarCarimbo(FUTURO);
  const dados = {
    config: { ajusteSaldo: 0, atualizadoEm: agora() },
    receitas: [], despesas: [], devedores: [], investimento: [],
    removidos: [], logAcesso: [], recordes: {}, salvoEm: agora()
  };
  // `desde` é a marca da última sincronia, já no futuro do relógio.
  const comandos = comandosDeSubida(dados, FUTURO);
  const subiuConfig = comandos.some((c) => c.args[0] === 'estado' && c.args[1] === 'config');
  certo(subiuConfig, 'a configuração devia entrar na subida');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
