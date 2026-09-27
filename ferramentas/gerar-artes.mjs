// =========================================================
// Lê app/img/temas/<tema>/ e escreve app/js/artes.js.
//
// Existe porque uma página não consegue listar uma pasta: ela precisa
// dos nomes escritos em algum lugar. Em vez de manter essa lista na
// mão, este script a refaz a partir do que está no disco — assim
// basta jogar os arquivos na pasta do tema e publicar.
//
// Roda sozinho dentro de publicar.sh e de movel/gerar-apk.sh.
// Para rodar avulso:  node ferramentas/gerar-artes.mjs
// =========================================================
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'app', 'img', 'temas');
const SAIDA = join(RAIZ, 'app', 'js', 'artes.js');
const ACEITOS = ['.png', '.webp', '.svg', '.jpg', '.jpeg', '.gif'];

if (!existsSync(PASTA)) mkdirSync(PASTA, { recursive: true });

const temas = {};
for (const tema of readdirSync(PASTA).sort()) {
  const caminho = join(PASTA, tema);
  if (!statSync(caminho).isDirectory()) continue;

  const arquivos = readdirSync(caminho)
    .filter((f) => !f.startsWith('.') && ACEITOS.includes(extname(f).toLowerCase()))
    .sort();
  if (arquivos.length) temas[tema] = arquivos;
}

const linhas = Object.entries(temas)
  .map(([t, fs]) => `  ${/^[a-zA-Z_$][\w$]*$/.test(t) ? t : JSON.stringify(t)}: ` +
                    `[${fs.map((f) => JSON.stringify(f)).join(', ')}]`)
  .join(',\n');

writeFileSync(SAIDA, `// GERADO por ferramentas/gerar-artes.mjs — não edite à mão.
//
// Cada tema aponta para os arquivos que estão em
// app/img/temas/<tema>/. Quem monta o papel de parede com eles é
// fundos.js; quem lê os bytes é o cf:arte do Electron (ou o fetch,
// no Android e no navegador).
//
// Sem arquivos, o tema cai no desenho vetorial de sempre.

export const ARTES = {${linhas ? '\n' + linhas + '\n' : ''}};

/** Caminho relativo à página, do jeito que o <img> e o fetch pedem. */
export function caminhoDaArte(tema, arquivo) {
  return \`img/temas/\${tema}/\${arquivo}\`;
}
`);

const total = Object.values(temas).reduce((n, l) => n + l.length, 0);
console.log(`artes.js: ${Object.keys(temas).length} tema(s), ${total} arquivo(s).`);
