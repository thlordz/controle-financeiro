// =========================================================
// Sair com um arquivo do app.
//
// São três mundos diferentes para a mesma coisa. No computador existe
// uma caixa de diálogo de verdade; no celular não existe "salvar em",
// e sim a folha de compartilhar; no navegador é um link de download.
// Esta função esconde essa diferença de quem chama.
//
// Veio do antigo formulario.js, que saiu junto com o desenho velho.
// =========================================================

export async function salvarArquivo(blob, nome) {
  // Electron: caixa de diálogo, para escolher onde salvar.
  if (window.cfAPI?.salvarComo) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const r = await window.cfAPI.salvarComo({ nome, bytes });
    return Boolean(r?.caminho);
  }

  // Android: grava no cache e abre a folha de compartilhar, que é como
  // se manda um arquivo para fora do app no celular.
  const plugins = window.Capacitor?.Plugins;
  if (plugins?.Filesystem && plugins?.Share) {
    const base64 = await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
      leitor.readAsDataURL(blob);
    });
    await plugins.Filesystem.writeFile({ path: nome, data: base64, directory: 'CACHE' });
    const { uri } = await plugins.Filesystem.getUri({ path: nome, directory: 'CACHE' });
    await plugins.Share.share({ title: nome, files: [uri] });
    return true;
  }

  // Navegador: link de download comum.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
