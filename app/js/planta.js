// =========================================================
// Planta de frequência + sequência (streak) de acessos
// Porte fiel de Log_Modulo.bas
//
// A planta cresce conforme a sequência de dias seguidos de
// acesso e murcha conforme os dias sem entrar.
// =========================================================

import { paraData, paraISO, hoje, formatarData, diferencaEmDias } from './util.js';
import { svgDoRegador, svgDaPlanta, svgDasEstrelas, svgDoEscudo } from './plantaSvg.js';

const DIAS_MAX_GRADIENTE = 10;

/** Estágios de crescimento — Log_EstagioPlantaCrescendo(streak). */
const ESTAGIOS_CRESCENDO = [
  { ate: 1, chave: 'semente', emoji: '🌱', nome: 'Semente' },
  { ate: 4, chave: 'brotando', emoji: '🌿', nome: 'Brotando' },
  { ate: 9, chave: 'crescendo', emoji: '🪴', nome: 'Crescendo' },
  { ate: Infinity, chave: 'florescendo', emoji: '🌸', nome: 'Florescendo' }
];

/**
 * Estágios de declínio — Log_EstagioPlantaMurchando(gap), com um
 * quarto estágio que o VBA não tinha: passados 15 dias sem entrar,
 * a planta morre de vez e um novo ciclo começa do zero.
 */
const ESTAGIOS_MURCHANDO = [
  { ate: 4, chave: 'murchando', emoji: '🥀', nome: 'Murchando' },
  { ate: 9, chave: 'seca', emoji: '🍂', nome: 'Seca' },
  { ate: 14, chave: 'abandonada', emoji: '🕸️', nome: 'Abandonada' },
  { ate: Infinity, chave: 'morta', emoji: '🪦', nome: 'Morreu' }
];

/** Dias sem entrar a partir dos quais a planta não se recupera. */
export const DIAS_ATE_MORRER = 15;

export function estagioCrescendo(streak) {
  return ESTAGIOS_CRESCENDO.find((e) => streak <= e.ate);
}

export function estagioMurchando(gap) {
  return ESTAGIOS_MURCHANDO.find((e) => gap <= e.ate);
}

/** Frases de incentivo — Log_FraseIncentivo(streak). */
function frases(streak) {
  return [
    `Você entrou ontem, muito bem! Já são ${streak} dias seguidos!`,
    `Boa! ${streak} dias seguidos de acesso.`,
    `Mandou bem, ${streak} dias seguidos!`,
    `Sequência de ${streak} dias! Continue assim.`,
    `Isso aí! ${streak} dias seguidos cuidando das finanças.`,
    `Consistência é tudo — ${streak} dias seguidos!`,
    `Você está no ritmo certo: ${streak} dias seguidos.`,
    `Show de bola! ${streak} dias seguidos de organização.`,
    `Hábito formado: ${streak} dias seguidos!`,
    `Nada mal! ${streak} dias seguidos de controle financeiro.`,
    `Você tá voando, hein? ${streak} dias seguidos!`,
    `Firme e forte: ${streak} dias seguidos de acesso.`
  ];
}

/**
 * Sorteia uma frase diferente da última usada e guarda o índice
 * em dados.ultimaFraseIndice (equivalente a Log_Acesso!C1).
 */
function fraseIncentivo(dados, streak) {
  const lista = frases(streak);
  const ultimo = Number(dados.ultimaFraseIndice) || 0;
  let novo;
  do {
    novo = Math.floor(Math.random() * 12) + 1;
  } while (novo === ultimo);
  dados.ultimaFraseIndice = novo;
  return lista[novo - 1];
}

// ---------------------------------------------------------
// Escudos de sequência
//
// Um escudo cobre UM dia que a pessoa não entrou: aquele dia passa a
// contar como presença e a sequência segue. Ganha-se um a cada 10
// dias de sequência, com estoque máximo de 3.
//
// O estoque não é guardado como número. O que fica gravado são as
// DATAS cobertas (`diasProtegidos`), e o resto se calcula daí. É a
// mesma lição do início de ciclo: número solto em aparelho que
// sincroniza diverge, lista de datas se une sem conflito — e o
// cartão, o calendário e o histórico leem todos a mesma coisa.
// ---------------------------------------------------------

/** De quantos em quantos dias nasce um escudo. */
export const DIAS_POR_ESCUDO = 10;

/** Quantos escudos cabem no bolso ao mesmo tempo. */
export const MAX_ESCUDOS = 3;

/**
 * Todos os dias que contam como presença: os que a pessoa entrou
 * mais os que um escudo cobriu, sem repetição e em ordem.
 */
export function diasDaSequencia(dados) {
  const dias = [...(dados?.logAcesso || []), ...(dados?.diasProtegidos || [])].filter(Boolean);
  return [...new Set(dias)].sort();
}

/** Escudos ganhos por tempo numa sequência deste tamanho. */
export function escudosGanhos(sequencia) {
  return Math.floor((sequencia || 0) / DIAS_POR_ESCUDO);
}

/**
 * Quantos escudos a pessoa tem agora.
 *
 * Ganhos pelo tempo, mais os de presente, menos os já gastos neste
 * ciclo — o que foi gasto antes da planta morrer morreu com ela.
 */
export function escudosDisponiveis(dados) {
  const dias = diasDaSequencia(dados);
  const inicio = inicioDoCiclo(dias);
  const sequencia = calcularSequencia(dias, inicio);

  const gastos = (dados?.diasProtegidos || []).filter((d) => !inicio || d >= inicio).length;
  const total = escudosGanhos(sequencia) + (Number(dados?.escudoBonus) || 0) - gastos;
  return Math.max(0, Math.min(MAX_ESCUDOS, total));
}

/** As datas entre dois dias, sem incluir nenhum dos dois. */
function diasEntre(de, ate) {
  const saida = [];
  const d = paraData(de);
  const fim = paraData(ate);
  if (!d || !fim) return saida;
  d.setDate(d.getDate() + 1);
  while (d < fim) {
    saida.push(paraISO(d));
    d.setDate(d.getDate() + 1);
  }
  return saida;
}

/**
 * Em que dia nasceu a planta que está viva agora.
 *
 * Quem sabe isso é o próprio log: a planta atual começou no dia
 * seguinte à última ausência longa (DIAS_ATE_MORRER ou mais) — ou no
 * primeiro acesso, se nunca houve uma.
 *
 * O campo `cicloInicio` guardado nos dados é só uma cópia disto. Ele
 * não pode mandar sozinho: um aparelho recém-instalado marca o ciclo
 * como "hoje", e ao sincronizar isso apagaria semanas de sequência de
 * quem já vinha de longe. O log é o único dono da história, e é dele
 * que a tela da planta e o calendário tiram a mesma resposta.
 */
export function inicioDoCiclo(log) {
  const dias = [...(log || [])].filter(Boolean).sort();
  if (dias.length === 0) return '';

  for (let i = dias.length - 1; i > 0; i--) {
    const atual = paraData(dias[i]);
    const anterior = paraData(dias[i - 1]);
    if (!atual || !anterior) break;
    if (diferencaEmDias(atual, anterior) >= DIAS_ATE_MORRER) return dias[i];
  }
  return dias[0];
}

/**
 * Conta quantos dias seguidos (sem furo) terminam na última data
 * registrada no log. Porte de Log_CalcularSequencia().
 */
export function calcularSequencia(log, cicloInicio = null) {
  if (!log || log.length === 0) return 0;

  const limite = cicloInicio ? paraData(cicloInicio) : null;

  let streak = 1;
  let dataAtual = paraData(log[log.length - 1]);
  if (limite && dataAtual < limite) return 0;

  for (let i = log.length - 2; i >= 0; i--) {
    const dataAnterior = paraData(log[i]);
    if (!dataAnterior) break;
    // Um ciclo novo não herda os dias do anterior: a planta morreu.
    if (limite && dataAnterior < limite) break;
    if (diferencaEmDias(dataAtual, dataAnterior) === 1) {
      streak++;
      dataAtual = dataAnterior;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Rega do dia: só roda na primeira entrada de cada dia, porque quem
 * dispara é o `alterou` do registrarAcesso — ele só é verdadeiro
 * quando um dia novo entra no log. Reabrir o app no mesmo dia não
 * repete.
 *
 * A cena é curta: o regador desce pelo canto, inclina, pingam gotas,
 * a folhagem dá uma "bebida" e o contador de dias sobe até o número
 * novo.
 */
export function animarRega({ desenho, selo, de, ate, aoTerminar }) {
  const svg = desenho?.querySelector('svg');
  const paradinho = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const escreverSelo = (n) => {
    if (selo) selo.textContent = n === 1 ? '1 dia' : `${n} dias seguidos`;
  };

  if (!svg || paradinho) {
    escreverSelo(ate);
    aoTerminar?.();
    return;
  }

  svg.insertAdjacentHTML('beforeend', svgDoRegador());
  const cena = svg.querySelector('.rega');
  const folhagem = svg.querySelector('.planta__folhagem');

  requestAnimationFrame(() => cena.classList.add('rega--tocando'));

  // A folhagem só "bebe" quando as gotas chegam nela.
  const beber = setTimeout(() => folhagem?.classList.add('folhagem--bebendo'), 700);

  // O contador sobe junto com a bebida, casa em casa — mas só quando
  // há o que contar. Antes ele disparava mesmo com `de` igual a `ate`,
  // somava 1 e só então percebia que já tinha chegado: quem estava com
  // 1 dia via "2 dias seguidos" por quase dois segundos.
  let atual = de;
  escreverSelo(atual);

  let contador = null;
  if (ate > de) {
    const passos = ate - de;
    selo?.classList.add('planta__selo--contando');
    contador = setInterval(() => {
      atual = Math.min(ate, atual + 1);
      escreverSelo(atual);
      if (atual >= ate) clearInterval(contador);
    }, Math.min(420, 700 / passos));
  }

  const fim = setTimeout(() => {
    cena.remove();
    folhagem?.classList.remove('folhagem--bebendo');
    selo?.classList.remove('planta__selo--contando');
    escreverSelo(ate);
    aoTerminar?.();
  }, 2400);

  return () => { clearTimeout(beber); clearTimeout(fim); clearInterval(contador); };
}

/**
 * Troca o desenho da planta pelo do estágio novo, com um empurrãozinho
 * de escala e estrelinhas em volta.
 *
 * Entra depois da rega, de propósito: primeiro a água, depois o
 * crescimento. Sem isso a passagem de semente para broto acontecia
 * entre uma abertura e outra, sem ninguém ver.
 */
export function animarCrescimento({ desenho, rotulo, estagio, aoTerminar }) {
  const paradinho = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  desenho.innerHTML = svgDaPlanta(estagio.chave);
  if (rotulo) rotulo.textContent = `${estagio.emoji} ${estagio.nome}`;

  const svg = desenho.querySelector('svg');
  if (!svg || paradinho) { aoTerminar?.(); return; }

  svg.insertAdjacentHTML('beforeend', svgDasEstrelas());
  const folhagem = svg.querySelector('.planta__folhagem');

  requestAnimationFrame(() => {
    svg.classList.add('planta__vaso--crescendo');
    folhagem?.classList.add('folhagem--crescendo');
  });

  setTimeout(() => {
    svg.querySelector('.brilho')?.remove();
    svg.classList.remove('planta__vaso--crescendo');
    folhagem?.classList.remove('folhagem--crescendo');
    aoTerminar?.();
  }, 1800);
}

/**
 * O escudo nascendo em volta da planta.
 *
 * Roda quando a sequência completa mais dez dias e quando a
 * atualização dá escudos de presente. Reaproveita as estrelinhas do
 * crescimento — é o mesmo tipo de conquista.
 */
export function animarEscudoFormando({ desenho, aoTerminar }) {
  const svg = desenho?.querySelector('svg');
  const paradinho = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!svg || paradinho) { aoTerminar?.(); return; }

  svg.insertAdjacentHTML('beforeend', svgDoEscudo());
  svg.insertAdjacentHTML('beforeend', svgDasEstrelas());
  const escudo = svg.querySelector('.escudo');

  requestAnimationFrame(() => escudo?.classList.add('escudo--formando'));

  setTimeout(() => {
    svg.querySelector('.brilho')?.remove();
    escudo?.remove();
    aoTerminar?.();
  }, 2000);
}

/**
 * O escudo se partindo: é o que a pessoa vê ao abrir o app depois de
 * um dia que não entrou e o escudo cobriu.
 */
export function animarEscudoQuebrando({ desenho, quantos = 1, aoTerminar }) {
  const svg = desenho?.querySelector('svg');
  const paradinho = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!svg || paradinho) { aoTerminar?.(); return; }

  // Aparece inteiro e só então racha: sem isso não dá para entender
  // que existia um escudo ali.
  svg.insertAdjacentHTML('beforeend', svgDoEscudo());
  const inteiro = svg.querySelector('.escudo');

  setTimeout(() => {
    inteiro?.remove();
    svg.insertAdjacentHTML('beforeend', svgDoEscudo({ quebrando: true }));
    const cacos = svg.querySelector('.escudo--quebrando');
    requestAnimationFrame(() => cacos?.classList.add('escudo--partiu'));

    setTimeout(() => {
      cacos?.remove();
      // Mais de um dia coberto: um escudo se quebra depois do outro.
      if (quantos > 1) {
        animarEscudoQuebrando({ desenho, quantos: quantos - 1, aoTerminar });
      } else {
        aoTerminar?.();
      }
    }, 1100);
  }, 620);
}

/**
 * Reconstrói a vida de todas as plantas a partir do log de acessos.
 *
 * Não precisa de dado novo: o log guarda todos os dias em que o app
 * foi aberto, e uma ausência de DIAS_ATE_MORRER ou mais é, por
 * definição, uma planta que morreu e um ciclo que recomeçou. Assim o
 * histórico existe desde sempre, inclusive para quem já usava o app
 * antes desta tela.
 *
 * Devolve os ciclos do mais recente para o mais antigo.
 */
export function historicoDePlantas(dados) {
  const log = diasDaSequencia(dados);
  if (log.length === 0) return [];

  const ciclos = [];
  let dias = [log[0]];

  for (let i = 1; i < log.length; i++) {
    const vao = diferencaEmDias(paraData(log[i]), paraData(log[i - 1]));
    if (vao >= DIAS_ATE_MORRER) {
      ciclos.push({ dias, ausencia: vao, morreu: true });
      dias = [log[i]];
    } else {
      dias.push(log[i]);
    }
  }
  ciclos.push({ dias, ausencia: 0, morreu: false });

  return ciclos.map((c, i) => {
    // Maior sequência de dias seguidos dentro do ciclo.
    let melhor = 1;
    let corrida = 1;
    for (let j = 1; j < c.dias.length; j++) {
      const seguido = diferencaEmDias(paraData(c.dias[j]), paraData(c.dias[j - 1])) === 1;
      corrida = seguido ? corrida + 1 : 1;
      if (corrida > melhor) melhor = corrida;
    }

    const inicio = c.dias[0];
    const fim = c.dias[c.dias.length - 1];
    return {
      numero: i + 1,
      inicio,
      fim,
      atual: !c.morreu,
      morreu: c.morreu,
      ausencia: c.ausencia,
      diasDeAcesso: c.dias.length,
      duracao: diferencaEmDias(paraData(fim), paraData(inicio)) + 1,
      melhorSequencia: melhor,
      // Até onde a planta chegou a crescer neste ciclo.
      estagio: estagioCrescendo(melhor)
    };
  }).reverse();
}

/**
 * Estágio da planta em CADA dia de acesso, do primeiro ao último.
 *
 * Percorre o log uma vez aplicando as mesmas regras do app: um dia
 * emendado no anterior soma na sequência, qualquer buraco a zera, e
 * um buraco de DIAS_ATE_MORRER ou mais mata a planta e começa outra.
 *
 * Devolve um Map de "aaaa-mm-dd" para o estado daquele dia — é o que
 * o calendário usa para desenhar a plantinha certa em cada data.
 */
export function linhaDoTempo(dados) {
  const log = diasDaSequencia(dados);
  const protegidos = new Set(dados?.diasProtegidos || []);
  const mapa = new Map();

  let sequencia = 0;
  let ciclo = 1;

  for (let i = 0; i < log.length; i++) {
    const dia = log[i];
    const vao = i === 0 ? null
      : diferencaEmDias(paraData(dia), paraData(log[i - 1]));

    let morreuAntes = false;
    if (vao === null) sequencia = 1;
    else if (vao === 1) sequencia += 1;
    else if (vao >= DIAS_ATE_MORRER) { ciclo += 1; sequencia = 1; morreuAntes = true; }
    else sequencia = 1;

    mapa.set(dia, {
      sequencia,
      ciclo,
      // Dia que a pessoa não entrou e um escudo cobriu: o calendário
      // desenha um escudo no lugar da plantinha.
      protegido: protegidos.has(dia),
      estagio: estagioCrescendo(sequencia),
      // Primeiro dia depois de uma morte: é onde a planta nova nasce.
      recomecou: morreuAntes,
      diasSemEntrar: vao === null ? 0 : vao - 1
    });
  }

  return mapa;
}

/**
 * Registra o acesso de hoje e devolve o estado da planta.
 * Porte de Log_AtualizarUltimoAcesso(): quatro cenários — primeiro
 * acesso, já entrou hoje, sequência mantida e sequência quebrada.
 *
 * Muta `dados` (log e índice da frase); quem chama decide se salva.
 * Devolve { alterou, estagio, mensagem, cor, ultimaVisita, streak, gap }
 */
export function registrarAcesso(dados) {
  if (!Array.isArray(dados.logAcesso)) dados.logAcesso = [];
  if (!Array.isArray(dados.diasProtegidos)) dados.diasProtegidos = [];
  if (!dados.recordes) dados.recordes = { melhorSequencia: 0, plantasPerdidas: 0 };

  const log = dados.logAcesso;
  // Quantos escudos existiam ANTES de hoje entrar na conta: é este o
  // estoque que pode cobrir os dias perdidos, e é com ele que se
  // descobre, no fim, se um escudo novo nasceu.
  const escudosAntes = escudosDisponiveis(dados);
  let escudosQuebrados = 0;
  const hj = hoje();
  const isoHoje = paraISO(hj);

  let alterou = false;
  let mensagem = '';
  let cor = '';
  let estagio;
  let streak = 0;
  let gap = 0;
  let morreu = false;
  let dataAnteriorParaExibir = null;

  // O log manda. Se o `cicloInicio` guardado discorda dele — o caso
  // clássico é ter vindo de outro aparelho na sincronia —, ele é
  // reescrito aqui, antes de qualquer conta.
  const cicloDoLog = inicioDoCiclo(diasDaSequencia(dados));
  if (cicloDoLog && dados.cicloInicio !== cicloDoLog) dados.cicloInicio = cicloDoLog;

  // A sequência conta os dias cobertos por escudo como presença.
  const sequenciaAtual = () => calcularSequencia(diasDaSequencia(dados), dados.cicloInicio);

  /** Guarda o recorde antes de a sequência ser perdida. */
  const registrarRecorde = (valor) => {
    if (valor > (dados.recordes.melhorSequencia || 0)) {
      dados.recordes.melhorSequencia = valor;
    }
  };

  if (log.length === 0) {
    // -------- cenário 1: primeiro acesso --------
    log.push(isoHoje);
    dados.cicloInicio = isoHoje;
    alterou = true;
    streak = 1;
    mensagem = 'Bem-vindo(a)! Esse é seu primeiro acesso registrado.';
    cor = 'rgb(0, 112, 60)';
    estagio = estagioCrescendo(1);
  } else {
    const presentes = diasDaSequencia(dados);
    const ultimoPresente = presentes[presentes.length - 1];
    const dataUltimoLog = paraData(ultimoPresente);
    const distancia = diferencaEmDias(hj, dataUltimoLog);

    if (distancia === 0) {
      // -------- cenário 2: já entrou hoje (não duplica registro) --------
      streak = sequenciaAtual();
      registrarRecorde(streak);
      mensagem = 'Você já entrou hoje.';
      cor = 'rgb(0, 128, 0)';
      estagio = estagioCrescendo(streak);
      if (log.length >= 2) dataAnteriorParaExibir = paraData(log[log.length - 2]);

    } else if (distancia === 1) {
      // -------- cenário 3: sequência continua --------
      log.push(isoHoje);
      alterou = true;
      streak = sequenciaAtual();
      registrarRecorde(streak);
      mensagem = fraseIncentivo(dados, streak);
      cor = 'rgb(0, 128, 0)';
      estagio = estagioCrescendo(streak);
      dataAnteriorParaExibir = dataUltimoLog;

    } else if (distancia - 1 > 0 && distancia - 1 <= escudosAntes) {
      // -------- cenário 3b: o escudo segurou --------
      //
      // Os dias perdidos viram dias cobertos: entram em
      // `diasProtegidos` e passam a contar como presença, então a
      // sequência não é interrompida.
      const faltantes = diasEntre(ultimoPresente, isoHoje);
      dados.diasProtegidos = [...new Set([...dados.diasProtegidos, ...faltantes])].sort();
      escudosQuebrados = faltantes.length;

      log.push(isoHoje);
      alterou = true;
      streak = sequenciaAtual();
      registrarRecorde(streak);
      estagio = estagioCrescendo(streak);
      cor = 'rgb(0, 112, 60)';
      mensagem = escudosQuebrados === 1
        ? 'Um escudo se quebrou para segurar sua sequência.'
        : `${escudosQuebrados} escudos se quebraram para segurar sua sequência.`;
      dataAnteriorParaExibir = dataUltimoLog;

    } else {
      // -------- cenário 4: quebrou a sequência --------
      gap = distancia;
      registrarRecorde(sequenciaAtual());

      log.push(isoHoje);
      alterou = true;
      estagio = estagioMurchando(gap);
      morreu = estagio.chave === 'morta';

      if (morreu) {
        // A planta não volta: começa um ciclo novo, do zero. O que já
        // foi desbloqueado não é tocado — ele vem do total de dias.
        dados.recordes.plantasPerdidas = (dados.recordes.plantasPerdidas || 0) + 1;
        dados.cicloInicio = isoHoje;
        // Ciclo novo, bolso vazio: o que foi acumulado morreu junto
        // com a planta. Os desbloqueios, esses, continuam.
        dados.diasProtegidos = [];
        dados.escudoBonus = 0;
        streak = 1;
        mensagem = `A planta morreu depois de ${gap} dias sem você. ` +
                   'Uma semente nova foi plantada — suas conquistas continuam suas.';
        cor = 'rgb(160, 60, 40)';
      } else {
        mensagem = `Você está a ${gap} dias sem entrar!`;
        // Gradiente verde -> vermelho conforme os dias de ausência
        const fator = Math.min(gap / DIAS_MAX_GRADIENTE, 1);
        const g = 130 - Math.floor(130 * fator);
        cor = `rgb(200, ${g}, 0)`;
      }

      dataAnteriorParaExibir = dataUltimoLog;
    }
  }

  return {
    alterou,
    estagio,
    mensagem,
    cor,
    streak,
    gap,
    morreu,
    melhorSequencia: dados.recordes.melhorSequencia || 0,
    plantasPerdidas: dados.recordes.plantasPerdidas || 0,
    escudos: escudosDisponiveis(dados),
    escudosQuebrados,
    // Um escudo a mais do que antes só pode ter nascido agora.
    ganhouEscudo: escudosDisponiveis(dados) > escudosAntes,
    ultimaVisita: dataAnteriorParaExibir
      ? `Última visita: ${formatarData(dataAnteriorParaExibir)}`
      : ''
  };
}
