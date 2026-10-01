// Testes da sincronia, com um Turso falso em memória.
// Rode com:  node testes/sincronia.test.mjs

import { sincronizar } from '../app/js/sincronia.js';
import { normalizarEndereco, criarCliente } from '../app/js/turso.js';
import { readFileSync } from 'fs';
import { lerArquivoReal } from './arquivoReal.mjs';

let passou = 0, falhou = 0;
function teste(nome, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passou++; console.log('  ok   ' + nome); })
    .catch((e) => { falhou++; console.log('  FALHOU ' + nome + '\n         ' + e.message); });
}
function igual(a, b, oque) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${oque}\n         esperado: ${y}\n         obtido:   ${x}`);
}

/** Banco falso: guarda linhas num Map e entende só o SQL que usamos. */
function bancoFalso() {
  const linhas = new Map();               // "tipo:id" -> linha
  let falharNaEscrita = false;
  return {
    linhas,
    derrubarEscrita(v) { falharNaEscrita = v; },
    get tamanho() { return linhas.size; },
    async executar(comandos) {
      const lista = Array.isArray(comandos) ? comandos : [comandos];
      const saida = [];
      for (const c of lista) {
        const sql = typeof c === 'string' ? c : c.sql;
        const args = (typeof c === 'string' ? [] : c.args) || [];
        if (/^CREATE/i.test(sql.trim())) { continue; }
        if (/^SELECT/i.test(sql.trim())) {
          const desde = args[0] || '';
          const achadas = [...linhas.values()]
            .filter((l) => (l.atualizado_em || '') > desde)
            .sort((a, b) => String(a.atualizado_em).localeCompare(String(b.atualizado_em)));
          saida.push({ colunas: [], linhas: achadas.map((l) => ({ ...l })) });
          continue;
        }
        if (/^INSERT/i.test(sql.trim())) {
          if (falharNaEscrita) throw new Error('sem rede');
          const [tipo, id, conteudo, em, removido] = args;
          const chave = `${tipo}:${id}`;
          const atual = linhas.get(chave);
          // o ON CONFLICT só grava se o carimbo novo for maior
          if (!atual || String(em) > String(atual.atualizado_em)) {
            linhas.set(chave, { tipo, id, conteudo, atualizado_em: em, removido: Number(removido) });
          }
          saida.push({ colunas: [], linhas: [] });
          continue;
        }
        saida.push({ colunas: [], linhas: [] });
      }
      return saida;
    }
  };
}

const T = (n) => new Date(Date.UTC(2026, 8, n, 12)).toISOString();
const aparelho = (extra = {}) => ({
  config: {}, personalizacao: { tema: 'padrao' },
  receitas: [], despesas: [], devedores: [], investimento: [],
  removidos: [], logAcesso: [], recordes: {}, salvoEm: T(1), ...extra
});
const idsDe = (d) => d.despesas.map((x) => x.id).sort();

console.log('\nendereço');
await teste('libsql:// vira https://', () => {
  igual(normalizarEndereco('libsql://meu-banco.turso.io'), 'https://meu-banco.turso.io', 'conversão');
});
await teste('endereço sem protocolo ganha https', () => {
  igual(normalizarEndereco('meu-banco.turso.io/'), 'https://meu-banco.turso.io', 'normalização');
});

console.log('\ncliente HTTP');

await teste('monta o pedido no formato do Turso e lê a resposta', async () => {
  let visto = null;
  const cliente = criarCliente({
    url: 'libsql://b.turso.io', token: 'tk',
    enviar: async (endereco, token, corpo) => {
      visto = { endereco, token, corpo };
      return { ok: true, status: 200, texto: JSON.stringify({ results: [{
        type: 'ok',
        response: { type: 'execute', result: {
          cols: [{ name: 'id' }, { name: 'n' }],
          rows: [[{ type: 'text', value: 'd-1' }, { type: 'integer', value: '7' }]]
        } }
      }] }) };
    }
  });

  const [r] = await cliente.executar({ sql: 'SELECT * FROM x WHERE a > ?', args: ['zz'] });
  igual(visto.endereco, 'https://b.turso.io/v2/pipeline', 'endereço montado');
  igual(visto.token, 'tk', 'token repassado');
  igual(visto.corpo.requests.at(-1).type, 'close', 'a última instrução é o close');
  igual(visto.corpo.requests[0].stmt.args, [{ type: 'text', value: 'zz' }], 'argumento tipado');
  igual(r.linhas, [{ id: 'd-1', n: 7 }], 'linha convertida para objeto');
});

await teste('resposta de erro vira exceção legível', async () => {
  const cliente = criarCliente({ url: 'b.turso.io', token: 'tk',
    enviar: async () => ({ ok: false, status: 401, texto: 'token inválido' }) });
  let msg = '';
  try { await cliente.executar('SELECT 1'); } catch (e) { msg = e.message; }
  igual(msg.includes('401') && msg.includes('token inválido'), true, 'devia dizer o que houve');
});

await teste('sem endereço ou token não cria cliente', () => {
  igual(criarCliente({ url: '', token: 'tk' }), null, 'sem endereço');
  igual(criarCliente({ url: 'b.turso.io', token: '' }), null, 'sem token');
});

console.log('\ndois aparelhos');

await teste('primeira subida leva tudo; o outro aparelho baixa igual', async () => {
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [
    { id: 'd-1', valor: 10, atualizadoEm: T(2) },
    { id: 'd-2', valor: 20, atualizadoEm: T(2) }
  ] });
  const a = await sincronizar({ cliente: banco, dados: pc, desde: '' });
  igual(a.resumo.enviados > 0, true, 'devia ter subido algo');

  const celular = aparelho();
  const b = await sincronizar({ cliente: banco, dados: celular, desde: '' });
  igual(idsDe(b.dados), ['d-1', 'd-2'], 'o celular devia receber os dois');
});

await teste('lançamento criado no celular chega no PC', async () => {
  const banco = bancoFalso();
  let pc = aparelho({ despesas: [{ id: 'd-1', valor: 10, atualizadoEm: T(2) }] });
  let marcaPc = (await sincronizar({ cliente: banco, dados: pc, desde: '' })).marca;

  let celular = (await sincronizar({ cliente: banco, dados: aparelho(), desde: '' })).dados;
  celular.despesas.push({ id: 'd-cel', valor: 42, atualizadoEm: T(3) });
  celular.salvoEm = T(3);
  await sincronizar({ cliente: banco, dados: celular, desde: T(2) });

  const r = await sincronizar({ cliente: banco, dados: pc, desde: marcaPc });
  igual(idsDe(r.dados), ['d-1', 'd-cel'], 'o PC devia receber o do celular');
});

await teste('edição no PC alcança o celular', async () => {
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [{ id: 'd-1', valor: 10, atualizadoEm: T(2) }] });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });
  const celular = (await sincronizar({ cliente: banco, dados: aparelho(), desde: '' })).dados;

  pc.despesas[0] = { id: 'd-1', valor: 999, atualizadoEm: T(4) };
  pc.salvoEm = T(4);
  await sincronizar({ cliente: banco, dados: pc, desde: T(2) });

  const r = await sincronizar({ cliente: banco, dados: celular, desde: T(2) });
  igual(r.dados.despesas[0].valor, 999, 'o celular devia ver o valor novo');
});

await teste('exclusão viaja e não ressuscita', async () => {
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [{ id: 'd-1', atualizadoEm: T(2) }] });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });
  const celular = (await sincronizar({ cliente: banco, dados: aparelho(), desde: '' })).dados;

  pc.despesas = [];
  pc.removidos = [{ tipo: 'despesas', id: 'd-1', em: T(5) }];
  pc.salvoEm = T(5);
  await sincronizar({ cliente: banco, dados: pc, desde: T(2) });

  const r = await sincronizar({ cliente: banco, dados: celular, desde: T(2) });
  igual(idsDe(r.dados), [], 'o celular devia apagar também');

  const r2 = await sincronizar({ cliente: banco, dados: r.dados, desde: r.marca });
  igual(idsDe(r2.dados), [], 'e não pode voltar na rodada seguinte');
});

await teste('os dois criam coisas diferentes offline: nada se perde', async () => {
  const banco = bancoFalso();
  const inicial = aparelho({ despesas: [{ id: 'd-0', atualizadoEm: T(2) }] });
  await sincronizar({ cliente: banco, dados: inicial, desde: '' });

  const pc = JSON.parse(JSON.stringify(inicial));
  const celular = JSON.parse(JSON.stringify(inicial));
  pc.despesas.push({ id: 'd-pc', atualizadoEm: T(6) }); pc.salvoEm = T(6);
  celular.despesas.push({ id: 'd-cel', atualizadoEm: T(6) }); celular.salvoEm = T(6);

  await sincronizar({ cliente: banco, dados: pc, desde: T(2) });
  const r = await sincronizar({ cliente: banco, dados: celular, desde: T(2) });
  igual(idsDe(r.dados), ['d-0', 'd-cel', 'd-pc'], 'os três têm de estar lá');
});

await teste('saldo em conta viaja para o outro aparelho', async () => {
  const banco = bancoFalso();
  // PC com ajuste de saldo, do jeito que o arquivo antigo fica depois
  // da migração: config carimbada.
  const pc = aparelho({
    config: { ajusteSaldo: 1234.56, metaInvestimento: 5000, atualizadoEm: T(2) },
    salvoEm: T(2)
  });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });

  const celular = await sincronizar({ cliente: banco, dados: aparelho(), desde: '' });
  igual(celular.dados.config.ajusteSaldo, 1234.56, 'o ajuste de saldo tinha de chegar');
  igual(celular.dados.config.metaInvestimento, 5000, 'a meta também');
});

await teste('config sem carimbo no conteúdo não perde para a local vazia', async () => {
  const banco = bancoFalso();
  // sobe usando só o salvoEm, como acontecia antes da migração
  const pc = aparelho({ config: { ajusteSaldo: 99 }, salvoEm: T(2) });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });

  const linha = [...banco.linhas.values()].find((l) => l.id === 'config');
  igual(JSON.parse(linha.conteudo).atualizadoEm, T(2), 'o carimbo tem de ir DENTRO do conteúdo');

  const celular = await sincronizar({ cliente: banco, dados: aparelho(), desde: '' });
  igual(celular.dados.config.ajusteSaldo, 99, 'e o saldo tem de vencer a config local vazia');
});

await teste('aparelho novo recebe o saldo em vez de sobrepor com o vazio', async () => {
  const banco = bancoFalso();
  const pc = aparelho({
    despesas: [{ id: 'd1', valor: 10, atualizadoEm: T(2) }],
    config: { ajusteSaldo: 5242.71, atualizadoEm: T(2) }, salvoEm: T(2)
  });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });

  // aparelho recém-instalado: sem lançamentos, logo SEM carimbo na
  // config (é o que o normalizar faz agora). Se carimbasse com agora,
  // o vazio venceria.
  const novo = aparelho({ config: {}, salvoEm: new Date().toISOString() });
  const r = await sincronizar({ cliente: banco, dados: novo, desde: '' });
  igual(r.dados.config.ajusteSaldo, 5242.71, 'o saldo tinha de chegar no aparelho novo');
});

console.log('\ncomprovantes e falhas de rede');

await teste('comprovante não sobe e não é apagado ao voltar', async () => {
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [{
    id: 'd-1', valor: 10, atualizadoEm: T(2),
    comprovante: { nome: 'nota.png', dados: 'data:image/png;base64,AAA' }
  }] });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });

  const linha = [...banco.linhas.values()].find((l) => l.id === 'd-1');
  igual(JSON.parse(linha.conteudo).comprovante, undefined, 'o anexo não podia subir');

  const r = await sincronizar({ cliente: banco, dados: pc, desde: '' });
  igual(r.dados.despesas[0].comprovante.nome, 'nota.png', 'o anexo local devia continuar');
});

await teste('se a subida falhar, a marca não avança e a próxima tenta de novo', async () => {
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [{ id: 'd-1', atualizadoEm: T(2) }] });

  banco.derrubarEscrita(true);
  let erro = null;
  try { await sincronizar({ cliente: banco, dados: pc, desde: '' }); }
  catch (e) { erro = e.message; }
  igual(erro, 'sem rede', 'devia ter estourado');
  igual(banco.tamanho, 0, 'nada podia ter entrado no banco');

  banco.derrubarEscrita(false);
  const r = await sincronizar({ cliente: banco, dados: pc, desde: '' });
  igual(banco.tamanho > 0, true, 'na segunda tentativa devia subir');
  igual(idsDe(r.dados), ['d-1'], 'e o dado continua aqui');
});

console.log('\ncom o arquivo de verdade');

await teste('lançamento SEM carimbo sobe (era o que segurava os antigos)', async () => {
  const banco = bancoFalso();
  const pc = aparelho({
    despesas: [{ id: 'd1', valor: 10, descricao: 'Antigo, sem carimbo' }],  // sem atualizadoEm
    salvoEm: T(2)
  });
  const r = await sincronizar({ cliente: banco, dados: pc, desde: '' });
  const subiu = [...banco.linhas.values()].some((l) => l.tipo === 'despesas' && l.id === 'd1');
  igual(subiu, true, 'o lançamento sem carimbo tinha de subir');

  const outro = await sincronizar({ cliente: banco, dados: aparelho(), desde: '' });
  igual(outro.dados.despesas.length, 1, 'e chegar no outro aparelho');
});

await teste('os lançamentos do arquivo real sobem exatamente como estão', async () => {
  const banco = bancoFalso();
  const real = lerArquivoReal().dados;
  // Tira os carimbos de propósito: reproduz o arquivo como ele era
  // ANTES da migração, que é o estado em que a subida falhava.
  for (const tipo of ['receitas', 'despesas', 'devedores', 'investimento']) {
    for (const item of real[tipo] || []) delete item.atualizadoEm;
  }
  real.salvoEm = T(2); real.removidos = [];
  const quantos = ['receitas', 'despesas', 'devedores']
    .reduce((n, t) => n + (real[t] || []).length, 0);

  const subida = await sincronizar({ cliente: banco, dados: real, desde: '' });
  igual(subida.resumo.enviados >= quantos, true,
        `deviam ter subido pelo menos ${quantos} lançamentos, foram ${subida.resumo.enviados}`);

  const novo = await sincronizar({ cliente: banco, dados: aparelho(), desde: '' });
  for (const tipo of ['receitas', 'despesas', 'devedores']) {
    igual(novo.dados[tipo].length, real[tipo].length, `${tipo} deviam vir todos`);
  }
  igual(novo.dados.despesas.length > 0, true, 'devia ter descido alguma despesa');
  console.log(`         (${quantos} lançamentos, ${novo.dados.despesas.length} despesas)`);
});

await teste('aparelho que JÁ sincronizou ainda sobe os lançamentos antigos', async () => {
  // Situação real: a primeira sincronia levou só config e frequência,
  // então a marca já está adiantada em relação ao arquivo.
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [{ id: 'd1', valor: 10 }], salvoEm: T(2) });

  const primeira = await sincronizar({ cliente: banco, dados: pc, desde: '' });
  const marcaAdiantada = primeira.marca;

  // agora o app migra: carimba o antigo com AGORA (é o que normalizar faz)
  const migrado = JSON.parse(JSON.stringify(primeira.dados));
  for (const item of migrado.despesas) item.atualizadoEm = new Date().toISOString();

  const segunda = await sincronizar({ cliente: banco, dados: migrado, desde: marcaAdiantada });
  const subiu = [...banco.linhas.values()].some((l) => l.tipo === 'despesas' && l.id === 'd1');
  igual(subiu, true, 'o antigo tinha de subir mesmo com a marca adiantada');

  const outro = await sincronizar({ cliente: banco, dados: aparelho(), desde: '' });
  igual(outro.dados.despesas.length, 1, 'e chegar no outro aparelho');
});

console.log('\nids antigos colidindo (o caso perigoso)');

await teste('celular com d1/d2 próprios não apaga os d1/d2 do PC', async () => {
  const banco = bancoFalso();
  // o PC semeia o banco com ids antigos
  const pc = aparelho({ despesas: [
    { id: 'd1', valor: 100, descricao: 'Aluguel do PC', atualizadoEm: T(2) },
    { id: 'd2', valor: 200, descricao: 'Luz do PC', atualizadoEm: T(2) }
  ] });
  const s1 = await sincronizar({ cliente: banco, dados: pc, desde: '' });
  igual(s1.resumo.reetiquetados, 0, 'o primeiro aparelho não reetiqueta nada');

  // o celular chega depois, com d1/d2 DIFERENTES
  const celular = aparelho({ despesas: [
    { id: 'd1', valor: 7, descricao: 'Café do celular', atualizadoEm: T(3) },
    { id: 'd2', valor: 9, descricao: 'Ônibus do celular', atualizadoEm: T(3) }
  ] });
  const s2 = await sincronizar({ cliente: banco, dados: celular, desde: '' });

  igual(s2.resumo.reetiquetados, 2, 'os dois do celular deviam ser reetiquetados');
  igual(s2.dados.despesas.length, 4, 'os quatro lançamentos têm de coexistir');
  const descricoes = s2.dados.despesas.map((d) => d.descricao).sort();
  igual(descricoes, ['Aluguel do PC', 'Café do celular', 'Luz do PC', 'Ônibus do celular'],
        'nenhum podia sumir');

  // e o PC recebe os do celular sem perder os dele
  const s3 = await sincronizar({ cliente: banco, dados: pc, desde: s1.marca });
  igual(s3.dados.despesas.length, 4, 'o PC também fica com os quatro');
});

await teste('marca de exclusão de id antigo não apaga lançamento alheio', async () => {
  const banco = bancoFalso();
  const pc = aparelho({ despesas: [{ id: 'd5', descricao: 'Importante', atualizadoEm: T(2) }] });
  const s1 = await sincronizar({ cliente: banco, dados: pc, desde: '' });

  // o celular apagou o SEU d5, que é outra coisa
  const celular = aparelho({
    despesas: [{ id: 'd9', atualizadoEm: T(3) }],
    removidos: [{ tipo: 'despesas', id: 'd5', em: T(3) }]
  });
  await sincronizar({ cliente: banco, dados: celular, desde: '' });

  const s3 = await sincronizar({ cliente: banco, dados: pc, desde: s1.marca });
  igual(s3.dados.despesas.some((d) => d.descricao === 'Importante'), true,
        'o lançamento do PC não podia ser apagado pela marca do celular');
});

await teste('aparelho já reetiquetado não reetiqueta de novo', async () => {
  const banco = bancoFalso();
  // Os dois `d1` precisam ser gastos DIFERENTES: é essa diferença que
  // diz ao app que os ids antigos vêm de mundos separados. Dois `d1`
  // idênticos são, por definição, o mesmo lançamento.
  await sincronizar({ cliente: banco, dados: aparelho({
    despesas: [{ id: 'd1', valor: 100, descricao: 'Aluguel', atualizadoEm: T(2) }] }), desde: '' });
  const celular = aparelho({
    despesas: [{ id: 'd1', valor: 7, descricao: 'Café', atualizadoEm: T(3) }] });
  const a = await sincronizar({ cliente: banco, dados: celular, desde: '' });
  igual(a.resumo.reetiquetados, 1, 'primeira vez reetiqueta');
  const b = await sincronizar({ cliente: banco, dados: a.dados, desde: a.marca });
  igual(b.resumo.reetiquetados, 0, 'segunda vez não mexe mais');
});

await teste('dois aparelhos do MESMO arquivo não duplicam a vida inteira', async () => {
  const banco = bancoFalso();
  // O caso real: a planilha foi importada no PC e o mesmo backup foi
  // levado para o celular. Os dois têm d1/d2/d3 para os MESMOS gastos.
  const mesmos = () => [
    { id: 'd1', data: '2026-01-05', valor: 100, descricao: 'Aluguel', atualizadoEm: T(2) },
    { id: 'd2', data: '2026-01-10', valor: 80,  descricao: 'Luz',     atualizadoEm: T(2) },
    { id: 'd3', data: '2026-01-12', valor: 60,  descricao: 'Água',    atualizadoEm: T(2) }
  ];
  const pc = aparelho({ despesas: mesmos() });
  await sincronizar({ cliente: banco, dados: pc, desde: '' });

  const celular = aparelho({ despesas: mesmos() });
  const s2 = await sincronizar({ cliente: banco, dados: celular, desde: '' });

  igual(s2.resumo.reetiquetados, 0, 'nada podia ser reetiquetado');
  igual(s2.dados.despesas.length, 3, 'continuam três, não seis');
});

await teste('mesmo arquivo com uma edição de um lado ainda é o mesmo mundo', async () => {
  const banco = bancoFalso();
  const base = (extra = {}) => [
    { id: 'd1', data: '2026-01-05', valor: 100, descricao: 'Aluguel', atualizadoEm: T(2) },
    { id: 'd2', data: '2026-01-10', valor: 80,  descricao: 'Luz',     atualizadoEm: T(2) },
    { id: 'd3', data: '2026-01-12', valor: 60,  descricao: 'Água',    atualizadoEm: T(2) },
    { id: 'd4', data: '2026-01-20', valor: 40,  descricao: 'Gás',     atualizadoEm: T(2), ...extra }
  ];
  await sincronizar({ cliente: banco, dados: aparelho({ despesas: base() }), desde: '' });

  // no celular o gás foi corrigido para 45: um de quatro difere
  const celular = aparelho({ despesas: base({ valor: 45, atualizadoEm: T(4) }) });
  const s2 = await sincronizar({ cliente: banco, dados: celular, desde: '' });

  igual(s2.resumo.reetiquetados, 0, 'uma edição não vira mundo novo');
  igual(s2.dados.despesas.length, 4, 'continuam quatro');
  igual(s2.dados.despesas.find((d) => d.id === 'd4').valor, 45, 'e a correção vence');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
