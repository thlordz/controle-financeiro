// =========================================================
// Camada de armazenamento
//
// Funciona em três modos, escolhidos automaticamente:
//   1. electron  -> grava direto no arquivo pelo Node (fs)
//   2. arquivo   -> File System Access API (Chrome/Edge), grava
//                   direto no JSON escolhido no pendrive
//   3. local     -> localStorage + importar/exportar. É o modo do
//                   aplicativo Android, onde não há pendrive nem
//                   seletor de arquivos: os dados moram no próprio
//                   aparelho e o backup sai pelo botão de exportar.
//
// O botão de configuração do app é quem informa qual arquivo
// de dados usar.
// =========================================================

import { salvarArquivo } from './formulario.js';
import { podarRemovidos, anotarCarimbo } from './dominio.js';
import { nomeDoMes, hoje } from './util.js';

export const DADOS_PADRAO = Object.freeze({
  versao: 1,
  config: {
    // Ajuste acumulado do saldo em conta (célula O3 da aba Início).
    // Nunca é digitado direto: só muda pelo botão "Reajustar" do painel.
    ajusteSaldo: 0,
    metaInvestimento: 0,
    anoSelecionado: new Date().getFullYear(),
    // O mês de partida é o de HOJE, não janeiro.
    //
    // Isto não é detalhe: um aparelho zerado herdava "Janeiro" daqui,
    // e o painel abria mostrando um mês sem nenhuma conta pendente —
    // ou seja, dizendo que ia sobrar dinheiro quando não ia. Só
    // parecia certo depois de reabrir, quando a configuração de
    // verdade já estava no arquivo.
    mesSelecionado: nomeDoMes(hoje().getMonth() + 1),
    // A aba Investimento tem mês próprio na planilha (H2/I2), que o
    // SincronizarAbas() de propósito não sincroniza com as outras.
    anoInvestimento: new Date().getFullYear(),
    mesInvestimento: nomeDoMes(hoje().getMonth() + 1)
  },
  personalizacao: {
    tema: 'padrao',
    cor: 'verde',
    fonte: 'serifada',
    fundo: 'liso',
    imagemFundo: ''
  },
  // Ciclo da planta: quando ela morre, um novo começa e a sequência
  // recomeça do zero. Os desbloqueios não dependem disto.
  cicloInicio: '',
  // Dias que a pessoa NÃO entrou e um escudo cobriu. Guardar as datas
  // em vez de um contador é o que mantém o cartão, o calendário e o
  // histórico concordando: os três leem a mesma lista.
  diasProtegidos: [],
  // Escudos dados de presente (a atualização deu 2). O que foi ganho
  // por tempo é calculado da sequência; só o presente precisa ficar
  // guardado, com a versão que o deu, para não repetir a cada abertura.
  escudoBonus: 0,
  escudoBonusVersao: '',
  recordes: { melhorSequencia: 0, plantasPerdidas: 0 },
  receitas: [],
  despesas: [],
  devedores: [],
  investimento: [],
  // Marcas de exclusão: dizem à junção que um lançamento foi apagado
  // de propósito, para ele não voltar do outro aparelho. São podadas
  // depois de um tempo, para não virar peso morto em quem não sincroniza.
  removidos: [],
  logAcesso: [],
  ultimaFraseIndice: 0
});

const CHAVE_LOCAL = 'controle-financeiro:dados';
const BD_NOME = 'controle-financeiro';
const BD_LOJA = 'handles';
const BD_CHAVE = 'arquivo-dados';

// ---------- IndexedDB: guarda o handle do arquivo entre sessões ----------

function abrirBanco() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BD_NOME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BD_LOJA);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardarHandle(handle) {
  try {
    const bd = await abrirBanco();
    await new Promise((resolve, reject) => {
      const tx = bd.transaction(BD_LOJA, 'readwrite');
      tx.objectStore(BD_LOJA).put(handle, BD_CHAVE);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    bd.close();
  } catch (e) {
    console.warn('Não foi possível lembrar o arquivo escolhido:', e);
  }
}

async function lerHandle() {
  try {
    const bd = await abrirBanco();
    const handle = await new Promise((resolve, reject) => {
      const tx = bd.transaction(BD_LOJA, 'readonly');
      const req = tx.objectStore(BD_LOJA).get(BD_CHAVE);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    bd.close();
    return handle;
  } catch {
    return null;
  }
}

async function esquecerHandle() {
  try {
    const bd = await abrirBanco();
    await new Promise((resolve) => {
      const tx = bd.transaction(BD_LOJA, 'readwrite');
      tx.objectStore(BD_LOJA).delete(BD_CHAVE);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    bd.close();
  } catch { /* ignora */ }
}

// ---------- Normalização ----------

/**
 * Dá carimbo aos lançamentos que não têm.
 *
 * Tudo que foi criado antes da sincronia existir está sem
 * `atualizadoEm`. Sem carimbo, a subida os ignora (o filtro é
 * "mudou depois da última visita", e sem data isso é sempre falso) —
 * foi assim que 671 lançamentos ficaram de fora da primeira
 * sincronia. O carimbo é posto uma vez e passa a viajar no arquivo.
 */
function carimbarAtrasados(lista, quando) {
  if (!Array.isArray(lista)) return [];
  for (const item of lista) {
    if (item && typeof item === 'object' && !item.atualizadoEm) {
      item.atualizadoEm = quando;
    }
  }
  return lista;
}

export function normalizar(bruto) {
  const d = bruto && typeof bruto === 'object' ? bruto : {};
  // O carimbo de migração é AGORA, não o último salvamento.
  //
  // Parece menos honesto, mas é o que funciona: um aparelho que já
  // sincronizou tem a marca de última visita igual ao `salvoEm` do
  // arquivo, e carimbar com esse mesmo valor deixaria os lançamentos
  // antigos de fora de novo — a subida leva o que é MAIS NOVO que a
  // marca. Datando a migração de agora, eles sobem na próxima
  // sincronia, que é o que precisa acontecer uma única vez.
  const carimboAntigo = new Date().toISOString();
  const config = { ...DADOS_PADRAO.config, ...(d.config || {}) };

  // Migração: "saldoInicial" era o nome antigo de "ajusteSaldo".
  if (config.saldoInicial !== undefined) {
    if (d.config?.ajusteSaldo === undefined) config.ajusteSaldo = Number(config.saldoInicial) || 0;
    delete config.saldoInicial;
  }

  // A configuração também precisa de carimbo, pelo mesmo motivo dos
  // lançamentos — MAS só num arquivo que já tem dados.
  //
  // Num aparelho recém-instalado a configuração está vazia; carimbá-la
  // com "agora" a tornaria mais nova que a configuração de verdade
  // guardada no banco, e o ajuste de saldo nunca chegaria. Sem dados,
  // sem carimbo: aí qualquer coisa que venha de fora vence, que é o
  // certo para quem está começando.
  const temLancamentos = ['receitas', 'despesas', 'devedores', 'investimento']
    .some((t) => Array.isArray(d[t]) && d[t].length > 0);
  if (temLancamentos && !config.atualizadoEm) config.atualizadoEm = carimboAntigo;

  // Ensina ao aparelho o carimbo mais novo que este arquivo conhece,
  // para uma alteração feita agora nunca nascer mais velha que ele.
  anotarCarimbo(d.salvoEm);
  anotarCarimbo(config.atualizadoEm);
  for (const tipo of ['receitas', 'despesas', 'devedores', 'investimento']) {
    for (const item of Array.isArray(d[tipo]) ? d[tipo] : []) anotarCarimbo(item?.atualizadoEm);
  }

  return {
    versao: d.versao || 1,
    config,
    personalizacao: { ...DADOS_PADRAO.personalizacao, ...(d.personalizacao || {}) },
    salvoEm: d.salvoEm || '',
    // Sem isto a marca se perderia ao salvar, e um aparelho já
    // sincronizado se trataria como recém-chegado, reetiquetando os
    // próprios lançamentos e duplicando tudo.
    sincroniaIniciada: Boolean(d.sincroniaIniciada),
    removidos: Array.isArray(d.removidos) ? d.removidos : [],
    receitas: carimbarAtrasados(d.receitas, carimboAntigo),
    despesas: carimbarAtrasados(d.despesas, carimboAntigo),
    devedores: carimbarAtrasados(d.devedores, carimboAntigo),
    // Aportes e retiradas são recalculados a partir de Despesas/Receitas;
    // linhas dessas categorias aqui são só o cache da última execução do
    // AtualizarListaEGrafico na planilha, e seriam contadas em dobro.
    investimento: carimbarAtrasados(
      (Array.isArray(d.investimento) ? d.investimento : [])
        .filter((i) => String(i?.categoria ?? '').trim().toLowerCase() === 'rendimento'),
      carimboAntigo),
    logAcesso: Array.isArray(d.logAcesso) ? d.logAcesso.slice().sort() : [],
    diasProtegidos: Array.isArray(d.diasProtegidos)
      ? [...new Set(d.diasProtegidos.filter(Boolean))].sort() : [],
    escudoBonus: Number(d.escudoBonus) || 0,
    escudoBonusVersao: typeof d.escudoBonusVersao === 'string' ? d.escudoBonusVersao : '',
    cicloInicio: typeof d.cicloInicio === 'string' ? d.cicloInicio : '',
    recordes: { ...DADOS_PADRAO.recordes, ...(d.recordes || {}) },
    ultimaFraseIndice: Number(d.ultimaFraseIndice) || 0
  };
}

// ---------- Armazenamento ----------

class Armazenamento {
  constructor() {
    this.modo = 'local';
    this.caminho = '';
    this.handle = null;
    this.configurado = false;
    this.suportaArquivo = typeof window.showOpenFilePicker === 'function';
    this._timerSalvar = null;
  }

  /** Detecta o modo disponível e reconecta ao arquivo já configurado. */
  async iniciar() {
    // No aplicativo Android não existe arquivo para escolher: os dados
    // já estão no armazenamento do app desde o primeiro uso, então o
    // modo local entra como configurado e nenhum aviso aparece.
    if (window.Capacitor?.isNativePlatform?.()) {
      this.modo = 'local';
      this.configurado = true;
      return;
    }

    if (window.cfAPI) {
      this.modo = 'electron';
      const info = await window.cfAPI.obterArquivo();
      this.caminho = info?.caminho || '';
      this.configurado = Boolean(info?.existe);
      return;
    }

    if (this.suportaArquivo) {
      const handle = await lerHandle();
      if (handle) {
        const permissao = await handle.queryPermission({ mode: 'readwrite' });
        this.handle = handle;
        this.caminho = handle.name;
        this.modo = 'arquivo';
        this.configurado = permissao === 'granted';
        return;
      }
      this.modo = 'arquivo';
      this.configurado = false;
      return;
    }

    this.modo = 'local';
    this.configurado = localStorage.getItem(CHAVE_LOCAL) !== null;
  }

  get noAplicativo() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  }

  get descricaoModo() {
    switch (this.modo) {
      case 'electron': return 'Arquivo no disco (Electron)';
      case 'arquivo': return 'Arquivo no disco (navegador)';
      default: return this.noAplicativo ? 'Armazenamento do aplicativo' : 'Memória do navegador';
    }
  }

  get descricaoOrigem() {
    if (this.modo === 'local') {
      return this.noAplicativo ? 'guardado neste aparelho' : 'localStorage deste navegador';
    }
    return this.caminho || 'nenhum arquivo escolhido';
  }

  /**
   * Pede permissão de leitura/escrita ao arquivo já lembrado.
   * O navegador exige um clique do usuário para isso.
   */
  async reconectar() {
    if (this.modo !== 'arquivo' || !this.handle) return false;
    const permissao = await this.handle.requestPermission({ mode: 'readwrite' });
    this.configurado = permissao === 'granted';
    return this.configurado;
  }

  /** Botão de configuração: escolher o arquivo de dados existente. */
  async escolherArquivo() {
    if (this.modo === 'electron') {
      const info = await window.cfAPI.escolherArquivo();
      if (!info) return false;
      this.caminho = info.caminho;
      this.configurado = true;
      return true;
    }

    if (!this.suportaArquivo) return false;

    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Dados do Controle Financeiro', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    if (!handle) return false;
    const permissao = await handle.requestPermission({ mode: 'readwrite' });
    if (permissao !== 'granted') return false;

    this.handle = handle;
    this.caminho = handle.name;
    this.configurado = true;
    await guardarHandle(handle);
    return true;
  }

  /** Botão de configuração: criar um arquivo de dados novo. */
  async criarArquivo(dadosIniciais = DADOS_PADRAO) {
    if (this.modo === 'electron') {
      const info = await window.cfAPI.criarArquivo(normalizar(dadosIniciais));
      if (!info) return false;
      this.caminho = info.caminho;
      this.configurado = true;
      return true;
    }

    if (!this.suportaArquivo) return false;

    const handle = await window.showSaveFilePicker({
      suggestedName: 'controle-financeiro.json',
      types: [{ description: 'Dados do Controle Financeiro', accept: { 'application/json': ['.json'] } }]
    });
    if (!handle) return false;

    this.handle = handle;
    this.caminho = handle.name;
    this.configurado = true;
    await guardarHandle(handle);
    await this.salvar(normalizar(dadosIniciais));
    return true;
  }

  /** Desvincula o arquivo atual (volta ao estado não configurado). */
  /**
   * Apaga o espelho guardado dentro do próprio app.
   *
   * O espelho existe para o arquivo poder sumir no meio do uso — o
   * pendrive ser removido, por exemplo — sem levar os dados junto. O
   * efeito colateral é que tirar o arquivo do lugar NÃO zera o app:
   * ele continua lendo daqui. Quem zera de verdade é isto.
   */
  limparEspelho() {
    try { localStorage.removeItem(CHAVE_LOCAL); } catch { /* sem localStorage, nada a limpar */ }
  }

  async desvincular() {
    if (this.modo === 'electron') {
      await window.cfAPI.desvincular();
    } else {
      await esquecerHandle();
      this.handle = null;
    }
    this.caminho = '';
    this.configurado = false;
  }

  async carregar() {
    if (this.modo === 'electron' && this.configurado) {
      const bruto = await window.cfAPI.lerDados();
      return normalizar(bruto);
    }

    if (this.modo === 'arquivo' && this.configurado && this.handle) {
      const arquivo = await this.handle.getFile();
      const conteudo = await arquivo.text();
      return normalizar(conteudo.trim() ? JSON.parse(conteudo) : {});
    }

    const cache = localStorage.getItem(CHAVE_LOCAL);
    return normalizar(cache ? JSON.parse(cache) : {});
  }

  async salvar(dados) {
    // Carimbo do arquivo inteiro: a junção usa para desempatar o que
    // não é lançamento (o ajuste de saldo, por exemplo). Precisa ir
    // também no objeto vivo — é dele que a sincronia lê para saber o
    // que mudou; só no arquivo, a frequência nunca subiria.
    const carimbo = new Date().toISOString();
    if (dados && typeof dados === 'object') dados.salvoEm = carimbo;

    const limpo = normalizar(dados);
    limpo.salvoEm = carimbo;
    podarRemovidos(limpo);
    const texto = JSON.stringify(limpo, null, 1);

    if (this.modo === 'electron' && this.configurado) {
      await window.cfAPI.salvarDados(limpo);
    } else if (this.modo === 'arquivo' && this.configurado && this.handle) {
      const fluxo = await this.handle.createWritable();
      await fluxo.write(texto);
      await fluxo.close();
    }

    // Espelho local: garante que nada se perde se o arquivo estiver
    // indisponível. No Android NÃO é espelho nenhum — é o único lugar
    // onde os dados existem. Engolir a falha ali fazia o app parecer
    // ter salvo, e a alteração sumia na próxima abertura.
    try {
      localStorage.setItem(CHAVE_LOCAL, texto);
    } catch (e) {
      if (this.modo === 'local') {
        throw new Error('Não consegui gravar neste aparelho — a memória do app pode estar cheia. ' +
                        'A última alteração NÃO foi salva.');
      }
      console.warn('Não deu para atualizar o espelho local:', e);
    }
  }

  /** Salvamento com atraso, para não escrever a cada tecla. */
  salvarComAtraso(dados, ms = 600) {
    clearTimeout(this._timerSalvar);
    this._timerSalvar = setTimeout(() => {
      this.salvar(dados).catch((e) => this.relatarFalha(e));
    }, ms);
  }

  /**
   * Quem avisa a pessoa quando o salvamento falha. A interface liga o
   * seu aviso aqui; sem isso, uma falha só apareceria no console —
   * onde ninguém olha.
   */
  aoFalharSalvar = null;

  relatarFalha(e) {
    console.error('Falha ao salvar:', e);
    this.aoFalharSalvar?.(e);
  }

  /** Importa um .json escolhido manualmente (modo de compatibilidade). */
  async importarDeArquivo(file) {
    const conteudo = await file.text();
    return normalizar(JSON.parse(conteudo));
  }

  /** Entrega uma cópia dos dados para a pessoa guardar (backup). */
  async exportar(dados) {
    const texto = JSON.stringify(normalizar(dados), null, 1);
    const dia = new Date().toISOString().slice(0, 10);
    const blob = new Blob([texto], { type: 'application/json' });
    return salvarArquivo(blob, `controle-financeiro-${dia}.json`);
  }
}

export const armazenamento = new Armazenamento();
