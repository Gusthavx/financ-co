# Desenha a logo do Financ.co (um F geométrico com o ponto do ".co") e grava web/icone.ico e web/icone.png.
# Rodar de novo só se quiser mudar o desenho: python fazer_icone.py
import os

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
T = 1024  # desenha grande e reduz, para as bordas ficarem lisas
FUNDO, TINTA = (0, 0, 0, 255), (255, 255, 255, 255)


def desenhar():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    p = lambda v: round(v * T)
    d.rounded_rectangle([0, 0, T - 1, T - 1], radius=p(0.225), fill=FUNDO)
    d.rectangle([p(0.300), p(0.255), p(0.418), p(0.745)], fill=TINTA)  # haste
    d.rectangle([p(0.300), p(0.255), p(0.700), p(0.373)], fill=TINTA)  # barra de cima
    d.rectangle([p(0.300), p(0.452), p(0.615), p(0.562)], fill=TINTA)  # barra do meio
    cx, cy, r = p(0.640), p(0.686), p(0.060)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TINTA)  # o ponto do ".co"
    return img


if __name__ == "__main__":
    img = desenhar()
    web = os.path.join(BASE, "web")
    img.resize((512, 512), Image.LANCZOS).save(os.path.join(web, "icone.png"))
    img.save(os.path.join(web, "icone.ico"), sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
    print("ok")
