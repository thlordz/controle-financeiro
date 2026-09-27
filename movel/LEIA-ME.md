# Versão Android

O aplicativo do celular é **o mesmo app web de `../app`**, embrulhado
pelo [Capacitor](https://capacitorjs.com) num WebView. Não há código
duplicado: mexer em `../app` e rodar `./gerar-apk.sh` atualiza os dois.

## Dados

No celular **não existe pendrive nem arquivo compartilhado**. O app cai
no modo `local` do `armazenamento.js`: os lançamentos ficam no
armazenamento do próprio aplicativo, separados do desktop. Os dois não
se falam.

Para levar dados de um lado para o outro, use **exportar / importar**
no botão de engrenagem. É também o backup: desinstalar o app apaga
tudo.

## Gerar o APK

```bash
./gerar-apk.sh
```

Ele sincroniza o app web, compila, assina e copia para `Android/` no
pendrive. Precisa das ferramentas instaladas em `~/.local/lib`:
`jdk17` e `android-sdk`.

## A chave de assinatura

Fica em `chave/controle-financeiro.jks` (senha `controlefinanceiro`,
ou a variável `SENHA_CHAVE`). **Guarde esse arquivo.** O Android só
instala uma atualização por cima de um app existente se ela estiver
assinada com a mesma chave; perdendo a chave, só desinstalando e
reinstalando do zero — o que apaga os dados.

## Ícone

Gerado a partir do mesmo desenho do ícone do desktop:

```bash
python3 ../build-assets/gerar_icones_android.py android/app/src/main/res
```
