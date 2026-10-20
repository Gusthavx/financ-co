# Financ.co (pessoal): janela de mesa com pywebview. Abrir com pythonw app.py.
# Os dados ficam só neste PC, em dados/dados.json, com uma cópia por dia em dados/copias.
import glob
import os
import shutil
import sys
import time

import webview

BASE = os.path.dirname(os.path.abspath(__file__))
ARQUIVO = os.path.join(BASE, "dados", "dados.json")
COPIAS = os.path.join(BASE, "dados", "copias")
ICONE = os.path.join(BASE, "web", "icone.ico")
MANTER_COPIAS = 30
TITULO = "Financ.co"
AUMID = "gusthavo.app.financeiro"


def _pintar_barra(tema):
    """Deixa a barra da janela (minimizar, quadrado e X) na cor da tela: preta ou branca, sem título por cima.
    Continua sendo a barra do Windows, então redimensionar, encaixar na lateral e maximizar seguem iguais."""
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, TITULO)
        if not hwnd:
            return False
        claro = tema == "claro"
        por = lambda atributo, valor: ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, atributo, ctypes.byref(ctypes.c_int(valor)), 4)
        fundo = 0x00FFFFFF if claro else 0x00000000  # 0x00BBGGRR
        por(20, 0 if claro else 1)  # botões claros ou escuros
        por(35, fundo)  # cor da barra
        por(36, fundo)  # título na mesma cor do fundo: some da barra, continua na barra de tarefas
        por(34, 0x00EBEBEB if claro else 0x001E1E1E)  # contorno da janela
        return True
    except Exception:
        return False


def _tema_gravado():
    try:
        import json
        with open(ARQUIVO, encoding="utf-8") as f:
            tema = json.load(f).get("tema")
        if tema in ("claro", "escuro"):
            return tema
    except Exception:
        pass
    try:
        import winreg
        chave = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        return "claro" if winreg.QueryValueEx(chave, "AppsUseLightTheme")[0] else "escuro"
    except Exception:
        return "escuro"


class Api:
    def tema(self, nome):
        return _pintar_barra(nome)

    def carregar(self):
        if not os.path.exists(ARQUIVO):
            return ""
        with open(ARQUIVO, encoding="utf-8") as f:
            return f.read()

    def salvar(self, texto):
        os.makedirs(os.path.dirname(ARQUIVO), exist_ok=True)
        self._copia_do_dia()
        tmp = ARQUIVO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(texto)
        os.replace(tmp, ARQUIVO)
        return True

    def guardar_ilegivel(self):
        """O arquivo não abriu na tela: guarda uma cópia à parte para não se perder."""
        if not os.path.exists(ARQUIVO):
            return ""
        os.makedirs(COPIAS, exist_ok=True)
        destino = os.path.join(COPIAS, time.strftime("ilegivel-%Y-%m-%d-%H%M%S.json"))
        shutil.copy2(ARQUIVO, destino)
        return destino

    def _copia_do_dia(self):
        # Antes da primeira gravação do dia, guarda como o arquivo estava.
        if not os.path.exists(ARQUIVO):
            return
        os.makedirs(COPIAS, exist_ok=True)
        destino = os.path.join(COPIAS, time.strftime("dados-%Y-%m-%d.json"))
        if os.path.exists(destino):
            return
        shutil.copy2(ARQUIVO, destino)
        for velha in sorted(glob.glob(os.path.join(COPIAS, "dados-*.json")))[:-MANTER_COPIAS]:
            os.remove(velha)


def _ja_aberto():
    """Uma janela só: duas abertas gravariam uma por cima da outra."""
    try:
        import ctypes
        k32, u32 = ctypes.WinDLL("kernel32", use_last_error=True), ctypes.windll.user32
        k32.CreateMutexW(None, False, AUMID)  # o Windows solta o mutex quando o processo fecha
        if ctypes.get_last_error() != 183:  # ERROR_ALREADY_EXISTS
            return False
        hwnd = u32.FindWindowW(None, TITULO)
        if hwnd:
            u32.ShowWindow(hwnd, 9)  # SW_RESTORE
            u32.SetForegroundWindow(hwnd)
        return True
    except Exception:
        return False


def _fundo():
    """Cor da janela antes da tela carregar: a tela escolhida no app ou, sem escolha, o tema do Windows."""
    return "#ffffff" if _tema_gravado() == "claro" else "#000000"


def _ao_abrir():
    """Roda quando a janela aparece: pinta a barra e dá identidade própria na barra de tarefas."""
    import ctypes
    for _ in range(50):  # espera a janela existir
        if ctypes.windll.user32.FindWindowW(None, TITULO):
            break
        time.sleep(0.1)
    _pintar_barra(_tema_gravado())
    _separar_na_barra()


def _separar_na_barra():
    """Dá identidade própria à janela na barra de tarefas: sem isso o Windows junta com
    qualquer outro programa que rode pelo pythonw (ex.: Restock Analytics)."""
    try:
        import ctypes
        import pywintypes
        from win32com.propsys import propsys
        u32 = ctypes.windll.user32
        for _ in range(50):  # espera a janela existir
            hwnd = u32.FindWindowW(None, TITULO)
            if hwnd:
                break
            time.sleep(0.1)
        else:
            return
        fmt = "{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}"
        pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
        valores = {
            5: AUMID,  # System.AppUserModel.ID
            2: f'"{pythonw}" "{os.path.abspath(__file__)}"',  # RelaunchCommand
            4: TITULO,  # RelaunchDisplayNameResource
        }
        if os.path.isfile(ICONE):
            valores[3] = ICONE + ",0"  # RelaunchIconResource: o ícone ao fixar na barra de tarefas
        ps = propsys.SHGetPropertyStoreForWindow(hwnd, propsys.IID_IPropertyStore)
        for pid, v in valores.items():  # o ID vai primeiro; se um dos outros falhar, os demais continuam valendo
            try:
                ps.SetValue((pywintypes.IID(fmt), pid), propsys.PROPVARIANTType(v))
            except Exception as e:
                print(f"[barra] propriedade {pid} não gravada:", e, flush=True)
        ps.Commit()
    except Exception as e:
        print("[barra] não consegui gravar as propriedades da janela:", e, flush=True)


if __name__ == "__main__":
    if _ja_aberto():
        sys.exit(0)
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(AUMID)
    except Exception:
        pass
    webview.create_window(
        TITULO,
        os.path.join(BASE, "web", "index.html"),
        js_api=Api(),
        width=1320,
        height=860,
        min_size=(1080, 720),
        background_color=_fundo(),
    )
    webview.start(_ao_abrir, icon=ICONE if os.path.isfile(ICONE) else None)
