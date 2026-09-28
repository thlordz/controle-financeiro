// =========================================================
// Onde mora o papel de parede da pessoa.
//
// Foto pequena caberia no localStorage, mas vídeo não: lá o limite é
// de uns poucos megabytes e o texto ainda incha um terço ao virar
// data URL. Então o arquivo vai inteiro para o IndexedDB, que guarda
// o blob como ele é e aguenta bem mais.
//
// O localStorage fica só com o bilhete dizendo que existe algo
// guardado e de que tipo.
// =========================================================

const BANCO = 'controle-financeiro-midia';
const CAIXA = 'fundo';

function abrir() {
  return new Promise((aceite, recuse) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(CAIXA)) {
        pedido.result.createObjectStore(CAIXA);
      }
    };
    pedido.onsuccess = () => aceite(pedido.result);
    pedido.onerror = () => recuse(pedido.error);
  });
}

async function comACaixa(modo, fn) {
  const banco = await abrir();
  return new Promise((aceite, recuse) => {
    const t = banco.transaction(CAIXA, modo);
    const pedido = fn(t.objectStore(CAIXA));
    pedido.onsuccess = () => aceite(pedido.result);
    pedido.onerror = () => recuse(pedido.error);
  });
}

/** Guarda o arquivo escolhido. Devolve o tipo ('video' ou 'imagem'). */
export async function guardarMidia(arquivo) {
  const tipo = arquivo.type.startsWith('video/') ? 'video' : 'imagem';
  soltarEndereco();
  await comACaixa('readwrite', (caixa) => caixa.put(arquivo, 'atual'));
  return { tipo, nome: arquivo.name, tamanho: arquivo.size };
}

/**
 * Devolve um endereço temporário para o arquivo guardado, ou null.
 * Quem chama fica responsável por soltar o endereço depois — mas aqui
 * o fundo vive enquanto o app estiver aberto, então soltamos só ao
 * trocar de arquivo.
 */
let enderecoAtual = '';
let tipoAtual = '';

export async function lerMidia() {
  // O endereço é criado UMA vez e reaproveitado. Antes ele era
  // recriado a cada leitura, revogando o anterior — e como o fundo e
  // a prévia leem em sequência, a segunda leitura derrubava o vídeo
  // que a primeira tinha acabado de pôr na tela.
  if (enderecoAtual) return { url: enderecoAtual, tipo: tipoAtual };
  try {
    const blob = await comACaixa('readonly', (caixa) => caixa.get('atual'));
    if (!blob) return null;
    enderecoAtual = URL.createObjectURL(blob);
    tipoAtual = blob.type.startsWith('video/') ? 'video' : 'imagem';
    return { url: enderecoAtual, tipo: tipoAtual };
  } catch (e) {
    console.warn('Fundo:', e?.message || e);
    return null;
  }
}

/** Solta o endereço guardado. Usado ao trocar ou tirar o arquivo. */
function soltarEndereco() {
  if (enderecoAtual) URL.revokeObjectURL(enderecoAtual);
  enderecoAtual = '';
  tipoAtual = '';
}

export async function apagarMidia() {
  try {
    await comACaixa('readwrite', (caixa) => caixa.delete('atual'));
    soltarEndereco();
  } catch { /* paciência */ }
}

/** Quanto ocupa, em texto curto, para mostrar nos ajustes. */
export function emTamanho(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}
