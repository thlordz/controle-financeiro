#!/usr/bin/env bash
# ==================================================================
# Manda os pacotes prontos para as Releases do GitHub.
#
# É daqui que os aplicativos instalados descobrem que existe versão
# nova: cada release leva um `atualizacao.json` dizendo quais arquivos
# a compõem, o tamanho e a soma de verificação de cada um. O aplicativo
# compara com o que ele já tem e baixa só o que mudou.
#
# Chamado pelo publicar.sh (Linux/Windows) e pelo gerar-apk.sh
# (Android). Pode rodar sozinho também: os arquivos que não existirem
# são simplesmente pulados, então dá para publicar o APK hoje e o
# resto amanhã, na mesma release.
#
# O token de escrita NÃO mora no projeto. Ele vem da variável
# TOKEN_PUBLICACAO ou de ~/.config/controle-financeiro-tokens/publicacao.txt
# ==================================================================
set -euo pipefail

REPO="thlordz/controle-financeiro"
PJ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PJ"

# ------------------------------------------------------------------
# Token
# ------------------------------------------------------------------
ARQ_TOKEN="$HOME/.config/controle-financeiro-tokens/publicacao.txt"
TOKEN="${TOKEN_PUBLICACAO:-}"
if [ -z "$TOKEN" ] && [ -f "$ARQ_TOKEN" ]; then
  TOKEN="$(tr -d '[:space:]' < "$ARQ_TOKEN")"
fi
if [ -z "$TOKEN" ]; then
  echo "Falta o token de escrita do GitHub."
  echo "Guarde-o com:"
  echo "  read -rsp 'Token: ' T && printf '%s\\n' \"\$T\" > $ARQ_TOKEN && chmod 600 $ARQ_TOKEN && unset T"
  echo "Ou rode assim, só desta vez:  TOKEN_PUBLICACAO=... $0"
  exit 1
fi

api() {
  # api <método> <caminho> [corpo]
  local metodo="$1" caminho="$2" corpo="${3:-}"
  if [ -n "$corpo" ]; then
    curl -sS -X "$metodo" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      --data "$corpo" "https://api.github.com$caminho"
  else
    curl -sS -X "$metodo" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com$caminho"
  fi
}

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))"; }

# ------------------------------------------------------------------
# Versão e pacotes
#
# A versão é a mesma que o app mostra na tela. Cada linha abaixo é
# "plataforma|caminho do arquivo|nome que ele terá na release".
# O nome na release não tem espaços porque o GitHub os troca por ponto.
# ------------------------------------------------------------------
VERSAO="$(sed -n "s/^export const VERSAO = '\([^']*\)'.*/\1/p" app/js/versao.js)"
[ -n "$VERSAO" ] || { echo "Não achei a versão em app/js/versao.js"; exit 1; }
TAG="v$VERSAO"

# O app do Windows é uma pasta com uns sessenta arquivos. Ela viaja
# compactada num arquivo só. As opções do `tar` fazem o resultado sair
# igual byte a byte quando nada mudou — sem elas, a data de cada
# arquivo entraria no pacote e ele pareceria diferente a cada vez,
# obrigando todo mundo a baixar de novo à toa.
PASTA_TMP="$(mktemp -d)"
trap 'rm -rf "$PASTA_TMP"' EXIT
TAR_WINDOWS="$PASTA_TMP/app.tar.gz"
if [ -d "build/win-unpacked/resources/app" ]; then
  tar --sort=name --owner=0 --group=0 --numeric-owner \
      --mtime="@0" -cf - -C "build/win-unpacked/resources" app \
    | gzip -n -9 > "$TAR_WINDOWS"
fi

# O Windows completo, para quem ainda não tem o app.
#
# O `Controle-Financeiro.exe` sozinho não roda: ele é o electron.exe
# puro e precisa da pasta `resources` ao lado. Ele continua na release
# porque é dele que o atualizador se serve, mas quem está instalando
# pela primeira vez precisa do conjunto — e durante vários meses não
# havia conjunto nenhum para baixar.
#
# A pasta `dados` fica de fora por regra: ela é do dono do pendrive e
# nunca entra em pacote.
ZIP_WINDOWS="$PASTA_TMP/Controle-Financeiro-Windows.zip"
if [ -d "build/win-unpacked" ]; then
  python3 - "$ZIP_WINDOWS" <<'FIM'
import os, sys, zipfile
raiz = 'build/win-unpacked'
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for pasta, _, arquivos in os.walk(raiz):
        if '/resources/app/dados' in pasta.replace(os.sep, '/'):
            continue
        for a in sorted(arquivos):
            caminho = os.path.join(pasta, a)
            z.write(caminho, os.path.relpath(caminho, raiz))
FIM
fi

APPIMAGE_ACHADO="$(ls -1t build/*.AppImage 2>/dev/null | head -1)"
DEB_ACHADO="$(ls -1t build/*.deb 2>/dev/null | head -1)"

PACOTES=(
  "linux|${APPIMAGE_ACHADO:-build/nao-existe}|Controle-Financeiro.AppImage"
  "linux|${DEB_ACHADO:-build/nao-existe}|controle-financeiro.deb"
  "windows|$TAR_WINDOWS|app.tar.gz"
  "windows|build/win-unpacked/Controle Financeiro.exe|Controle-Financeiro.exe"
  "nenhuma|${ZIP_WINDOWS:-build/nao-existe}|Controle-Financeiro-Windows.zip"
  "android|movel/Controle Financeiro.apk|Controle-Financeiro.apk"
)

echo "Publicando $TAG em $REPO"

# ------------------------------------------------------------------
# A release: reaproveita se já existir
# ------------------------------------------------------------------
RESP="$(api GET "/repos/$REPO/releases/tags/$TAG")"
ID_RELEASE="$(printf '%s' "$RESP" | json id)"

if [ -z "$ID_RELEASE" ]; then
  CORPO="$(python3 -c "
import json,sys
print(json.dumps({
  'tag_name': sys.argv[1],
  'name': 'Versão ' + sys.argv[2],
  'body': 'Atualização automática do Controle Financeiro.',
  'draft': False,
  'prerelease': False,
}))" "$TAG" "$VERSAO")"
  RESP="$(api POST "/repos/$REPO/releases" "$CORPO")"
  ID_RELEASE="$(printf '%s' "$RESP" | json id)"
  [ -n "$ID_RELEASE" ] || { echo "Não consegui criar a release:"; printf '%s\n' "$RESP" | head -20; exit 1; }
  echo "  release criada"
else
  echo "  release já existia, vou substituir os arquivos"
fi

# ------------------------------------------------------------------
# Envio de cada pacote
#
# O GitHub não substitui um anexo de mesmo nome: recusa com 422. Então
# apagamos o antigo antes de mandar o novo.
# ------------------------------------------------------------------
ANEXOS="$(api GET "/repos/$REPO/releases/$ID_RELEASE/assets")"

apagar_anexo() {
  local nome="$1"
  local id
  id="$(printf '%s' "$ANEXOS" | python3 -c "
import json,sys
nome = sys.argv[1]
for a in json.load(sys.stdin):
    if a['name'] == nome:
        print(a['id']); break
" "$nome")"
  [ -n "$id" ] && api DELETE "/repos/$REPO/releases/assets/$id" >/dev/null || true
}

# ------------------------------------------------------------------
# Anexos que já subiram antes
#
# O executável do Windows tem 181 MB e quase nunca muda — só quando o
# Electron muda. Guardamos aqui a soma de cada arquivo já enviado e o
# número que o GitHub deu a ele. Se a soma for a mesma, o manifesto
# aponta para o anexo antigo em vez de subir tudo de novo. O número do
# anexo vale para o repositório inteiro, não só para a release dele.
# ------------------------------------------------------------------
CONHECIDOS="ferramentas/.github-anexos.json"
[ -f "$CONHECIDOS" ] || echo '{}' > "$CONHECIDOS"

anexo_conhecido() {
  python3 -c "
import json,sys
try:
    print(json.load(open(sys.argv[1])).get(sys.argv[2], ''))
except Exception:
    print('')
" "$CONHECIDOS" "$1"
}

guardar_anexo() {
  python3 -c "
import json,sys
arq, soma, id_anexo = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    d = json.load(open(arq))
except Exception:
    d = {}
d[soma] = id_anexo
json.dump(d, open(arq, 'w'), indent=1)
" "$CONHECIDOS" "$1" "$2"
}

anexo_ainda_existe() {
  local codigo
  codigo="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/releases/assets/$1")"
  [ "$codigo" = "200" ]
}

LINHAS_MANIFESTO=()
ENVIADOS=0

for pacote in "${PACOTES[@]}"; do
  IFS='|' read -r plataforma caminho nome <<< "$pacote"
  if [ ! -f "$caminho" ]; then
    echo "  pulei $nome (não existe em $caminho)"
    continue
  fi

  soma="$(sha256sum "$caminho" | cut -d' ' -f1)"
  tamanho="$(stat -c%s "$caminho")"

  id_antigo="$(anexo_conhecido "$soma")"
  if [ -n "$id_antigo" ] && anexo_ainda_existe "$id_antigo"; then
    echo "  $nome não mudou, reaproveitei o anexo $id_antigo"
    LINHAS_MANIFESTO+=("$plataforma|$nome|$id_antigo|$soma|$tamanho")
    ENVIADOS=$((ENVIADOS + 1))
    continue
  fi

  apagar_anexo "$nome"
  echo -n "  enviando $nome ($(numfmt --to=iec --suffix=B "$tamanho"))... "
  envio="$(curl -sS -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"$caminho" \
    "https://uploads.github.com/repos/$REPO/releases/$ID_RELEASE/assets?name=$nome")"
  id_anexo="$(printf '%s' "$envio" | json id)"
  [ -n "$id_anexo" ] || { echo "falhou"; printf '%s\n' "$envio" | head -10; exit 1; }
  echo "ok"

  guardar_anexo "$soma" "$id_anexo"
  LINHAS_MANIFESTO+=("$plataforma|$nome|$id_anexo|$soma|$tamanho")
  ENVIADOS=$((ENVIADOS + 1))
done

[ "$ENVIADOS" -gt 0 ] || { echo "Nenhum pacote para enviar. Gere os builds antes."; exit 1; }

# ------------------------------------------------------------------
# O manifesto
#
# É o único arquivo que o app baixa toda vez (menos de 1 KB). Ele traz
# o número do anexo de cada pacote, porque em repositório privado não
# dá para baixar por endereço simples: é preciso pedir o anexo pelo
# número, com o token.
# ------------------------------------------------------------------
MANIFESTO="$(python3 -c "
import json, sys
versao, linhas = sys.argv[1], sys.argv[2:]
plataformas = {}
for linha in linhas:
    plataforma, nome, id_anexo, soma, tamanho = linha.split('|')
    # 'nenhuma' é o anexo que existe só para gente baixar na mão — o
    # zip do Windows. Ele não entra no manifesto porque nenhum app
    # deve puxar 115 MB para se atualizar: para isso há o app.tar.gz.
    if plataforma == 'nenhuma':
        continue
    plataformas.setdefault(plataforma, []).append({
        'nome': nome, 'anexo': int(id_anexo), 'soma': soma, 'tamanho': int(tamanho),
    })
print(json.dumps({'versao': versao, 'plataformas': plataformas}, ensure_ascii=False, indent=1))
" "$VERSAO" "${LINHAS_MANIFESTO[@]}")"

ARQ_MANIFESTO="$(mktemp)"
printf '%s\n' "$MANIFESTO" > "$ARQ_MANIFESTO"
apagar_anexo "atualizacao.json"
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @"$ARQ_MANIFESTO" \
  "https://uploads.github.com/repos/$REPO/releases/$ID_RELEASE/assets?name=atualizacao.json" >/dev/null
rm -f "$ARQ_MANIFESTO"

echo
echo "Pronto. A versão $VERSAO está publicada:"
printf '%s\n' "$MANIFESTO" | sed 's/^/  /'
