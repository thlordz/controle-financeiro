// =========================================================
// Modal de formulário genérico.
// Substitui a sequência de InputBox/MsgBox do VBA por um
// diálogo único, montado a partir de uma lista de campos.
// =========================================================

import { moeda } from './util.js';
import { icone } from './icones.js';

const $ = (id) => document.getElementById(id);

/** Lê "3200,50", "3.200,50" ou "3200.50" e devolve 3200.5 (NaN se não der). */
export function lerNumero(valor) {
  let t = String(valor ?? '').trim().replace(/\s|R\$/g, '');
  if (!t) return NaN;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  if (temVirgula && temPonto) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }
  return Number(t);
}

/** Formata um número para o campo de valor, no padrão brasileiro (com milhar). */
export function paraCampoValor(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Máscara "de calculadora": cada dígito digitado entra pela casa dos
 * centavos, empurrando os que já estavam pra esquerda — como um campo
 * de valor de maquininha de cartão, não uma edição de texto comum.
 */
function formatarCentavos(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ligarMascaraValor(input) {
  const aplicar = () => {
    const digitos = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(-12);
    const centavos = digitos ? parseInt(digitos, 10) : 0;
    // Basta ter digitado algum algarismo para o campo mostrar valor —
    // inclusive 0,00. Antes o campo se apagava quando dava zero, e por
    // isso não havia como dizer que a conta está zerada.
    input.value = digitos ? formatarCentavos(centavos) : '';
    input.setSelectionRange(input.value.length, input.value.length);
  };
  input.addEventListener('input', aplicar);
  input.addEventListener('focus', () => {
    // Ao focar, o cursor sempre vai pro fim — é ali que a máscara escreve.
    setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
  });
}

/**
 * Autocompletar no estilo da planilha: o resto da sugestão entra no campo
 * já selecionado, então continuar digitando o substitui, e o Tab o aceita.
 * Não completa enquanto a pessoa está apagando.
 */
export function ligarAutocompletar(input, sugestoes) {
  let apagando = false;
  input.dataset.autocompletar = 'sim';

  input.addEventListener('keydown', (e) => {
    apagando = e.key === 'Backspace' || e.key === 'Delete';
  });

  input.addEventListener('input', () => {
    const digitado = input.value;
    if (apagando || !digitado) return;

    const alvo = (sugestoes() || []).find((s) =>
      s.length > digitado.length && s.toLowerCase().startsWith(digitado.toLowerCase()));
    if (!alvo) return;

    input.value = digitado + alvo.slice(digitado.length);
    input.setSelectionRange(digitado.length, alvo.length);
  });
}

/**
 * Converte o data URI guardado no JSON de volta para um Blob.
 *
 * É o que destrava ver o comprovante: o navegador bloqueia abrir um
 * `data:` como página (window.open("data:...") não faz nada desde o
 * Chrome 60), mas um blob: criado a partir dele abre normalmente, e
 * serve tanto para mostrar na tela quanto para salvar o arquivo.
 */
export function comprovanteParaBlob(anexo) {
  const uri = String(anexo?.dados || '');
  const virgula = uri.indexOf(',');
  if (virgula < 0) return null;

  const cabecalho = uri.slice(0, virgula);
  const corpo = uri.slice(virgula + 1);
  const tipo = (cabecalho.match(/data:([^;]+)/) || [, 'application/octet-stream'])[1];

  if (!cabecalho.includes(';base64')) {
    return new Blob([decodeURIComponent(corpo)], { type: tipo });
  }

  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** Entrega um arquivo para a pessoa guardar, no jeito de cada plataforma. */
export async function salvarArquivo(blob, nome) {
  // Electron: caixa de diálogo de verdade, para escolher onde salvar.
  if (window.cfAPI?.salvarComo) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const r = await window.cfAPI.salvarComo({ nome, bytes });
    if (r?.caminho) await avisar(`Arquivo salvo em:\n${r.caminho}`, 'Pronto');
    return Boolean(r?.caminho);
  }

  // Aplicativo Android: grava no cache e abre a folha de compartilhar,
  // que é como se manda um arquivo para fora do app no celular.
  const plugins = window.Capacitor?.Plugins;
  if (plugins?.Filesystem && plugins?.Share) {
    const base64 = await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
      leitor.readAsDataURL(blob);
    });
    await plugins.Filesystem.writeFile({ path: nome, data: base64, directory: 'CACHE' });
    const { uri } = await plugins.Filesystem.getUri({ path: nome, directory: 'CACHE' });
    await plugins.Share.share({ title: nome, files: [uri] });
    return true;
  }

  // Navegador: link de download comum.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/**
 * Mostra o comprovante dentro do próprio app. Imagem vai numa <img>,
 * o resto (PDF) num <iframe>; os dois apontam para um blob:, que o
 * navegador aceita.
 */
export function verComprovante(anexo) {
  const modal = $('modalComprovante');
  const corpo = $('comprovanteCorpo');
  const blob = comprovanteParaBlob(anexo);

  if (!blob) {
    return avisar('Este lançamento tem um comprovante antigo, sem arquivo anexado.', 'Sem arquivo');
  }

  const url = URL.createObjectURL(blob);
  const nome = anexo.nome || 'comprovante';
  const ehImagem = blob.type.startsWith('image/');
  // O WebView do Android não sabe desenhar PDF — um <iframe> ali sairia
  // em branco. Nesse caso a saída é abrir no aplicativo do aparelho.
  const noAplicativo = Boolean(window.Capacitor?.isNativePlatform?.());

  $('comprovanteNome').textContent = nome;

  if (ehImagem) {
    corpo.innerHTML = `<img class="visor__imagem" src="${url}" alt="${nome.replace(/"/g, '&quot;')}">`;
  } else if (noAplicativo) {
    corpo.innerHTML = `<p class="visor__recado">Este comprovante não é uma imagem e o Android não
      mostra PDF aqui dentro.<br>Use <strong>Abrir</strong> para ver no aplicativo do aparelho.</p>`;
  } else {
    corpo.innerHTML = `<iframe class="visor__quadro" src="${url}" title="${nome.replace(/"/g, '&quot;')}"></iframe>`;
  }

  $('btnSalvarComprovante').textContent = noAplicativo ? 'Abrir' : 'Salvar arquivo…';
  modal.hidden = false;

  function encerrar() {
    modal.hidden = true;
    corpo.innerHTML = '';
    URL.revokeObjectURL(url);
    $('btnFecharComprovante').removeEventListener('click', encerrar);
    $('btnSalvarComprovante').removeEventListener('click', aoSalvar);
    modal.removeEventListener('click', aoClicarFora);
    document.removeEventListener('keydown', aoTeclar);
  }

  const aoSalvar = () => salvarArquivo(blob, nome);
  const aoClicarFora = (e) => { if (e.target === modal) encerrar(); };
  const aoTeclar = (e) => { if (e.key === 'Escape') encerrar(); };

  $('btnFecharComprovante').addEventListener('click', encerrar);
  $('btnSalvarComprovante').addEventListener('click', aoSalvar);
  modal.addEventListener('click', aoClicarFora);
  document.addEventListener('keydown', aoTeclar);
  return null;
}

/** Lê um arquivo escolhido como data URI, pra viajar embutido no JSON. */
function lerComoDataUri(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

const LIMITE_COMPROVANTE = 5 * 1024 * 1024;

/** Formata bytes como "1,2 MB" / "340 KB", pra mensagens de limite. */
function formatarTamanho(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Nome + tamanho de um comprovante anexado, pra mostrar no campo. */
function resumoComprovante(v) {
  if (v && typeof v === 'object' && v.dados) {
    return `${v.nome || 'arquivo'}${v.tamanho ? ` · ${formatarTamanho(v.tamanho)}` : ''}`;
  }
  if (typeof v === 'string' && v.trim()) return 'Comprovante antigo, sem arquivo anexado.';
  return 'Nenhum comprovante anexado.';
}

/** Asterisco discreto: aparece so onde o campo e mesmo obrigatorio. */
function marcaObrigatorio(campo) {
  return campo.obrigatorio
    ? '<span class="campo__obrigatorio" title="Preenchimento obrigatório">*</span>'
    : '';
}

/**
 * Cabeçalho da ficha: o ícone, o nome do campo por extenso e o
 * asterisco. É o que responde "o que é isso aqui?" sem a pessoa ter
 * de deduzir pelo formato do valor.
 */
function cabecaHtml(campo, id, comLabel = true) {
  const abre = comLabel ? `<label class="campo__nome" for="${id}">` : '<span class="campo__nome">';
  const fecha = comLabel ? '</label>' : '</span>';
  return `<div class="campo__cabeca">
    <span class="campo__icone">${icone(campo.icone || 'etiqueta')}</span>
    ${abre}${campo.rotulo}${marcaObrigatorio(campo)}${fecha}
  </div>`;
}

/** A dica agora fica sempre à vista, embaixo do campo. */
function dicaHtml(campo) {
  return campo.dica ? `<p class="campo__dica">${campo.dica}</p>` : '';
}

/** Normaliza as opções de select/segmentado para { valor, rotulo, cor }. */
function normalizarOpcoes(campo, atual) {
  const opcoes = (campo.opcoes || []).map((o) =>
    typeof o === 'string' ? { valor: o, rotulo: o } : { ...o });

  // A planilha teve listas de validação diferentes ao longo do tempo
  // (por exemplo "Fundo Emergência", que saiu da lista de formas de
  // pagamento). Sem isto o campo viria vazio e o valor gravado seria
  // perdido silenciosamente ao salvar.
  if (atual && !opcoes.some((o) => o.valor === atual)) {
    opcoes.push({ valor: atual, rotulo: `${atual} (fora da lista)` });
  }
  return opcoes;
}

function campoHtml(campo, valor) {
  const id = `campo_${campo.nome}`;
  const meia = campo.largura === 'meia' ? ' campo--meia' : '';
  const obrigatorio = campo.obrigatorio ? 'required' : '';
  let controle;

  switch (campo.tipo) {
    // A caixinha "Sim" não dizia sim para quê. Virou uma linha inteira,
    // com nome, explicação e uma chave — e a linha toda é área de toque.
    case 'checkbox': {
      const marcado = String(valor ?? '').trim().toLowerCase() === 'sim';
      return `<div class="campo campo--ficha${meia}">
        <label class="interruptor">
          <span class="campo__icone">${icone(campo.icone || 'repetir')}</span>
          <span class="interruptor__texto">
            <span class="interruptor__nome">${campo.rotulo}</span>
            <span class="interruptor__dica">${campo.dica || campo.rotuloCheck || 'Sim'}</span>
          </span>
          <input type="checkbox" id="${id}" ${marcado ? 'checked' : ''}>
          <span class="interruptor__chave"></span>
        </label>
      </div>`;
    }

    // Poucas opções não merecem um menu suspenso: viram botões lado a
    // lado, todos legíveis de uma vez, na cor do próprio significado.
    case 'opcoes': {
      const atual = String(valor ?? '').trim();
      const opcoes = normalizarOpcoes(campo, atual);

      // Campo que aceita ficar em branco ganha um botão para isso. Sem
      // ele não haveria como desmarcar depois de escolher — num
      // <select> esse papel era do "—" no topo da lista.
      if (campo.vazio !== false) {
        opcoes.unshift({ valor: '', rotulo: campo.vazio || 'Nenhuma', vazia: true });
      }

      const botoes = opcoes.map((o) => {
        const ativa = o.valor === atual;
        return `<button type="button" class="opcao${o.cor ? ` opcao--${o.cor}` : ''}${o.vazia ? ' opcao--vazia' : ''}${ativa ? ' opcao--ativa' : ''}"
          data-opcao="${campo.nome}" data-valor="${String(o.valor).replace(/"/g, '&quot;')}"
          role="radio" aria-checked="${ativa}">
          <svg class="opcao__marca" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4.5 12.6 9.4 17.5 19.5 7.2"/>
          </svg>
          <span>${o.rotulo}</span>
        </button>`;
      }).join('');

      return `<div class="campo campo--ficha${meia}">
        ${cabecaHtml(campo, id, false)}
        <input type="hidden" id="${id}" value="${atual.replace(/"/g, '&quot;')}">
        <div class="opcoes" role="radiogroup" aria-label="${campo.rotulo}">${botoes}</div>
        ${dicaHtml(campo)}
      </div>`;
    }

    case 'arquivo': {
      const anexoAtual = valor && typeof valor === 'object' && valor.dados ? valor : null;
      const inicial = anexoAtual ? JSON.stringify(anexoAtual).replace(/"/g, '&quot;') : '';
      return `<div class="campo campo--ficha${meia}">
        ${cabecaHtml(campo, id, false)}
        <input type="hidden" id="${id}" value="${inicial}">
        <div class="anexo" id="${id}_caixa">
          <button type="button" class="botao" id="${id}_escolher">
            ${icone('clipe', 'botao__icone')}<span class="botao__rotulo">Escolher arquivo…</span>
          </button>
          <button type="button" class="botao" id="${id}_ver" ${anexoAtual ? '' : 'hidden'}>
            <span class="botao__rotulo">Ver</span>
          </button>
          <button type="button" class="botao botao--perigo" id="${id}_remover" ${anexoAtual ? '' : 'hidden'}>
            <span class="botao__rotulo">Remover</span>
          </button>
          <input type="file" id="${id}_arquivo" accept="image/*,.pdf" hidden>
        </div>
        <p class="campo__dica" id="${id}_estado">${resumoComprovante(valor)}</p>
      </div>`;
    }

    case 'select': {
      const atual = String(valor ?? '').trim();
      const opcoes = normalizarOpcoes(campo, atual);
      controle = `<select class="entrada" id="${id}" ${obrigatorio}>
        ${campo.vazio !== false ? `<option value="">${campo.vazio || '—'}</option>` : ''}
        ${opcoes.map((o) =>
          `<option value="${o.valor}" ${atual === o.valor ? 'selected' : ''}>${o.rotulo}</option>`
        ).join('')}
      </select>`;
      break;
    }

    case 'data':
      controle = `<input class="entrada" id="${id}" type="date" value="${valor || ''}" ${obrigatorio}>`;
      break;

    case 'valor':
      controle = `<input class="entrada" id="${id}" type="text" inputmode="decimal"
        autocomplete="off" placeholder="0,00" value="${paraCampoValor(valor)}" ${obrigatorio}>`;
      break;

    case 'inteiro':
      controle = `<input class="entrada" id="${id}" type="number" min="${campo.min ?? 1}"
        step="1" value="${valor ?? ''}" ${obrigatorio}>`;
      break;

    case 'area':
      controle = `<textarea class="entrada" id="${id}" rows="3"
        placeholder="${campo.exemplo || ''}">${valor || ''}</textarea>`;
      break;

    default: {
      const listaId = campo.sugestoes ? `${id}_lista` : '';
      controle = `<input class="entrada" id="${id}" type="text" autocomplete="off"
        ${listaId ? `list="${listaId}"` : ''}
        placeholder="${campo.exemplo || ''}" value="${String(valor ?? '').replace(/"/g, '&quot;')}" ${obrigatorio}>
        ${listaId ? `<datalist id="${listaId}">${(campo.sugestoes() || [])
          .map((s) => `<option value="${String(s).replace(/"/g, '&quot;')}">`).join('')}</datalist>` : ''}`;
    }
  }

  return `<div class="campo campo--ficha${meia}">
    ${cabecaHtml(campo, id)}
    ${controle}
    ${dicaHtml(campo)}
  </div>`;
}

/**
 * Monta o corpo do formulário em seções. Os campos são agrupados pela
 * propriedade `grupo`, na ordem em que os grupos aparecem na lista —
 * é o que separa "o que aconteceu" de "como classificar" e de "o que
 * anexar", em vez de despejar dez campos seguidos.
 */
function corpoHtml(campos, valores) {
  const grupos = [];
  for (const campo of campos) {
    const nome = campo.grupo || '';
    let grupo = grupos.find((g) => g.nome === nome);
    if (!grupo) { grupo = { nome, campos: [] }; grupos.push(grupo); }
    grupo.campos.push(campo);
  }

  return grupos.map((g) => `<section class="secao">
    ${g.nome ? `<div class="secao__titulo">${g.nome}</div>` : ''}
    <div class="secao__grade">${g.campos.map((c) => campoHtml(c, valores[c.nome])).join('')}</div>
  </section>`).join('');
}

/** Liga o comportamento dos tipos de campo que precisam de JS depois de renderizados. */
function ligarCamposEspeciais(campos) {
  for (const campo of campos) {
    const id = `campo_${campo.nome}`;

    if (campo.tipo === 'valor') {
      const input = $(id);
      if (input) ligarMascaraValor(input);
    }

    if (campo.sugestoes && (!campo.tipo || campo.tipo === 'texto')) {
      const input = $(id);
      if (input) ligarAutocompletar(input, campo.sugestoes);
    }

    // Escolha segmentada: o valor mora num input escondido, e os botões
    // só pintam qual está escolhido. Assim o resto do formulário (coletar,
    // validar) continua lendo tudo do mesmo jeito, por id do campo.
    if (campo.tipo === 'opcoes') {
      const guardar = $(id);
      const botoes = [...document.querySelectorAll(`[data-opcao="${campo.nome}"]`)];
      if (!guardar || botoes.length === 0) continue;

      const marcar = (valor) => {
        if (guardar.value === valor) return;
        guardar.value = valor;
        for (const b of botoes) {
          const ativa = b.dataset.valor === valor;
          b.classList.toggle('opcao--ativa', ativa);
          b.setAttribute('aria-checked', String(ativa));
        }
        // Quem escuta o campo continua escutando "change", como fazia
        // quando isto ainda era um <select>.
        guardar.dispatchEvent(new Event('change', { bubbles: true }));
      };

      for (const b of botoes) {
        b.addEventListener('click', () => marcar(b.dataset.valor));
        // Setas percorrem as opções, como num grupo de rádio de verdade.
        b.addEventListener('keydown', (e) => {
          const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!passo) return;
          e.preventDefault();
          const i = botoes.indexOf(b);
          const proximo = botoes[(i + passo + botoes.length) % botoes.length];
          marcar(proximo.dataset.valor);
          proximo.focus();
        });
      }
    }

    if (campo.tipo === 'arquivo') {
      const guardar = $(id);
      const estado = $(`${id}_estado`);
      const btnVer = $(`${id}_ver`);
      const btnRemover = $(`${id}_remover`);
      const inputArquivo = $(`${id}_arquivo`);
      if (!guardar || !inputArquivo) continue;

      const redesenhar = () => {
        const anexo = guardar.value ? JSON.parse(guardar.value) : null;
        estado.textContent = resumoComprovante(anexo);
        btnVer.hidden = !anexo;
        btnRemover.hidden = !anexo;
      };

      $(`${id}_escolher`)?.addEventListener('click', () => inputArquivo.click());

      inputArquivo.addEventListener('change', async () => {
        const arquivo = inputArquivo.files?.[0];
        inputArquivo.value = '';
        if (!arquivo) return;
        if (arquivo.size > LIMITE_COMPROVANTE) {
          alert(
            `Esse arquivo tem ${formatarTamanho(arquivo.size)}. Como ele fica guardado dentro do ` +
            `arquivo de dados, o limite é ${formatarTamanho(LIMITE_COMPROVANTE)} — reduza o arquivo e tente de novo.`
          );
          return;
        }
        try {
          const dados = await lerComoDataUri(arquivo);
          guardar.value = JSON.stringify({ nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, dados });
          redesenhar();
        } catch (e) {
          alert('Não foi possível ler o arquivo: ' + e.message);
        }
      });

      btnVer?.addEventListener('click', () => {
        const anexo = guardar.value ? JSON.parse(guardar.value) : null;
        if (anexo?.dados) verComprovante(anexo);
      });

      btnRemover?.addEventListener('click', () => {
        guardar.value = '';
        redesenhar();
      });
    }
  }
}

/**
 * Abre o formulário e resolve com o objeto preenchido,
 * ou com null se o usuário cancelar.
 */
/**
 * Abre o formulário e resolve com o objeto preenchido, ou com null se
 * a pessoa cancelar.
 *
 * `layout: 'linha'` dispõe os campos numa faixa horizontal, na ordem
 * das colunas da tabela — é a linha de digitação da planilha, só que
 * dentro do modal, o que deixa caber também comprovante e observação.
 * Nesse formato, os campos de anexo e de texto longo descem para um
 * bloco embaixo, porque não cabem na faixa.
 *
 * `repetir: true` acrescenta "Salvar e novo": grava e devolve
 * `__novo: true`, para o chamador reabrir o formulário e seguir
 * lançando um atrás do outro.
 */
export function abrirFormulario({
  titulo, campos, valores = {},
  rotuloConfirmar = 'Salvar', aoRemover = null, aoRenderizar = null,
  layout = 'grade', repetir = false, icone: nomeIcone = '', sub = ''
}) {
  return new Promise((resolve) => {
    const caixa = $('formularioCaixa');

    $('formularioTitulo').textContent = titulo;

    // Ícone e subtítulo do topo dizem, antes de qualquer campo, que
    // tipo de lançamento está aberto ali.
    $('formularioIcone').innerHTML = nomeIcone ? icone(nomeIcone) : '';
    const elSub = $('formularioSub');
    elSub.textContent = sub;
    elSub.hidden = !sub;

    $('formularioCampos').innerHTML = corpoHtml(campos, valores);

    // Só o formulário completo de lançamento pede as duas colunas.
    caixa.classList.toggle('modal__caixa--larga', layout === 'ficha');
    definirRotulo($('btnConfirmarFormulario'), rotuloConfirmar);

    const btnNovo = $('btnSalvarNovoFormulario');
    btnNovo.hidden = !repetir;

    const btnRemover = $('btnRemoverFormulario');
    btnRemover.hidden = !aoRemover;

    const modal = $('modalFormulario');
    modal.hidden = false;

    ligarCamposEspeciais(campos);

    // Deixa o chamador ligar comportamento dependente de campo
    // (é o que substitui a sequência de InputBox encadeados do VBA).
    if (aoRenderizar) aoRenderizar($('formularioCampos'));

    // Enter anda para o campo seguinte, como numa planilha; no último,
    // grava. Em texto longo o Enter continua servindo para quebrar linha.
    const navegaveis = () => [...$('formularioCampos')
      .querySelectorAll('input:not([type=hidden]), select')];

    function aoTeclarNoCampo(e) {
      const alvo = e.target;

      if (e.key === 'Enter' && alvo.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const lista = navegaveis();
        const i = lista.indexOf(alvo);
        if (i >= 0 && i < lista.length - 1) lista[i + 1].focus();
        else $('formFormulario').requestSubmit();
        return;
      }

      // Tab com sugestão pendente aceita o trecho completado e fica no
      // campo; o Tab seguinte segue adiante normalmente.
      if (e.key === 'Tab' && !e.shiftKey && alvo.dataset?.autocompletar === 'sim' &&
          alvo.selectionStart !== alvo.selectionEnd) {
        e.preventDefault();
        alvo.setSelectionRange(alvo.value.length, alvo.value.length);
      }
    }

    $('formularioCampos').addEventListener('keydown', aoTeclarNoCampo);

    // No computador o primeiro campo já recebe o cursor. No celular
    // não: focar sozinho abre o teclado (ou o seletor de data) por cima
    // da folha e esconde justamente o que a pessoa veio conferir.
    const primeiro = caixa.querySelector('.entrada');
    if (primeiro && window.matchMedia('(min-width: 621px)').matches) {
      setTimeout(() => primeiro.focus(), 60);
    }

    function coletar() {
      const saida = {};
      for (const campo of campos) {
        const el = $(`campo_${campo.nome}`);
        if (!el) continue;
        if (campo.tipo === 'valor') saida[campo.nome] = lerNumero(el.value);
        else if (campo.tipo === 'inteiro') saida[campo.nome] = Number(el.value);
        else if (campo.tipo === 'checkbox') saida[campo.nome] = el.checked ? 'Sim' : 'Não';
        else if (campo.tipo === 'arquivo') {
          saida[campo.nome] = el.value ? JSON.parse(el.value) : '';
        } else saida[campo.nome] = el.value.trim();
      }
      return saida;
    }

    function validar(dados) {
      for (const campo of campos) {
        if (!campo.obrigatorio) continue;
        const v = dados[campo.nome];
        const vazio = campo.tipo === 'valor' || campo.tipo === 'inteiro'
          ? !Number.isFinite(v)
          : !String(v ?? '').trim();
        if (vazio) {
          // Num campo segmentado o input é escondido: quem recebe o
          // foco é o primeiro botão da fileira.
          const alvo = campo.tipo === 'opcoes'
            ? document.querySelector(`[data-opcao="${campo.nome}"]`)
            : $(`campo_${campo.nome}`);
          alvo?.focus();
          alvo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return `Falta preencher: ${campo.rotulo}.`;
        }
      }
      return null;
    }

    function encerrar(resultado) {
      modal.hidden = true;
      $('formFormulario').removeEventListener('submit', aoEnviar);
      $('btnCancelarFormulario').removeEventListener('click', aoCancelar);
      $('btnFecharFormulario').removeEventListener('click', aoCancelar);
      modal.removeEventListener('click', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
      btnRemover.removeEventListener('click', aoRemoverClick);
      btnNovo.removeEventListener('click', aoSalvarNovo);
      $('formularioCampos').removeEventListener('keydown', aoTeclarNoCampo);
      resolve(resultado);
    }

    function enviar(extra = {}) {
      const dados = coletar();
      const erro = validar(dados);
      if (erro) {
        const aviso = $('formularioErro');
        aviso.innerHTML = `${icone('alerta')}<span>${erro}</span>`;
        aviso.hidden = false;
        return;
      }
      encerrar({ ...dados, ...extra });
    }

    function aoEnviar(e) {
      e.preventDefault();
      enviar();
    }

    const aoSalvarNovo = () => enviar({ __novo: true });

    const aoCancelar = () => encerrar(null);
    const aoClicarFora = (e) => { if (e.target === modal) encerrar(null); };
    const aoTeclar = (e) => { if (e.key === 'Escape') encerrar(null); };
    const aoRemoverClick = () => encerrar({ __remover: true });

    $('formularioErro').hidden = true;
    $('formFormulario').addEventListener('submit', aoEnviar);
    $('btnCancelarFormulario').addEventListener('click', aoCancelar);
    $('btnFecharFormulario').addEventListener('click', aoCancelar);
    modal.addEventListener('click', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    btnRemover.addEventListener('click', aoRemoverClick);
    btnNovo.addEventListener('click', aoSalvarNovo);
  });
}

/**
 * Troca só o texto de um botão, preservando o ícone. Escrever direto no
 * textContent apagava o SVG junto.
 */
function definirRotulo(botao, texto) {
  const rotulo = botao.querySelector('.botao__rotulo');
  if (rotulo) rotulo.textContent = texto;
  else botao.textContent = texto;
}

/** Diálogo de confirmação, no lugar do MsgBox vbYesNo. */
export function confirmar(mensagem, {
  titulo = 'Confirmar',
  rotuloOk = 'Confirmar',
  perigo = false,
  soOk = false
} = {}) {
  return new Promise((resolve) => {
    const modal = $('modalConfirmar');
    $('confirmarTitulo').textContent = titulo;
    $('confirmarMensagem').textContent = mensagem;

    const ok = $('btnOkConfirmar');
    const cancelar = $('btnCancelarConfirmar');
    ok.textContent = rotuloOk;
    ok.classList.toggle('botao--vermelho', perigo);
    cancelar.hidden = soOk;
    modal.hidden = false;

    function encerrar(v) {
      modal.hidden = true;
      ok.removeEventListener('click', aoOk);
      cancelar.removeEventListener('click', aoNao);
      modal.removeEventListener('click', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
      resolve(v);
    }
    const aoOk = () => encerrar(true);
    const aoNao = () => encerrar(false);
    const aoClicarFora = (e) => { if (e.target === modal) encerrar(false); };
    const aoTeclar = (e) => { if (e.key === 'Escape') encerrar(false); };

    ok.addEventListener('click', aoOk);
    cancelar.addEventListener('click', aoNao);
    modal.addEventListener('click', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    setTimeout(() => ok.focus(), 60);
  });
}

/** Aviso simples, no lugar do MsgBox informativo. */
export function avisar(mensagem, titulo = 'Pronto') {
  return confirmar(mensagem, { titulo, rotuloOk: 'Fechar', soOk: true });
}

export { moeda };
