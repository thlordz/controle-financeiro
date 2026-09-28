// =========================================================
// Controle Financeiro — a abertura do app.
//
// Este arquivo não desenha nada e não calcula nada. Ele só coloca as
// peças no lugar e nessa ordem:
//
//   abertura → ler o arquivo → presente de escudos → registrar o
//   acesso do dia → entregar os dados para a tela → sincronizar →
//   procurar versão nova
//
// Quem desenha é `tela.js`. Quem faz conta é `calculos.js` e
// `planta.js`. Quem grava é `armazenamento.js`. Essa divisão é de
// propósito: o desenho mudou inteiro e nenhum daqueles precisou ser
// tocado.
// =========================================================

import { armazenamento } from './armazenamento.js';
import { BONUS_VERSAO, BONUS_ESCUDOS } from './versao.js';
import { registrarAcesso } from './planta.js';
import * as lembretes from './lembretes.js';
import { atualizarWidget } from './widget.js';
import { cuidarDaAtualizacao } from './atualizacao.js';
import { sincronizar, estaLigada } from './sincronia.js';
import { normalizar } from './armazenamento.js';
import { iniciarTela, redesenharTudo, quandoMexer, avisar } from './tela.js';
import { abrirAbertura, passo, fecharAbertura, falharAbertura } from './abertura.js';

let dados = null;
let sincroniaMarcada = null;

/**
 * Chamado pela tela sempre que alguma coisa muda. Grava de imediato e
 * marca uma sincronia para daqui a pouco, para não subir a cada tecla.
 */
function aoMexer(novos) {
  dados = novos;
  atualizarWidget(dados);
  armazenamento.salvar(dados).catch((e) => armazenamento.relatarFalha(e));
  if (!estaLigada()) return;
  clearTimeout(sincroniaMarcada);
  sincroniaMarcada = setTimeout(() => sincronizarEmSilencio(), 4000);
}

async function sincronizarEmSilencio() {
  try {
    const r = await sincronizar(dados);
    if (r?.dados) {
      // Depois de juntar, o arquivo é outro: normalizar de novo é o
      // que garante que a tela receba tudo no formato que ela espera.
      dados = normalizar(r.dados);
      await armazenamento.salvar(dados);
      redesenharTudo(dados);
    }
  } catch (e) {
    console.warn('Sincronia:', e?.message || e);
  }
}

/** Primeira carga: tenta a semente que vem junto com o pacote. */
async function tentarSementeInicial() {
  const intocado =
    dados.receitas.length === 0 && dados.despesas.length === 0 &&
    dados.devedores.length === 0 && dados.investimento.length === 0 &&
    dados.logAcesso.length === 0;
  if (!intocado || armazenamento.configurado) return;
  try {
    const resp = await fetch('../dados/controle-financeiro.json', { cache: 'no-store' });
    if (!resp.ok) return;
    dados = normalizar(await resp.json());
  } catch { /* sem semente, começa vazio mesmo */ }
}

async function iniciar() {
  abrirAbertura();

  passo('lendo', 22);
  await armazenamento.iniciar();
  dados = await armazenamento.carregar();
  await tentarSementeInicial();

  // Presente da atualização: escudos dados uma vez só, marcados pela
  // versão que os deu. Entra ANTES de registrar o acesso, para já
  // poder cobrir um dia perdido nesta mesma abertura.
  const ganhouPresente = dados.escudoBonusVersao !== BONUS_VERSAO;
  if (ganhouPresente) {
    dados.escudoBonus = (Number(dados.escudoBonus) || 0) + BONUS_ESCUDOS;
    dados.escudoBonusVersao = BONUS_VERSAO;
  }

  const acesso = registrarAcesso(dados);

  passo('juntando', 55);
  quandoMexer(aoMexer);
  iniciarTela(dados);

  // Uma falha de gravação não pode morrer no console: no celular o
  // armazenamento do app é o único lugar onde os dados existem.
  armazenamento.aoFalharSalvar = (e) =>
    avisar(e?.message || 'Não consegui salvar a última alteração.');

  if (acesso.alterou || ganhouPresente) {
    armazenamento.salvar(dados).catch((e) => armazenamento.relatarFalha(e));
  }

  lembretes.reagendar(dados);
  atualizarWidget(dados);

  if (ganhouPresente) {
    setTimeout(() => avisar(`Você ganhou ${BONUS_ESCUDOS} escudos de sequência!`), 1400);
  }

  passo('atualizando', 82);
  fecharAbertura();

  // Estes dois ficam para depois da abertura de propósito: são coisas
  // de rede, e ninguém deve esperar a internet para ver o saldo.
  if (estaLigada()) sincronizarEmSilencio();
  cuidarDaAtualizacao();
}

iniciar().catch((e) => {
  console.error(e);
  falharAbertura('Deu ruim ao abrir: ' + (e?.message || e));
});
