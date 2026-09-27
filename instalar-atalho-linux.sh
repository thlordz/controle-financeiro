#!/usr/bin/env bash
# Integra o Controle Financeiro ao GNOME/KDE deste usuário.
#
# Por que isto é preciso: o Electron até põe o ícone na janela
# (_NET_WM_ICON), mas o GNOME resolve o ícone de uma janela casando o
# WM_CLASS dela com um arquivo .desktop instalado. Sem esse arquivo,
# ele cai no ícone genérico. O WM_CLASS do app é "controle-financeiro".
#
# Não mexe em nada do sistema: escreve só dentro de ~/.local/share.
# Para desfazer, veja o fim deste arquivo.
set -euo pipefail

APP="${1:-}"
if [ -z "$APP" ]; then
  for tentativa in \
    "/media/thiago/Thiago/Controle Financeiro/Controle Financeiro.AppImage" \
    "$(dirname "$0")/Controle Financeiro.AppImage"; do
    [ -f "$tentativa" ] && { APP="$tentativa"; break; }
  done
fi
[ -f "$APP" ] || { echo "AppImage não encontrado. Use: $0 /caminho/Controle Financeiro.AppImage"; exit 1; }
APP="$(readlink -f "$APP")"

# Os ícones podem estar ao lado do script (projeto), dentro do
# app-extraido do pendrive (script rodado de lá) ou ao lado do
# AppImage. O segundo caso faltava: rodar do pendrive apontando para
# um AppImage copiado para o computador não achava ícone nenhum.
ORIGEM_ICONES="$(dirname "$0")/build-assets"
[ -d "$ORIGEM_ICONES" ] || ORIGEM_ICONES="$(dirname "$0")/app-extraido/build-assets"
[ -d "$ORIGEM_ICONES" ] || ORIGEM_ICONES="$(dirname "$APP")/app-extraido/build-assets"
[ -d "$ORIGEM_ICONES" ] || { echo "Não achei os ícones (build-assets)."; exit 1; }

# 1. Ícones no tema do usuário, nos tamanhos que o GNOME procura.
for n in 48 64 128 256 512; do
  destino="$HOME/.local/share/icons/hicolor/${n}x${n}/apps"
  origem="$ORIGEM_ICONES/icone-$n.png"
  [ -f "$origem" ] || origem="$ORIGEM_ICONES/icone.png"
  mkdir -p "$destino"
  cp "$origem" "$destino/controle-financeiro.png"
done

# 2. O atalho. StartupWMClass é a peça que amarra a janela ao ícone.
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/controle-financeiro.desktop" <<ATALHO
[Desktop Entry]
Type=Application
Name=Controle Financeiro
Comment=Controle financeiro pessoal, portátil
Exec="$APP" %U
Icon=controle-financeiro
Terminal=false
Categories=Office;Finance;
StartupWMClass=controle-financeiro
ATALHO
chmod +x "$HOME/.local/share/applications/controle-financeiro.desktop"

# 3. Avisa o sistema que algo novo chegou.
command -v update-desktop-database >/dev/null && \
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && \
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Pronto. O app agora aparece no menu de Atividades com o ícone certo."
echo "Se a janela já estava aberta, feche e abra de novo."
echo
echo "Para desfazer:"
echo "  rm ~/.local/share/applications/controle-financeiro.desktop"
echo "  rm ~/.local/share/icons/hicolor/*/apps/controle-financeiro.png"
