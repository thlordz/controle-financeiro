// O arquivo de dados de verdade, para os testes que valem mais que
// qualquer caso inventado.
//
// Ele mora no pendrive, e o pendrive nem sempre está espetado. Sem
// isto os testes quebravam com ENOENT longe do pendrive, o que fazia
// uma suíte verde parecer vermelha por um motivo que não é defeito de
// código. A cópia da planilha que ficou no projeto serve de reserva.
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATOS = [
  '/media/thiago/Thiago/Controle Financeiro/dados/controle-financeiro.json',
  '/media/thiago/Thiago/pendrive/dados/controle-financeiro.json',
  join(RAIZ, 'dados', 'controle-financeiro.json'),
  join(RAIZ, 'dados', 'backup-planilha-2026-09-03.json')
];

/** O primeiro arquivo real que existir, ou null se nenhum existir. */
export function lerArquivoReal() {
  for (const c of CANDIDATOS) {
    if (!existsSync(c)) continue;
    try {
      const d = JSON.parse(readFileSync(c, 'utf8'));
      // Um arquivo vazio não serve de teste: continua procurando.
      const tem = ['receitas', 'despesas'].some((t) => (d?.[t] || []).length > 0);
      if (tem) return { dados: d, caminho: c };
    } catch { /* corrompido: tenta o próximo */ }
  }
  return null;
}
