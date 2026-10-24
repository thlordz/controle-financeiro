// =========================================================
// Exportar para conferir com o banco.
//
// Dois arquivos saem daqui, e os dois têm o mesmo recorte — um
// período e um "modo", que diz que pedaço da vida financeira entra:
//
//   fatura  as compras no crédito, todas, inclusive as estornadas.
//           A fatura do banco lista a compra E o estorno; deixar o
//           estornado de fora faria a conferência acusar uma falta.
//   conta   o que de fato mexeu no dinheiro: pago fora do crédito,
//           receita recebida, devedor que pagou. É o que o extrato
//           da conta mostra — e ele não mostra o que ainda vai
//           acontecer, então pendente não entra.
//   tudo    sem recorte nenhum.
//
// O extrato (CSV) segue o jeito do Nubank: valor entre aspas com
// vírgula decimal, saída negativa, entrada positiva. Assim o arquivo
// do app e o do banco ficam lado a lado sem conversão.
//
// O relatório (texto) é para ler: o saldo, as somas do período, o
// total por forma de pagamento e a lista, dia a dia.
//
// Nada aqui sabe de tela. Recebe os dados, devolve texto.
// =========================================================

import { calcularPainel, statusDevedor } from './calculos.js';

const texto = (s) => String(s ?? '').trim().toLowerCase();
const credito = (x) => texto(x.formaPgto).includes('crédito');

export const MODOS = {
  fatura: {
    nome: 'Fatura do cartão',
    explica: 'As compras no crédito, inclusive as estornadas — o banco lista as duas.',
  },
  conta: {
    nome: 'Conta (Pix, débito e o resto)',
    explica: 'Só o que já mexeu no seu dinheiro: o que você pagou fora do crédito, o que recebeu e quem te pagou.',
  },
  tudo: {
    nome: 'Tudo',
    explica: 'Todos os lançamentos do período, pagos ou não.',
  },
};

const dentro = (iso, de, ate) => Boolean(iso) && iso >= de && iso <= ate;

/**
 * Os movimentos do período, já com sinal: saída negativa, entrada
 * positiva. Cada um sabe de onde veio (`tipo`), para o relatório
 * poder separar e para quem confere entender a linha.
 */
export function movimentos(dados, { de, ate, modo = 'tudo' }) {
  const saida = [];

  for (const x of dados.despesas || []) {
    if (!dentro(x.data, de, ate)) continue;
    const st = texto(x.status);
    if (modo === 'fatura' && !credito(x)) continue;
    if (modo === 'conta' && (credito(x) || st !== 'pago')) continue;
    saida.push({
      data: x.data, descricao: x.descricao || '', valor: -(Number(x.valor) || 0),
      forma: x.formaPgto || '', status: x.status || '', tipo: 'despesa',
      categoria: x.categoria || '', observacao: x.observacao || '',
    });
  }

  if (modo !== 'fatura') {
    for (const x of dados.receitas || []) {
      if (!dentro(x.data, de, ate)) continue;
      if (modo === 'conta' && texto(x.status) !== 'recebido') continue;
      // Receita não tem forma de pagamento; tem origem — quem pagou.
      // No extrato do banco o nome de quem pagou vem na descrição, então
      // ela vai para lá, e a coluna de forma fica com o que ela é.
      const desc = [x.descricao, x.origem].filter(Boolean).join(' — ');
      saida.push({
        data: x.data, descricao: desc, valor: Number(x.valor) || 0,
        forma: '', status: x.status || '', tipo: 'receita',
        categoria: x.categoria || '', observacao: x.observacao || '',
      });
    }

    // Devedor entra pela data em que o dinheiro chegou, não pela
    // previsão: é nessa data que ele aparece no extrato do banco.
    for (const v of dados.devedores || []) {
      const pago = texto(statusDevedor(v)) === 'pago';
      const quando = pago ? v.pagouEm : v.pgtoPrevisto;
      if (!dentro(quando, de, ate)) continue;
      if (modo === 'conta' && !pago) continue;
      saida.push({
        data: quando, descricao: `${v.nome || 'Devedor'} me pagou`, valor: Number(v.valor) || 0,
        forma: v.formaPgto || '', status: statusDevedor(v), tipo: 'devedor',
        categoria: v.tipo || '', observacao: v.observacao || '',
      });
    }
  }

  return saida.sort((a, b) => b.data.localeCompare(a.data) || a.descricao.localeCompare(b.descricao));
}

/** Estornado aparece na lista e não conta em soma nenhuma. */
const conta = (m) => texto(m.status) !== 'estornado';

/* ---------------- o extrato ---------------- */

const aspas = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const valorDoBanco = (n) => aspas((Number(n) || 0).toFixed(2).replace('.', ','));

export function extratoCsv(movs) {
  const linhas = ['data,descricao,valor,forma,status,tipo,categoria,observacao'];
  for (const m of movs) {
    linhas.push([
      m.data, aspas(m.descricao), valorDoBanco(m.valor), aspas(m.forma),
      aspas(m.status), m.tipo, aspas(m.categoria), aspas(m.observacao),
    ].join(','));
  }
  return linhas.join('\n') + '\n';
}

/* ---------------- o relatório ---------------- */

const real = (n) => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '') + 'R$ ' + s;
};
const bonita = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';

/** "Nome ........ valor", com o valor alinhado à direita. */
function linha(nome, valor, largura = 44) {
  const v = String(valor);
  const pontos = Math.max(2, largura - nome.length - v.length - 2);
  return `  ${nome} ${'.'.repeat(pontos)} ${v}`;
}

export function relatorioTexto(dados, { de, ate, modo = 'tudo' }, agora = new Date()) {
  const movs = movimentos(dados, { de, ate, modo });
  const validos = movs.filter(conta);
  const entradas = validos.filter((m) => m.valor > 0).reduce((t, m) => t + m.valor, 0);
  const saidas = validos.filter((m) => m.valor < 0).reduce((t, m) => t + m.valor, 0);
  const estornados = movs.filter((m) => !conta(m));

  // O painel de hoje, para o relatório trazer os mesmos números que a
  // tela inicial mostra.
  const hj = agora;
  const p = calcularPainel(dados, hj.getFullYear(), hj.getMonth() + 1);

  // Receita é agrupada à parte: ela não tem forma, e misturá-la com
  // Pix e débito somaria entrada de salário com gasto de padaria.
  const rotulo = (m) => m.tipo === 'receita' ? 'Receitas'
    : m.forma || (m.tipo === 'devedor' ? 'Devedores (sem forma)' : 'Sem forma');
  const porForma = new Map();
  for (const m of validos) {
    const f = rotulo(m);
    const atual = porForma.get(f) || { soma: 0, qtd: 0 };
    porForma.set(f, { soma: atual.soma + m.valor, qtd: atual.qtd + 1 });
  }

  const quando = `${bonita(hj.toISOString())} às ${String(hj.getHours()).padStart(2, '0')}:${String(hj.getMinutes()).padStart(2, '0')}`;
  const r = [];
  r.push('CONTROLE FINANCEIRO — RELATÓRIO');
  r.push(`Gerado em ${quando}`);
  r.push(`Período: ${bonita(de)} a ${bonita(ate)}`);
  r.push(`O que entrou: ${MODOS[modo]?.nome || modo}`);
  r.push('');
  r.push('Vai comparar com o arquivo do banco? As instruções estão no fim deste relatório.');
  r.push('');
  r.push('HOJE');
  r.push(linha('Saldo em conta', real(p.saldoConta)));
  r.push(linha(p.possoGastar < 0 ? 'Quanto estou devendo' : 'Quanto vai sobrar no mês', real(Math.abs(p.possoGastar))));
  r.push(linha('Fatura atual', real(p.faturaAtual)));
  r.push(linha('Fatura prevista', real(p.faturaTotalPrevista)));
  r.push('');
  r.push('NO PERÍODO');
  r.push(linha('Entradas', real(entradas)));
  r.push(linha('Saídas', real(saidas)));
  r.push(linha('Diferença', real(entradas + saidas)));
  r.push(linha('Lançamentos', String(movs.length)));
  if (estornados.length) {
    r.push(linha('Estornados (não somam)', `${estornados.length} · ${real(Math.abs(estornados.reduce((t, m) => t + m.valor, 0)))}`));
  }
  r.push('');
  r.push('POR FORMA DE PAGAMENTO');
  for (const [f, { soma, qtd }] of [...porForma.entries()].sort((a, b) => Math.abs(b[1].soma) - Math.abs(a[1].soma))) {
    r.push(linha(f, `${real(soma)}   ${qtd}`));
  }
  r.push('');
  r.push('LANÇAMENTOS');
  let dia = null;
  for (const m of movs) {
    if (m.data !== dia) { dia = m.data; r.push(''); r.push(`  ${bonita(dia)}`); }
    const marca = conta(m) ? '' : '   [ESTORNADO]';
    r.push(`    ${real(m.valor).padStart(13)}  ${m.descricao}  ·  ${m.forma || '—'}  ·  ${m.status}${marca}`);
  }
  r.push('');
  r.push(...instrucoesParaComparar(modo));
  return r.join('\n');
}

/**
 * O bloco do fim do relatório, para quem for comparar — pessoa ou IA.
 *
 * Tudo aqui saiu de conferências de verdade, com a fatura e o extrato
 * do Nubank: cada item de "não é erro" foi um falso alarme que custou
 * tempo para ser entendido. Escrever isso no próprio arquivo faz a
 * próxima conferência começar de onde a anterior terminou, em vez de
 * redescobrir que o pagamento da fatura não é um gasto.
 */
export function instrucoesParaComparar(modo) {
  const comum = [
    'COMO CASAR UMA LINHA DO BANCO COM UMA DO APP',
    '  - Mesmo valor, ao centavo. Diferença de R$ 0,01 é arredondamento: aponte, mas não é erro.',
    '  - Data até 5 dias de distância. Parcelas (\"Parcela 3/6\") podem estar até 45 dias longe.',
    '  - Para desempatar valores iguais, use a descrição: no banco ela vem com o nome da loja',
    '    ("Compra no débito - DROGARIA ATITUDE"), no app vem como a pessoa escreveu ("Drogaria").',
    '  - Cada linha só casa uma vez, dos dois lados.',
    '',
  ];
  const fatura = [
    'O QUE NA FATURA PARECE ERRO E NÃO É',
    '  - O banco lista todas as parcelas na data em que a fatura abre; o app usa o dia de cada',
    '    vencimento. Mesmo valor e mesma parcela com datas diferentes estão certos.',
    '  - Compra e estorno da mesma coisa: no app ela aparece marcada [ESTORNADO], ou não aparece.',
    '    As duas formas estão certas — nas duas, ela não soma.',
    '  - Cobrança e crédito do mesmo serviço no mesmo dia (ex.: 4,50 e −4,35): o app pode ter só o',
    '    líquido (0,15).',
    '  - IOF de compra internacional vem numa linha à parte no banco; o app pode ter a compra e o',
    '    IOF somados numa linha só.',
    '  - "Pagamento recebido" é o pagamento da fatura anterior. Não é compra e não vai no app.',
    '  - A fatura não vai do dia 1º ao 31: vai de um fechamento ao outro. Compare o mesmo período.',
    '',
  ];
  const conta = [
    'O QUE NO EXTRATO DA CONTA PARECE ERRO E NÃO É',
    '  - "Aplicação RDB", "Resgate RDB" e "Pagamento de fatura" são dinheiro mudando de lugar',
    '    dentro do próprio banco. Não são gasto nem receita e não devem estar no app.',
    '  - Pix enviado para o próprio nome costuma ser dinheiro guardado (no app: "Cofrinho", na',
    '    categoria Investimentos).',
    '  - Uma transferência recebida pode pagar mais de um devedor de uma vez: some os devedores',
    '    pagos na mesma data antes de dizer que falta.',
    '  - Devedor aparece aqui na data em que pagou, que é quando o dinheiro entrou.',
    '  - Despesa marcada como fixa costuma estar no dia 1º do mês, mesmo que tenha sido paga',
    '    noutro dia. Se o valor e o destinatário batem, é ela.',
    '  - Devedor pago sem forma de pagamento e sem Pix no extrato provavelmente pagou em dinheiro.',
    '    Pergunte antes de mandar desmarcar.',
    '',
  ];
  const resposta = [
    'COMO ESCREVER O RESULTADO',
    '  Comece dizendo quantas linhas casaram de quantas. Depois, só o que precisa de ação,',
    '  em quatro grupos, nesta ordem, com data, valor, descrição e forma de pagamento:',
    '',
    '    LANÇAR        está no banco e não está no app',
    '    APAGAR        está no app e não está no banco (diga por que parece duplicado)',
    '    CORRIGIR      está nos dois, mas com valor, forma ou data diferente',
    '    PERGUNTAR     não dá para saber sem a pessoa (ex.: pagou em dinheiro?)',
    '',
    '  Os falsos alarmes da lista acima ficam num quinto grupo, curto, "Não é erro", para a',
    '  pessoa saber que foram vistos. Termine dizendo quanto o saldo do app muda se ela fizer',
    '  tudo que está em LANÇAR e APAGAR.',
    '',
    '  As palavras dos botões do app são: lançar, apagar, "Foi estornado", e marcar o status',
    '  tocando no selo (Pendente, Pago, Aguardando). Use essas.',
    '',
  ];
  return [
    '══════════════════════════════════════════════════════════════════════',
    'INSTRUÇÕES PARA QUEM FOR COMPARAR (PESSOA OU IA)',
    '══════════════════════════════════════════════════════════════════════',
    '',
    'Este relatório vem do app Controle Financeiro. A lista acima são os lançamentos do app no',
    'período; o outro arquivo é o do banco. O objetivo é dizer à pessoa o que ela precisa fazer',
    'no app para os dois baterem. A lista acima basta — o CSV exportado junto é a mesma coisa em',
    'formato de planilha, se for mais fácil de ler.',
    '',
    'No app, saída é negativa e entrada é positiva, igual ao banco.',
    '',
    ...comum,
    ...(modo === 'conta' ? conta : modo === 'fatura' ? fatura : [...fatura, ...conta]),
    ...resposta,
  ];
}

/** Nome de arquivo que diz o que tem dentro e de quando é. */
export function nomeDoArquivo(modo, de, ate, extensao) {
  const curto = { fatura: 'fatura', conta: 'conta', tudo: 'tudo' }[modo] || modo;
  return `controle-financeiro-${curto}-${de}-a-${ate}.${extensao}`;
}
