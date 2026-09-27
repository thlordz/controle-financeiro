// =========================================================
// Tela de recompensas: mostra o progresso por frequência e
// deixa escolher o que já foi desbloqueado.
// =========================================================

import {
  TEMAS, CORES, FONTES, FUNDOS, MARCOS,
  progresso, liberado, aplicar
} from './recompensas.js';
import { moeda } from './util.js';
import { svgDoEscudoMini } from './plantaSvg.js';
import { calcularSequencia, historicoDePlantas, linhaDoTempo, inicioDoCiclo,
         diasDaSequencia, escudosDisponiveis, escudosGanhos,
         DIAS_POR_ESCUDO, MAX_ESCUDOS } from './planta.js';

const $ = (id) => document.getElementById(id);

let ctx = null; // { dados, aoMudarPersonalizacao }

export function configurar(contexto) {
  ctx = contexto;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

const trava = (faltam) =>
  `<div class="item__trava">🔒 faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}</div>`;

/** Duas faixas de cor para dar uma prévia do tema. */
function amostraTema(tema) {
  const p = tema.claro || { fundo: '#eef1f5', acento: '#12805c', cartao: '#ffffff' };
  const e = tema.escuro || { fundo: '#0f141b', acento: '#3ddc9a', cartao: '#182029' };
  return `<div class="item__amostra">
    <span style="background:${p.fundo}"></span>
    <span style="background:${p.acento}"></span>
    <span style="background:${e.fundo}"></span>
    <span style="background:${e.acento}"></span>
  </div>`;
}

function cartaoTema(tema, dias, atual) {
  const ok = liberado(tema, dias);
  const classes = ['item', ok ? '' : 'item--bloqueado', atual === tema.id ? 'item--ativo' : ''].join(' ');
  return `<button type="button" class="${classes}" data-grupo="tema" data-id="${tema.id}" ${ok ? '' : 'disabled'}>
    ${amostraTema(tema)}
    <div class="item__nome">${esc(tema.nome)}</div>
    <div class="item__resumo">${esc(tema.resumo)}</div>
    ${ok ? '' : trava(tema.dias - dias)}
  </button>`;
}

function cartaoCor(cor, dias, atual) {
  const ok = liberado(cor, dias);
  const classes = ['item', ok ? '' : 'item--bloqueado', atual === cor.id ? 'item--ativo' : ''].join(' ');
  const bolinha = cor.claro
    ? `<div class="bolinha" style="background:linear-gradient(135deg,${cor.claro} 50%,${cor.escuro} 50%)"></div>`
    : '<div class="bolinha" style="background:var(--verde)"></div>';
  return `<button type="button" class="${classes}" data-grupo="cor" data-id="${cor.id}" ${ok ? '' : 'disabled'}>
    ${bolinha}
    <div class="item__nome">${esc(cor.nome)}</div>
    ${ok ? '' : trava(cor.dias - dias)}
  </button>`;
}

function cartaoFonte(fonte, dias, atual) {
  const ok = liberado(fonte, dias);
  const classes = ['item', ok ? '' : 'item--bloqueado', atual === fonte.id ? 'item--ativo' : ''].join(' ');
  return `<button type="button" class="${classes}" data-grupo="fonte" data-id="${fonte.id}" ${ok ? '' : 'disabled'}>
    <div class="item__previa" style="font-family:${fonte.titulo}">Ag 1.234</div>
    <div class="item__nome">${esc(fonte.nome)}</div>
    ${ok ? '' : trava(fonte.dias - dias)}
  </button>`;
}

function cartaoFundo(fundo, dias, atual) {
  const ok = liberado(fundo, dias);
  const classes = ['item', ok ? '' : 'item--bloqueado', atual === fundo.id ? 'item--ativo' : ''].join(' ');
  return `<button type="button" class="${classes}" data-grupo="fundo" data-id="${fundo.id}" ${ok ? '' : 'disabled'}>
    <div class="item__nome">${esc(fundo.nome)}</div>
    ${ok ? '' : trava(fundo.dias - dias)}
  </button>`;
}

/** Redesenha a tela inteira a partir do estado atual. */
const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const INICIAIS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Mês que o calendário está mostrando; começa no mês de hoje. */
let mesAberto = null;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` +
  `-${String(d.getDate()).padStart(2, '0')}`;

/** Uma casinha do calendário. */
function celulaDeDia(data, tempo, hojeIso, dentroDoMes = true) {
  const chave = iso(data);
  const info = tempo.get(chave);
  const classes = ['dia'];
  if (!dentroDoMes) classes.push('dia--fora');
  if (chave === hojeIso) classes.push('dia--hoje');
  if (info) classes.push('dia--acesso');
  if (info?.recomecou) classes.push('dia--renasceu');

  const titulo = info
    ? `${chave} · ${info.estagio.nome} · ${info.sequencia} ${info.sequencia === 1 ? 'dia' : 'dias'} seguidos` +
      (info.recomecou ? ` · planta nova depois de ${info.diasSemEntrar} dias sem entrar` : '')
    : `${chave} · sem acesso`;

  return `<div class="${classes.join(' ')}" title="${titulo}">
    <span class="dia__numero">${data.getDate()}</span>
    <span class="dia__planta">${info ? (info.protegido ? '🛡️' : info.recomecou ? '🌱' : info.estagio.emoji) : ''}</span>
  </div>`;
}

/** Fita dos últimos sete dias — o resumo rápido antes do mês inteiro. */
function renderizarSemana(tempo, hoje, hojeIso) {
  const alvo = $('plantaSemana');
  if (!alvo) return;

  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const info = tempo.get(iso(d));
    dias.push(`<div class="semana__dia ${info ? 'semana__dia--acesso' : ''} ${iso(d) === hojeIso ? 'semana__dia--hoje' : ''}"
      title="${iso(d)}${info ? ` · ${info.estagio.nome}` : ' · sem acesso'}">
      <span class="semana__inicial">${INICIAIS_SEMANA[d.getDay()]}</span>
      <span class="semana__planta">${info ? (info.protegido ? '🛡️' : info.estagio.emoji) : '·'}</span>
      <span class="semana__numero">${d.getDate()}</span>
    </div>`);
  }
  alvo.innerHTML = `<div class="semana__titulo">Últimos 7 dias</div>
    <div class="semana__fita">${dias.join('')}</div>`;
}

/** Grade do mês, com a plantinha de cada dia. */
function renderizarCalendario(dados) {
  const alvo = $('plantaCalendario');
  if (!alvo) return;

  const tempo = linhaDoTempo(dados);
  const agora = new Date();
  const hojeIso = iso(agora);
  if (!mesAberto) mesAberto = { ano: agora.getFullYear(), mes: agora.getMonth() };

  renderizarSemana(tempo, agora, hojeIso);

  const { ano, mes } = mesAberto;
  const primeiro = new Date(ano, mes, 1);
  const inicioDaGrade = new Date(primeiro);
  inicioDaGrade.setDate(1 - primeiro.getDay());   // volta até o domingo

  const casas = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioDaGrade);
    d.setDate(inicioDaGrade.getDate() + i);
    casas.push(celulaDeDia(d, tempo, hojeIso, d.getMonth() === mes));
  }

  // Quantos dias daquele mês tiveram acesso, para o rodapé.
  const noMes = [...tempo.keys()].filter((k) => {
    const [a, m] = k.split('-').map(Number);
    return a === ano && m === mes + 1;
  }).length;

  alvo.innerHTML = `
    <div class="calendario__topo">
      <button type="button" class="calendario__seta" data-mes-planta="-1" aria-label="Mês anterior">‹</button>
      <span class="calendario__nome">${NOMES_MES[mes]} de ${ano}</span>
      <button type="button" class="calendario__seta" data-mes-planta="1" aria-label="Próximo mês">›</button>
    </div>
    <div class="calendario__semana">${INICIAIS_SEMANA.map((i) => `<span>${i}</span>`).join('')}</div>
    <div class="calendario__grade">${casas.join('')}</div>
    <div class="calendario__rodape">${noMes === 0 ? 'Nenhum acesso neste mês.'
      : `${noMes} ${noMes === 1 ? 'dia de acesso' : 'dias de acesso'} neste mês.`}</div>`;
}

/** dd/mm de uma data ISO, para as linhas do histórico. */
function diaCurto(iso) {
  const [ano, mes, dia] = String(iso || '').split('-');
  return dia ? `${dia}/${mes}` : '—';
}

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

/**
 * Uma linha por planta, da mais nova para a mais velha. Tudo sai do
 * log de acessos, então quem já usava o app antes desta tela também
 * vê a história inteira.
 */
function renderizarHistorico(dados) {
  const ciclos = historicoDePlantas(dados);
  const alvo = $('historicoPlantas');
  if (!alvo) return;

  if (ciclos.length === 0) {
    alvo.innerHTML = `<p class="campo__dica" style="margin:0">
      Sua primeira planta começa no primeiro acesso registrado.</p>`;
    return;
  }

  alvo.innerHTML = ciclos.map((c) => {
    const periodo = c.atual
      ? `desde ${diaCurto(c.inicio)}`
      : `${diaCurto(c.inicio)} a ${diaCurto(c.fim)}`;

    const desfecho = c.atual
      ? '<span class="historico__viva">viva</span>'
      : `<span class="historico__morta">morreu depois de ${plural(c.ausencia, 'dia', 'dias')} sem entrar</span>`;

    return `<div class="historico__linha ${c.atual ? 'historico__linha--atual' : ''}">
      <span class="historico__emoji" aria-hidden="true">${c.atual ? c.estagio.emoji : '🪦'}</span>
      <div class="historico__texto">
        <div class="historico__titulo">
          Planta ${c.numero}${c.atual ? ' · atual' : ''} <span class="historico__periodo">${periodo}</span>
        </div>
        <div class="historico__detalhe">
          ${plural(c.diasDeAcesso, 'dia de acesso', 'dias de acesso')} ·
          melhor sequência de ${plural(c.melhorSequencia, 'dia', 'dias')} ·
          chegou a ${esc(c.estagio.nome)} · ${desfecho}
        </div>
      </div>
    </div>`;
  }).join('');
}

/**
 * O quadro dos escudos: quantos estão no bolso, quantos cabem, e
 * quanto falta para o próximo.
 */
function renderizarEscudos(dados, streak) {
  const tem = escudosDisponiveis(dados);

  $('escudosSelos').innerHTML = Array.from({ length: MAX_ESCUDOS }, (_, i) =>
    `<span class="escudo-selo${i < tem ? '' : ' escudo-selo--vazio'}">${svgDoEscudoMini()}</span>`
  ).join('');

  $('escudosEstado').textContent = tem === 0
    ? 'Nenhum escudo guardado'
    : `${tem} de ${MAX_ESCUDOS} ${tem === 1 ? 'escudo guardado' : 'escudos guardados'}`;

  const gastos = (dados.diasProtegidos || []).length;
  const faltam = DIAS_POR_ESCUDO - (streak % DIAS_POR_ESCUDO);

  $('escudosProximo').textContent =
    tem >= MAX_ESCUDOS
      ? 'Bolso cheio: o próximo só entra depois que você gastar um.'
      : streak === 0
        ? `Comece uma sequência: o primeiro escudo vem em ${DIAS_POR_ESCUDO} dias.`
        : `Próximo escudo em ${faltam} ${faltam === 1 ? 'dia' : 'dias'}` +
          ` (você está em ${streak}).` +
          (gastos ? ` Já usou ${gastos} ${gastos === 1 ? 'vez' : 'vezes'}.` : '');
}

export function renderizar() {
  const dados = ctx.dados;
  const p = progresso(dados);
  const pers = dados.personalizacao || {};
  const dias = diasDaSequencia(dados);
  const streak = calcularSequencia(dias, inicioDoCiclo(dias));

  $('patenteNome').textContent = p.patente;
  $('patenteDias').textContent =
    `${p.dias} ${p.dias === 1 ? 'dia de acesso' : 'dias de acesso'} · ${p.desbloqueados} de ${p.total} itens liberados`;
  $('patenteNivel').textContent = `Nível ${p.nivel}/${p.totalNiveis}`;
  $('patenteBarra').style.width = `${p.pct}%`;

  $('patenteProximo').textContent = p.proximo
    ? `Próximo: ${p.proximo.rotuloGrupo} “${p.proximo.nome}” em ${p.proximo.faltam} ${p.proximo.faltam === 1 ? 'dia' : 'dias'}.`
    : 'Você desbloqueou tudo. Nada mal.';

  renderizarEscudos(dados, streak);
  renderizarCalendario(dados);
  renderizarHistorico(dados);

  $('marcos').innerHTML = MARCOS.map((m) => {
    const ok = streak >= m.dias;
    return `<span class="marco ${ok ? 'marco--conquistado' : 'marco--pendente'}"
      title="${ok ? 'Conquistado' : `Precisa de ${m.dias} dias seguidos`}">
      <span class="marco__emoji">${m.emoji}</span>${esc(m.nome)}
    </span>`;
  }).join('');

  // Os temas ficam agrupados por origem, para a vitrine não virar
  // uma parede de trinta cartões sem hierarquia.
  const familias = [...new Set(TEMAS.map((t) => t.familia))];
  $('vitrineTemas').innerHTML = familias.map((f) => `
    <div class="familia">
      <div class="familia__nome">${esc(f)}</div>
      <div class="vitrine">
        ${TEMAS.filter((t) => t.familia === f).map((t) => cartaoTema(t, p.dias, pers.tema)).join('')}
      </div>
    </div>`).join('');
  // Cor e fundo soltos só existem no tema Base — os demais já trazem
  // os dois embutidos (a cor é o acento do tema; o fundo, um desenho
  // que representa o tema, aplicado sozinho).
  const ehBase = (pers.tema || 'padrao') === 'padrao';
  $('notaCorFundo').hidden = ehBase;
  $('campoCor').hidden = !ehBase;
  $('campoFundo').hidden = !ehBase;
  if (ehBase) {
    $('vitrineCores').innerHTML = CORES.map((c) => cartaoCor(c, p.dias, pers.cor)).join('');
    $('vitrineFundos').innerHTML = FUNDOS.map((f) => cartaoFundo(f, p.dias, pers.fundo)).join('');
  }
  $('vitrineFontes').innerHTML = FONTES.map((f) => cartaoFonte(f, p.dias, pers.fonte)).join('');

  // Recordes da planta
  $('recordeSequencia').textContent =
    `${dados.recordes?.melhorSequencia || 0} ${(dados.recordes?.melhorSequencia || 0) === 1 ? 'dia' : 'dias'}`;
  $('recordePerdas').textContent =
    `${dados.recordes?.plantasPerdidas || 0}`;
  $('recordeAtual').textContent = `${streak} ${streak === 1 ? 'dia' : 'dias'}`;

  // Botão de imagem própria
  const escolhida = pers.fundo === 'imagem';
  $('linhaImagem').hidden = !liberado(FUNDOS.find((f) => f.id === 'imagem'), p.dias);
  $('imagemEstado').textContent = pers.imagemFundo
    ? 'Uma imagem está escolhida.'
    : 'Nenhuma imagem escolhida ainda.';
  $('btnRemoverImagem').hidden = !pers.imagemFundo;
  $('avisoImagem').hidden = !(escolhida && !pers.imagemFundo);

  document.querySelectorAll('#modalRecompensas .item:not([disabled])').forEach((b) => {
    b.addEventListener('click', () => escolher(b.dataset.grupo, b.dataset.id));
  });
}

function escolher(grupo, id) {
  ctx.dados.personalizacao = { ...ctx.dados.personalizacao, [grupo]: id };
  ctx.aoMudarPersonalizacao();
  renderizar();
}

/** Mostra a patente no cartão da planta, na tela de Início. */
export function atualizarSeloDaPlanta() {
  const p = progresso(ctx.dados);
  $('plantaPatente').textContent = p.patente;
}

export function abrir() {
  renderizar();
  $('modalRecompensas').hidden = false;
}

export function fechar() {
  $('modalRecompensas').hidden = true;
}

/** Lê o arquivo escolhido como data URI, para viajar dentro do JSON. */
function lerComoDataUri(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

const LIMITE_IMAGEM = 3 * 1024 * 1024;

async function escolherImagem(arquivo) {
  if (!arquivo) return;

  if (arquivo.size > LIMITE_IMAGEM) {
    alert(
      `Essa imagem tem ${(arquivo.size / 1048576).toFixed(1)} MB. ` +
      'Como ela é guardada dentro do arquivo de dados, o limite é 3 MB — ' +
      'reduza a imagem e tente de novo.'
    );
    return;
  }

  const uri = await lerComoDataUri(arquivo);
  ctx.dados.personalizacao = { ...ctx.dados.personalizacao, fundo: 'imagem', imagemFundo: uri };
  ctx.aoMudarPersonalizacao();
  renderizar();
}

export function ligarEventos() {
  $('cartaoPlanta').addEventListener('click', abrir);

  // Setas do calendário: trocam o mês e redesenham só ele.
  $('plantaCalendario').addEventListener('click', (e) => {
    // `data-mes` já é da navegação de mês das telas; aqui usamos um
    // nome próprio para os dois não se confundirem.
    const seta = e.target.closest('[data-mes-planta]');
    if (!seta) return;
    const passo = Number(seta.dataset.mesPlanta);
    const d = new Date(mesAberto.ano, mesAberto.mes + passo, 1);
    mesAberto = { ano: d.getFullYear(), mes: d.getMonth() };
    renderizarCalendario(ctx.dados);
  });

  $('btnEscolherImagem').addEventListener('click', () => $('inputImagemFundo').click());
  $('inputImagemFundo').addEventListener('change', async (e) => {
    try {
      await escolherImagem(e.target.files?.[0]);
    } catch (err) {
      alert('Não foi possível ler a imagem: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
  $('btnRemoverImagem').addEventListener('click', () => {
    ctx.dados.personalizacao = { ...ctx.dados.personalizacao, imagemFundo: '', fundo: 'liso' };
    ctx.aoMudarPersonalizacao();
    renderizar();
  });
  $('btnFecharRecompensas').addEventListener('click', fechar);
  $('btnFecharRecompensas2').addEventListener('click', fechar);
  $('modalRecompensas').addEventListener('click', (e) => {
    if (e.target === $('modalRecompensas')) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modalRecompensas').hidden) fechar();
  });
}

export { aplicar, progresso };
