"""
Gera o ícone do Controle Financeiro.

Duas variantes do mesmo desenho: a completa, para 64px pra cima, e uma
simplificada para 16-48px, em que os detalhes finos viram borrão. As
duas mantêm a mesma silhueta — vaso, folhas e a seta subindo.
"""
from PIL import Image, ImageDraw
import math, sys

S = 4                      # supersampling
L = 1024                   # lado final do desenho

FUNDO      = (18, 39, 27, 255)
FUNDO_TOPO = (26, 54, 37, 255)
FOLHA_A    = (99, 213, 154, 255)
FOLHA_B    = (73, 189, 130, 255)
CAULE      = (61, 165, 113, 255)
VASO       = (192, 122, 85, 255)
VASO_BORDA = (208, 138, 100, 255)
SETA       = (255, 209, 102, 255)


def tela():
    return Image.new('RGBA', (L * S, L * S), (0, 0, 0, 0))


def elipse(img, cx, cy, rx, ry, giro, cor):
    """Elipse girada, desenhada numa camada própria para sair lisa."""
    camada = Image.new('RGBA', (int(rx * 2 * S) + 8, int(ry * 2 * S) + 8), (0, 0, 0, 0))
    ImageDraw.Draw(camada).ellipse([4, 4, rx * 2 * S + 4, ry * 2 * S + 4], fill=cor)
    camada = camada.rotate(giro, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(camada, (int(cx * S - camada.width / 2), int(cy * S - camada.height / 2)))


def linha(d, pontos, largura, cor):
    d.line([(x * S, y * S) for x, y in pontos], fill=cor, width=int(largura * S), joint='curve')
    r = largura * S / 2
    for x, y in pontos:
        d.ellipse([x * S - r, y * S - r, x * S + r, y * S + r], fill=cor)


def ponta(d, de, para, tamanho, cor):
    """Cabeça da seta, apontando de `de` para `para`."""
    ang = math.atan2(para[1] - de[1], para[0] - de[0])
    pontos = []
    for desvio in (0, 2.4, -2.4):
        a = ang + desvio
        comp = tamanho if desvio == 0 else tamanho * 0.95
        pontos.append(((para[0] + math.cos(a) * comp) * S,
                       (para[1] + math.sin(a) * comp) * S))
    d.polygon(pontos, fill=cor)


def fundo(img):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, L * S, L * S], radius=232 * S, fill=FUNDO)
    # clarão suave no topo, para o quadrado não ficar chapado
    brilho = Image.new('RGBA', (L * S, L * S), (0, 0, 0, 0))
    db = ImageDraw.Draw(brilho)
    for i in range(90):
        a = int(16 * (1 - i / 90))
        db.rounded_rectangle([0, -L * S * 0.55 + i * 6 * S, L * S, L * S * 0.62 - i * 3 * S],
                             radius=232 * S, fill=FUNDO_TOPO[:3] + (a,))
    recorte = Image.new('L', (L * S, L * S), 0)
    ImageDraw.Draw(recorte).rounded_rectangle([0, 0, L * S, L * S], radius=232 * S, fill=255)
    img.alpha_composite(Image.composite(brilho, Image.new('RGBA', brilho.size, (0, 0, 0, 0)), recorte))


def vaso(img, simples):
    d = ImageDraw.Draw(img)
    # corpo: trapézio
    d.polygon([(336 * S, 690 * S), (688 * S, 690 * S), (628 * S, 892 * S), (396 * S, 892 * S)], fill=VASO)
    # borda
    d.rounded_rectangle([312 * S, 626 * S, 712 * S, 706 * S], radius=26 * S, fill=VASO_BORDA)
    if not simples:
        d.polygon([(468 * S, 706 * S), (498 * S, 706 * S), (486 * S, 892 * S), (452 * S, 892 * S)],
                  fill=(176, 108, 74, 255))


def planta(img, simples):
    d = ImageDraw.Draw(img)
    if simples:
        # duas folhas grandes: é o que ainda se lê a 16px
        linha(d, [(512, 640), (512, 470)], 46, CAULE)
        elipse(img, 386, 494, 122, 74, 22, FOLHA_B)
        elipse(img, 640, 470, 128, 76, -22, FOLHA_A)
        return
    linha(d, [(512, 646), (512, 404)], 30, CAULE)
    elipse(img, 372, 520, 116, 62, 20, FOLHA_B)
    elipse(img, 652, 490, 120, 64, -20, FOLHA_A)
    elipse(img, 400, 392, 92, 52, 28, FOLHA_A)
    elipse(img, 512, 344, 84, 50, 0, FOLHA_B)


def seta(img, simples):
    d = ImageDraw.Draw(img)
    if simples:
        pontos = [(576, 386), (676, 288), (784, 246)]
        linha(d, pontos[:-1], 58, SETA)
        linha(d, pontos[1:], 58, SETA)
        ponta(d, pontos[-2], (806, 238), 100, SETA)
        return
    pontos = [(566, 392), (664, 288), (742, 344), (846, 216)]
    for i in range(len(pontos) - 1):
        linha(d, pontos[i:i + 2], 44, SETA)
    ponta(d, pontos[-2], (862, 198), 86, SETA)


def desenhar(simples, com_fundo=True):
    # O desenho vive numa camada própria: assim a variante pequena pode
    # dar um zoom no conteúdo sem comer os cantos arredondados do fundo.
    conteudo = tela()
    seta(conteudo, simples)
    vaso(conteudo, simples)
    planta(conteudo, simples)
    # a planta cresce por trás da borda do vaso
    frente = tela()
    df = ImageDraw.Draw(frente)
    df.polygon([(336 * S, 690 * S), (688 * S, 690 * S), (628 * S, 892 * S), (396 * S, 892 * S)], fill=VASO)
    df.rounded_rectangle([312 * S, 626 * S, 712 * S, 706 * S], radius=26 * S, fill=VASO_BORDA)
    if not simples:
        df.polygon([(468 * S, 706 * S), (498 * S, 706 * S), (486 * S, 892 * S), (452 * S, 892 * S)],
                   fill=(176, 108, 74, 255))
    conteudo.alpha_composite(frente)

    if simples:
        zoom, subir = 1.18, 20
        novo = conteudo.resize((int(L * S * zoom), int(L * S * zoom)), Image.LANCZOS)
        desloc = int((L * S * zoom - L * S) / 2)
        conteudo = novo.crop((desloc, desloc + int(subir * S),
                              desloc + L * S, desloc + int(subir * S) + L * S))

    img = tela()
    if com_fundo:
        fundo(img)
    img.alpha_composite(conteudo)
    return img.resize((L, L), Image.LANCZOS)


# Só gera arquivos quando chamado direto; importado, serve de biblioteca
# de desenho (é o que o gerar_icones_android.py faz).
if __name__ == '__main__':
    destino = sys.argv[1]
    detalhado = desenhar(False)
    simples = desenhar(True)
    detalhado.save(f'{destino}/icone.png')
    simples.save(f'{destino}/icone-simples.png')
    for n in (16, 24, 32, 48, 64, 128, 256, 512):
        base = simples if n <= 48 else detalhado
        base.resize((n, n), Image.LANCZOS).save(f'{destino}/icone-{n}.png')
    print('gerado')
