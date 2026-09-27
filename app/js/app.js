// =========================================================
// Controle Financeiro — aplicação
// Etapa 1: tela de Início (painel), menu inferior,
// configuração do arquivo de dados e planta de frequência.
// =========================================================

import { armazenamento, DADOS_PADRAO, normalizar } from './armazenamento.js';
import { agora } from './dominio.js';
import { VERSAO, BONUS_VERSAO, BONUS_ESCUDOS } from './versao.js';
import { atualizacaoEsperando, cuidarDaAtualizacao, instalarAgora } from './atualizacao.js';
import { calcularPainel } from './calculos.js';
import { registrarAcesso, animarRega, animarCrescimento, estagioCrescendo,
         animarEscudoFormando, animarEscudoQuebrando, MAX_ESCUDOS } from './planta.js';
import { svgDaPlanta, ESTAGIOS_MURCHOS, svgDoEscudoMini } from './plantaSvg.js';
import {
  MESES, numeroDoMes, nomeDoMes, moeda, hoje, formatarData
} from './util.js';
import * as telas from './telas.js';
import * as recompensas from './telaRecompensas.js';
import { diasDeAcesso } from './recompensas.js';
import { ligarMascaraValor, confirmar } from './formulario.js';
import { criarCliente } from './turso.js';
import * as lembretes from './lembretes.js';
import { ligarTerminalVivo } from './terminalVivo.js';
import { atualizarWidget } from './widget.js';
import {
  sincronizar, lerConfiguracao, gravarConfiguracao, limparConfiguracao, estaLigada
} from './sincronia.js';

const $ = (id) => document.getElementById(id);

/** Ordem do menu inferior — define o sentido da transição. */
const ORDEM_TELAS = ['inicio', 'receitas', 'despesas', 'devedores', 'investimento'];

const estado = {
  dados: null,
  ano: hoje().getFullYear(),
  mes: hoje().getMonth() + 1,
  // A tela de Investimento navega por conta própria, como as células
  // H2/I2 da planilha, que o SincronizarAbas() não sincroniza.
  anoInv: hoje().getFullYear(),
  mesInv: hoje().getMonth() + 1,
  tela: 'inicio',
  telaAnterior: 'inicio',
  // Enquanto for falso, o mês mostrado é só o padrão e a sincronia
  // pode trocá-lo pelo que veio da configuração. Depois que a pessoa
  // navega, o mês é escolha dela e ninguém mexe.
  mesEscolhidoNaMao: false
};

/** A tela de Investimento é a única com mês próprio. */
const temMesProprio = (tela) => tela === 'investimento';

// ---------------------------------------------------------
// Tema
// ---------------------------------------------------------

const CHAVE_TEMA = 'controle-financeiro:tema';

function aplicarTema(tema) {
  if (tema === 'claro' || tema === 'escuro') {
    document.documentElement.dataset.tema = tema;
  } else {
    delete document.documentElement.dataset.tema;
  }
  // A paleta escolhida tem variante clara e escura: precisa ser
  // reaplicada sempre que o modo muda.
  aplicarPersonalizacao();
}

/** Escreve a personalização desbloqueada nas variáveis do CSS. */
function aplicarPersonalizacao() {
  if (!estado.dados) return;
  recompensas.aplicar(estado.dados.personalizacao, diasDeAcesso(estado.dados));
}

function alternarTema() {
  const atual = document.documentElement.dataset.tema;
  const escuroPorPadrao = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let proximo;
  if (!atual) proximo = escuroPorPadrao ? 'claro' : 'escuro';
  else proximo = atual === 'escuro' ? 'claro' : 'escuro';
  aplicarTema(proximo);
  try { localStorage.setItem(CHAVE_TEMA, proximo); } catch { /* ignora */ }
}

aplicarTema(localStorage.getItem(CHAVE_TEMA));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.dataset.tema) aplicarPersonalizacao();
});

// ---------------------------------------------------------
// Painel de Início — equivale a AtualizarPainel()
// ---------------------------------------------------------

function atualizarPainel() {
  const p = calcularPainel(estado.dados, estado.ano, estado.mes);

  $('vSaldoConta').textContent = moeda(p.saldoConta);
  $('vSaldoConta').className =
    'cartao__valor ' + (p.saldoConta < 0 ? 'cartao__valor--vermelho' : 'cartao__valor--verde');

  $('rotuloPossoGastar').textContent = p.rotuloPossoGastar.replace(':', '');
  $('vPossoGastar').textContent = moeda(Math.abs(p.possoGastar));
  $('vPossoGastar').className =
    'cartao__valor ' + (p.devendo ? 'cartao__valor--vermelho' : 'cartao__valor--verde');
  $('cartaoPossoGastar').className = 'cartao ' + (p.devendo ? 'cartao--alerta' : 'cartao--destaque');

  $('vReceitasMes').textContent = moeda(p.receitasDoMes);
  $('vRecebido').textContent = moeda(p.recebido);
  $('vFaltaReceber').textContent = moeda(p.faltaReceber);

  $('vDespesasMes').textContent = moeda(p.despesasDoMes);
  $('vPago').textContent = moeda(p.pago);
  $('vFaltaPagar').textContent = moeda(p.faltaPagar);

  $('vFaturaAtual').textContent = moeda(p.faturaAtual);
  $('vFaturaPrevista').textContent = moeda(p.faturaTotalPrevista);
  $('vFaturaPaga').textContent = moeda(p.faturaPaga);

  atualizarRotulosDeMes();
}

/** Guarda o mês selecionado no arquivo, como a planilha faz em D2/E2. */
function guardarMesSelecionado() {
  estado.dados.config.anoSelecionado = estado.ano;
  estado.dados.config.mesSelecionado = nomeDoMes(estado.mes);
  estado.dados.config.anoInvestimento = estado.anoInv;
  estado.dados.config.mesInvestimento = nomeDoMes(estado.mesInv);
  armazenamento.salvarComAtraso(estado.dados);
}

function mudarMes(passo) {
  // Porte de MudarMesEsquerda()/MudarMesDireita() e das versões
  // Investimento_MudarMes*, que mexem só no mês daquela aba.
  const proprio = temMesProprio(estado.tela);
  let mes = (proprio ? estado.mesInv : estado.mes) + passo;
  let ano = proprio ? estado.anoInv : estado.ano;

  if (mes < 1) { mes = 12; ano -= 1; }
  else if (mes > 12) { mes = 1; ano += 1; }

  if (proprio) { estado.mesInv = mes; estado.anoInv = ano; }
  else { estado.mes = mes; estado.ano = ano; estado.mesEscolhidoNaMao = true; }

  if (!proprio) atualizarPainel();
  telas.renderizarTela(estado.tela);
  atualizarRotulosDeMes();
  guardarMesSelecionado();
}

function irParaMesAtual() {
  const h = hoje();
  if (temMesProprio(estado.tela)) {
    estado.anoInv = h.getFullYear();
    estado.mesInv = h.getMonth() + 1;
  } else {
    estado.ano = h.getFullYear();
    estado.mes = h.getMonth() + 1;
    estado.mesEscolhidoNaMao = true;
    atualizarPainel();
  }
  telas.renderizarTela(estado.tela);
  atualizarRotulosDeMes();
  guardarMesSelecionado();
}

// ---------------------------------------------------------
// Planta de frequência
// ---------------------------------------------------------

function mostrarPlanta(resultado, { animar = true } = {}) {
  const { estagio, mensagem, cor, ultimaVisita, streak, gap, alterou } = resultado;
  const { escudos = 0, escudosQuebrados = 0, ganhouEscudo = false } = resultado;

  $('plantaDesenho').innerHTML = svgDaPlanta(estagio.chave);
  $('plantaEstagio').textContent = `${estagio.emoji} ${estagio.nome}`;

  const selo = $('plantaSelo');
  if (streak > 0) {
    selo.hidden = false;
    selo.textContent = streak === 1 ? '1 dia' : `${streak} dias seguidos`;
  } else if (gap > 0) {
    selo.hidden = false;
    selo.textContent = `${gap} dias fora`;
  } else {
    selo.hidden = true;
  }

  const msg = $('plantaMensagem');
  msg.textContent = mensagem;
  msg.style.color = cor;

  // Os escudos guardados, um selo por escudo. Os vazios aparecem
  // apagados, para dar para ver que existe espaço para mais.
  const caixa = $('plantaEscudos');
  caixa.hidden = escudos === 0;
  if (escudos > 0) {
    caixa.innerHTML = Array.from({ length: MAX_ESCUDOS }, (_, i) =>
      `<span class="planta__escudo${i < escudos ? '' : ' planta__escudo--vazio'}">` +
      `${svgDoEscudoMini()}</span>`).join('');
    caixa.title = escudos === 1
      ? '1 escudo guardado: ele cobre um dia que você não entrar.'
      : `${escudos} escudos guardados: cada um cobre um dia que você não entrar.`;
  }

  $('plantaVisita').textContent = ultimaVisita;
  $('cartaoPlanta').classList.toggle('planta--murcha', ESTAGIOS_MURCHOS.includes(estagio.chave));
  recompensas.atualizarSeloDaPlanta();

  // Rega a cada abertura do app, como um cumprimento. Só não rega
  // quando a planta está murchando por ausência: ali a mensagem é de
  // cobrança, e comemorar seria falso.
  //
  // O contador só SOBE na primeira entrada do dia — é quando a
  // sequência realmente cresceu. Reabrindo no mesmo dia a planta
  // recebe água, mas o número fica onde está, sem fingir avanço.
  // O escudo tem preferência sobre a rega: é a notícia do dia.
  if (animar && escudosQuebrados > 0) {
    animarEscudoQuebrando({ desenho: $('plantaDesenho'), quantos: escudosQuebrados });
    return;
  }
  if (animar && ganhouEscudo) {
    animarEscudoFormando({ desenho: $('plantaDesenho') });
    return;
  }

  if (animar && gap === 0 && streak > 0) {
    // Passou de estágio hoje? Então a tela começa mostrando o estágio
    // de ONTEM, para a mudança acontecer na frente da pessoa em vez de
    // já estar feita quando ela abre o app.
    const anterior = alterou && streak > 1 ? estagioCrescendo(streak - 1) : null;
    const subiuDeEstagio = anterior && anterior.chave !== estagio.chave;

    if (subiuDeEstagio) {
      $('plantaDesenho').innerHTML = svgDaPlanta(anterior.chave);
      $('plantaEstagio').textContent = `${anterior.emoji} ${anterior.nome}`;
    }

    animarRega({
      desenho: $('plantaDesenho'),
      selo: $('plantaSelo'),
      // Com 1 dia não há de onde contar: começar em 0 mostraria
      // "0 dias seguidos" antes de virar "1 dia".
      de: alterou && streak > 1 ? streak - 1 : streak,
      ate: streak,
      aoTerminar: subiuDeEstagio
        ? () => animarCrescimento({
            desenho: $('plantaDesenho'),
            rotulo: $('plantaEstagio'),
            estagio
          })
        : null
    });
  }
}

// ---------------------------------------------------------
// Reajuste do saldo em conta
// Porte de Início_Módulo.bas -> Sub ReajustarSaldoConta()
//
// O ajuste (célula O3) nunca é informado direto: o usuário diz
// quanto tem na conta agora e o app acumula a diferença.
// ---------------------------------------------------------

/** Lê "3200,50", "3.200,50" ou "3200.50" e devolve 3200.5 (NaN se não der). */
function lerNumero(texto) {
  let t = String(texto ?? '').trim().replace(/\s|R\$/g, '');
  if (!t) return NaN;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  if (temVirgula && temPonto) {
    // O último separador que aparece é o decimal.
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }
  return Number(t);
}

function abrirReajuste() {
  const p = calcularPainel(estado.dados, estado.ano, estado.mes);
  $('reajusteSaldoAtual').textContent = moeda(p.saldoConta);
  $('campoSaldoReal').value = '';
  $('reajusteDiferenca').textContent = 'O app lança sozinho a diferença como ajuste.';
  $('reajusteDiferenca').style.color = '';
  $('modalReajuste').hidden = false;
  $('campoSaldoReal').focus();
}

function fecharReajuste() {
  $('modalReajuste').hidden = true;
}

/** Mostra ao vivo a diferença que será lançada. */
function previsualizarReajuste() {
  const dica = $('reajusteDiferenca');
  const valorReal = lerNumero($('campoSaldoReal').value);

  if (!Number.isFinite(valorReal)) {
    dica.textContent = 'O app lança sozinho a diferença como ajuste.';
    dica.style.color = '';
    return;
  }

  const p = calcularPainel(estado.dados, estado.ano, estado.mes);
  const diferenca = valorReal - p.saldoConta;

  if (Math.abs(diferenca) < 0.005) {
    dica.textContent = 'O saldo já bate — nada a ajustar.';
    dica.style.color = 'var(--texto-fraco)';
    return;
  }

  const sinal = diferenca > 0 ? 'Acrescenta' : 'Desconta';
  dica.textContent = `${sinal} ${moeda(Math.abs(diferenca))} de ajuste.`;
  dica.style.color = diferenca > 0 ? 'var(--verde)' : 'var(--vermelho)';
}

async function confirmarReajuste() {
  const valorReal = lerNumero($('campoSaldoReal').value);
  if (!Number.isFinite(valorReal)) {
    alert('Informe um valor válido, por exemplo 3200,50.');
    $('campoSaldoReal').focus();
    return;
  }

  const p = calcularPainel(estado.dados, estado.ano, estado.mes);
  const diferenca = valorReal - p.saldoConta;

  estado.dados.config.ajusteSaldo =
    (Number(estado.dados.config.ajusteSaldo) || 0) + diferenca;
  // Carimbo próprio: é por ele que a junção sabe qual ajuste é o mais novo.
  estado.dados.config.atualizadoEm = agora();

  await armazenamento.salvar(estado.dados);
  atualizarPainel();
  fecharReajuste();
}

// ---------------------------------------------------------
// Navegação (menu inferior)
// ---------------------------------------------------------

// A troca de tela é decidida de forma síncrona: "ativa" é definida na
// hora e nunca mais tocada por callback. A animação só acrescenta a
// classe "saindo" (que já mostra a tela sozinha, via CSS) e a remove
// depois. Assim nenhum listener atrasado consegue esvaziar a tela.
let transicaoEmCurso = null;

function encerrarTransicao() {
  transicaoEmCurso?.abort();
  transicaoEmCurso = null;

  document.querySelectorAll('.tela').forEach((t) => {
    t.classList.remove('saindo', 'entrando');
    t.style.removeProperty('--desloca');
  });
}

function abrirTela(nome) {
  if (nome === estado.tela) return;

  const anterior = $(`tela-${estado.tela}`);
  const proxima = $(`tela-${nome}`);
  if (!proxima) return;

  encerrarTransicao();

  estado.telaAnterior = estado.tela;
  estado.tela = nome;
  telas.renderizarTela(nome);

  document.querySelectorAll('.menu__item').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.tela === nome);
  });

  // Estado final aplicado já: daqui em diante é só enfeite.
  document.querySelectorAll('.tela').forEach((t) => t.classList.toggle('ativa', t === proxima));

  atualizarRotulosDeMes();
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!anterior || anterior === proxima) return;

  // A tela desliza no sentido da navegação: para a esquerda quando
  // avança no menu, para a direita quando volta.
  const avancando = ORDEM_TELAS.indexOf(nome) > ORDEM_TELAS.indexOf(estado.telaAnterior);
  const desloca = `${avancando ? 22 : -22}px`;

  transicaoEmCurso = new AbortController();
  const { signal } = transicaoEmCurso;

  // Numera os filhos para a entrada em cascata.
  [...proxima.children].forEach((filho, i) => filho.style.setProperty('--i', i));

  anterior.style.setProperty('--desloca', desloca);
  anterior.classList.add('saindo');

  proxima.style.setProperty('--desloca', desloca);
  proxima.classList.add('entrando');

  const limpar = (elemento, classe) => (e) => {
    // Os filhos também emitem animationend, e o evento borbulha até
    // aqui: só o fim da animação da própria tela encerra a etapa.
    if (e.target !== elemento) return;
    elemento.classList.remove(classe);
    elemento.style.removeProperty('--desloca');
  };

  anterior.addEventListener('animationend', limpar(anterior, 'saindo'), { signal });
  proxima.addEventListener('animationend', limpar(proxima, 'entrando'), { signal });

  // Rede de segurança: se algum animationend não chegar (aba em segundo
  // plano, animação interrompida), a transição termina mesmo assim.
  setTimeout(() => { if (!signal.aborted) encerrarTransicao(); }, 700);
}

/** Mantém o rótulo do mês igual em todas as telas — porte de SincronizarAbas(). */
function atualizarRotulosDeMes() {
  const compartilhado = `${nomeDoMes(estado.mes)} de ${estado.ano}`;
  const investimento = `${nomeDoMes(estado.mesInv)} de ${estado.anoInv}`;

  document.querySelectorAll('[data-rotulo-mes]').forEach((el) => {
    const tela = el.closest('.tela')?.id.replace('tela-', '');
    el.textContent = temMesProprio(tela) ? investimento : compartilhado;
  });
  $('rotuloMesTexto').textContent = compartilhado;
}

// ---------------------------------------------------------
// Configuração
// ---------------------------------------------------------

function atualizarInfoOrigem() {
  atualizarDisponibilidadeSincronia();
  $('origemModo').textContent = armazenamento.descricaoModo;
  $('origemCaminho').textContent = armazenamento.descricaoOrigem;
  $('origemInfo').classList.toggle('origem--aviso', !armazenamento.configurado);

  const d = estado.dados;
  $('resumoDados').textContent =
    `${d.receitas.length} receitas · ${d.despesas.length} despesas · ` +
    `${d.devedores.length} devedores · ${d.investimento.length} lançamentos de investimento · ` +
    `${d.logAcesso.length} dias no log de acesso`;

  // Versão e carimbos: é o que permite comparar dois aparelhos quando
  // alguém diz que um valor "voltou sozinho".
  $('versaoApp').textContent = `Versão ${VERSAO}`;
  // Se já tem versão nova baixada, o rótulo da versão avisa. No
  // computador a troca é sozinha; no celular o Android sempre pergunta,
  // então o rótulo vira um botão — é a saída para quem disse "agora
  // não" da primeira vez.
  atualizacaoEsperando().then((nova) => {
    if (!nova) return;
    const rotulo = $('versaoApp');
    if (window.cfAPI) {
      rotulo.textContent =
        `Versão ${VERSAO} · a ${nova.versao} já baixou, entra quando você fechar o app`;
      return;
    }
    rotulo.textContent = `Versão ${VERSAO} · toque para instalar a ${nova.versao}`;
    rotulo.classList.add('campo__dica--toque');
    rotulo.onclick = () => instalarAgora();
  });

  const sinc = lerConfiguracao();
  const quandoFoi = (iso) => {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR') : '—';
  };
  $('diagnostico').textContent =
    `Ajuste de saldo alterado em ${quandoFoi(d.config?.atualizadoEm)} · ` +
    `dados gravados em ${quandoFoi(d.salvoEm)} · ` +
    (estaLigada()
      ? `sincronia ligada, última em ${quandoFoi(sinc.em)}`
      : 'sincronia desligada');

  const semSuporte = armazenamento.modo === 'local';
  $('btnEscolherArquivo').disabled = semSuporte;
  $('btnCriarArquivo').disabled = semSuporte;
  $('btnDesvincular').disabled = semSuporte || !armazenamento.configurado;
  if (semSuporte) {
    $('dicaArquivo').innerHTML =
      'Este navegador não permite gravar direto em arquivo. Os dados ficam salvos ' +
      'neste navegador — use <strong>Exportar</strong> e <strong>Importar</strong> para levar no pendrive, ' +
      'ou abra o app no Chrome/Edge (ou pela versão Electron) para gravação automática.';
  }

  atualizarFaixa();
  atualizarSubtitulo();
}

function atualizarSubtitulo() {
  const h = hoje();
  $('marcaSub').textContent =
    (armazenamento.configurado
      ? `${armazenamento.descricaoOrigem} · hoje é ${formatarData(h)}`
      : `Sem arquivo configurado · hoje é ${formatarData(h)}`) + ` · v${VERSAO}`;
  $('rotuloHoje').textContent = `hoje: ${formatarData(h)}`;
}

function atualizarFaixa() {
  const faixa = $('faixaAviso');
  if (armazenamento.configurado || armazenamento.modo === 'local') {
    faixa.hidden = true;
    return;
  }
  faixa.hidden = false;
  $('faixaTexto').textContent = armazenamento.handle
    ? 'Clique para reconectar ao arquivo de dados do pendrive.'
    : 'Sem arquivo de dados: nada está sendo gravado no pendrive.';
  $('faixaBotao').textContent = armazenamento.handle ? 'Reconectar' : 'Configurar';
}

function abrirConfig() {
  $('valorAjusteSaldo').textContent = moeda(estado.dados.config.ajusteSaldo ?? 0);
  atualizarInfoOrigem();
  $('modalConfig').hidden = false;
}

function fecharConfig() {
  $('modalConfig').hidden = true;
}

async function recarregarDoArquivo() {
  estado.dados = await armazenamento.carregar();
  aplicarMesSalvo();
  aplicarPersonalizacao();
  atualizarPainel();
  telas.renderizarTela(estado.tela);
  atualizarInfoOrigem();
}

function aplicarMesSalvo() {
  const n = numeroDoMes(estado.dados.config.mesSelecionado);
  if (n >= 1) estado.mes = n;
  const ano = Number(estado.dados.config.anoSelecionado);
  if (ano >= 1900) estado.ano = ano;

  const nInv = numeroDoMes(estado.dados.config.mesInvestimento);
  if (nInv >= 1) estado.mesInv = nInv;
  const anoInv = Number(estado.dados.config.anoInvestimento);
  if (anoInv >= 1900) estado.anoInv = anoInv;
}

// ---------------------------------------------------------
// Semente inicial: se o app roda por http e ainda não há dados,
// tenta ler o JSON que acompanha o app.
// ---------------------------------------------------------

async function tentarSementeInicial() {
  // Só na primeiríssima carga: nenhum lançamento E nenhum acesso
  // registrado. Sem a checagem do log, um arquivo de dados vazio
  // apagaria o progresso de recompensas a cada abertura.
  const intocado =
    estado.dados.receitas.length === 0 &&
    estado.dados.despesas.length === 0 &&
    estado.dados.devedores.length === 0 &&
    estado.dados.investimento.length === 0 &&
    estado.dados.logAcesso.length === 0;
  if (!intocado || armazenamento.configurado) return;

  try {
    const resp = await fetch('../dados/controle-financeiro.json', { cache: 'no-store' });
    if (!resp.ok) return;
    const bruto = await resp.json();

    // Um arquivo vazio não tem nada a semear.
    const temConteudo = ['receitas', 'despesas', 'devedores', 'investimento']
      .some((k) => Array.isArray(bruto?.[k]) && bruto[k].length > 0);
    if (!temConteudo) return;

    estado.dados = { ...DADOS_PADRAO, ...bruto, config: { ...DADOS_PADRAO.config, ...bruto.config } };
    aplicarMesSalvo();
  } catch {
    // file:// bloqueia fetch — normal, o usuário escolhe o arquivo pela configuração
  }
}

// ---------------------------------------------------------
// Ligações de eventos
// ---------------------------------------------------------

function ligarEventos() {
  $('btnMesAnterior').addEventListener('click', () => mudarMes(-1));
  $('btnMesSeguinte').addEventListener('click', () => mudarMes(1));
  $('rotuloMes').addEventListener('click', irParaMesAtual);

  // Navegadores de mês das telas de lista (o mês é compartilhado,
  // como o SincronizarAbas() fazia entre as abas da planilha).
  document.querySelectorAll('[data-navmes] [data-mes]').forEach((b) => {
    b.addEventListener('click', () => mudarMes(Number(b.dataset.mes)));
  });
  document.querySelectorAll('[data-mes-hoje]').forEach((b) => {
    b.addEventListener('click', irParaMesAtual);
  });
  $('btnTema').addEventListener('click', alternarTema);

  document.querySelectorAll('.menu__item').forEach((b) => {
    b.addEventListener('click', () => abrirTela(b.dataset.tela));
  });

  $('btnReajustar').addEventListener('click', abrirReajuste);
  $('btnFecharReajuste').addEventListener('click', fecharReajuste);
  $('btnCancelarReajuste').addEventListener('click', fecharReajuste);
  ligarMascaraValor($('campoSaldoReal'));
  $('campoSaldoReal').addEventListener('input', previsualizarReajuste);
  $('formReajuste').addEventListener('submit', (e) => {
    e.preventDefault();
    confirmarReajuste();
  });
  $('modalReajuste').addEventListener('click', (e) => {
    if (e.target === $('modalReajuste')) fecharReajuste();
  });

  $('btnConfig').addEventListener('click', abrirConfig);
  $('btnFecharConfig').addEventListener('click', fecharConfig);
  $('btnCancelarConfig').addEventListener('click', fecharConfig);
  $('modalConfig').addEventListener('click', (e) => {
    if (e.target === $('modalConfig')) fecharConfig();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('modalReajuste').hidden) fecharReajuste();
    else if (!$('modalConfig').hidden) fecharConfig();
  });

  $('faixaBotao').addEventListener('click', async () => {
    if (armazenamento.handle) {
      if (await armazenamento.reconectar()) {
        await recarregarDoArquivo();
        return;
      }
    }
    abrirConfig();
  });

  $('btnEscolherArquivo').addEventListener('click', async () => {
    try {
      if (await armazenamento.escolherArquivo()) await recarregarDoArquivo();
    } catch (e) {
      if (e.name !== 'AbortError') alert('Não foi possível abrir o arquivo: ' + e.message);
    }
  });

  $('btnCriarArquivo').addEventListener('click', async () => {
    try {
      if (await armazenamento.criarArquivo(estado.dados)) {
        await recarregarDoArquivo();
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Não foi possível criar o arquivo: ' + e.message);
    }
  });

  $('btnDesvincular').addEventListener('click', async () => {
    // Antes isto só esquecia o caminho — e o app reabria com tudo no
    // lugar, porque continuava lendo o espelho guardado dentro dele.
    // Parecia que o botão não funcionava. Agora ele zera de fato, e
    // diz isso antes.
    const ligada = estaLigada();
    const aviso =
      'Isto vai ZERAR o aplicativo neste aparelho.\n\n' +
      '• O app esquece o arquivo de dados e apaga a cópia guardada aqui dentro.\n' +
      '• O arquivo .json no disco NÃO é apagado — dá para voltar apontando para ele.\n' +
      (ligada
        ? '• A sincronia está LIGADA: na próxima sincronização os dados voltam do banco.\n'
        : '') +
      '\nExporte um backup antes, se ainda não exportou.';

    if (!await confirmar(aviso, { rotuloOk: 'Desvincular e zerar', perigo: true })) return;

    await armazenamento.desvincular();
    armazenamento.limparEspelho();
    // Recomeçar do zero é mais seguro que remendar a tela: tudo que
    // está em memória some junto.
    window.location.reload();
  });

  $('btnExportar').addEventListener('click', () => armazenamento.exportar(estado.dados));

  // O seletor de arquivos do Android não entende ".json" nem casa com
  // application/json: com esse filtro ele mostra a pasta vazia. No
  // aplicativo, deixa escolher qualquer arquivo.
  if (window.Capacitor?.isNativePlatform?.()) $('inputImportar').accept = '*/*';

  $('btnImportar').addEventListener('click', () => $('inputImportar').click());
  $('inputImportar').addEventListener('change', async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    try {
      estado.dados = await armazenamento.importarDeArquivo(arquivo);
      aplicarMesSalvo();
      await armazenamento.salvar(estado.dados);
      atualizarPainel();
      atualizarInfoOrigem();
      alert('Dados importados.');
    } catch (err) {
      alert('Arquivo inválido: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  $('btnSalvarConfig').addEventListener('click', async () => {
    await armazenamento.salvar(estado.dados);
    atualizarPainel();
    fecharConfig();
  });
}

/**
 * Mede o cabeçalho e a barra de ações e publica as alturas em
 * --topo-fixo / --altura-barra-acoes. É o que diz ao CSS onde a barra
 * de busca e ações deve grudar quando a página rola.
 */
function medirTopoFixo() {
  const cabecalho = document.querySelector('.cabecalho');
  if (!cabecalho) return;

  const aplicar = () => {
    const raiz = document.documentElement;
    raiz.style.setProperty('--topo-fixo', `${Math.round(cabecalho.offsetHeight)}px`);
    const barra = document.querySelector('.tela.ativa .barra-acoes');
    if (barra) raiz.style.setProperty('--altura-barra-acoes', `${Math.round(barra.offsetHeight)}px`);
  };

  aplicar();

  const observador = new ResizeObserver(aplicar);
  observador.observe(cabecalho);

  // As barras de ação também entram na conta: cada tela tem a sua, e a
  // altura muda ao trocar de tela (e ao os botões passarem a caber numa
  // fileira só). Sem observar todas elas, a barra de seleção grudava na
  // altura medida da primeira tela e cobria os botões.
  document.querySelectorAll('.barra-acoes').forEach((b) => observador.observe(b));

  window.addEventListener('resize', aplicar);
}

// ---------------------------------------------------------
// Sincronia entre aparelhos (opcional)
//
// Sem endereço e token guardados neste aparelho, nada aqui roda e o
// app nunca toca na rede. Quem não configura não percebe diferença.
// ---------------------------------------------------------

let sincronizando = false;
let agendada = null;

function clienteDaSincronia() {
  const { url, token } = lerConfiguracao();
  return criarCliente({ url, token });
}

function contarTempo(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} dias`;
}

let sumirAviso = null;

/**
 * Aviso no alto da tela. A engrenagem mostra o estado detalhado, mas
 * ela costuma estar fechada — sem isto, puxar a tela ou apertar F5
 * não daria sinal nenhum de vida.
 */
function mostrarAviso(texto, { girando = false, erro = false, sumirEm = 0 } = {}) {
  const aviso = $('sincAviso');
  if (!aviso) return;
  clearTimeout(sumirAviso);
  $('sincAvisoTexto').textContent = texto;
  aviso.style.removeProperty('--puxada');
  aviso.classList.remove('sincaviso--puxando');
  aviso.classList.toggle('sincaviso--girando', girando);
  aviso.classList.toggle('sincaviso--erro', erro);
  aviso.classList.toggle('sincaviso--pronto', !girando && !erro);
  aviso.classList.add('sincaviso--visivel');
  if (sumirEm) sumirAviso = setTimeout(() => esconderAviso(), sumirEm);
}

function esconderAviso() {
  const aviso = $('sincAviso');
  if (!aviso) return;
  clearTimeout(sumirAviso);
  aviso.classList.remove('sincaviso--visivel', 'sincaviso--puxando');
  aviso.style.removeProperty('--puxada');
}

function mostrarEstadoSincronia(texto = null, cor = '') {
  const alvo = $('sincEstado');
  if (!alvo) return;
  const { em } = lerConfiguracao();
  const ligada = estaLigada();
  $('btnSincDesligar').hidden = !ligada;
  alvo.style.color = cor;
  if (texto) { alvo.textContent = texto; return; }
  alvo.textContent = !ligada
    ? 'Desligada — os dados ficam só neste aparelho.'
    : em ? `Ligada · sincronizado ${contarTempo(em)}.`
         : 'Ligada · ainda não sincronizou.';
}

/**
 * Uma rodada. `silenciosa` é o caso automático: falhar aí não pode
 * atrapalhar quem está usando o app — o dado continua salvo aqui e a
 * próxima tentativa resolve.
 */
async function sincronizarAgora({ silenciosa = false } = {}) {
  // Vale para o botão e para os caminhos automáticos (F5, puxar para
  // atualizar, o agendado depois de cada mudança).
  if (armazenamento.modo === 'electron' && !armazenamento.configurado) {
    if (!silenciosa) {
      mostrarEstadoSincronia('Escolha ou crie o arquivo de dados antes de ligar o banco.',
        'var(--ambar)');
      mostrarAviso('Sem arquivo de dados — não dá para sincronizar.',
        { erro: true, sumirEm: 3200 });
    }
    return;
  }

  const cliente = clienteDaSincronia();

  // Sair calado aqui era um buraco: sem endereço e token o botão não
  // fazia nada e não dizia nada. Acontece justamente depois de
  // "limpar dados" no Android, que apaga a configuração junto.
  if (!cliente) {
    if (!silenciosa) {
      mostrarEstadoSincronia(
        'Falta o endereço do banco e o token — preencha os dois campos acima.',
        'var(--ambar)');
      mostrarAviso('Sincronia desligada — configure na engrenagem.',
        { erro: true, sumirEm: 3200 });
    }
    return;
  }

  if (sincronizando) {
    if (!silenciosa) mostrarEstadoSincronia('Já estou sincronizando, aguarde…');
    return;
  }

  sincronizando = true;
  mostrarEstadoSincronia('Sincronizando…');
  if (!silenciosa) mostrarAviso('Sincronizando…', { girando: true });

  try {
    const { marca } = lerConfiguracao();
    const r = await sincronizar({ cliente, dados: estado.dados, desde: marca });

    // Passar pelo normalizar é o que faz o depois-da-sincronia ser
    // igual ao depois-de-reabrir. Sem isso o objeto recém-juntado
    // entra cru no app, e sobrava a diferença que aparecia como
    // "só arrumou quando reabri": alguns números saíam de um estado
    // que a abertura teria limpado.
    estado.dados = normalizar(r.dados);
    // Guardar a marca só agora: se algo acima falhou, a próxima
    // rodada refaz tudo em vez de pular o que não subiu.
    gravarConfiguracao({ marca: r.marca, em: new Date().toISOString() });

    await armazenamento.salvar(estado.dados);

    // O mês selecionado viaja dentro da configuração. A abertura o
    // aplica; a sincronia também precisa — senão o painel fica
    // somando as pendências de um mês e mostrando o rótulo de outro.
    // Só que aqui não se atropela quem já navegou na mão.
    if (!estado.mesEscolhidoNaMao) aplicarMesSalvo();

    // Tema e fundo também descem junto.
    aplicarPersonalizacao();

    atualizarPainel();
    telas.renderizarTela(estado.tela);
    atualizarRotulosDeMes();

    // A sequência da planta sai da união dos dias de acesso dos dois
    // aparelhos. Ela é calculada na abertura do app, então sem
    // recalcular aqui o cartão ficaria mostrando o número de antes da
    // sincronia. Registrar de novo é seguro: no mesmo dia não duplica
    // e não repete a rega.
    mostrarPlanta(registrarAcesso(estado.dados), { animar: false });
    lembretes.reagendar(estado.dados);
    atualizarWidget(estado.dados);

    const { adicionados, atualizados, apagados, enviados, reetiquetados } = r.resumo;
    const partes = [];
    if (adicionados) partes.push(`${adicionados} recebidos`);
    if (atualizados) partes.push(`${atualizados} atualizados`);
    if (apagados) partes.push(`${apagados} apagados`);
    if (enviados) partes.push(`${enviados} enviados`);
    if (reetiquetados) partes.push(`${reetiquetados} reetiquetados`);
    const recado = partes.length
      ? `Sincronizado · ${partes.join(', ')}.`
      : 'Tudo em dia — nada novo.';
    mostrarEstadoSincronia(recado, 'var(--verde)');
    if (!silenciosa) mostrarAviso(recado, { sumirEm: 2600 });
    else esconderAviso();
  } catch (e) {
    console.warn('Sincronia falhou:', e);
    mostrarEstadoSincronia(`Não deu para sincronizar: ${e.message}`, 'var(--ambar)');
    if (!silenciosa) mostrarAviso(`Não deu para sincronizar: ${e.message}`, { erro: true, sumirEm: 4200 });
    else esconderAviso();
  } finally {
    sincronizando = false;
  }
}

/**
 * Depois de mexer nos dados, sincroniza — mas sem correr atrás de cada
 * toque. A espera curta junta uma rajada de mudanças (marcar dez
 * contas como pagas, por exemplo) numa subida só, em vez de dez.
 */
const ESPERA_SINCRONIA = 1500;

function agendarSincronia() {
  if (!estaLigada()) return;
  clearTimeout(agendada);
  agendada = setTimeout(() => { agendada = null; sincronizarAgora({ silenciosa: true }); },
    ESPERA_SINCRONIA);
}

/**
 * Fechar o app ou trocar de aplicativo no meio da espera deixaria a
 * mudança sem subir até a próxima abertura. Aqui ela é despachada na
 * hora. O dado nunca se perde — ele já está salvo neste aparelho —,
 * mas assim ele chega no outro sem atraso.
 */
function despacharPendente() {
  if (!agendada) return;
  clearTimeout(agendada);
  agendada = null;
  sincronizarAgora({ silenciosa: true });
}

function ligarDespachoAoSair() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') despacharPendente();
  });
  window.addEventListener('pagehide', despacharPendente);
  window.addEventListener('blur', despacharPendente);
}

/**
 * Puxar a tela para baixo (celular) e F5 (computador) fazem a mesma
 * coisa: sincronizar. O gesto só é armado quando a sincronia está
 * ligada — oferecer o puxão a quem não sincroniza seria promessa vazia.
 */
function ligarAtualizarPuxando() {
  const LIMITE = 70;       // quanto puxar para disparar
  const RESISTENCIA = 0.45; // o aviso anda menos que o dedo
  let inicioY = null;
  let puxada = 0;

  const aviso = () => $('sincAviso');

  document.addEventListener('touchstart', (e) => {
    if (!estaLigada() || sincronizando) return;
    if (window.scrollY > 0 || e.touches.length !== 1) return;
    // Não sequestra o gesto dentro de algo que rola sozinho.
    if (e.target.closest('.tabela-rolagem, .modal, .acoes')) return;
    inicioY = e.touches[0].clientY;
    puxada = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (inicioY === null) return;
    const delta = e.touches[0].clientY - inicioY;
    if (delta <= 0 || window.scrollY > 0) { inicioY = null; return; }

    e.preventDefault();
    puxada = Math.min(delta * RESISTENCIA, LIMITE + 24);
    const el = aviso();
    el.classList.add('sincaviso--visivel', 'sincaviso--puxando', 'sincaviso--pronto');
    el.style.setProperty('--puxada', `${puxada}px`);
    $('sincAvisoTexto').textContent = puxada >= LIMITE ? 'Solte para sincronizar' : 'Puxe para sincronizar';
  }, { passive: false });

  const soltar = () => {
    if (inicioY === null) return;
    const disparar = puxada >= LIMITE;
    inicioY = null;
    puxada = 0;
    aviso().classList.remove('sincaviso--puxando');
    aviso().style.removeProperty('--puxada');
    if (disparar) sincronizarAgora();
    else esconderAviso();
  };

  document.addEventListener('touchend', soltar, { passive: true });
  document.addEventListener('touchcancel', soltar, { passive: true });

  // F5 no computador: sincroniza em vez de recarregar a janela.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F5' || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (estaLigada()) sincronizarAgora();
    else mostrarAviso('Sincronia desligada — configure na engrenagem.',
      { erro: true, sumirEm: 3200 });
  });
}

/**
 * No computador, o banco só entra depois que existe um arquivo.
 *
 * Sem arquivo o app está lendo o espelho interno, que é provisório
 * por natureza. Ligar o banco nesse estado é o caminho mais curto
 * para os dados descerem e não serem gravados em lugar nenhum. No
 * Android e no navegador não existe essa escolha — lá o próprio
 * armazenamento do aparelho é o destino final —, então nada é
 * trancado.
 */
function atualizarDisponibilidadeSincronia() {
  const faltaArquivo = armazenamento.modo === 'electron' && !armazenamento.configurado;
  for (const id of ['campoSincUrl', 'campoSincToken', 'btnSincTestar', 'btnSincAgora']) {
    $(id).disabled = faltaArquivo;
  }
  $('sincSemArquivo').hidden = !faltaArquivo;
  return !faltaArquivo;
}

function mostrarEstadoLembrete(texto, cor) {
  const el = $('lembreteEstado');
  el.textContent = texto;
  el.style.color = cor || '';
}

/**
 * A seção só existe onde o aviso funciona de verdade: o aplicativo
 * Android. No computador o app só notifica enquanto está aberto, e
 * um aviso assim não lembra ninguém de nada — ali a própria tela
 * inicial já mostra o estado da planta.
 */
function ligarEventosLembretes() {
  if (!lembretes.disponivel()) return;

  const bloco = $('blocoLembretes');
  bloco.hidden = false;

  const cfg = lembretes.lerConfiguracao();
  $('lembreteLigado').checked = cfg.ligado;
  $('lembreteHora').value = cfg.hora;
  mostrarEstadoLembrete(cfg.ligado ? `Avisa às ${cfg.hora} nos dias que você esquecer.` : 'Desligado.');

  $('lembreteLigado').addEventListener('change', async (e) => {
    if (e.target.checked) {
      // A permissão só pode ser pedida a partir de um toque da pessoa.
      if (!await lembretes.pedirPermissao()) {
        e.target.checked = false;
        lembretes.gravarConfiguracao({ ligado: false });
        mostrarEstadoLembrete(
          'O Android não liberou as notificações. Libere em Configurações → Aplicativos → ' +
          'Controle Financeiro → Notificações.', 'var(--ambar)');
        return;
      }
      const c = lembretes.gravarConfiguracao({ ligado: true });
      await lembretes.reagendar(estado.dados);
      mostrarEstadoLembrete(`Avisa às ${c.hora} nos dias que você esquecer.`, 'var(--verde)');
    } else {
      lembretes.gravarConfiguracao({ ligado: false });
      await lembretes.desligar();
      mostrarEstadoLembrete('Desligado.');
    }
  });

  $('lembreteHora').addEventListener('change', async () => {
    const hora = $('lembreteHora').value || '20:00';
    const c = lembretes.gravarConfiguracao({ hora });
    if (!c.ligado) return mostrarEstadoLembrete('Desligado.');
    await lembretes.reagendar(estado.dados);
    mostrarEstadoLembrete(`Avisa às ${c.hora} nos dias que você esquecer.`, 'var(--verde)');
  });
}

/**
 * Congela a camada viva quando o app sai da frente.
 *
 * O navegador já reduz o ritmo de animação de aba escondida por
 * conta própria, mas no Android o app pode ficar visível atrás de
 * outra janela, e um fundo animado rodando à toa é bateria indo
 * embora sem ninguém olhando.
 */
function ligarPausaDoFundo() {
  const camada = $('fundoVivo');
  if (!camada) return;
  const ajustar = () =>
    camada.classList.toggle('fundo-vivo--parado', document.hidden);
  document.addEventListener('visibilitychange', ajustar);
  ajustar();
}

function ligarEventosSincronia() {
  const { url, token } = lerConfiguracao();
  $('campoSincUrl').value = url;
  $('campoSincToken').value = token;
  mostrarEstadoSincronia();

  const guardar = () => gravarConfiguracao({
    url: $('campoSincUrl').value.trim(),
    token: $('campoSincToken').value.trim()
  });

  $('campoSincUrl').addEventListener('change', () => { guardar(); mostrarEstadoSincronia(); });
  $('campoSincToken').addEventListener('change', () => { guardar(); mostrarEstadoSincronia(); });

  $('btnSincTestar').addEventListener('click', async () => {
    guardar();
    const cliente = clienteDaSincronia();
    if (!cliente) return mostrarEstadoSincronia('Preencha o endereço e o token.', 'var(--ambar)');
    mostrarEstadoSincronia('Testando…');
    try {
      await cliente.testar();
      mostrarEstadoSincronia('Conexão certa. Pode sincronizar.', 'var(--verde)');
    } catch (e) {
      mostrarEstadoSincronia(`Não conectou: ${e.message}`, 'var(--ambar)');
    }
  });

  $('btnSincAgora').addEventListener('click', () => { guardar(); sincronizarAgora(); });

  $('btnSincDesligar').addEventListener('click', async () => {
    if (!await confirmar('Desligar a sincronização deste aparelho? Os dados continuam aqui.',
      { rotuloOk: 'Desligar' })) return;
    limparConfiguracao();
    $('campoSincUrl').value = '';
    $('campoSincToken').value = '';
    mostrarEstadoSincronia();
  });
}

// ---------------------------------------------------------
// Início
// ---------------------------------------------------------

async function iniciar() {
  await armazenamento.iniciar();
  estado.dados = await armazenamento.carregar();
  await tentarSementeInicial();
  aplicarMesSalvo();

  // As telas de lista compartilham o mês e o mesmo objeto de dados.
  telas.configurar({
    get dados() { return estado.dados; },
    set dados(v) { estado.dados = v; },
    get ano() { return estado.ano; },
    get mes() { return estado.mes; },
    mesInvestimento: () => ({ ano: estado.anoInv, mes: estado.mesInv }),
    irParaTela: abrirTela,
    aoMudarDados() {
      atualizarWidget(estado.dados);
      atualizarPainel();
      telas.renderizarTela(estado.tela);
      armazenamento.salvar(estado.dados).catch((e) => armazenamento.relatarFalha(e));
      agendarSincronia();
    }
  });

  recompensas.configurar({
    get dados() { return estado.dados; },
    aoMudarPersonalizacao() {
      aplicarPersonalizacao();
      armazenamento.salvarComAtraso(estado.dados);
    }
  });

  aplicarPersonalizacao();

  // Presente da atualização: escudos dados uma vez só, marcados pela
  // versão que os deu. Entra ANTES de registrar o acesso, para já
  // poder cobrir um dia perdido nesta mesma abertura.
  const ganhouPresente = estado.dados.escudoBonusVersao !== BONUS_VERSAO;
  if (ganhouPresente) {
    estado.dados.escudoBonus = (Number(estado.dados.escudoBonus) || 0) + BONUS_ESCUDOS;
    estado.dados.escudoBonusVersao = BONUS_VERSAO;
  }

  // Porte de Workbook_Open(): atualiza o painel e registra o acesso.
  const acesso = registrarAcesso(estado.dados);
  // O presente tem a cena só para ele: a planta aparece parada e o
  // escudo se forma na frente da pessoa.
  mostrarPlanta(acesso, { animar: !ganhouPresente });
  if (ganhouPresente) {
    mostrarAviso(`Você ganhou ${BONUS_ESCUDOS} escudos de sequência!`, { sumirEm: 4200 });
    animarEscudoFormando({ desenho: $('plantaDesenho') });
  }
  atualizarPainel();
  atualizarInfoOrigem();
  medirTopoFixo();
  ligarEventos();
  telas.ligarEventosTelas();
  recompensas.ligarEventos();

  if (acesso.alterou || ganhouPresente) {
    armazenamento.salvar(estado.dados).catch((e) => armazenamento.relatarFalha(e));
  }

  ligarEventosSincronia();
  ligarEventosLembretes();
  // Uma falha de gravação não pode morrer no console: no celular o
  // armazenamento do app é o único lugar onde os dados existem.
  armazenamento.aoFalharSalvar = (e) =>
    mostrarAviso(e?.message || 'Não consegui salvar a última alteração.',
      { erro: true, sumirEm: 6000 });

  ligarPausaDoFundo();
  ligarTerminalVivo();
  // O acesso de hoje já foi registrado acima: reagendar aqui apaga o
  // aviso de hoje (não é mais preciso) e reescreve o dos próximos dias
  // com a sequência nova.
  lembretes.reagendar(estado.dados);
  atualizarWidget(estado.dados);
  ligarAtualizarPuxando();
  ligarDespachoAoSair();
  // Ao abrir, busca o que os outros aparelhos deixaram. Em silêncio:
  // se não houver rede, o app já está pronto para uso do mesmo jeito.
  if (estaLigada()) sincronizarAgora({ silenciosa: true });
  // Atualização: no Android é aqui que ela acontece; no computador o
  // Electron cuida por fora e esta chamada não faz nada.
  cuidarDaAtualizacao();
}

iniciar().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<pre style="padding:16px;color:#c8353c">Erro ao iniciar: ${e.message}</pre>`
  );
});
