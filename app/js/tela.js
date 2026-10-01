// =========================================================
// A tela.
//
// Todo o desenho do app mora aqui: as telas, os formulários, a folha
// que sobe, os popups e a personalização. O que este arquivo NÃO faz
// é conta: para saber quanto sobra, qual o saldo ou quantos dias de
// sequência, ele chama `calculos.js` e `planta.js`, que continuam
// exatamente como estavam e seguem cobertos pelos testes.
//
// A gravação também não é daqui: qualquer mudança nos dados passa por
// `mexeuNosDados()`, que avisa quem sabe salvar.
// =========================================================

import { calcularPainel, statusDevedor as statusDevedorReal } from './calculos.js';
import {
  diasDaSequencia, inicioDoCiclo, calcularSequencia, estagioCrescendo,
  escudosDisponiveis, DIAS_POR_ESCUDO, MAX_ESCUDOS, DIAS_ATE_MORRER,
} from './planta.js';
import { svgDaPlanta, svgDoEscudoMini } from './plantaSvg.js';
import {
  novoId, carimbar, agora,
  copiarFixasReceitas, copiarFixasDespesas, copiarRecorrentesDevedores,
  mesAnterior,
} from './dominio.js';
import { hoje, paraISO, formatarData } from './util.js';
import { VERSAO } from './versao.js';
import {
  lerConfiguracao, gravarConfiguracao, limparConfiguracao, estaLigada,
} from './sincronia.js';
import {
  sincronizarAgora, testarConexao, estadoDaSincronia, quandoSincroniaMudar,
  contarTempo,
} from './sincroniaApp.js';
import { guardarMidia, lerMidia, apagarMidia, emTamanho } from './midia.js';
import { temVersaoNova, versaoLaFora } from './atualizacao.js';

/** No aparelho mesmo, não no navegador nem no Electron. */
const noCelular = () => Boolean(window.Capacitor?.isNativePlatform?.());

/** Chamado toda vez que a tela mexe nos dados. Ligado em app.js. */
let aoMexer = () => {};
export function quandoMexer(fn) { aoMexer = fn; }
function mexeuNosDados() { aoMexer(D); }

/* ===================================================================
   Protótipo navegável do Controle Financeiro.
   Os dados são os de verdade, exportados do app.
   =================================================================== */

let D = null;   // preenchido por iniciarTela()

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const estado = {
  tela: 'inicio',
  ano: 2026,
  mes: 8,            // 0 a 11
  escolhido: null,   // id do lançamento aberto
  busca: '',
  planta: true,   // reposto do que ficou guardado, logo abaixo
  detalheInicio: false,  // os números de "já entrou / ainda falta" na tela inicial
  filtro: 'todos',
  selecao: new Set(),
  ajuste: null,    // seção aberta dentro dos Ajustes
};

/* ---------------- utilidades ---------------- */
const real = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const bonito = (s) => s ? s.split('-').reverse().join('/') : '';
const texto = (s) => String(s || '').trim().toLowerCase();
const noMes = (data) => {
  if (!data) return false;
  const [a, m] = data.split('-').map(Number);
  return a === estado.ano && m === estado.mes + 1;
};
const $ = (id) => document.getElementById(id);

function icone(nome, tamanho = 21) {
  const caminhos = {
    casa:'<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    sobe:'<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    desce:'<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    gente:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    porco:'<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5Z"/>',
    planta:'<path d="M12 22V12"/><path d="M12 12c0-4 2-7 6-8 0 4-2 7-6 8Z"/><path d="M12 14c0-3-1.6-5.5-5-6 0 3 1.6 5.5 5 6Z"/>',
    engrenagem:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    cartao:'<rect x="2" y="6" width="20" height="13" rx="2.5"/><path d="M2 10h20"/>',
    caindo:'<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h6v6"/><path d="M3 3l18 18"/>',
    subindo:'<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h6v6"/>',
    seta:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    volta:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    lupa:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    mais:'<path d="M12 5v14M5 12h14"/>',
    filtro:'<path d="M4 6h16M7 12h10M10 18h4"/>',
    clipe:'<path d="M21 8.5 12.5 17a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3"/>',
    copiar:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    parcela:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 15h6"/>',
    check:'<path d="M4.5 12.6 9.4 17.5 19.5 7.2"/>',
    sino:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    gota:'<path d="M12 3s6 6.4 6 10.4A6 6 0 0 1 6 13.4C6 9.4 12 3 12 3Z"/>',
    quadro:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="9" cy="9" r="1.4"/>',
    letra:'<path d="M5 19 12 5l7 14M8.2 14h7.6"/>',
    atualizar:'<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    filme:'<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M7 5v14M17 5v14M2.5 12h19M2.5 8.5h4.5M2.5 15.5h4.5M17 8.5h4.5M17 15.5h4.5"/>',
    fogo:'<path d="M12 22c4 0 6.5-2.6 6.5-6 0-4.5-4.5-6-4-11-2.5 1.5-4 4-4 6.5 0 1.5-1 2-1.5 1.5-1-1-1-2.5-1-2.5S5.5 12 5.5 16c0 3.4 2.5 6 6.5 6Z"/>',
    sol:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    lua:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    sistema:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    ajuda:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.8-.9 1.4v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  };
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">${caminhos[nome]||''}</svg>`;
}

/* ===================================================================
   Ponte com os módulos de cálculo do app.

   Nada aqui recalcula nada: são adaptadores finos que traduzem os
   nomes que a tela usa para os que o `calculos.js` e o `planta.js`
   devolvem. Foi de propósito, aqueles módulos têm 87 testes em cima
   e não podem ser reescritos por causa de uma troca de desenho.
   =================================================================== */
function statusDevedor(v) { return statusDevedorReal(v); }

function painel() {
  const p = calcularPainel(D, estado.ano, estado.mes + 1);
  return {
    saldo: p.saldoConta,
    sobra: p.possoGastar,
    devendo: p.devendo,
    receitasDoMes: p.receitasDoMes,
    recebido: p.recebido,
    faltaReceber: p.faltaReceber,
    despesasDoMes: p.despesasDoMes,
    pago: p.pago,
    faltaPagar: p.faltaPagar,
    fatura: p.faturaTotalPrevista,
    faturaPaga: p.faturaPaga,
  };
}

function sequencia() {
  const dias = diasDaSequencia(D);
  const inicio = inicioDoCiclo(dias);
  const hojeIso = paraISO(hoje());
  const anteriores = dias.filter((d) => d < hojeIso);
  return {
    dias: calcularSequencia(dias, inicio),
    ultimo: anteriores[anteriores.length - 1] || dias[dias.length - 1] || '',
    entrouHoje: dias.includes(hojeIso),
  };
}

// `estagioCrescendo` devolve a ficha inteira do estágio (chave, nome,
// emoji), não só o nome. A tela usa as duas coisas em lugares
// diferentes, então cada uma tem o seu atalho.
function estagio(dias) {
  return estagioCrescendo(dias)?.nome || 'Semente';
}
const chaveDoEstagio = (dias) => estagioCrescendo(dias)?.chave || 'semente';

/* ---------------- navegação ---------------- */
const TELAS = {
  inicio:      { nome: 'Início',      icone: 'casa' },
  receitas:    { nome: 'Receitas',    icone: 'sobe' },
  despesas:    { nome: 'Despesas',    icone: 'desce' },
  devedores:   { nome: 'Devedores',   icone: 'gente' },
  investir:    { nome: 'Investir',    icone: 'porco' },
  planta:      { nome: 'Planta',      icone: 'planta' },
  ajustes:     { nome: 'Ajustes',     icone: 'engrenagem' },
};

/**
 * O voltar do Android.
 *
 * A regra que o Thiago pediu: de qualquer tela, voltar leva para o
 * início; no início, voltar sai do app. Com a folha aberta, voltar
 * fecha a folha e não sai do lugar, senão a pessoa perde o que estava
 * digitando sem querer.
 *
 * Aqui isso é feito com o histórico do navegador, que é justamente o
 * que o Android usa por baixo. No app de verdade o mesmo desenho vira
 * um `App.addListener('backButton', …)` do Capacitor, onde `canGoBack`
 * falso significa fechar o aplicativo.
 */
function voltarDoAndroid() {
  if ($('folha').classList.contains('aberta')) { fecharFolha(); return true; }
  if (estado.tela === 'ajustes' && estado.ajuste) {
    if (estado.ajuste.includes('/')) irNoAjuste(estado.ajuste.split('/')[0]);
    else voltarDosAjustes();
    return true;
  }
  if (estado.tela !== 'inicio') { ir('inicio', true); return true; }
  return false; // nada mais para desfazer: o app fecha
}

window.addEventListener('popstate', () => {
  if (voltarDoAndroid()) {
    // Continuamos dentro do app, então repomos a entrada que o voltar
    // consumiu. Sem isso, o próximo voltar pularia uma etapa.
    history.pushState({ dentro: true }, '');
  }
  // Se voltarDoAndroid devolveu falso, deixamos o navegador ir embora:
  // é o equivalente a fechar o aplicativo.
});

/**
 * O botão físico do Android.
 *
 * Sem este trecho o sistema não pergunta nada a ninguém: ele olha se
 * a tela tem histórico e, não tendo, fecha o app. Era o que estava
 * acontecendo, o primeiro toque em voltar matava o aplicativo em vez
 * de ir para o início.
 *
 * Com o ouvinte, quem decide somos nós, e só chamamos `exitApp()`
 * quando realmente não há para onde voltar.
 */
function ligarVoltarDoAndroid() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App?.addListener) return;
  App.addListener('backButton', () => {
    if (!voltarDoAndroid()) App.exitApp();
  });
}

function ir(tela, doVoltar) {
  if (!doVoltar && tela !== estado.tela) history.pushState({ dentro: true }, '');
  estado.tela = tela;
  estado.escolhido = null;
  estado.busca = '';
  estado.selecao.clear();
  if (tela !== 'ajustes') estado.ajuste = null;
  desenhar();
  window.scrollTo({ top: 0 });
  $('conteudo').classList.remove('entrando');
  void $('conteudo').offsetWidth;
  $('conteudo').classList.add('entrando');
}

function mudarMes(passo) {
  let m = estado.mes + passo, a = estado.ano;
  if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
  estado.mes = m; estado.ano = a; estado.escolhido = null; estado.selecao.clear();
  desenhar();
}
function voltarParaHoje() { const h = hoje(); estado.mes = h.getMonth(); estado.ano = h.getFullYear(); desenhar(); }

/* ---------------- desenho ---------------- */
function desenhar() {
  desenharMenu();
  desenharBarra();
  const p = painel();
  const conteudo = $('conteudo');

  if (estado.tela === 'inicio')        conteudo.innerHTML = telaInicio(p);
  else if (estado.tela === 'ajustes')  conteudo.innerHTML = telaAjustes();
  else if (estado.tela === 'planta')   conteudo.innerHTML = telaPlanta();
  else if (estado.tela === 'investir') conteudo.innerHTML = telaInvestir();
  else if (estado.tela === 'devedores')conteudo.innerHTML = telaDevedores();
  else                                 conteudo.innerHTML = telaLancamentos(estado.tela, p);

  const semBotao = ['inicio','ajustes','planta'].includes(estado.tela);
  $('fab').style.display = semBotao ? 'none' : '';
  preencherAmostrasDeArquivo();
  $('fab').lastChild.textContent = ({
    despesas: ' Nova despesa',
    receitas: ' Nova receita',
    devedores: ' Novo devedor',
    investir: ' Registrar',
  })[estado.tela] || ' Adicionar';
}

function desenharMenu() {
  const itens = ['inicio', 'receitas', 'despesas', 'devedores', 'investir'];
  if (estado.planta) itens.push('planta');
  itens.push('ajustes');
  $('menu').innerHTML = itens.map((t) => `
    <button class="menu__item ${estado.tela===t?'ativo':''}" onclick="ir('${t}')" title="${TELAS[t].nome}">
      ${icone(TELAS[t].icone, 19)}${estado.tela===t ? TELAS[t].nome : ''}
    </button>`).join('');
}

function desenharBarra() {
  const semMes = ['ajustes','planta'].includes(estado.tela);
  const comBusca = ['receitas','despesas','devedores'].includes(estado.tela);
  $('barra').innerHTML = `<div class="barra__interno">
    <div class="barra__titulo">${estado.tela === 'ajustes' && estado.ajuste
      ? fichaDaSecao(estado.ajuste).nome : TELAS[estado.tela].nome}</div>
    ${comBusca ? `<div class="busca">${icone('lupa',17)}
      <input placeholder="Procurar em ${TELAS[estado.tela].nome.toLowerCase()}…" value="${estado.busca}"
             oninput="estado.busca=this.value; redesenharLista()"></div>` : ''}
    <div class="barra__dir">
      ${semMes ? '' : `<div class="mes-pilula">
        <span class="mes-pilula__nome">${MESES[estado.mes]} de ${estado.ano}</span>
        <button class="seta" onclick="mudarMes(-1)" aria-label="Mês anterior">‹</button>
        <button class="seta" onclick="mudarMes(1)" aria-label="Próximo mês">›</button>
      </div>`}
      ${comBusca ? `<button class="redondo" onclick="voltarParaHoje()" title="Me leva pra hoje">${icone('filtro',19)}</button>` : ''}
    </div></div>`;
}

/**
 * Troca só as linhas, deixando o campo de busca de pé.
 *
 * Se o recipiente ainda não existir (troca de tela, por exemplo),
 * cai para o desenho completo.
 */
function redesenharLista() {
  const lista = $('lista');
  if (!lista) { desenhar(); return; }
  lista.innerHTML = linhasDaTela();
}

function cabecalhoCelular(titulo) {
  if (estado.tela === 'inicio') return `
    <header class="topo celular-so">
      <span class="marca">$</span>
      <div>
        <div class="topo__marca">Controle Financeiro</div>
        <div class="topo__ola">Olá, ${escapar(seuNome())}</div>
      </div>
      <button class="redondo" onclick="ir('ajustes')" aria-label="Ajustes">${icone('engrenagem',20)}</button>
    </header>`;
  return `
    <div class="voltar celular-so">
      <div class="voltar__titulo">${titulo}</div>
    </div>`;
}

function barraMesCelular() {
  return `
    <div class="mes-barra celular-so">
      <button class="seta" onclick="mudarMes(-1)" aria-label="Mês anterior">‹</button>
      <button class="mes-barra__meio" onclick="voltarParaHoje()">
        <span class="mes-barra__nome">${MESES[estado.mes]} de ${estado.ano}</span>
        <span class="mes-barra__hoje">hoje: ${formatarData(hoje())}</span>
      </button>
      <button class="seta" onclick="mudarMes(1)" aria-label="Próximo mês">›</button>
    </div>`;
}

/* ---------------- tela inicial ---------------- */
function telaInicio(p) {
  const seq = sequencia();
  const cartaoPlanta = estado.planta ? `
    <button class="cartao" onclick="ir('planta')">
      ${svgDaPlanta(chaveDoEstagio(seq.dias))}
      <span class="cartao__meio">
        <span class="planta__nome">${estagio(seq.dias)} <span class="planta__selo">${seq.dias} dias seguidos</span></span>
        <span class="planta__sub">${seq.entrouHoje ? 'Você já passou por aqui hoje' : 'Você ainda não passou hoje'} · antes, dia ${bonito(seq.ultimo).slice(0,5)}</span>
      </span>
    </button>` : '';

  return cabecalhoCelular('') + barraMesCelular() + `
    <div class="pilha">
      ${cartaoPlanta}
      <button class="cartao" onclick="explicarSaldo()">
        <span class="pastilha pastilha--menta">${icone('cartao')}</span>
        <span class="cartao__meio">
          <span class="rotulo">Saldo em conta</span>
          <span class="cartao__valor dinheiro">${real(p.saldo)}</span>
        </span>
        <span class="cartao__acao">${icone('ajuda',16)}</span>
      </button>
      <button class="cartao" onclick="explicarSobra()">
        <span class="pastilha pastilha--${corDaSobra(p)}">${icone(p.sobra < 0 ? 'caindo' : 'subindo')}</span>
        <span class="cartao__meio">
          <span class="rotulo">${rotuloDaSobra(p)}</span>
          <span class="cartao__valor ${p.sobra < 0 ? 'cartao__valor--vermelho' : ''} dinheiro">${real(Math.abs(p.sobra))}</span>
        </span>
        <span class="cartao__acao">${icone('ajuda',16)}</span>
      </button>
      <button class="cartao" onclick="ir('receitas')">
        <span class="pastilha pastilha--verde">${icone('sobe')}</span>
        <span class="cartao__meio">
          <span class="rotulo">Receitas do mês</span>
          <span class="cartao__valor dinheiro">${real(p.receitasDoMes)}</span>
          ${quebra('Já entrou', p.recebido, 'Ainda falta', p.faltaReceber)}
        </span>
      </button>
      <button class="cartao" onclick="ir('despesas')">
        <span class="pastilha pastilha--vermelha">${icone('desce')}</span>
        <span class="cartao__meio">
          <span class="rotulo">Despesas do mês</span>
          <span class="cartao__valor dinheiro">${real(p.despesasDoMes)}</span>
          ${quebra('Já paguei', p.pago, 'Ainda falta', p.faltaPagar)}
        </span>
      </button>
    </div>

    <div class="titulo-secao">Atalhos</div>
    <div class="atalhos">
      ${atalho('receitas','verde','sobe','Receitas', real(p.faltaReceber)+' pendente')}
      ${atalho('despesas','vermelha','desce','Despesas', real(p.faltaPagar)+' a pagar')}
      ${atalho('devedores','ouro','gente','Devedores', real(devedoresPendentes())+' a receber')}
      ${atalho('investir','menta','porco','Investir', porcentagemDaMeta()+' da meta')}
    </div>`;
}

/**
 * A quebra do valor em "o que já aconteceu" e "o que ainda vem".
 *
 * É o mesmo par que as telas de Receitas e Despesas mostram no alto;
 * aqui ele entra dentro do cartão que já existia, em vez de virar
 * cartão novo — a tela inicial já é comprida.
 */
function quebra(rotuloA, valorA, rotuloB, valorB) {
  if (!estado.detalheInicio) return '';
  return `<span class="quebra">
    <span class="quebra__parte"><span class="quebra__nome">${rotuloA}</span>
      <span class="quebra__valor quebra__valor--menta dinheiro">${real(valorA)}</span></span>
    <span class="quebra__parte"><span class="quebra__nome">${rotuloB}</span>
      <span class="quebra__valor quebra__valor--ouro dinheiro">${real(valorB)}</span></span>
  </span>`;
}

function atalho(tela, cor, ic, nome, sub) {
  return `<button class="atalho" onclick="ir('${tela}')">
    <span class="atalho__seta">${icone('seta',17)}</span>
    <span class="pastilha pastilha--quadrada pastilha--${cor}">${icone(ic,20)}</span>
    <div class="atalho__nome">${nome}</div>
    <div class="atalho__sub">${sub}</div>
  </button>`;
}

const devedoresPendentes = () => D.devedores.filter((v)=>noMes(v.pgtoPrevisto) && texto(statusDevedor(v))!=='pago')
  .reduce((s,v)=>s+(Number(v.valor)||0),0);
/**
 * A lista de investimento não é guardada: ela é montada a partir do
 * que já está em Despesas e Receitas, como no app.
 *
 *   Aporte     despesa de categoria "Investimentos" já paga
 *   Retirada   receita de categoria "Investimento" já recebida (negativa)
 *   Rendimento o único que mora na própria aba, porque esse dinheiro
 *              não passa pela conta
 *
 * Eu tinha somado só a aba, e por isso o total dava 0,1% em vez dos
 * 9,1% que o app mostra.
 */
function listaInvestimento() {
  const itens = [];
  for (const d of D.despesas)
    if (texto(d.categoria) === 'investimentos' && texto(d.status) === 'pago')
      itens.push({ id:'ap:'+d.id, data:d.data, valor:Number(d.valor)||0, descricao:d.descricao, categoria:'Aporte' });
  for (const r of D.receitas)
    if (texto(r.categoria) === 'investimento' && texto(r.status) === 'recebido')
      itens.push({ id:'rt:'+r.id, data:r.data, valor:-(Number(r.valor)||0), descricao:r.descricao, categoria:'Retirada' });
  for (const i of D.investimento)
    itens.push({ id:'rd:'+i.id, data:i.data, valor:Number(i.valor)||0, descricao:i.descricao, categoria:i.categoria||'Rendimento' });
  return itens.sort((a,b) => (b.data||'').localeCompare(a.data||''));
}

const totalInvestido = () => listaInvestimento().reduce((t,i) => t + i.valor, 0);
const porcentagemDaMeta = () => {
  const meta = D.config.metaInvestimento || 0;
  return meta ? (totalInvestido()/meta*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%' : '';
};

/* ===================================================================
   Os três estados do "quanto sobra", e as explicações.
   =================================================================== */

/**
 * Sobrando, devendo, ou exatamente no zero.
 *
 * O zero merece nome próprio: "R$ 0,00 vai sobrar" é uma frase que
 * não alerta ninguém, e a situação é justamente a de parar de gastar.
 */
function estadoDaSobra(p) {
  if (Math.abs(p.sobra) < 0.005) return 'zerado';
  return p.sobra < 0 ? 'devendo' : 'sobrando';
}
const rotuloDaSobra = (p) => ({
  sobrando: 'Quanto vai sobrar',
  devendo:  'Quanto estou devendo',
  zerado:   'Não gaste mais nada!',
})[estadoDaSobra(p)];
const corDaSobra = (p) => ({ sobrando: 'verde', devendo: 'vermelha', zerado: 'ouro' })[estadoDaSobra(p)];

function linhaDaConta(nome, valor, sinal, total) {
  const classe = total ? ' conta__linha--total' : '';
  const cor = sinal === '+' ? ' conta__valor--mais' : (sinal === '−' ? ' conta__valor--menos' : '');
  return `<div class="conta__linha${classe}">
    <span class="conta__nome">${nome}</span>
    <span class="conta__valor${cor} dinheiro">${sinal || ''}${real(Math.abs(valor))}</span>
  </div>`;
}

/** O popup do "quanto vai sobrar". */
function explicarSobra() {
  const p = painel();
  const est = estadoDaSobra(p);
  const devedoresAReceber = devedoresPendentes();
  mostrarFolha(`
    <div class="folha__titulo">${rotuloDaSobra(p)}</div>
    <p class="explica">
      Calma que é mais simples do que parece. Eu pego o dinheiro que você tem
      hoje, somo tudo que ainda vai cair na conta esse mês e tiro tudo que
      ainda vai sair. O que restar é esse número aqui.
    </p>
    <p class="explica">
      Serve pra uma coisa só: saber se dá pra gastar. Se está verde, sobra.
      Se está vermelho, falta.
    </p>

    <div class="conta">
      ${linhaDaConta('O que você tem hoje na conta', p.saldo, '')}
      ${linhaDaConta('O que ainda vai entrar', p.faltaReceber - devedoresAReceber, '+')}
      ${linhaDaConta('O que te devem e ainda vão pagar', devedoresAReceber, '+')}
      ${linhaDaConta('O que ainda vai sair', p.faltaPagar, '−')}
      ${linhaDaConta(rotuloDaSobra(p), p.sobra, '', true)}
    </div>

    <p class="explica explica--fraco">
      As contas que você já pagou não aparecem nessa lista, e nem o salário que
      já caiu. Isso tudo já está no seu saldo, ali na primeira linha. Aqui
      embaixo eu só conto o que ainda está pra acontecer.
    </p>

    <div class="secao-form__nome">Os três recados que eu te dou</div>
    <div class="estados">
      <div class="estado" ${est==='sobrando'?'style="outline:1px solid var(--verde)"':''}>
        <span class="estado__bola" style="background:var(--verde)"></span>
        <span>
          <div class="estado__nome">Quanto vai sobrar</div>
          <div class="estado__texto">Sobrou. Pode respirar: esse é o dinheiro que dá pra guardar ou gastar à vontade.</div>
        </span>
      </div>
      <div class="estado" ${est==='zerado'?'style="outline:1px solid var(--ouro)"':''}>
        <span class="estado__bola" style="background:var(--ouro)"></span>
        <span>
          <div class="estado__nome">Não gaste mais nada!</div>
          <div class="estado__texto">Está bem no zero. Dá pra pagar tudo, mas um lanchinho a mais já estoura. Segura a mão.</div>
        </span>
      </div>
      <div class="estado" ${est==='devendo'?'style="outline:1px solid var(--vermelho)"':''}>
        <span class="estado__bola" style="background:var(--vermelho)"></span>
        <span>
          <div class="estado__nome">Quanto estou devendo</div>
          <div class="estado__texto">Falta esse tanto pra fechar o mês. Ou entra mais dinheiro, ou alguma conta vai ter que esperar.</div>
        </span>
      </div>
    </div>

    <button class="principal" onclick="fecharFolha()">Entendi!</button>`);
}

/** O popup do saldo em conta, com o reajuste dentro. */
function explicarSaldo() {
  const p = painel();
  let recebido = 0, pago = 0, devPagos = 0;
  for (const r of D.receitas) if (texto(r.status) === 'recebido') recebido += Number(r.valor) || 0;
  for (const d of D.despesas) if (texto(d.status) === 'pago') pago += Number(d.valor) || 0;
  for (const v of D.devedores) if (texto(statusDevedor(v)) === 'pago') devPagos += Number(v.valor) || 0;

  mostrarFolha(`
    <div class="folha__titulo">Saldo em conta</div>
    <p class="explica">
      Esse é o dinheiro que está na sua conta agora, de verdade. Eu chego nele
      somando tudo que você já recebeu e tirando tudo que você já pagou, desde
      sempre, não só desse mês.
    </p>

    <div class="conta">
      ${linhaDaConta('O que você me disse que tinha', D.config.ajusteSaldo, '')}
      ${linhaDaConta('Tudo que já entrou', recebido, '+')}
      ${linhaDaConta('Tudo que te pagaram', devPagos, '+')}
      ${linhaDaConta('Tudo que já saiu', pago, '−')}
      ${linhaDaConta('Saldo em conta', p.saldo, '', true)}
    </div>

    <p class="explica explica--fraco">
      A conta que vence semana que vem não está aqui, porque ela ainda não saiu
      da sua conta. Aqui só entra o que já aconteceu.
    </p>

    <div class="secao-form__nome">Não bateu com o banco?</div>
    <p class="explica">
      Acontece, e não tem problema. Você não precisa apagar nada: me diz quanto
      o banco está mostrando e eu acerto a diferença sozinho. Seus lançamentos
      ficam todos onde estão.
    </p>
    <button class="principal" onclick="abrirReajuste()">Acertar meu saldo</button>
    <div class="rodape-form"><button class="secundario" onclick="fecharFolha()">Fechar</button></div>`);
}

/** O reajuste propriamente dito. */
function abrirReajuste() {
  const p = painel();
  mostrarFolha(`
    <div class="folha__titulo">Vamos acertar o saldo</div>
    <p class="explica">
      Dá uma olhada no banco e me diz quanto você tem na conta agora.
    </p>
    <div class="conta">
      ${linhaDaConta('Eu estou calculando', p.saldo, '')}
    </div>
    <div class="valorao">
      <span class="valorao__moeda">R$</span>
      <input class="valorao__numero dinheiro" id="saldo-real" inputmode="numeric"
             placeholder="0,00" value="" autocomplete="off" oninput="previverReajuste()">
      <div class="valorao__dica" id="reajuste-dica">Eu lanço a diferença sozinho.</div>
    </div>
    <button class="principal" onclick="confirmarReajuste()">Pode acertar</button>
    <div class="rodape-form"><button class="secundario" onclick="explicarSaldo()">Voltar</button></div>`);
  setTimeout(() => $('saldo-real')?.focus(), 480);
}

/**
 * Mostra ao vivo o que vai acontecer. Zero é um valor legítimo aqui 
 * "tenho R$ 0,00 na conta" é uma frase comum, então o campo vazio e o
 * campo com zero têm de ser coisas diferentes.
 */
function previverReajuste() {
  const dica = $('reajuste-dica');
  const escrito = $('saldo-real').value;
  if (escrito === '') {
    dica.textContent = 'Eu lanço a diferença sozinho.';
    dica.style.color = '';
    return;
  }
  const diferenca = pegarValor('saldo-real') - painel().saldo;
  if (Math.abs(diferenca) < 0.005) {
    dica.textContent = 'Já está batendo, não precisa mexer.';
    dica.style.color = '';
    return;
  }
  dica.textContent = (diferenca > 0 ? 'Então eu acrescento ' : 'Então eu desconto ') + real(Math.abs(diferenca)) + '.';
  dica.style.color = diferenca > 0 ? 'var(--verde)' : 'var(--vermelho)';
}

function confirmarReajuste() {
  if ($('saldo-real').value === '') { avisar('Me diz quanto tem na conta'); return; }
  const diferenca = pegarValor('saldo-real') - painel().saldo;
  D.config.ajusteSaldo = (Number(D.config.ajusteSaldo) || 0) + diferenca;
  D.config.atualizadoEm = agora();
  fecharFolha();
  mexeuNosDados();
  desenhar();
  avisar(Math.abs(diferenca) < 0.005 ? 'Já estava certinho' : 'Pronto, acertei o saldo');
}

/* ===================================================================
   Tema: claro, escuro ou o que o sistema estiver usando.
   "Sistema" é o padrão, e muda junto se a pessoa trocar o tema do
   aparelho com o app aberto.
   =================================================================== */
const FONTES = {
  charmosa: {
    nome: 'Charmosa', sub: 'Com serifa nos números, a que eu escolhi',
    texto: "'Plus Jakarta Sans', system-ui, sans-serif",
    destaque: "'Fraunces', Georgia, serif",
  },
  editorial: {
    nome: 'Editorial', sub: 'Serifa mais fina, cara de jornal',
    texto: "'Inter Tight', system-ui, sans-serif",
    destaque: "'Newsreader', Georgia, serif",
  },
  limpa: {
    nome: 'Limpa', sub: 'Sem serifa nenhuma, bem direta',
    texto: "'Inter Tight', system-ui, sans-serif",
    destaque: "'Inter Tight', system-ui, sans-serif",
  },
};

function fonteEscolhida() {
  try { return localStorage.getItem('cf:fonte') || 'charmosa'; } catch { return 'charmosa'; }
}

function aplicarFonte(chave) {
  const f = FONTES[chave] || FONTES.charmosa;
  try { localStorage.setItem('cf:fonte', chave); } catch { /* paciência */ }
  document.documentElement.style.setProperty('--fonte', f.texto);
  document.documentElement.style.setProperty('--fonte-destaque', f.destaque);
}

function trocarFonte(chave) {
  aplicarFonte(chave);
  escolherTema();
  avisar('Troquei a fonte pra ' + FONTES[chave].nome.toLowerCase());
}

const TEMAS = {
  sistema: { nome: 'Igual ao aparelho', icone: 'sistema', sub: 'Eu sigo o que você usa no celular' },
  claro:   { nome: 'Claro',            icone: 'sol',     sub: 'Fundo claro, sempre' },
  escuro:  { nome: 'Escuro',           icone: 'lua',     sub: 'Fundo escuro, sempre' },
};

/* ===================================================================
   Preferências que ficam guardadas no aparelho.
   =================================================================== */
function lerGuardado(chave, padrao) {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : JSON.parse(v);
  } catch { return padrao; }
}
function guardar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* paciência */ }
}

function temaEscolhido() {
  try { return localStorage.getItem('cf:tema') || 'sistema'; } catch { return 'sistema'; }
}

/** Qual tema está valendo de fato agora, é o que decide o ícone. */
function temaEmUso() {
  const escolha = temaEscolhido();
  if (escolha !== 'sistema') return escolha;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

const iconeDoTema = () => TEMAS[temaEscolhido()].icone;

function aplicarTema(escolha) {
  try { localStorage.setItem('cf:tema', escolha); } catch { /* sem memória, paciência */ }
  if (escolha === 'sistema') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.dataset.tema = escolha;
}

/** Ligar e desligar a planta, guardando a escolha. */
function mudarDetalheInicio(ligado) {
  estado.detalheInicio = ligado;
  guardar('cf:detalheInicio', ligado);
  desenhar();
  avisar(ligado ? 'Pronto, tá na tela inicial' : 'Tirei da tela inicial');
}

function mudarPlanta(ligada) {
  estado.planta = ligada;
  guardar('cf:planta', ligada);
  if (!ligada && ['planta'].includes(estado.tela)) ir('inicio');
  else desenhar();
  avisar(ligada ? 'A plantinha voltou!' : 'Tá bom, guardei a plantinha');
}

function escolherTema() {
  const atual = temaEscolhido();
  mostrarFolha(`
    <div class="folha__titulo">Tema</div>
    <div class="pilha" style="margin-bottom:8px">
      ${Object.entries(TEMAS).map(([chave, t]) => `
        <button class="cartao ${chave===atual?'item--marcado':''}" onclick="trocarTema('${chave}')">
          <span class="pastilha ${chave===atual?'pastilha--menta':'pastilha--ouro'}">${icone(t.icone)}</span>
          <span class="cartao__meio">
            <span class="chave__nome">${t.nome}</span>
            <span class="chave__sub">${t.sub}</span>
          </span>
          ${chave===atual ? `<span class="cartao__acao">${icone('check',16)}</span>` : ''}
        </button>`).join('')}
    </div>
    <p class="explica explica--fraco">
      Os temas coloridos vêm depois, prometo. Por enquanto são esses três.
    </p>

    <div class="secao-form__nome">Fonte</div>
    <div class="pilha">
      ${Object.entries(FONTES).map(([chave, f]) => `
        <button class="cartao ${chave===fonteEscolhida()?'item--marcado':''}" onclick="trocarFonte('${chave}')">
          <span class="cartao__meio">
            <span class="chave__nome" style="font-family:${f.destaque}">${f.nome} · R$ 1.234,56</span>
            <span class="chave__sub">${f.sub}</span>
          </span>
          ${chave===fonteEscolhida() ? `<span class="cartao__acao">${icone('check',16)}</span>` : ''}
        </button>`).join('')}
    </div>`);
}

function trocarTema(escolha) {
  aplicarTema(escolha);
  aplicarVisual();   // a cor tem versão clara e escura
  fecharFolha();
  desenhar();
  avisar('Prontinho, tema ' + TEMAS[escolha].nome.toLowerCase());
}

// Com "igual ao sistema", trocar o tema do aparelho troca o do app na
// hora, sem precisar fechar e abrir.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (temaEscolhido() === 'sistema') desenhar();
});

/* ---------------- listas de lançamentos ---------------- */
/**
 * A busca olha os mesmos campos que o app olha, e são mais do que
 * parece: além da descrição e da categoria, ela acha pela forma de
 * pagamento, pela origem, pela observação, pela situação e pelo valor.
 * Procurar "crédito" ou "pendente" tem que trazer resultado.
 */
function combina(item, campos, busca) {
  if (!busca) return true;
  return campos.some((c) => {
    const v = item[c];
    if (v == null || v === '') return false;
    if (c === 'valor') {
      const n = Number(v) || 0;
      return String(n).includes(busca) ||
             n.toFixed(2).replace('.', ',').includes(busca);
    }
    return texto(v).includes(busca);
  });
}

const CAMPOS_BUSCA = {
  receitas:  ['descricao','categoria','origem','observacao','status','valor'],
  despesas:  ['descricao','categoria','formaPgto','observacao','status','valor'],
  devedores: ['nome','tipo','formaPgto','observacao','valor'],
};

function listaDoMes(qual) {
  const fonte = qual === 'receitas' ? D.receitas : D.despesas;
  const busca = texto(estado.busca);
  return fonte
    .filter((x) => noMes(x.data))
    .filter((x) => combina(x, CAMPOS_BUSCA[qual], busca))
    .filter((x) => {
      if (estado.filtro === 'pendentes') return !['pago','recebido'].includes(texto(x.status));
      if (estado.filtro === 'fixos') return texto(x.fixa) === 'sim';
      return true;
    })
    .sort((a,b) => (b.data||'').localeCompare(a.data||''));
}

function telaLancamentos(qual, p) {
  const itens = listaDoMes(qual);
  const recebe = qual === 'receitas';
  return cabecalhoCelular(TELAS[qual].nome) + barraMesCelular() + `
    <div class="resumo">
      <div class="resumo__metade">
        <div class="rotulo">${recebe?'Já entrou':'Já paguei'}</div>
        <div class="resumo__valor resumo__valor--menta dinheiro">${real(recebe?p.recebido:p.pago)}</div>
      </div>
      <div class="resumo__metade">
        <div class="rotulo">${recebe?'Ainda falta entrar':'Ainda falta pagar'}</div>
        <div class="resumo__valor resumo__valor--ouro dinheiro">${real(recebe?p.faltaReceber:p.faltaPagar)}</div>
      </div>
    </div>
    ${!recebe && p.fatura ? `<div class="cartao" style="cursor:default;margin-bottom:10px">
        <span class="pastilha pastilha--ouro">${icone('cartao')}</span>
        <span class="cartao__meio">
          <span class="rotulo">A fatura do cartão</span>
          <span class="cartao__valor dinheiro">${real(p.fatura)}</span>
        </span>
      </div>` : ''}
    <div class="busca celular-so" style="margin-bottom:12px">${icone('lupa',17)}
      <input placeholder="Procurar…" value="${escapar(estado.busca)}"
             oninput="estado.busca=this.value; redesenharLista()">
    </div>
    <div id="lista">${linhasDaTela()}</div>`;
}

/**
 * Só as linhas, sem o que vem acima delas.
 *
 * Existe para o campo de busca ficar FORA do pedaço que se refaz a
 * cada tecla. Antes eu trocava o conteúdo inteiro, o campo era
 * destruído junto e o Android fechava o teclado: dava para digitar
 * uma letra por vez, tocando no campo de novo entre elas.
 */
function linhasDaTela() {
  if (estado.tela === 'devedores') return linhasDeDevedores();
  const recebe = estado.tela === 'receitas';
  const itens = listaDoMes(estado.tela);
  return `
    <div class="fichas">
      <button class="ficha" onclick="abrirParcelar()">${icone('parcela',15)} Parcelar</button>
      ${fichaDeCopiar()}
      <button class="ficha ${estado.filtro==='todos'?'ativa':''}" onclick="estado.filtro='todos'; redesenharLista()">Todos</button>
      <button class="ficha ${estado.filtro==='pendentes'?'ativa':''}" onclick="estado.filtro='pendentes'; redesenharLista()">Em aberto</button>
      <button class="ficha ${estado.filtro==='fixos'?'ativa':''}" onclick="estado.filtro='fixos'; redesenharLista()">Fixos</button>
    </div>
    ${barraDeSelecao(recebe)}
    ${itens.length ? itens.map((x) => linhaLancamento(x, recebe)).join('')
      : vazioOuNadaAchado()}`;
}

/**
 * Lista vazia tem duas causas, e dizer a errada assusta: quem procurou
 * algo e leu "o mês está vazio" acha que perdeu os lançamentos.
 */
function vazioOuNadaAchado() {
  if (estado.busca) return `<div class="vazio">Nada com "${escapar(estado.busca)}" aqui.</div>`;
  if (estado.filtro === 'pendentes') return `<div class="vazio">Nada em aberto. Tudo pago!</div>`;
  if (estado.filtro === 'fixos') return `<div class="vazio">Nenhum lançamento fixo neste mês.</div>`;
  return `<div class="vazio">${MESES[estado.mes]} está vazio por aqui.<br>Bora lançar o primeiro?</div>`;
}

function linhaLancamento(x, recebe) {
  const s = texto(x.status);
  const bom = recebe ? s === 'recebido' : s === 'pago';
  const marcado = estado.selecao.has(x.id);
  return `<div class="item item--recuado ${estado.escolhido===x.id?'escolhido':''} ${marcado?'item--marcado':''}"
       onclick="abrir('${x.id}')">
    <label class="marcar" onclick="event.stopPropagation()" title="Marcar esse">
      <input type="checkbox" ${marcado?'checked':''} onchange="marcar('${x.id}', this.checked)">
    </label>
    <span class="item__linha1">
      <span class="item__data">${bonito(x.data)}</span>
      <button class="selo selo--clicavel ${bom?'selo--ok':'selo--pendente'}"
        onclick="event.stopPropagation(); virarStatus('${x.id}')"
        title="Toca aqui pra marcar como pago">${x.status||''}</button>
      <span class="item__valor dinheiro">${real(x.valor)}</span>
    </span>
    <span class="item__nome">${escapar(x.descricao)||'(sem descrição)'}</span>
    <span class="item__cat">${escapar(x.categoria)||''}${x.formaPgto?' · '+escapar(x.formaPgto):''}</span>
  </div>`;
}

/* ===================================================================
   Seleção de várias linhas.
   A soma do que está marcado é o ponto: dá para conferir um bolo de
   lançamentos sem abrir um por um.
   =================================================================== */
function marcar(id, ligado) {
  if (ligado) estado.selecao.add(id); else estado.selecao.delete(id);
  redesenharLista();
}

function limparSelecao() { estado.selecao.clear(); redesenharLista(); }

function itensSelecionados() {
  return [...D.receitas, ...D.despesas, ...D.devedores].filter((x) => estado.selecao.has(x.id));
}

function marcarTodosComo(status) {
  const marcados = itensSelecionados();
  for (const x of marcados) x.status = status;
  const quantos = marcados.length;
  estado.selecao.clear();
  mexeuNosDados();
  desenhar();
  avisar(`Marquei ${quantos === 1 ? 'um' : quantos} como ${status.toLowerCase()}`);
}

function barraDeSelecao(recebe) {
  const marcados = itensSelecionados();
  if (!marcados.length) return '';
  const soma = marcados.reduce((t, x) => t + (Number(x.valor) || 0), 0);
  const bom = recebe ? 'Recebido' : 'Pago';
  return `<div class="barra-selecao">
    <span class="barra-selecao__texto">${marcados.length} ${marcados.length===1?'selecionado':'selecionados'} · soma ${real(soma)}</span>
    <span class="barra-selecao__acoes">
      <button class="forte" onclick="marcarTodosComo('${bom}')">Marcar como ${bom.toLowerCase()}</button>
      <button onclick="marcarTodosComo('Pendente')">Voltar pra pendente</button>
      <button onclick="limparSelecao()">Desmarcar tudo</button>
    </span>
  </div>`;
}

/**
 * Tocar no selo alterna entre pendente e quitado, e só isso.
 *
 * Antes ele girava na ordem da lista, e um "Pendente" virava
 * "Aguardando" em vez de "Pago", que é o movimento que a pessoa faz
 * o dia inteiro. Aguardando continua existindo no formulário, onde há
 * espaço para escolher com calma.
 */
function virarStatus(id) {
  const x = achar(id);
  if (!x) return;
  const quitado = D.receitas.includes(x) ? 'Recebido' : 'Pago';
  x.status = texto(x.status) === texto(quitado) ? 'Pendente' : quitado;
  mexeuNosDados();
  desenhar();
  avisar(x.descricao ? `${x.descricao}: ${x.status.toLowerCase()}!` : x.status);
}

/**
 * O mesmo para devedores, onde "pago" não é um rótulo e sim a data em
 * que a pessoa pagou.
 */
function virarDevedor(id) {
  const v = D.devedores.find((d) => d.id === id);
  if (!v) return;
  if (texto(statusDevedor(v)) === 'pago') v.pagouEm = '';
  else v.pagouEm = paraISO(hoje());
  mexeuNosDados();
  desenhar();
  avisar(`${v.nome}: ${statusDevedor(v).toLowerCase()}!`);
}

/* ===================================================================
   Copiar os fixos do mês anterior

   Isto é da planilha: lá existiam três botões, um por aba, que
   traziam de uma vez as contas que se repetem todo mês. A conta de
   quem copiar mora em `dominio.js` e está coberta pelos testes — o
   redesenho da 4.0 levou junto quem chamava, e só a chamada voltou.
   =================================================================== */
const COPIAVEIS = {
  receitas:  { nome: 'as receitas fixas',  um: 'receita fixa',  copiar: copiarFixasReceitas },
  despesas:  { nome: 'as despesas fixas',  um: 'despesa fixa',  copiar: copiarFixasDespesas },
  devedores: { nome: 'os recorrentes',     um: 'recorrente',    copiar: copiarRecorrentesDevedores },
};

/** Quantos fixos existem lá atrás esperando para serem trazidos. */
function quantosFixosAntes() {
  const a = mesAnterior(estado.ano, estado.mes + 1);
  // O `noMes` daqui de cima só sabe o mês que está na tela. Para
  // olhar o mês passado a comparação é na mão mesmo.
  const laAtras = (data) => {
    if (!data) return false;
    const [ano, mes] = String(data).split('-').map(Number);
    return ano === a.ano && mes === a.mes;
  };
  if (estado.tela === 'devedores') {
    return D.devedores.filter((v) => texto(v.recorrente) === 'sim'
      && laAtras(v.pgtoPrevisto)).length;
  }
  const lista = estado.tela === 'receitas' ? D.receitas : D.despesas;
  return lista.filter((x) => texto(x.fixa) === 'sim' && laAtras(x.data)).length;
}

function fichaDeCopiar() {
  if (!COPIAVEIS[estado.tela]) return '';
  const a = mesAnterior(estado.ano, estado.mes + 1);
  const quantos = quantosFixosAntes();
  if (!quantos) return '';
  return `<button class="ficha" onclick="abrirCopiarFixos()">
    ${icone('copiar',15)} Trazer de ${MESES[a.mes - 1].slice(0,3).toLowerCase()}</button>`;
}

function abrirCopiarFixos() {
  const qual = COPIAVEIS[estado.tela];
  if (!qual) return;
  const a = mesAnterior(estado.ano, estado.mes + 1);
  const rotulo = `${MESES[a.mes - 1].toLowerCase()}`;
  const quantos = quantosFixosAntes();

  mostrarFolha(`
    <div class="folha__titulo">Trazer ${qual.nome} de ${rotulo}</div>
    <p class="explica">
      Achei <b>${quantos} ${quantos === 1 ? qual.um : qual.nome.replace(/^(as|os) /, '')}</b>
      em ${rotulo}. Posso repetir ${quantos === 1 ? 'ela' : 'elas'} aqui em
      ${MESES[estado.mes].toLowerCase()}, no mesmo dia do mês e
      ${estado.tela === 'devedores' ? 'esperando pagamento' : 'como pendente'}.
    </p>
    <p class="explica explica--fraco">
      ${estado.tela === 'despesas'
        ? 'Comprovante e observação não vêm junto, que são da conta antiga.'
        : 'Se você já tinha trazido antes, vai ficar repetido — confere a lista depois.'}
    </p>
    <button class="principal" onclick="copiarFixosAgora()">Pode trazer</button>
    <div class="rodape-form"><button class="secundario" onclick="fecharFolha()">Agora não</button></div>`);
}

function copiarFixosAgora() {
  const qual = COPIAVEIS[estado.tela];
  if (!qual) return;
  const n = qual.copiar(D, estado.ano, estado.mes + 1);
  fecharFolha();
  if (!n) { avisar('Não achei nenhum fixo lá atrás'); return; }
  mexeuNosDados();
  desenhar();
  avisar(n === 1 ? 'Trouxe 1 lançamento' : `Trouxe ${n} lançamentos`);
}

function telaDevedores() {
  const pagos = D.devedores
    .filter((v) => noMes(v.pgtoPrevisto) && texto(statusDevedor(v)) === 'pago')
    .reduce((s, v) => s + (+v.valor || 0), 0);
  return cabecalhoCelular('Devedores') + barraMesCelular() + `
    <div class="resumo">
      <div class="resumo__metade"><div class="rotulo">Já me pagaram</div>
        <div class="resumo__valor resumo__valor--menta dinheiro">${real(pagos)}</div></div>
      <div class="resumo__metade"><div class="rotulo">Ainda me devem</div>
        <div class="resumo__valor resumo__valor--ouro dinheiro">${real(devedoresPendentes())}</div></div>
    </div>
    <div class="busca celular-so" style="margin-bottom:12px">${icone('lupa',17)}
      <input placeholder="Procurar…" value="${escapar(estado.busca)}"
             oninput="estado.busca=this.value; redesenharLista()">
    </div>
    <div id="lista">${linhasDeDevedores()}</div>`;
}

/** Só as linhas de devedores, pelo mesmo motivo do outro. */
function linhasDeDevedores() {
  const busca = texto(estado.busca);
  const itens = D.devedores
    .filter((v) => noMes(v.pgtoPrevisto))
    .filter((v) => combina(v, CAMPOS_BUSCA.devedores, busca))
    .sort((a, b) => (b.pgtoPrevisto || '').localeCompare(a.pgtoPrevisto || ''));
  const barra = `<div class="fichas">${fichaDeCopiar()}</div>`;
  if (!itens.length) {
    if (busca) return `<div class="vazio">Nada com "${escapar(estado.busca)}" aqui.</div>`;
    return barra + `<div class="vazio">Ninguém te devendo em ${MESES[estado.mes].toLowerCase()}.<br>Melhor assim!</div>`;
  }
  return barra + itens.map((v) => {
    const st = statusDevedor(v);
    const cls = st === 'Pago' ? 'selo--ok' : (st === 'Atrasado' ? 'selo--atrasado' : 'selo--pendente');
    return `<div class="item" onclick="abrirDevedor('${v.id}')" role="button" tabindex="0">
      <span class="item__linha1">
        <span class="item__data">${bonito(v.pgtoPrevisto)}</span>
        <button class="selo selo--clicavel ${cls}"
          onclick="event.stopPropagation(); virarDevedor('${v.id}')"
          title="Toca aqui pra marcar como pago">${st}</button>
        <span class="item__valor dinheiro">${real(v.valor)}</span>
      </span>
      <span class="item__nome">${escapar(v.nome)||''}</span>
      <span class="item__cat">${escapar(v.tipo)||''}</span>
    </div>`;
  }).join('');
}

function telaInvestir() {
  const meta = D.config.metaInvestimento || 0;
  const total = totalInvestido();
  const fatia = meta ? Math.min(100, total/meta*100) : 0;
  return cabecalhoCelular('Investir') + barraMesCelular() + `
    <div class="cartao" style="cursor:default;align-items:flex-start;flex-direction:column;gap:10px">
      <span class="rotulo">Sua meta de ${MESES[estado.mes].toLowerCase()}</span>
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <span class="cartao__valor dinheiro" style="margin:0">${real(total)}</span>
        <span style="color:var(--apagado);font-size:13.5px">você já guardou · a meta é ${real(meta)}</span>
      </div>
      <div class="progresso"><div class="progresso__cheio" style="--ate:${fatia}%"></div></div>
      <span style="font-size:12.5px;color:var(--apagado)">${fatia >= 100 ? 'Meta batida!' : `Faltam ${real(Math.max(0, meta-total))}`} · ${fatia.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span>
    </div>
    <div class="titulo-secao">O que foi e o que veio</div>
    ${(() => {
      const itens = listaInvestimento();
      if (!itens.length) return `<div class="vazio">Você ainda não guardou nada.</div>`;
      return itens.map((i) => `
        <div class="item" onclick="abrirInvestimento('${i.id}')" role="button" tabindex="0">
          <span class="item__linha1">
            <span class="item__data">${bonito(i.data)}</span>
            <span class="selo ${i.valor < 0 ? 'selo--pendente' : 'selo--ok'}">${i.categoria}</span>
            <span class="item__valor dinheiro" ${i.valor < 0 ? 'style="color:var(--ouro)"' : ''}>${i.valor < 0 ? '−' : ''}${real(Math.abs(i.valor))}</span>
          </span>
          <span class="item__nome">${escapar(i.descricao)||''}</span>
        </div>`).join('');
    })()}`;
}

function telaPlanta() {
  const seq = sequencia();
  const foram = new Set(D.logAcesso);
  const primeiro = new Date(estado.ano, estado.mes, 1);
  const dias = new Date(estado.ano, estado.mes + 1, 0).getDate();
  const vazios = primeiro.getDay();
  let grade = '<div class="dia" style="background:transparent"></div>'.repeat(vazios);
  for (let d = 1; d <= dias; d++) {
    const data = `${estado.ano}-${String(estado.mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const ehHoje = data === paraISO(hoje());
    grade += `<div class="dia ${foram.has(data)?'dia--foi':''} ${ehHoje?'dia--hoje':''}">${d}</div>`;
  }
  return cabecalhoCelular('Planta') + `
    <div class="planta-palco">
      <div style="display:flex;justify-content:center">${svgDaPlanta(chaveDoEstagio(seq.dias))
        .replace('planta__vaso', 'planta__vaso planta__vaso--grande')}</div>
      <div class="planta-palco__estagio">${estagio(seq.dias)}</div>
      <div class="planta-palco__dias">${seq.dias} dias seguidos · última visita ${bonito(seq.ultimo)}</div>
    </div>
    ${blocoDeEscudos()}
    ${barraMesCelular()}
    <div class="calendario">
      ${['D','S','T','Q','Q','S','S'].map((l)=>`<div style="font-size:11px;color:var(--apagado);text-align:center">${l}</div>`).join('')}
      ${grade}
    </div>`;
}

/* ===================================================================
   Ajustes em seções.

   Era uma página só, rolando sem fim. Agora a primeira tela é uma
   lista de assuntos, e cada um abre a sua. Cada linha já mostra como
   está a coisa, para não obrigar a entrar só pra conferir.
   =================================================================== */
const SECOES_AJUSTES = {
  voce:      { nome: 'Você',            icone: 'gente',      cor: 'menta' },
  inicio:    { nome: 'Tela inicial',    icone: 'casa',       cor: 'verde' },
  aparencia: { nome: 'Aparência',       icone: 'sol',        cor: 'ouro' },
  lembrete:  { nome: 'Lembrete',        icone: 'sino',       cor: 'verde' },
  planta:    { nome: 'A plantinha',     icone: 'planta',     cor: 'verde' },
  banco:     { nome: 'Seu banco',       icone: 'cartao',     cor: 'menta' },
  backup:    { nome: 'Backup',          icone: 'clipe',      cor: 'ouro' },
  sobre:     { nome: 'Sobre o app',     icone: 'ajuda',      cor: 'menta' },
  apagar:    { nome: 'Apagar tudo',     icone: 'fogo',       cor: 'vermelha' },
};

function resumoDaSecao(chave) {
  const c = conexaoGuardada();
  return {
    voce: seuNome(),
    inicio: estado.detalheInicio ? 'Mostrando o que falta entrar e pagar' : 'Só os totais do mês',
    aparencia: `${TEMAS[temaEscolhido()].nome} · ${CORES[visual.cor].nome.toLowerCase()} · ${FUNDOS[visual.fundo].nome.toLowerCase()}`,
    lembrete: lembrete.ligado ? `Todo dia às ${lembrete.hora}` : 'Desligado',
    planta: estado.planta
      ? `${sequencia().dias} dias seguidos · ${escudosDisponiveis(D)} de ${MAX_ESCUDOS} escudos`
      : 'Desligada',
    banco: c && c.ligado ? 'Ligado' : 'Só neste aparelho',
    backup: 'Guardar ou trazer de volta',
    sobre: `Versão ${VERSAO}`,
    apagar: 'Some com tudo e recomeça',
  }[chave];
}

function irNoAjuste(secao) {
  estado.ajuste = secao;
  history.pushState({ dentro: true }, '');
  desenhar();
  window.scrollTo({ top: 0 });
}

/**
 * Os escudos.
 *
 * Eles são o perdão da sequência: cada dez dias seguidos rendem um, e
 * um escudo cobre um dia que você deixou passar. Sem isso, esquecer
 * uma vez depois de dois meses jogava tudo fora, e a pessoa
 * simplesmente desistia.
 *
 * Quem conta é o `planta.js`; aqui só mostramos.
 */
function blocoDeEscudos() {
  const tem = escudosDisponiveis(D);
  const seq = sequencia().dias;
  const faltam = DIAS_POR_ESCUDO - (seq % DIAS_POR_ESCUDO);
  const cheio = tem >= MAX_ESCUDOS;

  const pinos = Array.from({ length: MAX_ESCUDOS }, (_, i) => `
    <span class="escudo ${i < tem ? '' : 'escudo--vazio'}">${svgDoEscudoMini()}</span>`).join('');

  return `<button class="cartao" onclick="explicarEscudos()" style="margin-bottom:12px">
    <span class="escudos">${pinos}</span>
    <span class="cartao__meio">
      <div class="chave__nome">${tem === 0 ? 'Nenhum escudo ainda'
        : tem === 1 ? 'Um escudo guardado' : `${tem} escudos guardados`}</div>
      <div class="chave__sub">${cheio
        ? 'Cheio! Mais que três eu não guardo.'
        : `Faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'} para o próximo`}</div>
    </span>
    <span class="cartao__acao">${icone('ajuda',16)}</span>
  </button>`;
}

function explicarEscudos() {
  const tem = escudosDisponiveis(D);
  mostrarFolha(`
    <div class="folha__titulo">Os escudos</div>
    <p class="explica">
      Escudo é o seu perdão. Se você esquecer de passar aqui um dia, ele
      cobre o buraco e a sua sequência continua de pé, como se nada tivesse
      acontecido.
    </p>
    <div class="conta">
      ${linhaDaConta(`A cada ${DIAS_POR_ESCUDO} dias seguidos`, 1, '+')}
      ${linhaDaConta('Cada dia esquecido gasta', 1, '−')}
      ${linhaDaConta('Mais do que isso eu não guardo', MAX_ESCUDOS, '', true)}
    </div>
    <p class="explica">
      Você tem <b>${tem === 0 ? 'nenhum' : tem}</b> agora.
    </p>
    <p class="explica explica--fraco">
      Eles não são infinitos de propósito: com escudo demais a sequência
      perderia a graça. E se você sumir por mais de ${DIAS_ATE_MORRER} dias, a
      planta morre e os escudos vão junto. Aí é recomeçar do zero mesmo.
    </p>
    <button class="principal" onclick="fecharFolha()">Entendi!</button>`);
}

/**
 * Procurar atualização na hora, a pedido.
 *
 * A conferência automática já acontece toda vez que o app abre, mas
 * quem acabou de saber que saiu versão nova não quer fechar e abrir.
 */
async function procurarAtualizacaoAgora() {
  const recado = $('recadoDaVersao');
  if (recado) recado.textContent = 'Olhando...';
  const { procurarAgora } = await import('./atualizacao.js');
  const r = await procurarAgora();
  const frases = {
    baixando: 'Achei versão nova! Estou baixando.',
    tem: 'Saiu versão nova. Dá uma olhada aqui embaixo.',
    pronta: 'Já tenho a versão nova aqui, esperando.',
    emdia: 'Você já está na mais nova.',
    semrede: 'Não consegui perguntar agora. Sem internet?',
  };
  avisar(frases[r] || frases.emdia);
  if (recado) recado.textContent = frases[r] || 'Eu confiro sozinho toda vez que abro';
  // 'tem' e 'pronta' fazem nascer o botão de baixar, que só existe
  // quando há o que baixar.
  if (r === 'tem' || r === 'pronta') desenhar();
}

/**
 * Baixar e instalar no Android, a pedido.
 *
 * Isto não acontece mais sozinho. O app conferia a versão, baixava o
 * APK calado e abria o instalador na abertura seguinte — e não
 * funcionava, porque o Android ainda pede que a pessoa libere
 * "instalar apps desconhecidos" na mão. Agora o app só avisa, e quem
 * decide é quem toca aqui.
 */
async function baixarVersaoNova() {
  avisar('Baixando…');
  const { baixarEInstalar } = await import('./atualizacao.js');
  const r = await baixarEInstalar();
  avisar(r.recado);
}

function telaAjustes() {
  if (estado.ajuste) return secaoDeAjuste(estado.ajuste);
  return cabecalhoCelular('Ajustes') + `
    <div class="pilha">
      ${Object.entries(SECOES_AJUSTES).map(([chave, s]) => `
        <button class="cartao" onclick="irNoAjuste('${chave}')">
          <span class="pastilha pastilha--${s.cor}">${icone(s.icone)}</span>
          <span class="cartao__meio">
            <div class="chave__nome">${s.nome}</div>
            <div class="chave__sub">${escapar(resumoDaSecao(chave))}</div>
          </span>
          <span class="cartao__acao">${icone('seta',15)}</span>
        </button>`).join('')}
    </div>`;
}

function voltarDosAjustes() {
  estado.ajuste = null;
  desenhar();
  window.scrollTo({ top: 0 });
}

const SUB_APARENCIA = {
  'aparencia/tema':  { nome: 'Claro ou escuro', icone: 'sol',    cor: 'ouro' },
  'aparencia/cor':   { nome: 'Cor do app',      icone: 'gota',   cor: 'menta' },
  'aparencia/fundo': { nome: 'Fundo',           icone: 'quadro', cor: 'verde' },
  'aparencia/fonte': { nome: 'Fonte',           icone: 'letra',  cor: 'ouro' },
};

function fichaDaSecao(chave) {
  return SECOES_AJUSTES[chave] || SUB_APARENCIA[chave];
}

function tituloDaSecao(chave) {
  // Uma sub-seção volta para a lista de Aparência, não para a raiz
  // dos Ajustes: pular dois níveis de uma vez desorienta.
  const pai = chave.includes('/') ? chave.split('/')[0] : null;
  const voltar = pai ? `irNoAjuste('${pai}')` : 'voltarDosAjustes()';
  // O botão só aparece no computador: no celular quem volta é o botão
  // do aparelho, e repetir a função na tela é ocupar espaço à toa.
  return `<div class="voltar voltar--sempre">
    <button class="redondo computador-so" onclick="${voltar}" aria-label="Voltar">${icone('volta',20)}</button>
    <div class="voltar__titulo">${fichaDaSecao(chave).nome}</div>
  </div>`;
}

function secaoDeAjuste(chave) {
  const corpo = {
    voce: () => `
      <div class="campo">
        <div class="campo__nome">Como eu te chamo?</div>
        <input id="campo-nome" value="${escapar(seuNome())}" placeholder="Seu nome"
               onchange="mudarNome(this.value)" maxlength="24">
      </div>
      <p class="explica explica--fraco">É só pra te dar oi na abertura. Nada demais.</p>`,

    inicio: () => `
      <label class="chave">
        <input type="checkbox" ${estado.detalheInicio?'checked':''}
               onchange="mudarDetalheInicio(this.checked)">
        <span class="chave__trilho"><span class="chave__bola"></span></span>
        <span class="chave__texto">
          <div class="chave__nome">Quanto já entrou e quanto ainda falta</div>
          <div class="chave__sub">Aparece dentro dos cartões de Receitas e Despesas</div>
        </span>
      </label>
      <p class="explica explica--fraco">
        É o mesmo par que você já vê lá dentro de Receitas e de Despesas. Aqui
        ele fica na tela inicial, pra você não precisar entrar.
      </p>`,

    aparencia: () => listaDaAparencia(),
    'aparencia/tema': () => parteDoTema(),
    'aparencia/cor': () => parteDaCor(),
    'aparencia/fundo': () => parteDoFundo(),
    'aparencia/fonte': () => parteDaFonte(),

    lembrete: () => `
      <label class="chave">
        <input type="checkbox" ${lembrete.ligado?'checked':''} onchange="mudarLembrete(this.checked)">
        <span class="chave__trilho"><span class="chave__bola"></span></span>
        <span class="chave__texto">
          <div class="chave__nome">Me dá um toque todo dia</div>
          <div class="chave__sub">${lembrete.ligado
            ? `Te chamo às ${lembrete.hora}, se você ainda não tiver passado por aqui`
            : 'Eu só aviso se você esquecer de passar.'}</div>
        </span>
      </label>
      ${lembrete.ligado ? `<div class="campo" style="margin-top:12px">
        <div class="campo__nome">A que horas?</div>
        <input type="time" value="${lembrete.hora}" onchange="mudarHoraDoLembrete(this.value)">
      </div>` : ''}
      <p class="explica explica--fraco">
        Se você já tiver entrado no dia, eu fico quieto. Nada de encher o saco.
      </p>`,

    planta: () => `
      <label class="chave">
        <input type="checkbox" ${estado.planta?'checked':''} onchange="mudarPlanta(this.checked)">
        <span class="chave__trilho"><span class="chave__bola"></span></span>
        <span class="chave__texto">
          <div class="chave__nome">Mostrar a plantinha</div>
          <div class="chave__sub">Se você desligar, ela some da tela inicial e do menu</div>
        </span>
      </label>
      <div class="moldura" style="margin-top:18px">Assim que o atalho fica na sua tela inicial:</div>
      ${desenharWidget()}`,

    banco: () => {
      const c = conexaoGuardada();
      const ligado = Boolean(c && c.ligado);
      return `
      <div class="cartao" style="cursor:default">
        <span class="pastilha ${ligado?'pastilha--verde':'pastilha--ouro'}">${icone(ligado?'subindo':'cartao')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">${ligado ? 'Ligado' : 'Só neste aparelho'}</div>
          <div class="chave__sub">${ligado ? escapar(c.url) : 'Seus dados não saem daqui'}</div>
        </span>
      </div>
      ${ligado ? `
      <div class="recado" id="recadoSincronia">${recadoDaSincronia()}</div>
      <button class="cartao" style="margin-top:10px" onclick="sincronizarPeloBotao()">
        <span class="pastilha pastilha--verde">${icone('atualizar')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Sincronizar agora</div>
          <div class="chave__sub">Sobe o que é daqui e traz o que é de lá</div>
        </span>
      </button>
      <button class="cartao" style="margin-top:10px" onclick="testarBancoDosAjustes()">
        <span class="pastilha pastilha--menta">${icone('check')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Testar a conexão</div>
          <div class="chave__sub">Só confere se o endereço e o token funcionam</div>
        </span>
      </button>` : ''}
      <button class="cartao" style="margin-top:10px" onclick="trocarDeBanco()">
        <span class="pastilha pastilha--ouro">${icone('engrenagem')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">${ligado ? 'Trocar de banco' : 'Ligar um banco'}</div>
          <div class="chave__sub">Para usar o app em mais de um aparelho</div>
        </span>
      </button>
      <p class="explica explica--fraco">
        O banco é seu e eu não vejo o que tem dentro. Ele serve pra você abrir o
        app no celular e no computador com os mesmos lançamentos.
        ${ligado ? 'No celular, puxar a tela inicial para baixo também sincroniza.' : ''}
      </p>`;
    },

    backup: () => `
      <button class="cartao" onclick="baixarBackup()">
        <span class="pastilha pastilha--verde">${icone('desce')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Guardar um backup</div>
          <div class="chave__sub">Baixa um arquivo com tudo que você lançou</div>
        </span>
      </button>
      <button class="cartao" style="margin-top:10px" onclick="pedirBackupParaRestaurar()">
        <span class="pastilha pastilha--ouro">${icone('sobe')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Trazer um backup de volta</div>
          <div class="chave__sub">Eu junto com o que já tem aqui, sem apagar nada</div>
        </span>
      </button>
      <p class="explica explica--fraco">
        Vale guardar um de vez em quando, principalmente antes de trocar de celular.
      </p>`,

    sobre: () => `
      <div class="cartao" style="cursor:default">
        <span class="pastilha pastilha--menta">${icone('subindo')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Versão ${VERSAO}</div>
          <div class="chave__sub" id="recadoDaVersao">${temVersaoNova()
            ? `Saiu a ${escapar(versaoLaFora())}`
            : 'Eu confiro sozinho toda vez que abro'}</div>
        </span>
      </div>
      ${temVersaoNova() && noCelular() ? `
      <button class="cartao" style="margin-top:10px" onclick="baixarVersaoNova()">
        <span class="pastilha pastilha--verde">${icone('atualizar')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Baixar a ${escapar(versaoLaFora())}</div>
          <div class="chave__sub">Eu trago o arquivo e o Android pergunta se pode instalar</div>
        </span>
      </button>` : ''}
      <button class="cartao" style="margin-top:10px" onclick="procurarAtualizacaoAgora()">
        <span class="pastilha pastilha--ouro">${icone('atualizar')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Procurar agora</div>
          <div class="chave__sub">Se acabou de sair versão nova e você não quer esperar</div>
        </span>
      </button>
      ${noCelular() ? `<p class="explica explica--fraco">
        No celular eu não instalo nada sozinho: eu só te aviso, e você decide.
        Na primeira vez o Android ainda vai te pedir pra liberar "instalar apps
        desconhecidos" — é uma vez só.
      </p>` : ''}
      <div class="cartao" style="cursor:default;margin-top:10px">
        <span class="pastilha pastilha--ouro">${icone('cartao')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">${D.receitas.length} receitas · ${D.despesas.length} despesas</div>
          <div class="chave__sub">${D.devedores.length} devedores · ${listaInvestimento().length} no investimento</div>
        </span>
      </div>`,

    apagar: () => `
      <p class="explica">
        Aqui é onde tudo some. Não tem desfazer, e eu vou te perguntar três vezes
        antes de fazer.
      </p>
      <button class="cartao" onclick="apagarTudoPasso1()">
        <span class="pastilha pastilha--vermelha">${icone('fogo')}</span>
        <span class="cartao__meio">
          <div class="chave__nome">Apagar tudo e fingir que nada aconteceu</div>
          <div class="chave__sub">Some com tudo e começa do zero</div>
        </span>
      </button>`,
  }[chave];
  let dentro = '';
  try {
    // Todo o conteúdo de uma seção vai dentro de um painel: sem ele,
    // título e botão ficam soltos sobre o papel de parede e somem.
    dentro = corpo ? `<div class="painel">${corpo()}</div>` : '';
  } catch (e) {
    // Sem isto, um erro aqui deixaria a tela em branco e sem saída.
    console.error('Ajustes:', e);
    dentro = `<div class="vazio">Essa parte deu problema aqui.<br>
      <span style="font-size:12px">${escapar(e.message)}</span></div>`;
  }
  return tituloDaSecao(chave) + dentro;
}


/* ---------------- detalhe (computador) ---------------- */
function achar(id) {
  return D.receitas.find((x)=>x.id===id) || D.despesas.find((x)=>x.id===id) || null;
}

/* ===================================================================
   Os campos são os mesmos do app, nos mesmos grupos: Lançamento,
   Classificação, Repetição e Complementos. Antes eu tinha cortado
   metade deles e a tela ficou capenga.
   =================================================================== */
const LISTAS = {
  statusReceita: ['Recebido', 'Pendente'],
  statusDespesa: ['Pago', 'Pendente', 'Aguardando'],
  categoriaReceita: ['Renda fixa', 'Renda extra', 'Presente', 'Investimento', 'Empréstimo'],
  categoriaDespesa: ['Moradia','Transporte','Alimentação','Saúde','Serviço','Vestuário',
                     'Educação','Lazer','Imprevistos','Investimentos','Empréstimo','Outros'],
  formaPgto: ['Dinheiro','Cartão de Crédito','Cartão de Débito','Pix','Poupança'],
  tipoDevedor: ['Empréstimo','Streaming','Venda','Serviço','Outros'],
  formaDevedor: ['Pix','Dinheiro','Abatido'],
};

const escapar = (t) => String(t == null ? '' : t)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function seletor(id, opcoes, atual, vazio) {
  const fora = atual && !opcoes.includes(atual) ? [atual] : [];
  return `<select id="${id}">
    ${vazio ? `<option value="" ${!atual?'selected':''}>${vazio}</option>` : ''}
    ${[...opcoes, ...fora].map((o) => `<option ${texto(o)===texto(atual)?'selected':''}>${escapar(o)}</option>`).join('')}
  </select>`;
}

function fichasDeStatus(id, opcoes, atual, bom) {
  return `<div class="escolhas" id="${id}">
    ${opcoes.map((o) => `<button ${o===bom?'data-bom':''} class="${texto(o)===texto(atual)?'ativo':''}"
      onclick="escolher(this)">${o}</button>`).join('')}
  </div>`;
}

function simNao(id, atual) {
  const sim = texto(atual) === 'sim';
  return `<div class="duo" id="${id}">
    <button class="${sim?'ativo':''}" onclick="escolher(this)">Sim</button>
    <button class="${sim?'':'ativo'}" onclick="escolher(this)">Não</button>
  </div>`;
}

function anexo(id, valor) {
  const tem = !!valor;
  return `<button type="button" class="anexo ${tem?'anexo--cheio':''}" id="${id}"
    onclick="avisar('No app de verdade eu abro seus arquivos aqui')">
    ${icone('clipe',18)} ${tem ? 'Comprovante guardado' : 'Quer anexar o comprovante?'}
  </button>`;
}

/** Formulário de receita ou despesa, com todos os campos. */
function formulario(x, recebe, pre, semValor) {
  const st = recebe ? LISTAS.statusReceita : LISTAS.statusDespesa;
  return `
    <div class="secao-form__nome">Lançamento</div>
    ${semValor ? `<div class="campo">
        <div class="campo__nome">Quando foi?</div>
        <input id="${pre}-data" type="date" value="${x.data||''}">
      </div>` : `<div class="meia">
      <div class="campo">
        <div class="campo__nome">Quando foi?</div>
        <input id="${pre}-data" type="date" value="${x.data||''}">
      </div>
      <div class="campo">
        <div class="campo__nome">Quanto?</div>
        <input id="${pre}-valor" class="dinheiro" inputmode="decimal"
               value="${(Number(x.valor)||0).toFixed(2).replace('.',',')}">
      </div>
    </div>`}
    <div class="campo">
      <div class="campo__nome">O que foi?</div>
      <input id="${pre}-desc" value="${escapar(x.descricao)}" placeholder="Mercado, salário, uber…">
    </div>
    <div class="campo">
      <div class="campo__nome">Como está?</div>
      ${fichasDeStatus(pre+'-situacao', st, x.status, recebe ? 'Recebido' : 'Pago')}
    </div>

    <div class="secao-form__nome">Classificação</div>
    <div class="campo">
      <div class="campo__nome">É do tipo…</div>
      ${seletor(pre+'-cat', recebe ? LISTAS.categoriaReceita : LISTAS.categoriaDespesa, x.categoria, 'Nenhuma')}
    </div>
    <div class="campo">
      <div class="campo__nome">${recebe ? 'Veio de quem?' : 'Pagou como?'}</div>
      ${recebe
        ? `<input id="${pre}-origem" value="${escapar(x.origem)}" placeholder="Nome de quem te pagou">`
        : seletor(pre+'-forma', LISTAS.formaPgto, x.formaPgto, 'Nenhuma')}
    </div>

    <div class="secao-form__nome">Repetição</div>
    <div class="campo">
      <div class="campo__nome">Isso se repete todo mês?</div>
      ${simNao(pre+'-fixa', x.fixa)}
    </div>

    <div class="secao-form__nome">Complementos</div>
    <div class="campo">${anexo(pre+'-comprovante', x.comprovante)}</div>
    <div class="campo">
      <div class="campo__nome">Quer anotar mais alguma coisa?</div>
      <textarea id="${pre}-obs" placeholder="Fica só pra você">${escapar(x.observacao)}</textarea>
    </div>`;
}

/** Formulário de devedor. */
function formularioDevedor(v, pre) {
  return `
    <div class="secao-form__nome">A dívida</div>
    <div class="campo">
      <div class="campo__nome">Quem te deve?</div>
      <input id="${pre}-nome" value="${escapar(v.nome)}" placeholder="Nome da pessoa">
    </div>
    <div class="meia">
      <div class="campo">
        <div class="campo__nome">Quanto?</div>
        <input id="${pre}-valor" class="dinheiro" value="${(Number(v.valor)||0).toFixed(2).replace('.',',')}">
      </div>
      <div class="campo">
        <div class="campo__nome">Vence quando?</div>
        <input id="${pre}-venc" type="date" value="${v.pgtoPrevisto||''}">
      </div>
    </div>
    <div class="campo">
      <div class="campo__nome">Por causa de quê?</div>
      ${seletor(pre+'-tipo', LISTAS.tipoDevedor, v.tipo, 'Nenhum')}
    </div>

    <div class="secao-form__nome">Quitação</div>
    <div class="meia">
      <div class="campo">
        <div class="campo__nome">Pagou quando?</div>
        <input id="${pre}-pagou" type="date" value="${v.pagouEm && v.pagouEm!=='-' ? v.pagouEm : ''}">
      </div>
      <div class="campo">
        <div class="campo__nome">Pagou como?</div>
        ${seletor(pre+'-comopagou', LISTAS.formaDevedor, v.formaPgto, 'Nenhuma')}
      </div>
    </div>
    <div class="campo">
      <div class="campo__nome">Te deve todo mês?</div>
      ${simNao(pre+'-recorrente', v.recorrente)}
    </div>
    <div class="campo">
      <div class="campo__nome">Você perdoou a dívida?</div>
      ${simNao(pre+'-perdoado', v.pagouEm === '-' ? 'Sim' : 'Não')}
    </div>

    <div class="secao-form__nome">Complementos</div>
    <div class="campo">${anexo(pre+'-comprovante', v.comprovante)}</div>
    <div class="campo">
      <div class="campo__nome">Quer anotar mais alguma coisa?</div>
      <textarea id="${pre}-obs">${escapar(v.observacao)}</textarea>
    </div>`;
}

function escolher(b) {
  b.parentElement.querySelectorAll('button').forEach((o)=>o.classList.remove('ativo'));
  b.classList.add('ativo');
}

function abrir(id) {
  estado.escolhido = id;
  const x = achar(id);
  const recebe = D.receitas.includes(x);
  mostrarFolha(`
    <div class="folha__titulo">${x.descricao||'Lançamento'}</div>
    ${formulario(x, recebe, 'fol')}
    <button class="principal" onclick="salvar('fol')">Pode salvar</button>
    <div class="rodape-form">
      <button class="secundario" onclick="fecharFolha()">Deixa pra lá</button>
      <button class="apagar" onclick="excluir('${x.id}')">Apagar</button>
    </div>`);
}

function pegar(id) { const e = $(id); return e ? e.value : ''; }
function pegarEscolha(id) { const e = document.querySelector('#' + id + ' .ativo'); return e ? e.textContent : ''; }
function pegarValor(id) { return Number(String(pegar(id)).replace(/\./g,'').replace(',','.')) || 0; }

function salvar(pre) {
  const x = achar(estado.escolhido);
  if (!x) return;
  const recebe = D.receitas.includes(x);
  x.data = pegar(pre+'-data');
  x.valor = pegarValor(pre+'-valor');
  x.descricao = pegar(pre+'-desc');
  x.status = pegarEscolha(pre+'-situacao') || x.status;
  x.categoria = pegar(pre+'-cat');
  if (recebe) x.origem = pegar(pre+'-origem'); else x.formaPgto = pegar(pre+'-forma');
  x.fixa = pegarEscolha(pre+'-fixa');
  x.observacao = pegar(pre+'-obs');
  fecharFolha();
  estado.escolhido = null;
  mexeuNosDados();
  desenhar();
  avisar('Pronto, salvei');
}

function salvarDevedor(pre) {
  const v = D.devedores.find((d) => d.id === estado.escolhido);
  if (!v) return;
  v.nome = pegar(pre+'-nome');
  v.valor = pegarValor(pre+'-valor');
  v.pgtoPrevisto = pegar(pre+'-venc');
  v.tipo = pegar(pre+'-tipo');
  v.formaPgto = pegar(pre+'-comopagou');
  v.recorrente = pegarEscolha(pre+'-recorrente');
  v.observacao = pegar(pre+'-obs');
  // "Perdoado" é guardado como um traço no campo de pagamento, é
  // assim que o app faz, para distinguir de quem simplesmente pagou.
  v.pagouEm = pegarEscolha(pre+'-perdoado') === 'Sim' ? '-' : pegar(pre+'-pagou');
  fecharFolha();
  estado.escolhido = null;
  mexeuNosDados();
  desenhar();
  avisar('Pronto, salvei');
}

function abrirDevedor(id) {
  estado.escolhido = id;
  const v = D.devedores.find((d) => d.id === id);
  mostrarFolha(`
    <div class="folha__titulo">${escapar(v.nome) || 'Devedor'}</div>
    ${formularioDevedor(v, 'dev')}
    <button class="principal" onclick="salvarDevedor('dev')">Pode salvar</button>
    <div class="rodape-form">
      <button class="secundario" onclick="fecharFolha()">Deixa pra lá</button>
      <button class="apagar" onclick="excluirDevedor('${id}')">Apagar</button>
    </div>`);
}

function excluirDevedor(id) {
  const i = D.devedores.findIndex((d) => d.id === id);
  if (i >= 0) D.devedores.splice(i, 1);
  fecharFolha(); estado.escolhido = null; mexeuNosDados(); desenhar(); avisar('Apaguei');
}

function excluir(id) {
  for (const lista of [D.receitas, D.despesas]) {
    const i = lista.findIndex((x)=>x.id===id);
    if (i >= 0) { lista.splice(i,1); break; }
  }
  fecharFolha();
  estado.escolhido = null;
  mexeuNosDados();
  desenhar();
  avisar('Apaguei');
}

/* ---------------- novo lançamento ---------------- */
let tipoNovo = 'receita';

/**
 * O botão de adicionar não é o mesmo em toda tela.
 *
 * Em Despesas ele só lança despesa; em Receitas, só receita. Em
 * Investimento ele abre as três operações que existem lá, como no app
 * original. Assim ninguém lança uma receita sem querer estando na
 * tela de despesas.
 */
function abrirNovo() {
  if (estado.tela === 'devedores') return abrirNovoDevedor();
  if (estado.tela === 'investir') return abrirMenuInvestir();
  if (estado.tela === 'despesas') tipoNovo = 'despesa';
  else if (estado.tela === 'receitas') tipoNovo = 'receita';
  else tipoNovo = 'receita';
  desenharNovo();
  setTimeout(() => $('valor-novo')?.focus(), 480);
}

function trocarTipoNovo(t) {
  tipoNovo = t;
  desenharNovo();
}

function desenharNovo() {
  const recebe = tipoNovo === 'receita';
  // Só na tela inicial a pessoa escolhe entre entrada e saída: nas
  // outras, a tela já disse o que é.
  const podeEscolherTipo = estado.tela === 'inicio';
  const vazio = { data: `${estado.ano}-${String(estado.mes+1).padStart(2,'0')}-${String(hoje().getDate()).padStart(2,'0')}`, status: 'Pendente', fixa: 'Não' };
  mostrarFolha(`
    <div class="folha__titulo">${podeEscolherTipo ? 'O que aconteceu?' : (recebe ? 'Entrou dinheiro' : 'Saiu dinheiro')}</div>
    ${podeEscolherTipo ? `<div class="duo" style="margin-bottom:4px">
      <button class="${recebe?'ativo':''}" onclick="trocarTipoNovo('receita')">Entrou dinheiro</button>
      <button class="${recebe?'':'ativo'}" onclick="trocarTipoNovo('despesa')">Saiu dinheiro</button>
    </div>` : ''}
    <div class="valorao">
      <span class="valorao__moeda">R$</span>
      <input class="valorao__numero dinheiro" id="valor-novo" inputmode="numeric"
             placeholder="0,00" value="" autocomplete="off">
      <div class="valorao__dica">vai digitando, eu começo pelos centavos</div>
    </div>
    ${formulario(vazio, recebe, 'novo', true)}
    <button class="principal" onclick="gravarNovo()">Pode salvar</button>
    <div class="rodape-form">
      <button class="secundario" onclick="fecharFolha()">Deixa pra lá</button>
    </div>`);
}

function gravarNovo() {
  const recebe = tipoNovo === 'receita';
  const item = {
    id: novoId(recebe ? 'r' : 'd', recebe ? D.receitas : D.despesas),
    data: pegar('novo-data'),
    valor: pegarValor('valor-novo'),
    descricao: pegar('novo-desc') || '(sem descrição)',
    status: pegarEscolha('novo-situacao') || 'Pendente',
    categoria: pegar('novo-cat'),
    fixa: pegarEscolha('novo-fixa'),
    observacao: pegar('novo-obs'),
  };
  if (recebe) { item.origem = pegar('novo-origem'); D.receitas.push(item); }
  else { item.formaPgto = pegar('novo-forma'); D.despesas.push(item); }
  const [a, m] = item.data.split('-').map(Number);
  estado.ano = a; estado.mes = m - 1;
  fecharFolha();
  mexeuNosDados();
  desenhar();
  avisar(recebe ? 'Anotei essa entrada' : 'Anotei esse gasto');
}

function abrirNovoDevedor() {
  estado.escolhido = null;
  const vazio = { pgtoPrevisto: `${estado.ano}-${String(estado.mes+1).padStart(2,'0')}-${String(hoje().getDate()).padStart(2,'0')}`, recorrente: 'Não' };
  mostrarFolha(`
    <div class="folha__titulo">Quem ficou te devendo?</div>
    ${formularioDevedor(vazio, 'novodev')}
    <button class="principal" onclick="gravarNovoDevedor()">Pode salvar</button>
    <div class="rodape-form"><button class="secundario" onclick="fecharFolha()">Deixa pra lá</button></div>`);
}

function gravarNovoDevedor() {
  D.devedores.push({
    id: novoId('v', D.devedores),
    nome: pegar('novodev-nome') || '(sem nome)',
    valor: pegarValor('novodev-valor'),
    pgtoPrevisto: pegar('novodev-venc'),
    tipo: pegar('novodev-tipo'),
    formaPgto: pegar('novodev-comopagou'),
    recorrente: pegarEscolha('novodev-recorrente'),
    observacao: pegar('novodev-obs'),
    pagouEm: pegarEscolha('novodev-perdoado') === 'Sim' ? '-' : pegar('novodev-pagou'),
  });
  fecharFolha(); mexeuNosDados(); desenhar(); avisar('Anotei quem te deve');
}

/* ===================================================================
   Investimento: três operações, como no app original.

   Elas não são lançamentos soltos, cada uma cai onde tem que cair:
     Aporte    vira uma DESPESA de categoria "Investimentos"
     Retirada  vira uma RECEITA de categoria "Investimento", origem "Retirada"
     Rendimento é o único que mora na própria aba, porque esse dinheiro
                não passa pela conta.
   =================================================================== */
function abrirMenuInvestir() {
  mostrarFolha(`
    <div class="folha__titulo">O que rolou?</div>
    <div class="pilha" style="margin-bottom:8px">
      <button class="cartao" onclick="operacaoInvestir('aporte')">
        <span class="pastilha pastilha--menta">${icone('desce')}</span>
        <span class="cartao__meio">
          <span class="chave__nome">Guardei um dinheiro</span>
          <span class="chave__sub">Sai da sua conta e vai pro investimento</span>
        </span>
      </button>
      <button class="cartao" onclick="operacaoInvestir('retirada')">
        <span class="pastilha pastilha--ouro">${icone('sobe')}</span>
        <span class="cartao__meio">
          <span class="chave__nome">Peguei de volta</span>
          <span class="chave__sub">Sai do investimento e cai na sua conta</span>
        </span>
      </button>
      <button class="cartao" onclick="operacaoInvestir('rendimento')">
        <span class="pastilha pastilha--verde">${icone('subindo')}</span>
        <span class="cartao__meio">
          <span class="chave__nome">Rendeu</span>
          <span class="chave__sub">O que o dinheiro fez sozinho, sem você mexer</span>
        </span>
      </button>
    </div>`);
}

function operacaoInvestir(qual) {
  const hojeIso = paraISO(hoje());
  const titulos = { aporte: 'Guardar um dinheiro', retirada: 'Pegar de volta', rendimento: 'O que rendeu' };
  const dicas = {
    aporte: 'Eu lanço em Despesas pra você, já como pago.',
    retirada: 'Eu lanço em Receitas pra você, já como recebido.',
    rendimento: 'Esse fica só aqui, porque o dinheiro nem passou pela sua conta.',
  };
  mostrarFolha(`
    <div class="folha__titulo">${titulos[qual]}</div>
    <div class="valorao">
      <span class="valorao__moeda">R$</span>
      <input class="valorao__numero dinheiro" id="valor-novo" inputmode="numeric"
             placeholder="0,00" value="" autocomplete="off">
      <div class="valorao__dica">${dicas[qual]}</div>
    </div>
    <div class="campo">
      <div class="campo__nome">Quando foi?</div>
      <input id="inv-data" type="date" value="${hojeIso}">
    </div>
    <div class="campo">
      <div class="campo__nome">Descrição</div>
      <input id="inv-desc" value="${qual === 'rendimento' ? 'Rendimento' : ''}"
             placeholder="${qual === 'aporte' ? 'ex: Reserva' : 'ex: Nuvem'}">
    </div>
    ${qual !== 'rendimento' ? `<div class="campo">
      <div class="campo__nome">${qual === 'aporte' ? 'Pagou como?' : 'Recebeu como?'}</div>
      ${seletor('inv-forma', LISTAS.formaPgto, 'Pix')}
    </div>` : ''}
    <button class="principal" onclick="gravarInvestir('${qual}')">Pode salvar</button>
    <div class="rodape-form"><button class="secundario" onclick="fecharFolha()">Deixa pra lá</button></div>`);
  setTimeout(() => $('valor-novo')?.focus(), 480);
}

function gravarInvestir(qual) {
  const valor = pegarValor('valor-novo');
  if (valor <= 0) { avisar('Falta me dizer quanto'); return; }
  const data = pegar('inv-data');
  const descricao = pegar('inv-desc') || titulosPadrao(qual);

  // A trava do app: não dá para retirar mais do que existe guardado.
  if (qual === 'retirada' && valor > totalInvestido()) {
    avisar('Opa, você só tem ' + real(totalInvestido()) + ' guardado');
    return;
  }

  if (qual === 'aporte') {
    D.despesas.push({ id: 'd-'+Math.random().toString(36).slice(2,10), data, valor, descricao,
      status: 'Pago', categoria: 'Investimentos', formaPgto: pegar('inv-forma'), fixa: 'Não' });
    // Nada é gravado na aba de investimento: ela lê a despesa acima.
    avisar('Guardei! Saiu da conta como despesa');
  } else if (qual === 'retirada') {
    D.receitas.push({ id: 'r-'+Math.random().toString(36).slice(2,10), data, valor, descricao,
      status: 'Recebido', categoria: 'Investimento', origem: 'Retirada', fixa: 'Não' });
    avisar('Tirei do investimento e caiu na conta');
  } else {
    D.investimento.push({ id: 'i-'+Math.random().toString(36).slice(2,10), data, valor, descricao, categoria: 'Rendimento' });
    avisar('Anotei o que rendeu');
  }
  fecharFolha();
  mexeuNosDados();
  desenhar();
}

const titulosPadrao = (qual) =>
  qual === 'aporte' ? 'Aporte' : (qual === 'retirada' ? 'Retirada' : 'Rendimento');

/**
 * Abrir um lançamento do investimento.
 *
 * Aporte e retirada não moram aqui: eles são a despesa e a receita
 * que os originaram. Então editar ou apagar mexe no lançamento de
 * verdade, na aba dele. O rendimento é o único que é daqui mesmo.
 */
function abrirInvestimento(id) {
  const tipo = id.slice(0, 2);      // ap: / rt: / rd:
  const idReal = id.slice(3);

  if (tipo !== 'rd') {
    const x = achar(idReal);
    if (!x) return;
    const naDespesa = D.despesas.includes(x);
    mostrarFolha(`
      <div class="folha__titulo">${escapar(x.descricao) || (naDespesa ? 'Aporte' : 'Retirada')}</div>
      <p class="explica explica--fraco">
        Esse lançamento mora em ${naDespesa ? 'Despesas' : 'Receitas'}. O que você mudar aqui
        muda lá também.
      </p>
      ${formulario(x, !naDespesa, 'fol')}
      <button class="principal" onclick="salvar('fol')">Pode salvar</button>
      <div class="rodape-form">
        <button class="secundario" onclick="fecharFolha()">Deixa pra lá</button>
        <button class="apagar" onclick="excluir('${idReal}')">Apagar</button>
      </div>`);
    estado.escolhido = idReal;
    return;
  }

  const r = D.investimento.find((i) => i.id === idReal);
  if (!r) return;
  mostrarFolha(`
    <div class="folha__titulo">${escapar(r.descricao) || 'Rendimento'}</div>
    <p class="explica explica--fraco">
      Esse dinheiro não passou pela sua conta, então ele fica só aqui.
    </p>
    <div class="meia">
      <div class="campo">
        <div class="campo__nome">Quando foi?</div>
        <input id="rd-data" type="date" value="${r.data||''}">
      </div>
      <div class="campo">
        <div class="campo__nome">Quanto?</div>
        <input id="rd-valor" class="dinheiro" inputmode="numeric"
               value="${(Number(r.valor)||0).toFixed(2).replace('.',',')}">
      </div>
    </div>
    <div class="campo">
      <div class="campo__nome">O que foi?</div>
      <input id="rd-desc" value="${escapar(r.descricao)}">
    </div>
    <button class="principal" onclick="salvarRendimento('${idReal}')">Pode salvar</button>
    <div class="rodape-form">
      <button class="secundario" onclick="fecharFolha()">Deixa pra lá</button>
      <button class="apagar" onclick="apagarRendimento('${idReal}')">Apagar</button>
    </div>`);
}

function salvarRendimento(id) {
  const r = D.investimento.find((i) => i.id === id);
  if (!r) return;
  r.data = pegar('rd-data');
  r.valor = pegarValor('rd-valor');
  r.descricao = pegar('rd-desc');
  fecharFolha(); mexeuNosDados(); desenhar(); avisar('Pronto, salvei');
}

function apagarRendimento(id) {
  const i = D.investimento.findIndex((x) => x.id === id);
  if (i >= 0) D.investimento.splice(i, 1);
  fecharFolha(); mexeuNosDados(); desenhar(); avisar('Apaguei');
}

/* ---------------- parcelar ---------------- */
function abrirParcelar() {
  const emReceitas = estado.tela === 'receitas';
  mostrarFolha(`
    <div class="folha__titulo">Comprou parcelado?</div>
    <div class="secao-form__nome">Onde e quando</div>
    <div class="campo">
      <div class="campo__nome">Isso é…</div>
      <div class="duo" id="par-destino">
        <button class="${emReceitas?'ativo':''}" onclick="escolher(this)">Receitas</button>
        <button class="${emReceitas?'':'ativo'}" onclick="escolher(this)">Despesas</button>
      </div>
    </div>
    <div class="meia">
      <div class="campo">
        <div class="campo__nome">A primeira cai quando?</div>
        <input id="par-data" type="date" value="${estado.ano}-${String(estado.mes+1).padStart(2,'0')}-05">
      </div>
      <div class="campo">
        <div class="campo__nome">Em quantas vezes?</div>
        <input id="par-qtd" type="number" min="2" max="60" value="12">
      </div>
    </div>
    <div class="secao-form__nome">Valor e classificação</div>
    <div class="campo">
      <div class="campo__nome">Quanto é cada uma?</div>
      <input id="par-valor" class="dinheiro" inputmode="decimal" value="0,00">
    </div>
    <div class="campo">
      <div class="campo__nome">Descrição</div>
      <input id="par-desc" placeholder="ex: Notebook">
    </div>
    <div class="campo">
      <div class="campo__nome">É do tipo…</div>
      ${seletor('par-cat', LISTAS.categoriaDespesa, 'Outros')}
    </div>
    <div class="campo">
      <div class="campo__nome">Pagou como?</div>
      ${seletor('par-forma', LISTAS.formaPgto, 'Cartão de Crédito')}
    </div>
    <div class="campo">
      <div class="campo__nome">Quer anotar mais alguma coisa?</div>
      <textarea id="par-obs"></textarea>
    </div>
    <button class="principal" onclick="gravarParcelas()">Pode lançar</button>
    <div class="rodape-form"><button class="secundario" onclick="fecharFolha()">Deixa pra lá</button></div>`);
}

function gravarParcelas() {
  const paraReceitas = pegarEscolha('par-destino') === 'Receitas';
  const quantas = Math.max(1, Math.min(60, Number(pegar('par-qtd')) || 1));
  const valor = pegarValor('par-valor');
  const desc = pegar('par-desc') || 'Parcela';
  const inicio = new Date(pegar('par-data') + 'T00:00:00');
  for (let i = 0; i < quantas; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, inicio.getDate());
    const item = {
      id: novoId(paraReceitas ? 'r' : 'd', paraReceitas ? D.receitas : D.despesas),
      data: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      valor, descricao: `${desc} (${i+1}/${quantas})`, status: 'Pendente',
      categoria: pegar('par-cat'), fixa: 'Não', observacao: pegar('par-obs'),
    };
    if (paraReceitas) D.receitas.push(item);
    else { item.formaPgto = pegar('par-forma'); D.despesas.push(item); }
  }
  fecharFolha(); mexeuNosDados(); desenhar();
  avisar(`Pronto, lancei as ${quantas} parcelas`);
}

/**
 * Máscara de dinheiro, a mesma do `ligarMascaraValor` do app: o campo
 * guarda só algarismos e se reescreve enchendo dos centavos para a
 * esquerda. Digitar 1234 mostra 12,34.
 *
 * Antes o número grande era um texto que escutava o teclado da página
 * inteira. No celular passava, mas no computador o foco ficava
 * escapando: com o cursor dentro de um campo, o valor parava de
 * responder. Campo de verdade resolve, dá para clicar, usar Tab e
 * digitar como em qualquer outro.
 */
function ligarMascaraValor(input) {
  if (!input || input.dataset.mascara) return;
  input.dataset.mascara = 'sim';
  const aplicar = () => {
    const digitos = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(-12);
    const centavos = digitos ? parseInt(digitos, 10) : 0;
    input.value = digitos
      ? (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';
    input.setSelectionRange(input.value.length, input.value.length);
  };
  input.addEventListener('input', aplicar);
  input.addEventListener('focus', () => {
    // Ao focar, o cursor vai para o fim: é ali que a máscara escreve.
    setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
  });
}

/** Liga a máscara em todo campo de dinheiro de um pedaço da tela. */
function ligarMascaras(onde) {
  (onde || document).querySelectorAll('input.dinheiro').forEach(ligarMascaraValor);
}

/* ===================================================================
   A tela de entrada.

   O app não cobra nada e não tem anúncio, então não existe servidor
   pago esperando por ninguém: cada pessoa liga o seu próprio banco,
   que é de graça no Turso. A tela conta isso na lata em vez de fingir
   que existe uma conta nossa.
   =================================================================== */
/**
 * Quem responde se o banco está ligado é o próprio módulo de
 * sincronia: é ele que guarda endereço e token, e é ele que sobe e
 * baixa. Esta tela só pergunta e escreve lá.
 *
 * O "só neste aparelho" é uma escolha explícita, guardada à parte,
 * para a tela de conexão não voltar a aparecer toda abertura para
 * quem já disse que não quer banco nenhum.
 */
/* ---------------- a sincronia na tela ----------------
   A regra aqui é uma só: nada de falha calada. A sincronia já ficou
   quatro versões quebrada porque o erro ia para o console, e console
   ninguém abre no celular. Agora todo resultado vira texto na seção
   Banco, e o que o botão dispara vira também um aviso na tela.
   ------------------------------------------------------------------ */
function recadoDaSincronia() {
  const e = estadoDaSincronia();
  if (!e.ligada) return 'Desligada: seus dados ficam só aqui.';
  if (e.rodando) return 'Sincronizando…';
  if (e.recado) return escapar(e.recado);
  return e.em ? `Última vez ${contarTempo(e.em)}.` : 'Ainda não sincronizou nenhuma vez.';
}

function pintarRecadoDaSincronia() {
  const alvo = $('recadoSincronia');
  if (!alvo) return;
  const e = estadoDaSincronia();
  alvo.textContent = '';
  alvo.innerHTML = recadoDaSincronia();
  alvo.classList.toggle('recado--bom', e.tom === 'bom');
  alvo.classList.toggle('recado--ruim', e.tom === 'ruim');
}
quandoSincroniaMudar(pintarRecadoDaSincronia);

async function sincronizarPeloBotao() {
  avisar('Sincronizando…');
  const r = await sincronizarAgora();
  avisar(r.recado || (r.ok ? 'Pronto' : 'Não rolou'));
}

async function testarBancoDosAjustes() {
  const { url, token } = lerConfiguracao();
  avisar('Conferindo…');
  const r = await testarConexao(url, token);
  avisar(r.ok ? 'Conexão certa, pode sincronizar' : `Não deu: ${r.erro}`);
}

/**
 * O aviso de puxar-para-sincronizar. Quem mede o dedo é o
 * sincroniaApp; aqui só se desenha o que ele manda.
 */
export function mostrarPuxao(distancia, pronto) {
  let el = $('puxao');
  if (!el) {
    el = document.createElement('div');
    el.id = 'puxao';
    el.className = 'puxao';
    document.body.appendChild(el);
  }
  if (!distancia) { el.classList.remove('puxao--visivel'); return; }
  el.classList.add('puxao--visivel');
  el.style.setProperty('--puxada', `${distancia}px`);
  el.textContent = pronto ? 'Solta que eu sincronizo' : 'Puxa mais um pouco';
}

function conexaoGuardada() {
  if (estaLigada()) {
    const c = lerConfiguracao();
    return { ligado: true, url: c.url };
  }
  return lerGuardado('cf:soAqui', false) ? { local: true } : null;
}

function mostrarEntrada() {
  const e = $('entrada');
  e.hidden = false;
  e.innerHTML = `
    <div class="entrada__meio">
      <div class="entrada__marca">$</div>
      <div class="entrada__titulo">Oi! Vamos ligar o seu banco?</div>
      <p class="entrada__conversa">
        Esse app é de graça e não tem anúncio, então eu não tenho onde guardar
        o seu dinheiro. <b>Você monta o seu próprio banco</b>, que também é de
        graça, e ele fica só seu. Eu nem consigo ver o que tem dentro.
      </p>

      <div class="entrada__passo">
        <span class="entrada__numero">1</span>
        <p>Entra no <b>turso.tech</b> e cria uma conta. Leva um minuto e não pede cartão.</p>
      </div>
      <div class="entrada__passo">
        <span class="entrada__numero">2</span>
        <p>Cria um banco novo. Pode dar o nome que quiser.</p>
      </div>
      <div class="entrada__passo">
        <span class="entrada__numero">3</span>
        <p>Copia o <b>endereço</b> e o <b>token</b> que aparecem lá e cola aqui embaixo.</p>
      </div>

      <div class="campo" style="margin-top:18px">
        <div class="campo__nome">Como eu te chamo?</div>
        <input id="con-nome" placeholder="Seu nome" value="${escapar(seuNome())}" maxlength="24" autocomplete="off">
      </div>
      <div class="campo">
        <div class="campo__nome">Endereço do banco</div>
        <input id="con-url" placeholder="https://meu-banco.turso.io" autocomplete="off">
      </div>
      <div class="campo">
        <div class="campo__nome">Token</div>
        <input id="con-token" placeholder="cola aqui o token" autocomplete="off">
      </div>
      <button class="principal" onclick="conectar()">Ligar meu banco</button>

      <div class="entrada__ou">ou</div>
      <button class="secundario" style="width:100%" onclick="usarSoNesteAparelho()">
        Deixa pra depois, quero usar só aqui
      </button>
      <p class="entrada__conversa" style="margin-top:14px;font-size:13px">
        Usando só aqui, seus dados ficam neste aparelho. Dá para ligar o banco
        depois, nos ajustes, sem perder nada.
      </p>
    </div>`;
}

function esconderEntrada() { $('entrada').hidden = true; }

/** `libsql://` é o mesmo endereço em `https://`. O painel do Turso
 *  mostra o primeiro, e ninguém precisa saber disso. */
function normalizarEndereco(url) {
  let t = String(url || '').trim().replace(/\/+$/, '');
  if (t.startsWith('libsql://')) t = 'https://' + t.slice('libsql://'.length);
  if (t && !/^https?:\/\//.test(t)) t = 'https://' + t;
  return t;
}

function trocarDeBanco() {
  limparConfiguracao();
  guardar('cf:soAqui', false);
  mostrarEntrada();
}

function conectar() {
  const nome = pegar('con-nome').trim();
  if (nome) guardar('cf:nome', nome.slice(0, 24));
  const url = pegar('con-url').trim();
  const token = pegar('con-token').trim();
  if (!url) { avisar('Falta o endereço do banco'); return; }
  if (!token) { avisar('Falta o token'); return; }
  conferirEligar(normalizarEndereco(url), token);
}

/**
 * Antes era só gravar e seguir. Um token errado passava batido e a
 * pessoa só descobria dias depois, quando o outro aparelho não via
 * nada — foi exatamente o tipo de silêncio que quebrou a sincronia.
 */
async function conferirEligar(url, token) {
  avisar('Conferindo o banco…');
  const r = await testarConexao(url, token);
  if (!r.ok) {
    avisar(`Não consegui entrar: ${r.erro}`);
    return;
  }
  gravarConfiguracao({ url, token, marca: '', em: '' });
  guardar('cf:soAqui', false);
  perguntarDoBackup();
}

function usarSoNesteAparelho() {
  const nome = pegar('con-nome').trim();
  if (nome) guardar('cf:nome', nome.slice(0, 24));
  guardar('cf:soAqui', true);
  esconderEntrada();
  desenhar();
  avisar('Beleza, fica só aqui então');
}

/**
 * Logo depois de ligar o banco, a pergunta que evita uma tragédia:
 * quem usava o app só neste aparelho tem um monte de coisa gravada, e
 * ligar um banco vazio por cima apagaria tudo.
 */
function perguntarDoBackup() {
  const e = $('entrada');
  e.innerHTML = `
    <div class="entrada__meio">
      <div class="entrada__marca">$</div>
      <div class="entrada__titulo">Pronto, ${escapar(seuNome())}, banco ligado!</div>
      <p class="entrada__conversa">
        Antes de começar: você já usava o app <b>só neste aparelho</b> e tem um
        backup guardado? Se tiver, me manda que eu junto tudo, e você não perde
        nada do que já tinha lançado.
      </p>
      <button class="principal" onclick="escolherArquivoDeBackup()">Tenho um backup, quero usar</button>
      <div class="rodape-form" style="margin-top:12px">
        <button class="secundario" onclick="comecarDoZero()">Começar do zero</button>
      </div>
      <p class="entrada__conversa" style="margin-top:16px;font-size:13px">
        Se você não sabe do que eu estou falando, pode começar do zero tranquilo.
      </p>
    </div>`;
}

function escolherArquivoDeBackup() {
  const campo = document.createElement('input');
  campo.type = 'file';
  campo.accept = 'application/json,.json';
  campo.onchange = async () => {
    const arquivo = campo.files?.[0];
    if (!arquivo) return;
    try {
      const lido = JSON.parse(await arquivo.text());
      restaurarBackup(lido);
      esconderEntrada();
      mexeuNosDados();
      desenhar();
      avisar('Juntei tudo, nada se perdeu');
    } catch {
      avisar('Esse arquivo eu não consegui ler');
    }
  };
  campo.click();
}

function comecarDoZero() {
  esconderEntrada();
  desenhar();
  avisar('Beleza, vamos começar!');
}

/* ===================================================================
   Backup: guardar e restaurar
   =================================================================== */
function baixarBackup() {
  const conteudo = JSON.stringify({
    versao: 1,
    salvoEm: new Date().toISOString(),
    config: D.config,
    receitas: D.receitas, despesas: D.despesas,
    devedores: D.devedores, investimento: D.investimento,
    logAcesso: D.logAcesso,
  }, null, 1);
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `controle-financeiro-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  avisar('Backup salvo no seu aparelho');
}

/**
 * Restaurar junta em vez de substituir: quem tem lançamento dos dois
 * lados não pode perder nenhum. O id decide quem é quem.
 */
function restaurarBackup(lido) {
  let novos = 0;
  for (const lista of ['receitas', 'despesas', 'devedores', 'investimento']) {
    const daqui = new Set(D[lista].map((x) => x.id));
    for (const item of lido[lista] || []) {
      if (item?.id && !daqui.has(item.id)) { D[lista].push(item); novos++; }
    }
  }
  if (lido.config?.ajusteSaldo !== undefined) D.config.ajusteSaldo = lido.config.ajusteSaldo;
  if (lido.config?.metaInvestimento !== undefined) D.config.metaInvestimento = lido.config.metaInvestimento;
  D.logAcesso = [...new Set([...(D.logAcesso || []), ...(lido.logAcesso || [])])].sort();
  return novos;
}

function pedirBackupParaRestaurar() {
  const campo = document.createElement('input');
  campo.type = 'file';
  campo.accept = 'application/json,.json';
  campo.onchange = async () => {
    const arquivo = campo.files?.[0];
    if (!arquivo) return;
    try {
      const novos = restaurarBackup(JSON.parse(await arquivo.text()));
      mexeuNosDados();
      desenhar();
      avisar(novos ? `Trouxe ${novos} lançamento${novos>1?'s':''} de volta` : 'Você já tinha tudo isso');
    } catch {
      avisar('Esse arquivo eu não consegui ler');
    }
  };
  campo.click();
}

/* ===================================================================
   Apagar tudo.

   Três telas de propósito. Apagar dado de dinheiro é daquelas coisas
   que a pessoa faz com raiva e se arrepende na semana seguinte, então
   o caminho é longo por dentro e leve por fora: a primeira mostra o
   tamanho do estrago, a segunda oferece o backup, e a terceira pede
   que ela escreva a palavra, porque quem escreve pensa.
   =================================================================== */
let backupFeitoAgora = false;

function quantoTemGuardado() {
  return {
    receitas: D.receitas.length,
    despesas: D.despesas.length,
    devedores: D.devedores.length,
    investimento: listaInvestimento().length,
    dias: (D.logAcesso || []).length,
  };
}

function passo(n, texto, feito) {
  return `<div class="passo ${feito ? 'passo--feito' : ''}">
    <span class="passo__bolinha">${feito ? '✓' : n}</span><span>${texto}</span>
  </div>`;
}

/** Primeira tela: o tamanho do estrago. */
function apagarTudoPasso1() {
  backupFeitoAgora = false;
  const q = quantoTemGuardado();
  mostrarFolha(`
    <div class="folha__titulo">Apagar tudo e fingir que nada aconteceu</div>
    <p class="explica">
      Tudo bem, acontece. Mas antes de eu sair apagando, deixa eu te mostrar o
      que vai embora.
    </p>
    <div class="contagem">
      <span><b>${q.receitas}</b> receitas</span>
      <span><b>${q.despesas}</b> despesas</span>
      <span><b>${q.devedores}</b> devedores</span>
      <span><b>${q.investimento}</b> no investimento</span>
      <span><b>${q.dias}</b> dias de sequência</span>
    </div>
    <div class="perigo">
      <p>Isso não tem desfazer. Depois que eu apagar, nem eu consigo trazer de volta.</p>
    </div>
    <div class="passos">
      ${passo(1, 'Você vê o que vai perder', true)}
      ${passo(2, 'Eu te ofereço um backup')}
      ${passo(3, 'Você escreve que tem certeza')}
    </div>
    <button class="principal" onclick="apagarTudoPasso2()">Entendi, pode seguir</button>
    <div class="rodape-form">
      <button class="secundario" onclick="fecharFolha()">Deixa pra lá</button>
    </div>`);
}

/** Segunda tela: o backup, que é o que salva a pessoa de si mesma. */
function apagarTudoPasso2() {
  const q = quantoTemGuardado();
  mostrarFolha(`
    <div class="folha__titulo">Leva um backup, vai</div>
    <p class="explica">
      É um arquivo só, fica no seu aparelho, e não custa nada. Se você mudar de
      ideia depois, é só me devolver ele e eu trago esses
      ${q.receitas + q.despesas + q.devedores} lançamentos de volta.
    </p>
    <button class="principal" onclick="baixarBackupAntesDeApagar()">
      Quero o backup
    </button>
    <div class="passos" style="margin-top:16px">
      ${passo(1, 'Você vê o que vai perder', true)}
      ${passo(2, 'Eu te ofereço um backup', backupFeitoAgora)}
      ${passo(3, 'Você escreve que tem certeza')}
    </div>
    <div class="rodape-form">
      <button class="secundario" onclick="apagarTudoPasso3()">
        ${backupFeitoAgora ? 'Pronto, pode seguir' : 'Não quero, pode seguir'}
      </button>
      <button class="apagar" onclick="fecharFolha()">Desisti</button>
    </div>`);
}

function baixarBackupAntesDeApagar() {
  baixarBackup();
  backupFeitoAgora = true;
  apagarTudoPasso2();
  avisar('Guardado! Agora sim');
}

/** Terceira tela: escrever a palavra. Quem escreve, pensa. */
function apagarTudoPasso3() {
  mostrarFolha(`
    <div class="folha__titulo">Última chance</div>
    <p class="explica">
      Escreve <b>apagar tudo</b> aí embaixo e eu faço. Não é para complicar sua
      vida, é para ninguém apagar tudo sem querer com o celular no bolso.
    </p>
    ${backupFeitoAgora ? '' : `<div class="perigo">
      <p>Você não quis o backup. Então é isso mesmo: some e não volta.</p>
    </div>`}
    <div class="campo">
      <div class="campo__nome">Escreve aqui</div>
      <input id="palavra-magica" placeholder="apagar tudo" autocomplete="off"
             oninput="conferirPalavra()">
    </div>
    <button class="botao-perigo" id="botao-apagar" disabled onclick="apagarTudoMesmo()">
      Apagar tudo
    </button>
    <div class="passos" style="margin-top:16px">
      ${passo(1, 'Você vê o que vai perder', true)}
      ${passo(2, 'Eu te ofereço um backup', backupFeitoAgora)}
      ${passo(3, 'Você escreve que tem certeza')}
    </div>
    <div class="rodape-form">
      <button class="secundario" onclick="fecharFolha()">Mudei de ideia</button>
    </div>`);
  setTimeout(() => $('palavra-magica')?.focus(), 480);
}

function conferirPalavra() {
  const certo = texto(pegar('palavra-magica')) === 'apagar tudo';
  $('botao-apagar').disabled = !certo;
}

function apagarTudoMesmo() {
  D.receitas.length = 0;
  D.despesas.length = 0;
  D.devedores.length = 0;
  D.investimento.length = 0;
  D.logAcesso.length = 0;
  D.config.ajusteSaldo = 0;
  limparConfiguracao();
  guardar('cf:soAqui', false);
  estado.escolhido = null;
  estado.selecao.clear();
  fecharFolha();
  mexeuNosDados();
  desenhar();
  mostrarEntrada();
  avisar('Pronto, limpei tudo. Recomeço é bom.');
}

/* ===================================================================
   Seu nome, o lembrete e o widget.
   =================================================================== */
const lembrete = { ligado: false, hora: '20:00' };

function seuNome() { return lerGuardado('cf:nome', 'Thiago'); }
function mudarNome(novo) {
  const limpo = String(novo || '').trim().slice(0, 24);
  guardar('cf:nome', limpo || 'você');
  desenhar();
}

function mudarLembrete(ligado) {
  lembrete.ligado = ligado;
  guardar('cf:lembrete', ligado);
  desenhar();
  avisar(ligado ? `Combinado, te chamo às ${lembrete.hora}` : 'Tá bom, não te chamo mais');
}

function mudarHoraDoLembrete(hora) {
  lembrete.hora = hora || '20:00';
  guardar('cf:lembreteHora', lembrete.hora);
  desenhar();
  if (lembrete.ligado) avisar(`Mudei pras ${lembrete.hora}`);
}

/**
 * O widget, do jeito que ele aparece na tela do celular.
 *
 * Com a planta desligada ele não some: some seria pior, porque a
 * pessoa ficaria com um buraco na tela inicial sem entender por quê.
 * Ele fica ali dormindo, dizendo onde ligar de novo.
 */
function desenharWidget() {
  if (!estado.planta) {
    return `<div class="widget widget--apagada">
      <span class="widget__zzz">z<sup>z</sup></span>
      <span class="widget__meio">
        <div class="widget__dormindo">A plantinha tirou férias</div>
        <div class="widget__recado">
          Você desligou ela, e tudo bem. Se bater saudade, é só ligar aqui em cima.
        </div>
      </span>
    </div>`;
  }
  const seq = sequencia();
  return `<div class="widget">
    ${svgDaPlanta(chaveDoEstagio(seq.dias))}
    <span class="widget__meio">
      <div class="widget__numero">${seq.dias} ${seq.dias === 1 ? 'dia' : 'dias'}</div>
      <div class="widget__dias">${seq.entrouHoje ? 'você já passou hoje' : 'passa aqui hoje pra não perder'}</div>
      <span class="widget__estagio">${estagio(seq.dias)}</span>
    </span>
  </div>`;
}

/* ===================================================================
   Personalização: cor, fundo, desfoque e transparência.

   O ponto delicado é que a pessoa pode botar qualquer foto de fundo,
   e aí não dá para adivinhar se o texto tem que ser claro ou escuro.
   Por isso a escolha do tema continua na mão dela, e existe um véu
   entre a foto e o conteúdo que ela regula.
   =================================================================== */
const CORES = {
  amarelo: { nome: 'Amarelo',  claro:'#F5C518', sobreClaro:'#161200', fundoClaro:'#FBEFBF', frenteClara:'#6B5200', fracaClara:'#FDF6DC',
                                escuro:'#FFD34E', sobreEscuro:'#231A00', fundoEscuro:'#4A3B00', frenteEscura:'#FFE08A', fracaEscura:'#2A2100' },
  verde:   { nome: 'Verde',    claro:'#00785C', sobreClaro:'#FFFFFF', fundoClaro:'#C5EFDD', frenteClara:'#00553F', fracaClara:'#DCF3E9',
                                escuro:'#7EEBC4', sobreEscuro:'#04120D', fundoEscuro:'#12564A', frenteEscura:'#9BF7D4', fracaEscura:'#0E3B31' },
  azul:    { nome: 'Azul',     claro:'#0B63C5', sobreClaro:'#FFFFFF', fundoClaro:'#D3E4FF', frenteClara:'#00429A', fracaClara:'#E6EFFF',
                                escuro:'#A6C8FF', sobreEscuro:'#002F66', fundoEscuro:'#004787', frenteEscura:'#D3E4FF', fracaEscura:'#082E52' },
  roxo:    { nome: 'Roxo',     claro:'#6B4EA8', sobreClaro:'#FFFFFF', fundoClaro:'#E9DDFF', frenteClara:'#4A2E86', fracaClara:'#F2EAFF',
                                escuro:'#CFBCFF', sobreEscuro:'#2A1757', fundoEscuro:'#523A8C', frenteEscura:'#E9DDFF', fracaEscura:'#31215C' },
  rosa:    { nome: 'Rosa',     claro:'#B1256B', sobreClaro:'#FFFFFF', fundoClaro:'#FFD9E6', frenteClara:'#8A0F50', fracaClara:'#FFE8F0',
                                escuro:'#FFB0CD', sobreEscuro:'#54082F', fundoEscuro:'#7C1747', frenteEscura:'#FFD9E6', fracaEscura:'#43102A' },
  laranja: { nome: 'Laranja',  claro:'#9C4310', sobreClaro:'#FFFFFF', fundoClaro:'#FFDBC8', frenteClara:'#7A3100', fracaClara:'#FFEDE3',
                                escuro:'#FFB694', sobreEscuro:'#5A1C00', fundoEscuro:'#7D330A', frenteEscura:'#FFDBC8', fracaEscura:'#401B06' },
  cinza:   { nome: 'Cinza',    claro:'#4A5560', sobreClaro:'#FFFFFF', fundoClaro:'#DCE3EA', frenteClara:'#313B45', fracaClara:'#EBF0F4',
                                escuro:'#BFC9D4', sobreEscuro:'#22292F', fundoEscuro:'#3C4753', frenteEscura:'#DCE3EA', fracaEscura:'#252C33' },
};

const FUNDOS = {
  nenhum:       { nome: 'Liso',          tipo:'nenhum' },
  quadriculado: { nome: 'Quadriculado',  tipo:'padrao' },
  pontilhado:   { nome: 'Pontilhado',    tipo:'padrao' },
  degrade:      { nome: 'Degradê',       tipo:'padrao' },
  ondas:        { nome: 'Ondas',         tipo:'padrao' },
  bolhas:       { nome: 'Bolhas subindo', tipo:'animado' },
  aurora:       { nome: 'Aurora',        tipo:'animado' },
  foto:         { nome: 'Sua foto',      tipo:'arquivo' },
  gif:          { nome: 'Seu GIF',       tipo:'arquivo' },
  video:        { nome: 'Seu vídeo',     tipo:'arquivo' },
};

/* Os três últimos são a mesma coisa por dentro: um arquivo que a
   pessoa escolheu. O que muda é o que o app aceita e como desenha. */
const ACEITA = { foto: 'image/*', gif: 'image/gif', video: 'video/*' };
const TEM_ARQUIVO = ['foto', 'gif', 'video'];

const visual = {
  cor: 'amarelo',
  fundo: 'nenhum',
  desfoque: 8,
  opacidade: 86,
  brilho: 100,   // vale para foto, gif e vídeo
  foto: '',
  midia: null,   // { tipo, nome, tamanho } do arquivo guardado
};

function lerVisual() {
  Object.assign(visual, lerGuardado('cf:visual', {}));
}
function guardarVisual() { guardar('cf:visual', visual); }

/** Pinta a cor escolhida por cima das variáveis do tema. */
function aplicarCor() {
  const c = CORES[visual.cor] || CORES.amarelo;
  const escuro = temaEmUso() === 'escuro';
  const r = document.documentElement.style;
  r.setProperty('--menta',        escuro ? c.escuro : c.claro);
  r.setProperty('--sobre-menta',  escuro ? c.sobreEscuro : c.sobreClaro);
  r.setProperty('--menta-fundo',  escuro ? c.fundoEscuro : c.fundoClaro);
  r.setProperty('--menta-frente', escuro ? c.frenteEscura : c.frenteClara);
  r.setProperty('--menta-fraca',  escuro ? c.fracaEscura : c.fracaClara);
  r.setProperty('--risco', escuro ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)');
}

/** Monta a camada de fundo e regula véu, desfoque e transparência. */
function aplicarFundo() {
  const papel = $('papel');
  const temFundo = visual.fundo !== 'nenhum';
  papel.className = 'papel' + (temFundo ? ' papel--' + visual.fundo : '');
  papel.style.display = temFundo ? '' : 'none';
  papel.innerHTML = '';
  papel.style.backgroundImage = '';

  if (TEM_ARQUIVO.includes(visual.fundo)) {
    // O arquivo mora no IndexedDB, então a leitura é assíncrona: o
    // fundo entra um instante depois do resto, e tudo bem.
    lerMidia().then((m) => {
      if (!m || !TEM_ARQUIVO.includes(visual.fundo)) return;
      if (m.tipo === 'video') {
        const v = document.createElement('video');
        v.src = m.url;
        v.autoplay = true; v.loop = true; v.playsInline = true;
        v.muted = true;            // vídeo de fundo com som seria um pesadelo
        v.setAttribute('muted', '');
        v.className = 'papel__video';
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          v.autoplay = false; v.pause();
        }
        // Nem todo aparelho decodifica todo vídeo. Um arquivo só de
        // áudio, ou num formato que o aparelho não abre, carregaria
        // em silêncio e deixaria a tela preta sem explicação.
        v.addEventListener('error', () => reclamarDoVideo('Esse vídeo eu não consigo abrir aqui'));
        v.addEventListener('loadeddata', () => {
          if (!v.videoWidth) reclamarDoVideo('Esse arquivo não tem imagem, só som');
        });
        papel.appendChild(v);
      } else {
        papel.style.backgroundImage = `url(${m.url})`;
      }
    });
  }
  if (visual.fundo === 'bolhas') {
    for (let i = 0; i < 14; i++) {
      const b = document.createElement('span');
      const tam = 18 + Math.random() * 50;
      b.style.cssText = `left:${Math.random()*100}%;width:${tam}px;height:${tam}px;` +
        `animation-duration:${16 + Math.random()*18}s;animation-delay:-${Math.random()*20}s`;
      papel.appendChild(b);
    }
  }
  if (visual.fundo === 'aurora') {
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('span');
      const tam = 260 + i * 90;
      b.style.cssText = `left:${[5, 45, 70][i]}%;top:${[10, 45, 5][i]}%;width:${tam}px;height:${tam}px;` +
        `animation-duration:${18 + i*7}s;animation-delay:-${i*4}s;opacity:${.5 - i*.1}`;
      papel.appendChild(b);
    }
  }

  document.body.classList.toggle('com-fundo', temFundo);
  const r = document.documentElement.style;
  // Sem fundo, nada de transparência: cartão sobre cor lisa não ganha
  // nada em ficar translúcido, só perde contraste.
  r.setProperty('--desfoque', temFundo ? visual.desfoque + 'px' : '0px');
  r.setProperty('--opacidade', temFundo ? visual.opacidade + '%' : '100%');
  // O modal usa um vidro mais forte e fecha mais a transparência: ele
  // cobre a tela inteira e é onde a pessoa lê e digita.
  r.setProperty('--desfoque-modal', temFundo ? Math.max(visual.desfoque, 14) + 'px' : '0px');
  r.setProperty('--opacidade-modal', temFundo ? Math.min(100, visual.opacidade + 12) + '%' : '100%');
  // O véu escurece a foto e nada mais. Antes ele vinha amarrado à
  // transparência dos cartões, e mexer num mexia no outro sem motivo.
  $('veu').style.opacity = TEM_ARQUIVO.includes(visual.fundo) ? (100 - visual.brilho) / 100 : 0;
}

/**
 * Quando o vídeo não serve, voltamos para o fundo liso e dizemos por
 * quê. Deixar a tela preta sem explicação seria pior.
 */
let jaReclamou = false;
function reclamarDoVideo(motivo) {
  if (jaReclamou) return;
  jaReclamou = true;
  avisar(motivo);
  visual.fundo = 'nenhum';
  guardarVisual();
  aplicarFundo();
  setTimeout(() => { jaReclamou = false; }, 3000);
}

function aplicarVisual() { aplicarCor(); aplicarFundo(); }

function mudarCor(chave) { visual.cor = chave; guardarVisual(); aplicarVisual(); desenhar(); avisar('Cor trocada!'); }
function mudarFundo(chave) {
  if (TEM_ARQUIVO.includes(chave) && !visual.midia) { escolherArquivoDeFundo(chave); return; }
  visual.fundo = chave; guardarVisual(); aplicarVisual(); desenhar();
}
function mudarDesfoque(v) { visual.desfoque = Number(v); guardarVisual(); aplicarFundo(); desenhar(); }
function mudarOpacidade(v) { visual.opacidade = Number(v); guardarVisual(); aplicarFundo(); desenhar(); }
function mudarBrilho(v) { visual.brilho = Number(v); guardarVisual(); aplicarFundo(); desenhar(); }

/**
 * Escolher o arquivo de fundo: foto, GIF ou vídeo.
 *
 * O arquivo vai para o IndexedDB, não para o localStorage: um vídeo
 * de poucos segundos já estoura o limite de lá, e virar texto ainda
 * infla o tamanho em um terço.
 */
function escolherArquivoDeFundo(qual) {
  const campo = document.createElement('input');
  campo.type = 'file';
  campo.accept = ACEITA[qual] || 'image/*';
  campo.onchange = async () => {
    const arquivo = campo.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > 120 * 1024 * 1024) {
      avisar('Esse aí é grande demais, tenta um menor');
      return;
    }
    try {
      visual.midia = await guardarMidia(arquivo);
      visual.fundo = visual.midia.tipo === 'video' ? 'video'
                   : (arquivo.type === 'image/gif' ? 'gif' : 'foto');
      visual.foto = '';
      guardarVisual(); aplicarVisual(); desenhar();
      avisar('Ficou bonito!');
    } catch (e) {
      avisar('Não consegui guardar esse arquivo');
      console.warn(e);
    }
  };
  campo.click();
}

async function tirarFoto() {
  await apagarMidia();
  visual.midia = null;
  visual.foto = '';
  visual.fundo = 'nenhum';
  guardarVisual(); aplicarVisual(); desenhar();
  avisar('Tirei o fundo');
}

/* ===================================================================
   Aparência, em quatro assuntos.

   Era uma tela só, longa demais, com um parágrafo de explicação no
   meio que ninguém lia. Agora cada assunto tem a sua tela, e o texto
   que explicava as coisas virou um "?" ao lado do título, quem
   precisa, toca; quem não precisa, não tropeça nele.
   =================================================================== */

function resumoDaAparencia(chave) {
  return {
    'aparencia/tema':  TEMAS[temaEscolhido()].nome,
    'aparencia/cor':   CORES[visual.cor].nome,
    'aparencia/fundo': FUNDOS[visual.fundo].nome,
    'aparencia/fonte': FONTES[fonteEscolhida()].nome,
  }[chave];
}

function listaDaAparencia() {
  return `<div class="pilha">
    ${Object.entries(SUB_APARENCIA).map(([chave, f]) => `
      <button class="cartao" onclick="irNoAjuste('${chave}')">
        <span class="pastilha pastilha--${f.cor}">${icone(f.icone)}</span>
        <span class="cartao__meio">
          <div class="chave__nome">${f.nome}</div>
          <div class="chave__sub">${escapar(resumoDaAparencia(chave))}</div>
        </span>
        <span class="cartao__acao">${icone('seta',15)}</span>
      </button>`).join('')}
  </div>`;
}

/** Um título com um "?" que abre a explicação daquele assunto. */
function tituloComAjuda(texto, assunto) {
  return `<div class="titulo-ajuda">
    <span class="secao-form__nome" style="margin:0">${texto}</span>
    <button class="ajuda-botao" onclick="explicarAjuste('${assunto}')" aria-label="O que é isso?">
      ${icone('ajuda', 15)}
    </button>
  </div>`;
}

const EXPLICACOES = {
  fundo: {
    titulo: 'O fundo',
    texto: `Os primeiros são desenhados pelo app e ficam bem em qualquer tema.
      Os três últimos são seus: foto, GIF ou vídeo. Escolhendo um seu, aparecem
      os controles de brilho, vidro e transparência para você deixar o texto
      legível por cima dele.`,
  },
  tema: {
    titulo: 'Claro ou escuro',
    texto: `Escuro cansa menos os olhos à noite; claro se lê melhor no sol.
      Deixando em "igual ao aparelho", eu mudo junto quando o seu celular muda.`,
  },
  cor: {
    titulo: 'A cor do app',
    texto: `É a cor dos botões, dos ícones e dos destaques. Cada uma tem uma
      versão para o tema claro e outra para o escuro, então trocar de tema não
      estraga a cor que você escolheu.`,
  },
  transparencia: {
    titulo: 'Transparência e efeito vidro',
    texto: `<b>Transparência</b> é o quanto o fundo aparece através dos cartões.
      Quanto mais transparente, mais você vê o fundo, e mais difícil fica ler
      os números.<br><br>
      <b>Efeito vidro</b> deixa o fundo borrado onde ele atravessa. É o que
      permite ver o fundo sem perder a leitura: o desenho continua ali, mas sem
      concorrer com os números.<br><br>
      Se as letras sumirem, diminua a transparência ou aumente o vidro. E se o
      seu fundo for muito claro, troque o tema para claro, eu não tenho como
      adivinhar a foto que você escolheu.`,
  },
  brilho: {
    titulo: 'Brilho do fundo',
    texto: `Escurece a sua foto, GIF ou vídeo sem mexer nos cartões. É o jeito
      mais rápido de fazer um fundo claro demais parar de brigar com o texto.`,
  },
  fonte: {
    titulo: 'A fonte',
    texto: `A primeira muda só os números e os títulos, deixando o resto numa
      letra calma de ler. As outras duas mudam tudo. Os valores continuam
      alinhados em coluna em qualquer uma, para o dinheiro não dançar.`,
  },
};

function explicarAjuste(assunto) {
  const e = EXPLICACOES[assunto];
  if (!e) return;
  mostrarFolha(`
    <div class="folha__titulo">${e.titulo}</div>
    <p class="explica">${e.texto}</p>
    <button class="principal" onclick="fecharFolha()">Entendi!</button>`);
}

function parteDoTema() {
  return `
    ${tituloComAjuda('Como o app se veste', 'tema')}
    <div class="pilha">
      ${Object.entries(TEMAS).map(([chave, t]) => `
        <button class="cartao ${chave===temaEscolhido()?'item--marcado':''}" onclick="trocarTema('${chave}')">
          <span class="pastilha ${chave===temaEscolhido()?'pastilha--menta':'pastilha--ouro'}">${icone(t.icone)}</span>
          <span class="cartao__meio">
            <div class="chave__nome">${t.nome}</div>
            <div class="chave__sub">${t.sub}</div>
          </span>
          ${chave===temaEscolhido() ? `<span class="cartao__acao">${icone('check',16)}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

function parteDaCor() {
  return `
    ${tituloComAjuda('Escolha uma', 'cor')}
    <div class="cores">
      ${Object.entries(CORES).map(([chave, c]) => `
        <button class="cor ${chave===visual.cor?'cor--ativa':''}" onclick="mudarCor('${chave}')"
          title="${c.nome}" style="background:${temaEmUso()==='escuro'?c.escuro:c.claro}">
          ${chave===visual.cor ? `<span style="color:${temaEmUso()==='escuro'?c.sobreEscuro:c.sobreClaro}">${icone('check',18)}</span>` : ''}
        </button>`).join('')}
    </div>
    <p class="explica explica--fraco">${CORES[visual.cor].nome} agora.</p>`;
}

function parteDaFonte() {
  return `
    ${tituloComAjuda('Escolha uma', 'fonte')}
    <div class="pilha">
      ${Object.entries(FONTES).map(([chave, f]) => `
        <button class="cartao ${chave===fonteEscolhida()?'item--marcado':''}" onclick="trocarFonte('${chave}')">
          <span class="cartao__meio">
            <span class="chave__nome" style="font-family:${f.destaque}">${f.nome} · R$ 1.234,56</span>
            <span class="chave__sub">${f.sub}</span>
          </span>
          ${chave===fonteEscolhida() ? `<span class="cartao__acao">${icone('check',16)}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

function parteDoFundo() {
  const temFundo = visual.fundo !== 'nenhum';
  return `
    ${tituloComAjuda('Escolha um', 'fundo')}
    <div class="fundos">
      ${Object.entries(FUNDOS).map(([chave, f]) => `
        <button class="fundo ${chave===visual.fundo?'fundo--ativo':''}" onclick="mudarFundo('${chave}')">
          <span class="fundo__amostra">${amostraDeFundo(chave)}</span>
          <span class="fundo__nome">${f.nome}</span>
        </button>`).join('')}
    </div>
    ${visual.midia ? `<div class="rodape-form" style="margin-top:0">
      <button class="secundario" onclick="escolherArquivoDeFundo('${visual.fundo}')">Trocar</button>
      <button class="apagar" onclick="tirarFoto()">Tirar</button>
    </div>
    <p class="explica explica--fraco" style="margin-top:6px">
      ${escapar(visual.midia.nome || 'arquivo')} · ${emTamanho(visual.midia.tamanho)}
      ${visual.fundo === 'video' ? ' · sem som, como todo fundo deve ser' : ''}
    </p>` : ''}

    ${temFundo ? `
      ${tituloComAjuda('Como vai ficar', 'transparencia')}
      ${previaDoFundo()}

      ${TEM_ARQUIVO.includes(visual.fundo) ? `
        ${tituloComAjuda('Brilho do fundo', 'brilho')}
        <div class="medidas">
          ${BRILHOS.map((b) => `
            <button class="medida ${b.valor===visual.brilho?'medida--ativa':''}"
              onclick="mudarBrilho(${b.valor})">${b.nome}</button>`).join('')}
        </div>` : ''}

      <div class="secao-form__nome">Efeito vidro nos cartões</div>
      <div class="medidas">
        ${DESFOQUES.map((d) => `
          <button class="medida ${d.valor===visual.desfoque?'medida--ativa':''}"
            onclick="mudarDesfoque(${d.valor})">${d.nome}</button>`).join('')}
      </div>

      <div class="secao-form__nome">Transparência dos cartões</div>
      <div class="medidas">
        ${OPACIDADES.map((o) => `
          <button class="medida ${o.valor===visual.opacidade?'medida--ativa':''}"
            onclick="mudarOpacidade(${o.valor})">${o.nome}</button>`).join('')}
      </div>` : ''}`;
}

/**
 * Preenche os lugares que mostram o arquivo de fundo (a prévia e a
 * miniatura) assim que ele é lido do IndexedDB. Não dá para fazer
 * isso na montagem do HTML porque a leitura é assíncrona.
 */
async function preencherAmostrasDeArquivo() {
  if (!TEM_ARQUIVO.includes(visual.fundo)) return;
  const m = await lerMidia();
  if (!m) return;
  for (const onde of document.querySelectorAll('.amostra-arquivo, .previa__papel--arquivo')) {
    onde.innerHTML = '';
    if (m.tipo === 'video') {
      const v = document.createElement('video');
      v.src = m.url; v.autoplay = true; v.loop = true; v.muted = true;
      v.playsInline = true; v.setAttribute('muted', '');
      v.className = 'papel__video';
      onde.appendChild(v);
    } else {
      onde.style.backgroundImage = `url(${m.url})`;
      onde.style.backgroundSize = 'cover';
      onde.style.backgroundPosition = 'center';
    }
  }
}

/* Valores prontos em vez de barrinha: é mais fácil acertar e mais
   fácil repetir. Os nomes dizem o efeito, o número fica escondido. */
const DESFOQUES = [
  { nome: 'Nenhum', valor: 0 },
  { nome: 'Leve',   valor: 4 },
  { nome: 'Médio',  valor: 10 },
  { nome: 'Forte',  valor: 18 },
  { nome: 'Vidro',  valor: 28 },
];
const OPACIDADES = [
  { nome: 'Sólido',          valor: 100 },
  { nome: 'Quase sólido',    valor: 88 },
  { nome: 'Translúcido',     valor: 72 },
  { nome: 'Bem clarinho',    valor: 55 },
  { nome: 'Quase invisível', valor: 38 },
];
const BRILHOS = [
  { nome: 'Normal',        valor: 100 },
  { nome: 'Um pouco',      valor: 80 },
  { nome: 'Na metade',     valor: 60 },
  { nome: 'Bem escuro',    valor: 40 },
  { nome: 'Quase apagado', valor: 22 },
];

/**
 * A prévia: o fundo escolhido com quatro elementos de mentira por
 * cima. É o único jeito de decidir vidro e transparência sem sair da
 * tela para conferir.
 */
function previaDoFundo() {
  const ehArquivo = TEM_ARQUIVO.includes(visual.fundo) && visual.midia;
  const veu = ehArquivo ? (100 - visual.brilho) / 100 : 0;
  return `<div class="previa">
    <span class="previa__papel ${ehArquivo ? 'previa__papel--arquivo' : 'papel--' + visual.fundo}">
      ${visual.fundo === 'aurora'
        ? '<span style="position:absolute;left:5%;top:-20%;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--menta) 55%,transparent) 0%,transparent 70%)"></span>'
        : ''}
      ${visual.fundo === 'bolhas'
        ? '<span style="position:absolute;left:15%;bottom:8px;width:26px;height:26px;border-radius:50%;background:color-mix(in srgb,var(--menta) 35%,transparent)"></span>' +
          '<span style="position:absolute;left:70%;bottom:40px;width:16px;height:16px;border-radius:50%;background:color-mix(in srgb,var(--menta) 28%,transparent)"></span>'
        : ''}
    </span>
    <span class="previa__veu" style="opacity:${veu}"></span>

    <div class="previa__cartao">
      <span class="pastilha pastilha--menta">${icone('cartao', 17)}</span>
      <span>
        <div class="previa__rotulo">Saldo em conta</div>
        <div class="previa__valor dinheiro">R$ 200,88</div>
      </span>
    </div>
    <div class="previa__cartao">
      <span class="pastilha pastilha--vermelha">${icone('desce', 17)}</span>
      <span>
        <div class="previa__nome">Mercado</div>
        <div class="previa__sub">27/09 · Cartão de Crédito</div>
      </span>
      <span class="previa__dir dinheiro">R$ 45,45</span>
    </div>
    <div class="previa__cartao">
      <span class="pastilha pastilha--verde">${icone('sobe', 17)}</span>
      <span>
        <div class="previa__nome">Salário</div>
        <div class="previa__sub">29/09 · Renda fixa</div>
      </span>
      <span class="previa__dir dinheiro">R$ 794,72</span>
    </div>
    <div class="previa__cartao">
      ${svgDaPlanta(chaveDoEstagio(sequencia().dias)).replace('planta__vaso', 'planta__vaso previa__planta')}
      <span>
        <div class="previa__nome">${estagio(sequencia().dias)}</div>
        <div class="previa__sub">${sequencia().dias} dias seguidos</div>
      </span>
    </div>
  </div>`;
}

/** Uma miniatura de cada fundo, desenhada com o próprio CSS dele. */
function amostraDeFundo(chave) {
  if (chave === 'nenhum') return '';
  if (TEM_ARQUIVO.includes(chave)) {
    const escolhido = visual.midia && visual.fundo === chave;
    const rotulo = { foto: 'Escolher', gif: 'Escolher GIF', video: 'Escolher vídeo' }[chave];
    if (!escolhido) {
      return `<span style="position:absolute;inset:0;display:grid;place-items:center;gap:4px;
            align-content:center;color:var(--menta-frente);background:var(--menta-fundo)">
           ${icone(chave === 'video' ? 'filme' : 'mais', 26)}
           <span style="font-size:11px;font-weight:700">${rotulo}</span>
         </span>`;
    }
    return `<span class="amostra-arquivo" data-tipo="${chave}"></span>
       <span style="position:absolute;inset:0;background:#000;opacity:${(100-visual.brilho)/100}"></span>`;
  }
  const bolinhas = chave === 'bolhas'
    ? '<span style="position:absolute;left:20%;bottom:10px;width:20px;height:20px;border-radius:50%;background:color-mix(in srgb,var(--menta) 40%,transparent)"></span>' +
      '<span style="position:absolute;left:60%;bottom:36px;width:13px;height:13px;border-radius:50%;background:color-mix(in srgb,var(--menta) 30%,transparent)"></span>'
    : '';
  const auroras = chave === 'aurora'
    ? '<span style="position:absolute;left:-10%;top:-30%;width:90px;height:90px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--menta) 60%,transparent) 0%,transparent 70%)"></span>'
    : '';
  return `<span class="papel--${chave}" style="position:absolute;inset:0;z-index:0"></span>${bolinhas}${auroras}`;
}

/* ---------------- folha e avisos ---------------- */
function mostrarFolha(html) {
  if (!$('folha').classList.contains('aberta')) history.pushState({ dentro: true }, '');
  $('folha').innerHTML = `<div class="folha__puxador"></div>` + html;
  $('cortina').classList.add('aberta');
  $('folha').classList.add('aberta');
  ligarMascaras($('folha'));
}
function fecharFolha() {
  // Tirar o foco de dentro da folha antes de fechar: senão o cursor
  // continua num campo escondido e, entre outras coisas, digitar
  // deixa de mandar para a busca.
  if ($('folha').contains(document.activeElement)) document.activeElement.blur();
  $('cortina').classList.remove('aberta');
  $('folha').classList.remove('aberta');
}

function avisar(texto) {
  const b = document.createElement('div');
  b.textContent = texto;
  b.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%) translateY(20px);z-index:60;' +
    'background:var(--cartao-alto);color:var(--texto);padding:12px 22px;border-radius:999px;opacity:0;' +
    'transition:opacity 240ms,transform 150ms var(--padrao);box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:14.5px';
  document.body.appendChild(b);
  requestAnimationFrame(() => { b.style.opacity = '1'; b.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => { b.style.opacity = '0'; setTimeout(() => b.remove(), 300); }, 1600);
}

/**
 * Digitar uma letra em qualquer lugar da lista já manda para a busca.
 * Quem tem 554 lançamentos não quer caçar o campo com o ponteiro.
 */
document.addEventListener('keydown', (e) => {
  if (!['receitas','despesas','devedores'].includes(estado.tela)) return;
  if ($('folha').classList.contains('aberta')) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const ativo = document.activeElement;
  const escrevendoDeVerdade = ['INPUT','SELECT','TEXTAREA'].includes(ativo?.tagName)
    && !$('folha').contains(ativo) && !$('entrada').contains(ativo);
  if (escrevendoDeVerdade) return;
  if (e.key.length !== 1 || e.key === ' ') return;
  const campo = document.querySelector('.barra__interno .busca input')
             || document.querySelector('#conteudo .busca input');
  if (!campo) return;
  campo.focus();
  // A tecla que disparou entra sozinha, senão a primeira letra se perde.
  estado.busca = e.key;
  campo.value = e.key;
  redesenharLista();
  (document.querySelector('.barra__interno .busca input')
   || document.querySelector('#conteudo .busca input'))?.focus();
  e.preventDefault();
});

/**
 * Redesenhar quando a janela muda de largura, e só.
 *
 * No Android o teclado que sobe conta como "resize": a altura encolhe.
 * Como isso refazia a tela inteira, o campo de busca era destruído no
 * instante em que ele ganhava o foco, e o teclado abria e fechava na
 * cara do usuário. A largura, essa sim, muda quando ele vira o
 * aparelho ou arrasta a janela no computador — aí redesenhar faz
 * sentido. Mesmo assim, não no meio de uma digitação.
 */
let larguraAnterior = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === larguraAnterior) return;
  larguraAnterior = window.innerWidth;
  const ativo = document.activeElement;
  if (['INPUT','SELECT','TEXTAREA'].includes(ativo?.tagName)) return;
  desenhar();
});

// Uma entrada de reserva no histórico: é ela que o primeiro "voltar"
// consome, deixando o app decidir o que fazer.
// Quem inicia tudo isso é o app.js, pelo iniciarTela().

/* ===================================================================
   O HTML chama estas por nome.
   Este arquivo é um módulo, então nada aqui é global por padrão. As
   telas são montadas como texto, com `onclick="ir('receitas')"` e
   afins, e para isso funcionar as funções precisam estar ao alcance
   do HTML. É o preço de desenhar com texto em vez de montar elemento
   por elemento, e vale: o arquivo fica legível.
   =================================================================== */
Object.assign(window, {
  // Estas não vêm de onclick: o botão flutuante é ligado por código, e
  // as outras servem para conferir o app de fora enquanto ele cresce.
  abrirNovo, abrirMenuInvestir, abrirNovoDevedor, desenhar, redesenharLista,
  listaInvestimento, painel, sequencia, estagio, chaveDoEstagio,
  temaEscolhido, fonteEscolhida, aplicarVisual, restaurarBackup,
  estado, visual, guardarVisual, preencherAmostrasDeArquivo,
  conexaoGuardada, mostrarEntrada, esconderEntrada, normalizarEndereco,
  explicarEscudos, blocoDeEscudos, explicarAjuste, listaDaAparencia,
  procurarAtualizacaoAgora, baixarVersaoNova,
  abrirCopiarFixos, copiarFixosAgora, sincronizarPeloBotao, testarBancoDosAjustes,
  abrir, abrirDevedor, abrirInvestimento, abrirParcelar, abrirReajuste, apagarRendimento,
  apagarTudoMesmo, apagarTudoPasso1, apagarTudoPasso2, apagarTudoPasso3, avisar, baixarBackup,
  baixarBackupAntesDeApagar, comecarDoZero, conectar, conferirPalavra, confirmarReajuste, escolher,
  escolherArquivoDeBackup, escolherArquivoDeFundo, trocarDeBanco, excluir, excluirDevedor, explicarSaldo, explicarSobra,
  fecharFolha, gravarInvestir, gravarNovo, gravarNovoDevedor, gravarParcelas, ir,
  irNoAjuste, limparSelecao, marcar, marcarTodosComo, mostrarEntrada, mudarBrilho,
  mudarCor, mudarDesfoque, mudarFundo, mudarHoraDoLembrete, mudarLembrete, mudarMes,
  mudarNome, mudarOpacidade, mudarPlanta, mudarDetalheInicio, operacaoInvestir, pedirBackupParaRestaurar, previverReajuste,
  salvar, salvarDevedor, salvarRendimento, tirarFoto, trocarFonte, trocarTema,
  trocarTipoNovo, usarSoNesteAparelho, virarDevedor, virarStatus, voltarDosAjustes, voltarParaHoje,
});

/* ===================================================================
   Entrada do módulo.
   =================================================================== */

/** Liga a tela a um arquivo de dados já normalizado. */
export function iniciarTela(dados) {
  D = dados;
  lerVisual();
  aplicarTema(temaEscolhido());
  aplicarFonte(fonteEscolhida());
  aplicarVisual();
  estado.planta = lerGuardado('cf:planta', true);
  estado.detalheInicio = lerGuardado('cf:detalheInicio', false);
  lembrete.ligado = lerGuardado('cf:lembrete', false);
  lembrete.hora = lerGuardado('cf:lembreteHora', '20:00');
  estado.ano = hoje().getFullYear();
  estado.mes = hoje().getMonth();
  history.replaceState({ raiz: true }, '');
  history.pushState({ dentro: true }, '');
  ligarVoltarDoAndroid();
  $('fab').onclick = abrirNovo;
  $('cortina').onclick = fecharFolha;
  desenhar();
}

/** Redesenha de fora, depois de uma sincronia por exemplo. */
export function redesenharTudo(dados) {
  if (dados) D = dados;
  desenhar();
}

export { mostrarEntrada, esconderEntrada, conexaoGuardada, avisar };
