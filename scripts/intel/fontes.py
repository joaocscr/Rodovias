"""Download com novas tentativas e manifesto de fontes.

Cada domínio grava data/manifest/<dominio>.json: uma entrada por arquivo baixado, com URL, data de acesso,
tamanho e sha256. O manifesto consolidado (data/intel/manifest.json, também copiado para o Drive) é a união.
"""
import datetime as dt
import hashlib
import json
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
MANIFEST_DIR = ROOT / "data" / "manifest"
UA = "Mozilla/5.0 (X11; Linux x86_64) rodovias-intel"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url, dest, tries=5, timeout=600, extra=(), force=False):
    """Baixa `url` para `dest` com curl (proxy e CA do ambiente), backoff 2/4/8/16 s. Pula se já existe."""
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    last = None
    for k in range(tries):
        r = subprocess.run(["curl", "-sSL", "--fail", "-A", UA, "-m", str(timeout), "-o", str(tmp), *extra, url],
                           capture_output=True, text=True)
        if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
            tmp.replace(dest)
            return dest
        last = r.stderr.strip()
        time.sleep(2 ** (k + 1))
    raise RuntimeError(f"falha ao baixar {url}: {last}")


class Manifest:
    def __init__(self, dominio):
        self.dominio = dominio
        self.path = MANIFEST_DIR / f"{dominio}.json"
        self.items = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else []

    def add(self, url, path, descricao, periodo="", licenca=""):
        path = Path(path)
        item = {"dominio": self.dominio, "descricao": descricao, "url": url, "arquivo": str(path.relative_to(ROOT)),
                "bytes": path.stat().st_size, "sha256": sha256(path), "periodo": periodo, "licenca": licenca,
                "acesso": dt.date.today().isoformat()}
        self.items = [i for i in self.items if i["arquivo"] != item["arquivo"]] + [item]
        return item

    def save(self):
        MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.items, ensure_ascii=False, indent=1), encoding="utf-8")
