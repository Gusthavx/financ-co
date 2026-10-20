# Atualiza o pacote de instalação em ~/projetos/Financ.co a partir desta pasta e refaz o zip.
# Rodar depois de qualquer mudança no app: python empacotar.py
# O pacote nunca leva a pasta dados (lançamentos pessoais).
import os
import shutil
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
PACOTE = os.path.join(os.path.dirname(AQUI), "Financ.co")
ZIP = os.path.join(PACOTE, "Financ.co.zip")
FORA = {"dados", "__pycache__", "Financ.co.zip"}

if __name__ == "__main__":
    app = os.path.join(PACOTE, "app")
    shutil.rmtree(app, ignore_errors=True)
    os.makedirs(app)
    shutil.copy2(os.path.join(AQUI, "app.py"), app)
    shutil.copytree(os.path.join(AQUI, "web"), os.path.join(app, "web"))
    for a in os.listdir(os.path.join(AQUI, "instalador")):  # Instalar.bat, Desinstalar.bat, instalador.py, LEIA-ME.txt
        shutil.copy2(os.path.join(AQUI, "instalador", a), PACOTE)

    if os.path.exists(ZIP):
        os.remove(ZIP)
    n = 0
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for raiz, pastas, arquivos in os.walk(PACOTE):
            pastas[:] = [p for p in pastas if p not in FORA]
            for a in arquivos:
                if a in FORA:
                    continue
                caminho = os.path.join(raiz, a)
                z.write(caminho, os.path.join("Financ.co", os.path.relpath(caminho, PACOTE)))  # extrai numa pasta Financ.co
                n += 1
    print(f"pacote atualizado: {n} arquivos, zip com {os.path.getsize(ZIP) // 1024} KB em {ZIP}")
