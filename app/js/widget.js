// =========================================================
// Alimenta o widget da tela inicial do Android.
//
// O widget vive fora do app: ele é desenhado pelo sistema, com o app
// fechado, e não enxerga o localStorage do WebView. Então a cada
// mudança relevante a tela empurra para o lado nativo o punhado de
// coisas que o widget mostra — sequência, escudos, estágio e o dia do
// último acesso — e o plugin manda redesenhar na hora.
//
// Vai o mínimo, de propósito: nada de saldo, lançamento ou qualquer
// valor em dinheiro. Widget fica à vista de quem passa, e finanças
// não são assunto para tela de bloqueio.
//
// Fora do aplicativo Android isto não faz nada.
// =========================================================
import { diasDaSequencia, calcularSequencia, inicioDoCiclo,
         escudosDisponiveis, estagioCrescendo } from './planta.js';

function plugin() {
  return window.Capacitor?.Plugins?.ControleWidget || null;
}

export function disponivel() {
  return Boolean(window.Capacitor?.isNativePlatform?.() && plugin());
}

/**
 * Manda o estado atual para o widget.
 *
 * Silencioso de propósito: se o widget falhar, o app não tem nada a
 * ver com isso e não deve incomodar ninguém por causa disso.
 */
export function atualizarWidget(dados) {
  const p = plugin();
  if (!p || !dados) return;

  try {
    const dias = diasDaSequencia(dados);
    const sequencia = calcularSequencia(dias, inicioDoCiclo(dias));

    p.atualizar({
      sequencia,
      escudos: escudosDisponiveis(dados),
      estagio: estagioCrescendo(sequencia).emoji,
      // O nome escrito e a chave vão junto: o widget mostra a mesma
      // etiqueta que o app e escolhe o desenho pela chave.
      estagioNome: estagioCrescendo(sequencia).nome,
      estagioChave: estagioCrescendo(sequencia).chave,
      // O dia do último acesso, não um "entrou hoje" cozido: quem
      // decide isso é o widget, ao desenhar, comparando com a data de
      // então. Gravado aqui, ficaria "sim" para sempre.
      ultimoDia: dias.length ? dias[dias.length - 1] : ''
    }).catch(() => { /* widget é enfeite: não atrapalha o app */ });
  } catch { /* idem */ }
}
