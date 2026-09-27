// =========================================================
// Lembretes da planta (só no aplicativo Android).
//
// O problema que isto resolve é concreto: a sequência quebra com UM
// dia esquecido, e o app só existe quando está aberto — ele não tem
// como se lembrar de você sozinho.
//
// A saída é agendar com antecedência. A cada abertura o app entrega
// ao Android os avisos dos próximos dias; o sistema dispara sozinho,
// com o app fechado e sem internet. Quando você abre, os avisos são
// cancelados e reescritos — então o de hoje nunca chega, porque
// abrir já é a prova de que não precisava.
//
// Como o texto de cada dia futuro é escrito na hora de agendar, e o
// estado da planta em cada dia de ausência é sabido de antemão, cada
// aviso já nasce com a frase certa: "quebra hoje", "está murchando",
// "morre amanhã".
//
// No computador nada disso existe. O Electron só notifica enquanto
// está aberto, e um aviso que só aparece com o app aberto não avisa
// nada — ali a própria tela já mostra o estado da planta.
// =========================================================
import { DIAS_ATE_MORRER, calcularSequencia, inicioDoCiclo,
         diasDaSequencia, escudosDisponiveis } from './planta.js';

const CHAVE = 'controle-financeiro:lembretes';

// Faixa de identificadores só nossa: permite cancelar os nossos sem
// tocar em nada que outro pedaço do app venha a agendar um dia.
const PRIMEIRO_ID = 7100;
const ULTIMO_ID = PRIMEIRO_ID + 40;

const PADRAO = { ligado: false, hora: '20:00' };

function plugin() {
  return window.Capacitor?.Plugins?.LocalNotifications || null;
}

/** Só o aplicativo Android tem como avisar com o app fechado. */
export function disponivel() {
  return Boolean(window.Capacitor?.isNativePlatform?.() && plugin());
}

export function lerConfiguracao() {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') };
  } catch {
    return { ...PADRAO };
  }
}

export function gravarConfiguracao(mudanca) {
  const novo = { ...lerConfiguracao(), ...mudanca };
  try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* sem espaço: segue */ }
  return novo;
}

/**
 * Pede a permissão de notificação (obrigatória do Android 13 em
 * diante). Devolve se ficou liberada.
 */
export async function pedirPermissao() {
  const p = plugin();
  if (!p) return false;
  try {
    let estado = await p.checkPermissions();
    if (estado.display !== 'granted') estado = await p.requestPermissions();
    return estado.display === 'granted';
  } catch {
    return false;
  }
}

export async function temPermissao() {
  const p = plugin();
  if (!p) return false;
  try {
    return (await p.checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/**
 * O que dizer a quem está há `dias` sem abrir.
 *
 * Espelha os estágios de planta.js: a sequência morre no primeiro dia
 * perdido, a planta vai murchando e morre de vez aos DIAS_ATE_MORRER.
 */
function recado(dias, sequencia, escudos = 0) {
  // Enquanto houver escudo, o dia perdido não quebra a sequência: ele
  // quebra um escudo. O aviso conta isso em vez de ameaçar.
  if (dias <= escudos) {
    const restam = escudos - dias;
    return {
      titulo: '🛡️ Um escudo se quebrou',
      corpo: `Você não entrou hoje, mas um escudo segurou sua sequência. ` +
             (restam > 0
               ? `${restam === 1 ? 'Resta 1 escudo' : `Restam ${restam} escudos`}.`
               : 'Era o último — amanhã a sequência depende de você.')
    };
  }
  // Passado o estoque, a contagem de ausência recomeça do primeiro
  // dia realmente perdido.
  dias -= escudos;

  if (dias === 1) {
    return sequencia > 1
      ? { titulo: '🌱 Sua sequência acaba hoje',
          corpo: `São ${sequencia} dias seguidos. Abra o app hoje para não perder.` }
      : { titulo: '🌱 Não perca a sequência',
          corpo: 'Você entrou ontem. Abra hoje e a contagem continua.' };
  }
  if (dias <= 4) {
    return { titulo: '🥀 A planta está murchando',
             corpo: `${dias} dias sem você. Ainda dá para cuidar dela.` };
  }
  if (dias <= 9) {
    return { titulo: '🍂 A planta está seca',
             corpo: `${dias} dias sem você, mas ela ainda está viva.` };
  }
  if (dias < DIAS_ATE_MORRER - 1) {
    return { titulo: '🕸️ A planta foi abandonada',
             corpo: `${dias} dias sem você. Ela morre em ${DIAS_ATE_MORRER - dias} dias.` };
  }
  if (dias === DIAS_ATE_MORRER - 1) {
    return { titulo: '🕸️ A planta morre amanhã',
             corpo: 'Último dia para salvar esta planta.' };
  }
  return { titulo: '🪦 A planta morreu',
           corpo: 'Uma semente nova espera por você. Suas conquistas continuam suas.' };
}

/** Remove só os avisos que são nossos, deixando o resto em paz. */
async function limpar(p) {
  try {
    const pendentes = await p.getPending();
    const meus = (pendentes?.notifications || [])
      .filter((n) => n.id >= PRIMEIRO_ID && n.id <= ULTIMO_ID)
      .map((n) => ({ id: n.id }));
    if (meus.length) await p.cancel({ notifications: meus });
  } catch { /* nada pendente, ou o sistema não deixou ler: segue */ }
}

/**
 * Reescreve toda a fila de avisos a partir de hoje.
 *
 * Chamado na abertura, depois de sincronizar e quando a configuração
 * muda. Cancelar e reagendar tudo é mais simples — e mais confiável —
 * do que tentar remendar a fila que já estava lá.
 */
export async function reagendar(dados) {
  const p = plugin();
  if (!p) return;

  await limpar(p);

  const cfg = lerConfiguracao();
  if (!cfg.ligado) return;
  if (!(await temPermissao())) return;

  const [hh, mm] = String(cfg.hora || PADRAO.hora).split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;

  const dias = diasDaSequencia(dados);
  const sequencia = calcularSequencia(dias, inicioDoCiclo(dias));
  const escudos = escudosDisponiveis(dados);
  const agora = new Date();
  const avisos = [];

  // Até o dia da morte, e um a mais para fechar a história. Depois
  // disso não há mais o que salvar, e insistir seria só incômodo.
  for (let dias = 1; dias <= DIAS_ATE_MORRER + escudos; dias++) {
    const quando = new Date(agora);
    quando.setDate(quando.getDate() + dias);
    quando.setHours(hh, mm, 0, 0);
    if (quando <= agora) continue;

    const { titulo, corpo } = recado(dias, sequencia, escudos);
    avisos.push({
      id: PRIMEIRO_ID + dias,
      title: titulo,
      body: corpo,
      schedule: { at: quando, allowWhileIdle: true }
    });
  }

  try {
    await p.schedule({ notifications: avisos });
  } catch (e) {
    console.warn('Não deu para agendar os lembretes:', e);
  }
}

/** Cancela tudo — usado ao desligar a opção. */
export async function desligar() {
  const p = plugin();
  if (p) await limpar(p);
}
