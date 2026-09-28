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
export async function lerMidia() {
  try {
    const blob = await comACaixa('readonly', (caixa) => caixa.get('atual'));
    if (!blob) return null;
    if (enderecoAtual) URL.revokeObjectURL(enderecoAtual);
    enderecoAtual = URL.createObjectURL(blob);
    return { url: enderecoAtual, tipo: blob.type.startsWith('video/') ? 'video' : 'imagem' };
  } catch (e) {
    console.warn('Fundo:', e?.message || e);
    return null;
  }
}

export async function apagarMidia() {
  try {
    await comACaixa('readwrite', (caixa) => caixa.delete('atual'));
    if (enderecoAtual) { URL.revokeObjectURL(enderecoAtual); enderecoAtual = ''; }
  } catch { /* paciência */ }
}

/** Quanto ocupa, em texto curto, para mostrar nos ajustes. */
export function emTamanho(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}
