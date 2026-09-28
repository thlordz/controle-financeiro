// =========================================================
// A tela de abertura.
//
// Ela existe por dois motivos. O primeiro é honesto: o app leva um
// tempinho para ler o arquivo, juntar com o banco e conferir se tem
// versão nova, e uma tela em branco nesse meio parece travamento. O
// segundo é que dá para usar esse tempo para dizer algo simpático em
// vez de mostrar uma ampulheta.
//
// As frases não se repetem seguidas: a última fica guardada.
// =========================================================

const FRASES = [
  'Contando moedas…',
  'Conferindo se o mês fecha…',
  'Perguntando pro cofrinho…',
  'Somando os cafés de ontem…',
  'Procurando aquele dinheiro esquecido no bolso…',
  'Dividindo a conta do jantar…',
  'Arredondando pra cima, como você gosta…',
  'Verificando se o salário caiu…',
  'Lembrando que sobremesa também é gasto…',
  'Colocando os boletos em ordem…',
  'Fingindo que a fatura não chegou…',
  'Contando até dez antes de olhar o extrato…',
  'Separando o que é vontade do que é precisão…',
  'Dando um oi pra sua plantinha…',
  'Tirando o pó da calculadora…',
  'Checando se alguém te pagou…',
  'Anotando tudo direitinho…',
];

const PASSOS = {
  abrindo:    'Acordando…',
  lendo:      'Lendo suas anotações',
  juntando:   'Buscando o que mudou no seu banco',
  atualizando:'Vendo se tem versão nova',
  pronto:     'Tudo pronto!',
};

const $ = (id) => document.getElementById(id);

function sortearFrase() {
  let ultima = '';
  try { ultima = localStorage.getItem('cf:ultimaFrase') || ''; } catch { /* paciência */ }
  const possiveis = FRASES.filter((f) => f !== ultima);
  const frase = possiveis[Math.floor(Math.random() * possiveis.length)];
  try { localStorage.setItem('cf:ultimaFrase', frase); } catch { /* paciência */ }
  return frase;
}

let comecou = 0;

export function abrirAbertura() {
  comecou = Date.now();
  const frase = $('aberturaFrase');
  if (frase) frase.textContent = sortearFrase();
  passo('abrindo', 8);
}

/**
 * Move a barra e troca o recado. A barra nunca volta para trás: ela
 * anda para a frente mesmo que uma etapa termine antes da outra.
 */
let ondeEsta = 0;
export function passo(qual, porcento) {
  const texto = $('aberturaPasso');
  const cheio = $('aberturaCheio');
  if (texto && PASSOS[qual]) texto.textContent = PASSOS[qual];
  if (cheio && porcento > ondeEsta) {
    ondeEsta = porcento;
    cheio.style.width = porcento + '%';
  }
}

/**
 * Fecha a abertura. Segura um instante se tudo foi rápido demais:
 * uma tela que pisca e some incomoda mais do que uma que fica meio
 * segundo.
 */
export function fecharAbertura() {
  passo('pronto', 100);
  const passado = Date.now() - comecou;
  const esperar = Math.max(0, 900 - passado);
  setTimeout(() => {
    const tela = $('abertura');
    if (!tela) return;
    tela.classList.add('abertura--saindo');
    setTimeout(() => { tela.hidden = true; }, 420);
  }, esperar);
}

/** Mostra um erro na própria abertura, em vez de deixar a tela parada. */
export function falharAbertura(mensagem) {
  const texto = $('aberturaPasso');
  if (texto) {
    texto.textContent = mensagem;
    texto.style.color = 'var(--vermelho)';
  }
  const cheio = $('aberturaCheio');
  if (cheio) cheio.style.background = 'var(--vermelho)';
}
