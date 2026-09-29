"""
Gera o ícone do Controle Financeiro.

O desenho é o mais simples possível de propósito: um cifrão preto num
quadrado amarelo. Ícone de app é visto a 48 pixels na maior parte do
tempo, e naquele tamanho qualquer detalhe vira sujeira — a planta e a
seta do desenho anterior sumiam.

O cifrão vem da Fraunces, a mesma fonte dos números do app e da tela
de abertura. O arquivo da fonte fica aqui do lado, para o ícone não
depender do que estiver instalado na máquina.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

S = 4                      # supersampling: desenha grande e reduz
L = 1024                   # lado final

AMARELO = (245, 197, 24, 255)
PRETO   = (17, 17, 17, 255)

# O gerador dos ícones do Android pede esta cor pelo nome, para pintar
# o fundo do ícone adaptativo com a mesma do quadrado.
FUNDO = AMARELO

# A mesma Fraunces que o app carrega na tela. Fica junto do gerador
# para o ícone não depender do que estiver instalado na máquina.
FONTE = Path(__file__).with_name('Fraunces-Bold.ttf')


def desenhar(lado=L, fundo=True, margem=0.0):
    """
    O ícone. `margem` deixa o desenho menor dentro da tela, que é o
    que o ícone adaptativo do Android pede: o sistema recorta o
    formato e só a área do meio é garantida.

    O cifrão é o glifo da Fraunces, a mesma fonte que o app usa nos
    números e na tela de abertura. Desenhá-lo à mão dava um cifrão
    parecido mas não igual, e o ícone na gaveta de apps ficava de uma
    família e a abertura de outra.
    """
    img = Image.new('RGBA', (lado * S, lado * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    T = lado * S

    if fundo:
        d.rounded_rectangle([0, 0, T - 1, T - 1], radius=int(T * 0.22), fill=AMARELO)

    # O tamanho é achado por medida, não por chute: o glifo tem que
    # ocupar a altura pedida seja qual for a fonte.
    altura_alvo = T * 0.60 * (1 - margem * 2)
    tamanho = int(altura_alvo)
    for _ in range(12):
        fonte = ImageFont.truetype(str(FONTE), tamanho)
        caixa = d.textbbox((0, 0), '$', font=fonte)
        alto = caixa[3] - caixa[1]
        if alto <= 0:
            break
        ajuste = altura_alvo / alto
        if 0.99 < ajuste < 1.01:
            break
        tamanho = max(8, int(tamanho * ajuste))

    fonte = ImageFont.truetype(str(FONTE), tamanho)
    caixa = d.textbbox((0, 0), '$', font=fonte)
    largura = caixa[2] - caixa[0]
    alto = caixa[3] - caixa[1]
    d.text((T / 2 - largura / 2 - caixa[0], T / 2 - alto / 2 - caixa[1]),
           '$', font=fonte, fill=PRETO)

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
