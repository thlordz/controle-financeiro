// =========================================================
// Cliente do Turso, em HTTP puro.
//
// De propósito sem biblioteca: o app não tem empacotador, carrega
// módulos soltos do disco. A API do Turso aceita `fetch` direto no
// endereço /v2/pipeline, então cabem aqui umas poucas dezenas de
// linhas e o mesmo código roda no Electron e na WebView do Android.
//
// Nada aqui sabe o que é uma despesa. Quem entende de dados é o
// sincronia.js; este arquivo só fala SQL.
// =========================================================

/**
 * O painel do Turso entrega o endereço como `libsql://…`, que é o
 * protocolo das bibliotecas nativas. Para HTTP é o mesmo host em
 * `https://`. Aceitar os dois evita uma pegadinha boba na configuração.
 */
export function normalizarEndereco(bruto) {
  let url = String(bruto || '').trim();
  if (!url) return '';
  url = url.replace(/^libsql:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

/** Converte um valor de JS para o formato de argumento do Turso. */
function paraArgumento(v) {
  if (v === null || v === undefined) return { type: 'null', value: null };
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { type: 'integer', value: String(v) }
      : { type: 'float', value: v };
  }
  return { type: 'text', value: String(v) };
}

/** Converte uma célula devolvida pelo Turso de volta para JS. */
function deCelula(c) {
  if (!c || c.type === 'null') return null;
  if (c.type === 'integer') return Number(c.value);
  if (c.type === 'float') return Number(c.value);
  return c.value;
}

/**
 * Faz o POST pelo caminho nativo de cada plataforma.
 *
 * Por que não usar `fetch` direto: a página do app tem origem própria
 * (`file://` no Electron, `https://localhost` no Android), então uma
 * chamada para o Turso passa pelas regras de CORS do navegador — e
 * não dá para saber de fora se o serviço manda os cabeçalhos certos,
 * nem garantir que continuará mandando. Indo pelo processo principal
 * do Electron e pelo HTTP nativo do Android, a requisição sai fora do
 * navegador e o assunto deixa de existir.
 *
 * No navegador comum (modo de teste) sobra o fetch mesmo.
 */
async function postar(endereco, token, corpo) {
  const cabecalhos = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Electron: o processo principal faz a chamada, sem navegador no meio.
  if (window.cfAPI?.http) {
    const r = await window.cfAPI.http({ url: endereco, cabecalhos, corpo });
    return { ok: r.ok, status: r.status, texto: r.texto };
  }

  // Android: HTTP nativo do Capacitor.
  const nativo = window.Capacitor?.Plugins?.CapacitorHttp;
  if (nativo && window.Capacitor?.isNativePlatform?.()) {
    const r = await nativo.post({
      url: endereco, headers: cabecalhos, data: corpo, responseType: 'text'
    });
    const texto = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, texto };
  }

  // Navegador.
  const r = await fetch(endereco, {
    method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo)
  });
  return { ok: r.ok, status: r.status, texto: await r.text() };
}

/**
 * Cria um cliente. `enviar` existe só para os testes injetarem um
 * transporte falso; em uso normal é o `postar` acima.
 */
export function criarCliente({ url, token, enviar = null } = {}) {
  const endereco = normalizarEndereco(url);
  const mandar = enviar || postar;

  if (!endereco || !token) return null;

  /**
   * Manda uma ou mais instruções na mesma viagem e devolve uma lista
   * de resultados, cada um com { colunas, linhas }.
   */
  async function executar(comandos) {
    const lista = Array.isArray(comandos) ? comandos : [comandos];

    const resposta = await mandar(`${endereco}/v2/pipeline`, token, {
      requests: [
        ...lista.map((c) => ({
          type: 'execute',
          stmt: {
            sql: typeof c === 'string' ? c : c.sql,
            args: (typeof c === 'string' ? [] : (c.args || [])).map(paraArgumento)
          }
        })),
        { type: 'close' }
      ]
    });

    if (!resposta.ok) {
      throw new Error(`Turso respondeu ${resposta.status}. ${String(resposta.texto || '').slice(0, 200)}`);
    }

    let json;
    try { json = JSON.parse(resposta.texto); }
    catch { throw new Error('O banco respondeu algo que não é JSON.'); }
    const saida = [];

    for (const r of json.results || []) {
      if (r.type === 'error') {
        throw new Error(r.error?.message || 'Erro do banco de dados.');
      }
      const resultado = r.response?.result;
      if (!resultado) continue;
      const colunas = (resultado.cols || []).map((c) => c.name);
      const linhas = (resultado.rows || []).map((linha) => {
        const obj = {};
        linha.forEach((celula, i) => { obj[colunas[i]] = deCelula(celula); });
        return obj;
      });
      saida.push({ colunas, linhas });
    }

    return saida;
  }

  /** Confere se o endereço e o token funcionam, sem escrever nada. */
  async function testar() {
    const [r] = await executar('SELECT 1 AS ok');
    return r?.linhas?.[0]?.ok === 1;
  }

  return { endereco, executar, testar };
}
