#!/usr/bin/env bash
# Gera o APK do Controle Financeiro e copia para o pendrive.
#
# O app web é o mesmo de ../app: o `cap sync` copia aquela pasta para
# dentro do projeto Android, então basta rodar isto depois de mexer no
# app para o celular ficar igual ao desktop.
#
# A chave de assinatura fica em chave/controle-financeiro.jks. NÃO a
# perca: o Android só aceita atualizar um app instalado se a nova
# versão estiver assinada com a mesma chave.
set -euo pipefail

export JAVA_HOME="$HOME/.local/lib/jdk17"
export ANDROID_HOME="$HOME/.local/lib/android-sdk"
export PATH="$JAVA_HOME/bin:$HOME/.local/lib/node/bin:$ANDROID_HOME/build-tools/34.0.0:$PATH"

MOVEL="$(cd "$(dirname "$0")" && pwd)"
cd "$MOVEL"

# A senha da chave fica em chave/senha.txt, que não vai para o
# GitHub. Antes ela estava escrita aqui dentro — e este script passou
# a ser público, então a senha teria ido junto.
SENHA="${SENHA_CHAVE:-}"
if [ -z "$SENHA" ] && [ -f chave/senha.txt ]; then
  SENHA="$(cat chave/senha.txt)"
fi
[ -n "$SENHA" ] || { echo "Não achei a senha da chave em movel/chave/senha.txt"; exit 1; }

# A versão vem de app/js/versao.js, que é o número que o app mostra na
# tela. Assim o que a pessoa lê nos Ajustes e o que o Android registra
# nunca divergem. O versionCode sobe sozinho a cada geração, porque o
# Android recusa instalar por cima com número igual ou menor.
VERSAO="$(sed -n "s/^export const VERSAO = '\([^']*\)'.*/\1/p" ../app/js/versao.js)"
[ -n "$VERSAO" ] || { echo "Não achei a versão em app/js/versao.js"; exit 1; }
CODIGO="$(sed -n 's/.*versionCode \([0-9]*\).*/\1/p' android/app/build.gradle)"
CODIGO=$((CODIGO + 1))
sed -i "s/versionCode [0-9]*/versionCode $CODIGO/; s/versionName \"[^\"]*\"/versionName \"$VERSAO\"/" android/app/build.gradle
echo "Gerando versão $VERSAO (versionCode $CODIGO)"

# O token de leitura entra no pacote só agora e sai logo depois, para
# nunca ser gravado no histórico do Git. Sem ele o APK funciona igual,
# só não se atualiza sozinho.
ORIGEM_TOKEN="$HOME/.config/controle-financeiro-tokens/leitura.txt"
TOKEN_NO_APP="$MOVEL/../app/token-leitura.txt"
limpar_token() { rm -f "$TOKEN_NO_APP"; }
trap limpar_token EXIT
if [ -f "$ORIGEM_TOKEN" ]; then
  tr -d '[:space:]' < "$ORIGEM_TOKEN" > "$TOKEN_NO_APP"
  echo "Token de leitura carimbado no APK."
else
  echo "AVISO: sem $ORIGEM_TOKEN — este APK sai SEM atualização automática."
fi

npx cap sync android
(cd android && ./gradlew assembleRelease --no-daemon)

APK=android/app/build/outputs/apk/release/app-release-unsigned.apk
zipalign -p -f 4 "$APK" /tmp/controle-financeiro-alinhado.apk
apksigner sign --ks chave/controle-financeiro.jks --ks-pass "pass:$SENHA" \
  --key-pass "pass:$SENHA" --out "Controle Financeiro.apk" \
  /tmp/controle-financeiro-alinhado.apk
rm -f /tmp/controle-financeiro-alinhado.apk
apksigner verify "Controle Financeiro.apk"

# Pendrive: os dois nomes que a pasta já teve.
P="${1:-}"
if [ -z "$P" ]; then
  for tentativa in "/media/thiago/Thiago/Controle Financeiro" "/media/thiago/Thiago/pendrive"; do
    [ -d "$tentativa" ] && { P="$tentativa"; break; }
  done
fi

if [ -n "$P" ] && [ -d "$P" ]; then
  mkdir -p "$P/Android"
  cp "Controle Financeiro.apk" "$P/Android/Controle Financeiro.apk"
  sync
  echo "APK copiado para $P/Android"
else
  echo "Pendrive não encontrado; o APK ficou em $MOVEL/Controle Financeiro.apk"
fi

# ------------------------------------------------------------------
# GitHub: é daqui que os celulares instalados descobrem a versão nova.
# ------------------------------------------------------------------
if [ "${SEM_GITHUB:-}" = "1" ]; then
  echo "SEM_GITHUB=1 — não publiquei a release."
else
  "$MOVEL/../ferramentas/publicar-github.sh"
fi
