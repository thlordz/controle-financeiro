"""
Gera os ícones do aplicativo Android a partir do mesmo desenho do
ícone do desktop (gerar_icone.py), para os dois não divergirem.

São três coisas diferentes:
  * ic_launcher       — o ícone quadrado clássico, para Android antigo;
  * ic_launcher_round — a versão recortada em círculo;
  * ic_launcher_foreground — só a planta e a seta, sem fundo, para o
    ícone adaptativo: o sistema recorta o formato que quiser, então o
    desenho tem de caber na área segura do meio.
"""
from PIL import Image, ImageDraw
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_icone import desenhar, FUNDO

# Densidades do Android: o lançador pede 48dp e o ícone adaptativo 108dp.
DENSIDADES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def recorte_circular(img):
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).ellipse([0, 0, img.width - 1, img.height - 1], fill=255)
    saida = Image.new('RGBA', img.size, (0, 0, 0, 0))
    saida.paste(img, (0, 0), mascara)
    return saida


def primeiro_plano(conteudo, lado):
    """
    O desenho centrado dentro da área segura do ícone adaptativo: de
    108dp de tela, só os 66dp do meio aparecem em todos os formatos.
    """
    recorte = conteudo.crop(conteudo.getbbox())
    alvo = int(lado * 0.60)
    escala = alvo / max(recorte.size)
    novo = recorte.resize((max(1, int(recorte.width * escala)),
                           max(1, int(recorte.height * escala))), Image.LANCZOS)
    tela = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    tela.alpha_composite(novo, ((lado - novo.width) // 2, (lado - novo.height) // 2))
    return tela


def gerar(res):
    quadrado = desenhar()
    conteudo = desenhar(fundo=False, margem=0.16)

    for nome, fator in DENSIDADES.items():
        pasta = os.path.join(res, f'mipmap-{nome}')
        os.makedirs(pasta, exist_ok=True)
        lado = int(48 * fator)
        quadrado.resize((lado, lado), Image.LANCZOS).save(os.path.join(pasta, 'ic_launcher.png'))
        recorte_circular(quadrado.resize((lado, lado), Image.LANCZOS)).save(
            os.path.join(pasta, 'ic_launcher_round.png'))
        primeiro_plano(conteudo, int(108 * fator)).save(
            os.path.join(pasta, 'ic_launcher_foreground.png'))

    # Cor de fundo do ícone adaptativo, igual à do quadrado.
    cor = '#%02X%02X%02X' % FUNDO[:3]
    with open(os.path.join(res, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                f'    <color name="ic_launcher_background">{cor}</color>\n</resources>\n')

    # Tela de abertura: o ícone no meio de um fundo da mesma cor.
    for pasta in sorted(os.listdir(res)):
        if not pasta.startswith('drawable'):
            continue
        destino = os.path.join(res, pasta, 'splash.png')
        if not os.path.exists(destino):
            continue
        largura, altura = Image.open(destino).size
        splash = Image.new('RGBA', (largura, altura), FUNDO)
        lado = int(min(largura, altura) * 0.34)
        splash.alpha_composite(quadrado.resize((lado, lado), Image.LANCZOS),
                               ((largura - lado) // 2, (altura - lado) // 2))
        splash.convert('RGB').save(destino)

    print('ícones do Android gerados em', res)


if __name__ == '__main__':
    gerar(sys.argv[1])
