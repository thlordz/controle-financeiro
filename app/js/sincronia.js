// =========================================================
// Sincronia entre aparelhos.
//
// O arquivo local continua sendo a verdade. Isto aqui é um acessório:
// se falhar, for desligado ou o serviço sumir, o app não sente nada.
//
// Como funciona, em quatro passos:
//   1. baixa do banco o que mudou desde a última visita deste aparelho
//   2. junta com o que existe aqui (juntar.js decide os empates)
//   3. sobe o que mudou aqui desde a última visita
//   4. só então guarda a nova marca de "última visita"
//
// O passo 4 é a rede de segurança: se a subida falhar, a marca não
// avança e a próxima sincronia tenta de novo. Não existe fila
// separada para corromper — a marca de tempo É a fila.
// =========================================================

import { juntar } from './juntar.js';
import { novoId, PREFIXO, agora, anotarCarimbo } from './dominio.js';

const LISTAS = ['receitas', 'despesas', 'devedores', 'investimento'];

/** Uma tabela só: acrescentar campo num lançamento não pede migração. */
const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS registros (
     tipo TEXT NOT NULL,
     id TEXT NOT NULL,
     conteudo TEXT,
     atualizado_em TEXT,
     removido INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (tipo, id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_registros_atualizado
     ON registros (atualizado_em)`
];

/** O comprovante fica no aparelho: nunca sobe. */
function semComprovante(item) {
  const { comprovante, ...resto } = item;
  return resto;
}

function quando(v) {
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? t : 0;
}

export async function garantirTabela(cliente) {
  await cliente.executar(ESQUEMA);
}

/**
 * Traz do banco tudo que mudou depois de `desde` e monta um objeto de
 * dados no mesmo formato do arquivo local.
 */
export async function baixar(cliente, desde) {
  const [r] = await cliente.executar({
    sql: `SELECT tipo, id, conteudo, atualizado_em, removido
            FROM registros WHERE atualizado_em > ? ORDER BY atualizado_em`,
    args: [desde || '']
  });

  const remoto = {
    receitas: [], despesas: [], devedores: [], investimento: [],
    removidos: [], logAcesso: [], recordes: {}, config: {}, cicloInicio: '',
    diasProtegidos: [], escudoBonus: 0, escudoBonusVersao: ''
  };
  let maisNovo = desde || '';

  for (const linha of r?.linhas || []) {
    if (linha.atualizado_em > maisNovo) maisNovo = linha.atualizado_em;
    // O carimbo do banco é o "agora" do resto do mundo: anotando, uma
    // edição feita aqui depois disto nasce mais nova que ele, mesmo
    // que o relógio deste aparelho esteja atrasado.
    anotarCarimbo(linha.atualizado_em);

    if (linha.removido) {
      remoto.removidos.push({ tipo: linha.tipo, id: linha.id, em: linha.atualizado_em });
      continue;
    }

    let conteudo = null;
    try { conteudo = JSON.parse(linha.conteudo || 'null'); } catch { conteudo = null; }
    if (!conteudo) continue;

    if (LISTAS.includes(linha.tipo)) {
      remoto[linha.tipo].push(conteudo);
    } else if (linha.tipo === 'estado' && linha.id === 'config') {
      remoto.config = conteudo;
    } else if (linha.tipo === 'estado' && linha.id === 'frequencia') {
      remoto.logAcesso = conteudo.logAcesso || [];
      remoto.recordes = conteudo.recordes || {};
      remoto.cicloInicio = conteudo.cicloInicio || '';
      remoto.diasProtegidos = conteudo.diasProtegidos || [];
      remoto.escudoBonus = conteudo.escudoBonus || 0;
      remoto.escudoBonusVersao = conteudo.escudoBonusVersao || '';
    }
  }

  return { remoto, maisNovo };
}

/** Monta as instruções de subida do que mudou aqui depois de `desde`. */
export function comandosDeSubida(dados, desde) {
  const corte = quando(desde);
  const comandos = [];
  const gravar = (tipo, id, conteudo, em, removido = 0) => comandos.push({
    sql: `INSERT INTO registros (tipo, id, conteudo, atualizado_em, removido)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (tipo, id) DO UPDATE SET
            conteudo = excluded.conteudo,
            atualizado_em = excluded.atualizado_em,
            removido = excluded.removido
          WHERE excluded.atualizado_em > registros.atualizado_em`,
    args: [tipo, id, conteudo === null ? null : JSON.stringify(conteudo), em, removido]
  });

  for (const tipo of LISTAS) {
    for (const item of dados[tipo] || []) {
      // Sem carimbo, o lançamento é antigo e nunca subiu: vai com o
      // carimbo do arquivo. Deixar de fora foi o que segurou 671
      // lançamentos na primeira sincronia de verdade.
      const em = item.atualizadoEm || dados.salvoEm || new Date().toISOString();
      if (!item.atualizadoEm || quando(em) > corte) {
        gravar(tipo, item.id, semComprovante({ ...item, atualizadoEm: em }), em);
      }
    }
  }

  for (const marca of dados.removidos || []) {
    if (quando(marca.em) > corte) gravar(marca.tipo, marca.id, null, marca.em, 1);
  }

  // O carimbo tem de ir DENTRO do conteúdo, não só na linha: quem
  // baixa compara `config.atualizadoEm`, e sem ele a configuração que
  // chega perde para a local mesmo estando certa — foi o que segurou
  // o saldo em conta no aparelho novo.
  const carimboConfig = dados.config?.atualizadoEm || dados.salvoEm;
  if (quando(carimboConfig) > corte) {
    gravar('estado', 'config', { ...(dados.config || {}), atualizadoEm: carimboConfig }, carimboConfig);
  }

  if (quando(dados.salvoEm) > corte) {
    gravar('estado', 'frequencia', {
      logAcesso: dados.logAcesso || [],
      recordes: dados.recordes || {},
      cicloInicio: dados.cicloInicio || '',
      diasProtegidos: dados.diasProtegidos || [],
      escudoBonus: dados.escudoBonus || 0,
      escudoBonusVersao: dados.escudoBonusVersao || ''
    }, dados.salvoEm);
  }

  return comandos;
}

/** Ids do formato antigo, sequencial: `d1`, `r12`, `v7`. */
const ID_LEGADO = /^[rdvi]\d+$/;

/**
 * Reetiqueta os lançamentos de id antigo deste aparelho.
 *
 * Por que isto existe: os ids eram sequenciais por lista, então o
 * celular e o PC criaram, cada um, o seu `d1`, `d2`… para gastos
 * DIFERENTES. Juntar sem tratar isso faria um apagar o outro em
 * silêncio. Na primeira sincronia de um aparelho que chega depois, os
 * ids antigos daqui viram ids únicos — eles são lançamentos novos do
 * ponto de vista do banco, que é exatamente o que são.
 *
 * As marcas de exclusão de id antigo são descartadas junto: elas
 * apontam para um id que agora pertence ao outro aparelho, e subir
 * isso apagaria um lançamento alheio.
 */
export function reetiquetarLegados(dados) {
  let trocados = 0;

  for (const tipo of LISTAS) {
    for (const item of dados[tipo] || []) {
      if (!ID_LEGADO.test(item.id || '')) continue;
      item.id = novoId(PREFIXO[tipo], dados[tipo]);
      item.atualizadoEm = item.atualizadoEm || agora();
      trocados++;
    }
  }

  const antes = (dados.removidos || []).length;
  dados.removidos = (dados.removidos || []).filter((r) => !ID_LEGADO.test(r.id || ''));

  return { dados, trocados, marcasDescartadas: antes - dados.removidos.length };
}

/**
 * Uma rodada completa. Devolve os dados já juntos, um resumo do que
 * mudou e a nova marca de última visita — que o chamador só guarda se
 * tudo deu certo.
 */
export async function sincronizar({ cliente, dados, desde = '' }) {
  await garantirTabela(cliente);

  const { remoto, maisNovo } = await baixar(cliente, desde);

  // Aparelho que chega depois, com dados próprios de id antigo: os
  // ids são reetiquetados ANTES de juntar, senão colidiriam com os do
  // aparelho que semeou o banco.
  //
  // A marca de "já entrei nesta sincronia" mora nos DADOS, não na
  // configuração do aparelho: assim, se alguém apagar a configuração e
  // reconectar, o app não reetiqueta de novo o que já está no banco —
  // o que duplicaria tudo.
  const bancoJaTemCoisa = LISTAS.some((t) => remoto[t].length > 0);
  let reetiquetagem = { trocados: 0 };
  if (!dados.sincroniaIniciada && bancoJaTemCoisa) {
    reetiquetagem = reetiquetarLegados(dados);
  }

  const { dados: juntos, resumo } = juntar(dados, remoto);

  const comandos = comandosDeSubida(juntos, desde);
  // Em blocos, para não montar um pedido gigante na primeira subida,
  // quando os 671 lançamentos vão de uma vez.
  for (let i = 0; i < comandos.length; i += 50) {
    await cliente.executar(comandos.slice(i, i + 50));
  }

  juntos.sincroniaIniciada = true;

  // A marca precisa passar também pelo que ACABAMOS de subir. Sem
  // isso, um aparelho que semeia um banco vazio continuaria achando
  // que nunca sincronizou — e na visita seguinte se trataria como
  // recém-chegado, reetiquetando os próprios lançamentos.
  let marca = maisNovo > desde ? maisNovo : desde;
  for (const c of comandos) {
    const em = c.args[3];
    if (em && em > marca) marca = em;
  }

  return {
    dados: juntos,
    resumo: { ...resumo, enviados: comandos.length, reetiquetados: reetiquetagem.trocados },
    marca
  };
}

// ---------------------------------------------------------
// Configuração, que é de CADA APARELHO
//
// Endereço, token e marca de última visita ficam fora do arquivo de
// dados de propósito: se fossem junto, viajariam para os outros
// aparelhos e o token acabaria dentro do backup. Aqui eles moram no
// armazenamento local, e por isso o mesmo APK serve para quem
// sincroniza e para quem não quer nada disso.
// ---------------------------------------------------------

const CHAVE_CONFIG = 'controle-financeiro:sincronia';

export function lerConfiguracao() {
  try {
    const bruto = localStorage.getItem(CHAVE_CONFIG);
    const c = bruto ? JSON.parse(bruto) : {};
    return { url: c.url || '', token: c.token || '', marca: c.marca || '', em: c.em || '' };
  } catch {
    return { url: '', token: '', marca: '', em: '' };
  }
}

export function gravarConfiguracao(config) {
  const atual = lerConfiguracao();
  localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ ...atual, ...config }));
}

export function limparConfiguracao() {
  localStorage.removeItem(CHAVE_CONFIG);
}

/** Ligada quando há endereço e token guardados neste aparelho. */
export function estaLigada() {
  const c = lerConfiguracao();
  return Boolean(c.url && c.token);
}
