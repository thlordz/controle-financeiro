// =========================================================
// Junção de dois conjuntos de dados.
//
// É a peça que permite o mesmo arquivo viver em mais de um aparelho.
// Não fala com rede nem com disco: recebe dois objetos de dados e
// devolve um terceiro. Assim dá para testar sozinha, e ela serve
// igual para juntar com um arquivo importado ou com o banco.
//
// As regras, em ordem de importância:
//
//   1. A unidade é o LANÇAMENTO, não o arquivo. Mexer numa despesa
//      aqui e noutra ali nunca colide.
//   2. Quando o MESMO lançamento mudou dos dois lados, vence o de
//      carimbo mais novo. Sem carimbo, perde.
//   3. Apagar vence voltar: se um lado apagou depois da última
//      alteração do outro, o lançamento fica apagado.
//   4. Comprovante é do aparelho. Ele nunca viaja, e a versão que
//      chega de fora não apaga o anexo que existe aqui.
// =========================================================

import { podarRemovidos } from './dominio.js';
import { inicioDoCiclo, diasDaSequencia } from './planta.js';

const LISTAS = ['receitas', 'despesas', 'devedores', 'investimento'];

/** Carimbo em milissegundos; o que não tem carimbo é tratado como antiquíssimo. */
function quando(valor) {
  const t = Date.parse(valor || '');
  return Number.isFinite(t) ? t : 0;
}

/** Índice { id -> lançamento } de uma lista. */
function porId(lista) {
  const mapa = new Map();
  for (const item of Array.isArray(lista) ? lista : []) {
    if (item && item.id) mapa.set(item.id, item);
  }
  return mapa;
}

/** Índice { "tipo:id" -> momento } das marcas de exclusão dos dois lados. */
function indiceDeRemocoes(...conjuntos) {
  const mapa = new Map();
  for (const dados of conjuntos) {
    for (const r of Array.isArray(dados?.removidos) ? dados.removidos : []) {
      if (!r?.tipo || !r?.id) continue;
      const chave = `${r.tipo}:${r.id}`;
      mapa.set(chave, Math.max(mapa.get(chave) || 0, quando(r.em)));
    }
  }
  return mapa;
}

/** Junta as marcas de exclusão dos dois lados, guardando a mais recente de cada. */
function juntarRemocoes(a, b) {
  const mapa = new Map();
  for (const lista of [a?.removidos, b?.removidos]) {
    for (const r of Array.isArray(lista) ? lista : []) {
      if (!r?.tipo || !r?.id) continue;
      const chave = `${r.tipo}:${r.id}`;
      const atual = mapa.get(chave);
      if (!atual || quando(r.em) > quando(atual.em)) mapa.set(chave, { ...r });
    }
  }
  return [...mapa.values()];
}

/**
 * O comprovante fica no aparelho onde foi anexado. Então, ao aceitar
 * uma versão vinda de fora, o anexo local é preservado — sem isto,
 * sincronizar apagaria os comprovantes.
 */
function preservarComprovante(escolhido, local) {
  const anexoLocal = local?.comprovante;
  if (!anexoLocal) return escolhido;
  if (escolhido.comprovante) return escolhido;
  return { ...escolhido, comprovante: anexoLocal };
}

/**
 * Junta `local` com `externo` e devolve o resultado mais um resumo do
 * que mudou — útil para mostrar "3 lançamentos novos" e para os testes.
 */
export function juntar(local, externo) {
  const base = local && typeof local === 'object' ? local : {};
  const outro = externo && typeof externo === 'object' ? externo : {};

  const remocoes = indiceDeRemocoes(base, outro);
  const resumo = { adicionados: 0, atualizados: 0, apagados: 0 };

  const saida = { ...base };

  for (const tipo of LISTAS) {
    const aqui = porId(base[tipo]);
    const la = porId(outro[tipo]);
    const juntos = [];

    for (const id of new Set([...aqui.keys(), ...la.keys()])) {
      const meu = aqui.get(id);
      const dele = la.get(id);
      const escolhido = !meu ? dele
        : !dele ? meu
        : (quando(dele.atualizadoEm) > quando(meu.atualizadoEm) ? dele : meu);

      // Apagar vence voltar: a marca de exclusão só perde se o
      // lançamento foi alterado DEPOIS de ter sido apagado.
      const apagadoEm = remocoes.get(`${tipo}:${id}`) || 0;
      if (apagadoEm && apagadoEm >= quando(escolhido.atualizadoEm)) {
        if (meu) resumo.apagados++;
        continue;
      }

      if (!meu) resumo.adicionados++;
      else if (escolhido !== meu) resumo.atualizados++;

      juntos.push(preservarComprovante({ ...escolhido }, meu));
    }

    saida[tipo] = juntos;
  }

  saida.removidos = juntarRemocoes(base, outro);

  // A frequência é a união dos dias: entrar no celular e no PC no
  // mesmo dia continua sendo um dia só.
  saida.logAcesso = [...new Set([
    ...(Array.isArray(base.logAcesso) ? base.logAcesso : []),
    ...(Array.isArray(outro.logAcesso) ? outro.logAcesso : [])
  ])].sort();

  saida.recordes = {
    melhorSequencia: Math.max(base.recordes?.melhorSequencia || 0,
                              outro.recordes?.melhorSequencia || 0),
    plantasPerdidas: Math.max(base.recordes?.plantasPerdidas || 0,
                              outro.recordes?.plantasPerdidas || 0)
  };

  // O início do ciclo NÃO se negocia entre os dois lados: ele se lê do
  // log já unido. Um aparelho recém-instalado marca o ciclo como hoje,
  // e qualquer regra que deixasse esse valor vencer apagaria semanas de
  // sequência de quem já vinha de longe. Como o log é a união dos dois,
  // ele sabe mais do que qualquer um dos lados sabia sozinho.
  // Dias cobertos por escudo viajam como os dias de acesso: uma
  // união. Guardar as DATAS em vez de um contador é o que evita um
  // aparelho ressuscitar o escudo que o outro gastou.
  saida.diasProtegidos = [...new Set([
    ...(Array.isArray(base.diasProtegidos) ? base.diasProtegidos : []),
    ...(Array.isArray(outro.diasProtegidos) ? outro.diasProtegidos : [])
  ])].sort();

  // O presente da atualização é dado uma vez por conjunto de dados;
  // vale o maior, e a versão que o deu vem junto para não repetir.
  saida.escudoBonus = Math.max(Number(base.escudoBonus) || 0, Number(outro.escudoBonus) || 0);
  saida.escudoBonusVersao = base.escudoBonusVersao || outro.escudoBonusVersao || '';

  // O ciclo se lê dos dias presentes — e dia coberto é presença.
  saida.cicloInicio = inicioDoCiclo(diasDaSequencia(saida))
    || base.cicloInicio || outro.cicloInicio || '';

  // Ajuste de saldo e meta são dados; vence o carimbo mais novo.
  //
  // Com uma exceção que custou caro: um aparelho ZERADO tem config
  // vazia e sem carimbo. Se o que vem de fora também não tiver carimbo
  // — arquivo antigo, de antes da sincronia —, os dois empatam em
  // "antiquíssimo" e o empate ficava com o lado de cá, que é o vazio.
  // Resultado: os lançamentos desciam e o ajuste de saldo não, e o
  // "quanto vai sobrar" saía errado. Quem não tem lançamento nenhum
  // não tem o que defender: a config do outro lado passa na frente.
  const temLancamentos = (d) => LISTAS.some((t) => Array.isArray(d?.[t]) && d[t].length > 0);
  const baseVazia = !temLancamentos(base);
  const outroVazio = !temLancamentos(outro);

  const configMaisNova =
    baseVazia && !outroVazio ? outro.config
    : outroVazio && !baseVazia ? base.config
    : quando(outro.config?.atualizadoEm) > quando(base.config?.atualizadoEm)
      ? outro.config : base.config;
  saida.config = { ...base.config, ...configMaisNova };

  // Tema, fonte e papel de parede são de cada aparelho: não viajam.
  saida.personalizacao = base.personalizacao;

  podarRemovidos(saida);
  return { dados: saida, resumo };
}
