# Instala ou remove o Financ.co neste PC. É chamado pelo Instalar.bat e pelo Desinstalar.bat.
#   python instalador.py instalar
#   python instalador.py desinstalar
# Onde fica: %LOCALAPPDATA%\Financ.co  (app\ = programa, app\dados\ = seus lançamentos, venv\ = Python do app)
import os
import shutil
import subprocess
import sys

NOME = "Financ.co"
AQUI = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.environ.get("FINANCO_DESTINO") or os.path.join(os.environ["LOCALAPPDATA"], NOME)
TESTE = bool(os.environ.get("FINANCO_TESTE"))  # só para testar: não cria atalho nem registro no Windows
APP = os.path.join(DESTINO, "app")
DADOS = os.path.join(APP, "dados")
VENV = os.path.join(DESTINO, "venv")
PYW = os.path.join(VENV, "Scripts", "pythonw.exe")
PY = os.path.join(VENV, "Scripts", "python.exe")
CHAVE = r"Software\Microsoft\Windows\CurrentVersion\Uninstall" + "\\" + NOME

# Roda dentro do Python do app (que tem o pywin32) para criar ou apagar os atalhos.
ATALHOS = r'''
import os, sys
from win32com.client import Dispatch
sh = Dispatch("WScript.Shell")
acao, pyw, app = sys.argv[1], sys.argv[2], sys.argv[3]
for pasta in ("Desktop", "Programs"):
    lnk = os.path.join(sh.SpecialFolders(pasta), "Financ.co.lnk")
    if acao == "criar":
        a = sh.CreateShortcut(lnk)
        a.TargetPath, a.Arguments, a.WorkingDirectory = pyw, '"' + os.path.join(app, "app.py") + '"', app
        a.IconLocation, a.Description = os.path.join(app, "web", "icone.ico") + ",0", "Financ.co"
        a.Save()
    elif os.path.exists(lnk):
        os.remove(lnk)
'''


def passo(texto):
    print("  " + texto, flush=True)


def instalar():
    origem = os.path.join(AQUI, "app")
    if not os.path.isfile(os.path.join(origem, "app.py")):
        sys.exit("Não achei a pasta app ao lado do instalador. Extraia o zip inteiro antes de instalar.")
    if sys.version_info < (3, 10):
        sys.exit("O Financ.co precisa do Python 3.10 ou mais novo.")
    atualizando = os.path.isdir(APP)
    print(("Atualizando" if atualizando else "Instalando") + f" o {NOME} em {DESTINO}")

    passo("Copiando o programa (seus lançamentos não são tocados)")
    os.makedirs(APP, exist_ok=True)
    for item in os.listdir(origem):
        de, para = os.path.join(origem, item), os.path.join(APP, item)
        if item in ("dados", "__pycache__"):
            continue
        if os.path.isdir(para):
            shutil.rmtree(para)
        shutil.copytree(de, para) if os.path.isdir(de) else shutil.copy2(de, para)
    for item in ("instalador.py", "Desinstalar.bat"):  # para dar para desinstalar sem a pasta original
        if os.path.abspath(AQUI) != os.path.abspath(DESTINO):
            shutil.copy2(os.path.join(AQUI, item), os.path.join(DESTINO, item))

    # Para levar os lançamentos de outro PC: pôr o dados.json numa pasta "dados" ao lado do Instalar.bat.
    trazidos = os.path.join(AQUI, "dados", "dados.json")
    if os.path.isfile(trazidos) and not os.path.isfile(os.path.join(DADOS, "dados.json")):
        passo("Trazendo os lançamentos da pasta dados")
        os.makedirs(DADOS, exist_ok=True)
        shutil.copy2(trazidos, os.path.join(DADOS, "dados.json"))

    if not os.path.isfile(PY):
        passo("Criando o Python próprio do app")
        subprocess.run([sys.executable, "-m", "venv", VENV], check=True)
    passo("Baixando o que o app usa (pywebview e pywin32); pode levar um minuto")
    subprocess.run([PY, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--upgrade", "pywebview", "pywin32"], check=True)

    if not TESTE:
        passo("Criando os atalhos (área de trabalho e menu Iniciar)")
        subprocess.run([PY, "-c", ATALHOS, "criar", PYW, APP], check=True)
        registrar()
    print(f"\nPronto. Abra pelo atalho {NOME} da área de trabalho.")


def registrar():
    """Faz o app aparecer em Configurações > Aplicativos instalados, com o botão Desinstalar."""
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, CHAVE) as k:
        valores = {
            "DisplayName": NOME,
            "DisplayIcon": os.path.join(APP, "web", "icone.ico"),
            "InstallLocation": DESTINO,
            "Publisher": "Gusthavo Silva",
            "UninstallString": f'cmd /c ""{os.path.join(DESTINO, "Desinstalar.bat")}""',
        }
        for nome, valor in valores.items():
            winreg.SetValueEx(k, nome, 0, winreg.REG_SZ, valor)
        winreg.SetValueEx(k, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(k, "NoRepair", 0, winreg.REG_DWORD, 1)


def desinstalar():
    if not os.path.isdir(DESTINO):
        sys.exit(f"O {NOME} não está instalado neste PC.")
    print(f"Removendo o {NOME} de {DESTINO}")
    tem_dados = os.path.isfile(os.path.join(DADOS, "dados.json"))
    apagar_dados = False
    if tem_dados:
        resposta = os.environ.get("FINANCO_APAGAR_DADOS") or input("  Apagar também os seus lançamentos? Digite S para apagar ou Enter para guardar: ")
        apagar_dados = resposta.strip().lower() in ("s", "sim")

    if not TESTE:
        if os.path.isfile(PY):
            subprocess.run([PY, "-c", ATALHOS, "apagar", PYW, APP])
        try:
            import winreg
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, CHAVE)
        except OSError:
            pass

    try:
        shutil.rmtree(VENV, ignore_errors=False)
    except FileNotFoundError:
        pass
    except OSError:
        sys.exit("Não consegui remover: feche o Financ.co e tente de novo.")
    if os.path.isdir(APP):
        for item in os.listdir(APP):
            if item == "dados" and not apagar_dados:
                continue
            caminho = os.path.join(APP, item)
            shutil.rmtree(caminho, ignore_errors=True) if os.path.isdir(caminho) else os.remove(caminho)

    if tem_dados and not apagar_dados:
        print(f"\nPronto. Seus lançamentos ficaram guardados em {DADOS}")
    else:
        # a pasta some logo depois que esta janela fechar (o .bat ainda está aberto dentro dela)
        subprocess.Popen(f'cmd /c ping -n 3 127.0.0.1 >nul & rmdir /s /q "{DESTINO}"', shell=True, cwd=os.environ.get("TEMP", "C:\\"),
                         creationflags=0x00000008 | 0x08000000)  # DETACHED_PROCESS | CREATE_NO_WINDOW
        print("\nPronto. Tudo removido.")


if __name__ == "__main__":
    acao = sys.argv[1] if len(sys.argv) > 1 else ""
    if acao == "instalar":
        instalar()
    elif acao == "desinstalar":
        desinstalar()
    else:
        sys.exit("Use: python instalador.py instalar  ou  python instalador.py desinstalar")
