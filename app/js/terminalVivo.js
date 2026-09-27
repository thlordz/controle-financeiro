// =========================================================
// Terminal vivo: o fundo do tema Terminal CRT digitando sozinho.
//
// Um terminal Linux de mentira atrás do app — prompt, comando sendo
// digitado letra a letra (com um erro de digitação de vez em quando,
// apagado em seguida), a saída aparecendo e a tela rolando quando
// enche.
//
// Tudo aqui é inventado. Nenhum número, nome ou lançamento de verdade
// aparece: o fundo fica visível para quem olha a tela por cima do seu
// ombro, e finanças não são assunto para papel de parede. Pelo mesmo
// motivo o usuário do prompt é genérico — o APK também vai para outra
// pessoa.
//
// Cuidado com bateria, porque isto é texto sendo redesenhado:
//   - só roda no tema Terminal e com o app na frente;
//   - cada tecla mexe num único nó de texto, nunca na tela inteira;
//   - a camada é `contain: strict`, então o navegador não recalcula o
//     resto da página por causa dela;
//   - quem pediu menos movimento no sistema recebe uma tela cheia e
//     parada, sem nenhum temporizador.
// =========================================================

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const dois = (n) => String(n).padStart(2, '0');
const sorteio = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function horario(d = new Date()) {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

/** Data no formato que o `ls -l` usa: "set 16 08:12". */
function dataDoLs(diasAtras, hora) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return `${MESES[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${hora}`;
}

/** Hora de alguns minutos atrás, para o log parecer recente. */
function minutosAtras(n) {
  return horario(new Date(Date.now() - n * 60000)).slice(0, 8);
}

function fusoHorario() {
  const h = -new Date().getTimezoneOffset() / 60;
  return `${h < 0 ? '-' : '+'}${dois(Math.abs(Math.trunc(h)))}`;
}

// ---------------------------------------------------------
// O repertório. Cada sessão é uma função, para as datas e horas
// saírem na hora em que o comando "roda", não quando o app abriu.
//
//   cmd       o que é digitado
//   linhas    a saída; texto solto sai rápido, e { t, espera } segura
//             o tempo que um comando de verdade levaria (o ping)
//   substituir  reescreve a última linha em vez de criar outra,
//             como uma barra de progresso
//   cwd       troca a pasta mostrada no prompt
//   limpar    o `clear`
// ---------------------------------------------------------
const SESSOES = [
  () => ({ cmd: 'neofetch', linhas: [
    'usuario@cofre',
    '-------------',
    'SO: Debian GNU/Linux 13 (trixie) x86_64',
    'Kernel: 6.12.107-amd64',
    `Uptime: ${sorteio(1, 9)} dias, ${sorteio(1, 23)} horas`,
    'Shell: bash 5.2.37',
    'CPU: 4 núcleos @ 3.40GHz',
    `Memória: ${sorteio(2600, 4200)}MiB / 15876MiB`
  ] }),

  () => ({ cmd: 'ls -lh ~/financas', linhas: [
    'total 48K',
    `drwxr-xr-x 2 usuario usuario 4,0K ${dataDoLs(1, '21:04')} comprovantes`,
    `-rw-r--r-- 1 usuario usuario  12K ${dataDoLs(0, '08:12')} despesas.csv`,
    `-rw-r--r-- 1 usuario usuario 3,1K ${dataDoLs(2, '19:47')} receitas.csv`,
    `-rw-r--r-- 1 usuario usuario  920 ${dataDoLs(6, '10:02')} metas.txt`
  ] }),

  () => ({ cmd: 'git log --oneline -5', linhas: [
    'a3f9c21 ajusta orçamento do mês',
    '7be04d8 registra conta de luz',
    'e41c0aa corrige categoria do mercado',
    '19d6f73 adiciona meta de reserva',
    'c08b5e2 primeiro commit'
  ] }),

  () => ({ cmd: 'ping -c 3 banco.local', linhas: [
    'PING banco.local (10.0.0.42) 56(84) bytes of data.',
    { t: `64 bytes from 10.0.0.42: icmp_seq=1 ttl=64 time=0.${sorteio(300, 480)} ms`, espera: 420 },
    { t: `64 bytes from 10.0.0.42: icmp_seq=2 ttl=64 time=0.${sorteio(300, 480)} ms`, espera: 1000 },
    { t: `64 bytes from 10.0.0.42: icmp_seq=3 ttl=64 time=0.${sorteio(300, 480)} ms`, espera: 1000 },
    { t: '', espera: 120 },
    '--- banco.local ping statistics ---',
    '3 packets transmitted, 3 received, 0% packet loss'
  ] }),

  () => ({ cmd: 'df -h /', linhas: [
    'Sist. Arq.      Tam. Usado Disp. Uso% Montado em',
    `/dev/nvme0n1p2  468G  ${sorteio(110, 140)}G  ${sorteio(300, 330)}G  ${sorteio(24, 31)}% /`
  ] }),

  () => ({ cmd: 'uptime', linhas: [
    ` ${horario()} up ${sorteio(1, 9)} days,  ${sorteio(1, 23)}:${dois(sorteio(0, 59))},  1 user,  load average: 0,${dois(sorteio(8, 40))}, 0,${dois(sorteio(8, 40))}, 0,${dois(sorteio(8, 40))}`
  ] }),

  () => ({ cmd: 'sudo apt update', linhas: [
    '[sudo] senha para usuario:',
    { t: 'Atingido:1 http://deb.debian.org/debian trixie InRelease', espera: 1500 },
    { t: 'Atingido:2 http://security.debian.org trixie-security InRelease', espera: 380 },
    { t: 'Lendo listas de pacotes... Pronto', espera: 650 },
    { t: 'Construindo árvore de dependências... Pronto', espera: 300 },
    { t: 'Todos os pacotes estão atualizados.', espera: 260 }
  ] }),

  () => ({ cmd: 'cat ~/financas/metas.txt', linhas: [
    '# metas',
    '[x] reserva de emergência — 3 meses',
    '[ ] trocar o notebook',
    '[ ] viagem de fim de ano'
  ] }),

  () => ({ cmd: 'grep -c "Pendente" despesas.csv', linhas: [String(sorteio(2, 9))] }),

  () => ({ cmd: 'free -h', linhas: [
    '               total        usado       livre',
    `Mem.:           15Gi        ${sorteio(2, 4)},${sorteio(0, 9)}Gi        ${sorteio(10, 12)}Gi`,
    'Swap:          2,0Gi           0B       2,0Gi'
  ] }),

  () => ({ cmd: './regar-planta.sh', linhas: [
    'regando a planta...',
    { t: '[##........]  20%', espera: 280 },
    { t: '[####......]  40%', espera: 280, substituir: true },
    { t: '[######....]  60%', espera: 280, substituir: true },
    { t: '[########..]  80%', espera: 280, substituir: true },
    { t: '[##########] 100%', espera: 280, substituir: true },
    { t: 'pronto. sequência mantida.', espera: 320 }
  ] }),

  () => ({ cmd: 'tail -n 3 /var/log/cofre.log', linhas: [
    `[${minutosAtras(sorteio(40, 90))}] sincronia concluída · 0 novos`,
    `[${minutosAtras(sorteio(20, 39))}] backup gravado em dados/`,
    `[${minutosAtras(sorteio(1, 19))}] planta regada`
  ] }),

  () => {
    const d = new Date();
    return { cmd: 'date', linhas: [
      `${SEMANA[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()} ${horario(d)} ${fusoHorario()}`
    ] };
  },

  () => ({ cmd: 'whoami', linhas: ['usuario'] }),
  () => ({ cmd: 'echo "a planta está florescendo"', linhas: ['a planta está florescendo'] }),
  () => ({ cmd: 'cd ~/financas', cwd: '~/financas' }),
  () => ({ cmd: 'cd ~', cwd: '~' }),
  () => ({ cmd: 'clear', limpar: true })
];

// ---------------------------------------------------------
// Estado
// ---------------------------------------------------------
let tela = null;
let cursor = null;
let linhas = [];
let pasta = '~';
let fila = [];
let temporizador = null;
let rodando = false;
let digitando = null;      // a linha do comando que está sendo digitado
let interrompida = null;   // a que ficou pela metade quando o app saiu da frente
let alturaLinha = 0;

const prompt = () => `usuario@cofre:${pasta}$ `;

function embaralhar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

function proximaSessao() {
  if (!fila.length) fila = embaralhar(SESSOES.slice());
  return fila.shift()();
}

/** Quantas linhas cabem na altura da janela. */
function capacidade() {
  if (!alturaLinha) alturaLinha = parseFloat(getComputedStyle(tela).lineHeight) || 19;
  const estilo = getComputedStyle(tela);
  const util = window.innerHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
  return Math.max(4, Math.floor(util / alturaLinha));
}

/** A tela rola: o que passou da altura sai por cima. */
function aparar() {
  const max = capacidade();
  while (linhas.length > max) linhas.shift().remove();
}

function novaLinha(texto = '', classe = '') {
  const el = document.createElement('div');
  el.className = classe ? `term__linha ${classe}` : 'term__linha';
  el.appendChild(document.createTextNode(texto));
  tela.appendChild(el);
  linhas.push(el);
  aparar();
  return el;
}

function limparTela() {
  for (const l of linhas) l.remove();
  linhas = [];
}

function escrever(saida) {
  const texto = typeof saida === 'string' ? saida : saida.t;
  if (typeof saida === 'object' && saida.substituir && linhas.length) {
    linhas[linhas.length - 1].firstChild.data = texto;
  } else {
    novaLinha(texto);
  }
}

function concluir(sessao) {
  if (sessao.limpar) limparTela();
  if (sessao.cwd) pasta = sessao.cwd;
}

/** Roda uma sessão inteira na hora, sem digitar: enche a tela ao abrir. */
function executarInstantaneo(sessao) {
  novaLinha(prompt() + sessao.cmd, 'term__linha--cmd');
  concluir(sessao);
  for (const saida of sessao.linhas || []) escrever(saida);
}

function semear() {
  const alvo = capacidade();
  let voltas = 0;
  while (linhas.length < alvo - 2 && voltas++ < 40) {
    const s = proximaSessao();
    if (s.limpar) continue;
    executarInstantaneo(s);
  }
}

// ---------------------------------------------------------
// Animação
// ---------------------------------------------------------
function esperar(fn, ms) {
  temporizador = setTimeout(fn, ms);
}

/** As teclas do comando, às vezes com um erro apagado logo depois. */
function montarTeclas(texto) {
  const teclas = [...texto].map((c) => ({ c }));
  if (texto.length > 6 && Math.random() < 0.14) {
    const onde = 2 + Math.floor(Math.random() * (texto.length - 4));
    const erradas = 'asdfghjklqwertyuiopzxcvbnm';
    teclas.splice(onde, 0,
      { c: erradas[Math.floor(Math.random() * erradas.length)] },
      { pausa: 420 },
      { apagar: true });
  }
  return teclas;
}

function teclar(linha, teclas, i, depois) {
  if (!rodando) return;
  if (i >= teclas.length) {
    digitando = null;
    return esperar(depois, sorteio(260, 700));
  }

  const t = teclas[i];
  const no = linha.firstChild;
  let espera = sorteio(45, 140);

  if (t.pausa) {
    espera = t.pausa;
  } else if (t.apagar) {
    no.data = no.data.slice(0, -1);
    espera = 160;
  } else {
    no.data += t.c;
    if (t.c === ' ') espera += 60;
  }

  esperar(() => teclar(linha, teclas, i + 1, depois), espera);
}

function imprimir(saidas, i, depois) {
  if (!rodando) return;
  if (i >= saidas.length) return esperar(depois, sorteio(900, 2800));

  const saida = saidas[i];
  const espera = typeof saida === 'object' && saida.espera ? saida.espera : sorteio(20, 70);
  esperar(() => {
    escrever(saida);
    imprimir(saidas, i + 1, depois);
  }, espera);
}

function rodarSessao() {
  if (!rodando) return;

  const sessao = proximaSessao();
  const linha = novaLinha(prompt(), 'term__linha--cmd');
  linha.appendChild(cursor);
  digitando = linha;

  teclar(linha, montarTeclas(sessao.cmd), 0, () => {
    // Enter: o cursor desce junto com a saída.
    cursor.remove();
    concluir(sessao);
    imprimir(sessao.linhas || [], 0, rodarSessao);
  });
}

function ligar() {
  if (rodando) return;
  rodando = true;

  // Voltou de outra janela no meio de um comando: como num terminal
  // de verdade, aquele fica cancelado.
  if (interrompida) {
    interrompida.firstChild.data += '^C';
    cursor.remove();
    interrompida = null;
  }

  if (!linhas.length) semear();
  rodarSessao();
}

function desligar() {
  if (!rodando) return;
  rodando = false;
  clearTimeout(temporizador);
  temporizador = null;
  interrompida = digitando;
  digitando = null;
}

function telaParada() {
  // Sem movimento: uma tela cheia e um prompt esperando, e só.
  if (!linhas.length) semear();
  const ultima = linhas[linhas.length - 1];
  if (!ultima || !ultima.classList.contains('term__linha--espera')) {
    const linha = novaLinha(prompt(), 'term__linha--cmd term__linha--espera');
    linha.appendChild(cursor);
  }
}

/** Liga o terminal e o mantém em sintonia com o tema e com a janela. */
export function ligarTerminalVivo() {
  const camada = document.getElementById('fundoVivo');
  if (!camada || tela) return;

  tela = document.createElement('div');
  tela.className = 'term';
  camada.appendChild(tela);

  cursor = document.createElement('span');
  cursor.className = 'term__cursor';
  cursor.textContent = '█';

  const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

  const avaliar = () => {
    const ehTerminal = document.documentElement.dataset.paleta === 'terminal';
    if (!ehTerminal || document.hidden) return desligar();
    if (semMovimento.matches) {
      desligar();
      return telaParada();
    }
    ligar();
  };

  new MutationObserver(avaliar)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-paleta'] });
  document.addEventListener('visibilitychange', avaliar);
  semMovimento.addEventListener?.('change', avaliar);
  window.addEventListener('resize', () => {
    alturaLinha = 0;
    if (linhas.length) aparar();
  });

  avaliar();
}
