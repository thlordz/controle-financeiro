"""
Gera o ícone do Controle Financeiro.

O desenho é o mais simples possível de propósito: um cifrão preto num
quadrado amarelo. Ícone de app é visto a 48 pixels na maior parte do
tempo, e naquele tamanho qualquer detalhe vira sujeira — a planta e a
seta do desenho anterior sumiam.

O cifrão é desenhado à mão com retângulos e arcos em vez de texto,
porque fonte instalada varia de máquina para máquina e o ícone
precisa sair igual em qualquer uma.
"""
from PIL import Image, ImageDraw

S = 4                      # supersampling: desenha grande e reduz
L = 1024                   # lado final

AMARELO = (245, 197, 24, 255)
PRETO   = (17, 17, 17, 255)

# O gerador dos ícones do Android pede esta cor pelo nome, para pintar
# o fundo do ícone adaptativo com a mesma do quadrado.
FUNDO = AMARELO


def desenhar(lado=L, fundo=True, margem=0.0):
    """
    O ícone. `margem` deixa o desenho menor dentro da tela, que é o
    que o ícone adaptativo do Android pede: o sistema recorta o
    formato e só a área do meio é garantida.
    """
    img = Image.new('RGBA', (lado * S, lado * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    T = lado * S

    if fundo:
        raio = int(T * 0.22)
        d.rounded_rectangle([0, 0, T - 1, T - 1], radius=raio, fill=AMARELO)

    # O cifrão, centrado, ocupando a área segura.
    #
    # O S é feito de duas circunferências que se cruzam no meio: da
    # de cima desenhamos três quartos (de baixo, pela esquerda, até a
    # direita); da de baixo, os outros três quartos no sentido
    # contrário (do topo, pela direita, até a esquerda). Os ângulos do
    # PIL começam às 3 horas e crescem no sentido do relógio.
    escala = 1 - margem * 2
    cx, cy = T / 2, T / 2
    r = T * 0.155 * escala          # raio de cada bojo
    traco = r * 0.62
    desvio = r * 0.80               # o quanto cada bojo sai do centro

    def caixa(centro_y):
        return [cx - r, centro_y - r, cx + r, centro_y + r]

    d.arc(caixa(cy - desvio), start=90, end=360, fill=PRETO, width=int(traco))
    d.arc(caixa(cy + desvio), start=270, end=540, fill=PRETO, width=int(traco))

    # O risco vertical que atravessa, marca registrada do cifrão.
    ponta = r * 0.55
    d.rounded_rectangle(
        [cx - traco / 2, cy - desvio - r - ponta,
         cx + traco / 2, cy + desvio + r + ponta],
        radius=traco / 2, fill=PRETO)

    return img.resize((lado, lado), Image.LANCZOS)


TAMANHOS = [16, 24, 32, 48, 64, 128, 256, 512]

if __name__ == '__main__':
    grande = desenhar()
    grande.save('icone.png')
    for t in TAMANHOS:
        desenhar(t if t >= 64 else 256).resize((t, t), Image.LANCZOS).save(f'icone-{t}.png')
    # O .ico do Windows guarda vários tamanhos no mesmo arquivo.
    grande.save('icone.ico', sizes=[(t, t) for t in TAMANHOS if t <= 256])
    print('ícone gerado: quadrado amarelo com cifrão preto')
