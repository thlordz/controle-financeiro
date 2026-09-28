#!/usr/bin/env bash
# ==================================================================
# Gera os pacotes do Linux e do Windows e publica a versão.
#
# O `set -o pipefail` é essencial: sem ele, um build que falha passa
# despercebido e a publicação leva o pacote velho.
#
# O pendrive deixou de ser obrigatório — ele queimou, e desde que o
# app se atualiza sozinho pelo GitHub ele virou só mais um lugar onde
# o programa pode morar. Se estiver espetado, é atualizado junto.
# ==================================================================
set -euo pipefail
export PATH="$HOME/.local/lib/node/bin:$PATH"

PJ="$(cd "$(dirname "$0")" && pwd)"
cd "$PJ"

# ------------------------------------------------------------------
# Pendrive, se houver
# ------------------------------------------------------------------
P="${1:-}"
if [ -z "$P" ]; then
  for tentativa in "/media/thiago/Thiago/Controle Financeiro" "/media/thiago/Thiago/pendrive"; do
    [ -d "$tentativa" ] && { P="$tentativa"; break; }
  done
fi

# Trava contra sobrescrever trabalho feito direto no pendrive. Ele já
# circulou entre máquinas e recebeu um redesenho inteiro feito fora
# daqui; publicar por cima sem olhar apagou aquilo uma vez.
SOMA=""
if [ -n "$P" ] && [ -d "$P" ]; then
  SOMA="$P/.publicado.sha256"
  somar_pendrive() {
    (cd "$P/app-extraido" 2>/dev/null && find . -type f -exec sha256sum {} + | sort -k2) 2>/dev/null
  }
  if [ -f "$SOMA" ] && ! diff -q <(somar_pendrive) "$SOMA" >/dev/null 2>&1; then
    echo
    echo "PAREI: o fonte no pendrive mudou desde a última publicação daqui."
    echo "Alguém editou $P/app-extraido/ por fora."
    echo
    { diff <(somar_pendrive) "$SOMA" || true; } | grep -E "^[<>]" | awk '{print "  " $NF}' | sort -u | head -20 || true
    echo
    echo "Compare antes de publicar. Para publicar mesmo assim:  FORCAR=1 $0"
    [ "${FORCAR:-}" = "1" ] || exit 1
    echo "FORCAR=1 — seguindo por cima."
  fi
else
  echo "Pendrive não encontrado — seguindo sem ele."
  P=""
fi

# ------------------------------------------------------------------
# O token de leitura
#
# Ele não mora no projeto: entra só na hora de empacotar e sai logo
# depois. Assim ele nunca é gravado no histórico do Git, e trocar de
# token um dia é mudar um arquivo em ~/.config e gerar de novo.
# ------------------------------------------------------------------
ORIGEM_TOKEN="$HOME/.config/controle-financeiro-tokens/leitura.txt"
TOKEN_NO_APP="$PJ/app/token-leitura.txt"
limpar_token() { rm -f "$TOKEN_NO_APP"; }
trap limpar_token EXIT

if [ -f "$ORIGEM_TOKEN" ]; then
  tr -d '[:space:]' < "$ORIGEM_TOKEN" > "$TOKEN_NO_APP"
  echo "Token de leitura carimbado no pacote."
else
  echo "AVISO: sem $ORIGEM_TOKEN — este pacote sai SEM atualização automática."
fi

# ------------------------------------------------------------------
# Build
# ------------------------------------------------------------------
npm run dist

# O app do Windows não é mais um pacote `app.asar` e sim a pasta
# `resources/app`. Foi de propósito: com o asar, o .exe guardava a
# impressão digital do pacote, então uma vírgula mudada obrigava a
# baixar 181 MB de executável na atualização. Sem ele, o .exe é o do
# Electron de fábrica, nunca muda, e o que viaja são 148 KB.
#
# O Electron prefere o app.asar quando os dois existem, então o antigo
# precisa sumir junto — senão a pasta nova é ignorada em silêncio.
trocar_app_windows() {
  local destino="$1"
  rm -f "$destino/resources/app.asar"
  rm -rf "$destino/resources/app"
  cp -r build/win-unpacked/resources/app "$destino/resources/app"
  cp "build/win-unpacked/Controle Financeiro.exe" "$destino/Controle Financeiro.exe"
}

# O nome do AppImage carrega a versão, então procuramos em vez de
# escrever à mão: assim mudar a versão não quebra a publicação.
APPIMAGE="$(ls -1t build/*.AppImage 2>/dev/null | head -1)"
[ -n "$APPIMAGE" ] || { echo "Não achei o AppImage em build/"; exit 1; }
DEB="$(ls -1t build/*.deb 2>/dev/null | head -1)"

# Espelho local, com a mesma cara que o pendrive tinha.
cp "$APPIMAGE" "pendrive/Controle Financeiro.AppImage"
trocar_app_windows "pendrive/Windows"

# A cópia que roda no PC. Só o programa é trocado; a pasta `dados`
# ao lado dele não é tocada.
PC="$HOME/Aplicativos/Controle Financeiro"
if [ -d "$PC" ]; then
  cp "$APPIMAGE" "$PC/.novo.AppImage.tmp"
  chmod +x "$PC/.novo.AppImage.tmp"
  mv -f "$PC/.novo.AppImage.tmp" "$PC/Controle Financeiro.AppImage"
  echo "AppImage do PC atualizado."
fi

if [ -n "$P" ]; then
  cp "$APPIMAGE" "$P/.novo.AppImage.tmp"
  chmod +x "$P/.novo.AppImage.tmp"
  mv -f "$P/.novo.AppImage.tmp" "$P/Controle Financeiro.AppImage"
  trocar_app_windows "$P/Windows"
  rm -rf "$P/app-extraido/app" "$P/app-extraido/electron" "$P/app-extraido/build-assets"
  cp -r app electron build-assets "$P/app-extraido/"
  rm -f "$P/app-extraido/app/token-leitura.txt"
  cp instalar-atalho-linux.sh "$P/instalar-atalho-linux.sh" && chmod +x "$P/instalar-atalho-linux.sh"
  somar_pendrive > "$SOMA"
  sync
  echo "Pendrive atualizado."
fi

# ------------------------------------------------------------------
# GitHub
# ------------------------------------------------------------------
if [ "${SEM_GITHUB:-}" = "1" ]; then
  echo "SEM_GITHUB=1 — não publiquei a release."
else
  ferramentas/publicar-github.sh
fi

echo "Pronto."
