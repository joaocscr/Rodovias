"""Conversores de texto do domínio de debêntures (nomes, datas, números e taxas), usados pelo leitor das planilhas
(debentures_planilhas.py), pelo domínio (debentures.py, para as séries públicas e a classificação) e por qualquer leitor
que o substitua (API interna)."""
import datetime as dt
import re
import unicodedata


def normalizar(nome):
    """Grafia comparável: sem acento, maiúsculas, só letras e números separados por um espaço, sem o "S.A."/"SA"/
    "LTDA" do fim. Casamento é por igualdade desse texto, nunca por pedaço ("RUMO" não casa "RUMOS")."""
    s = unicodedata.normalize("NFKD", str(nome or "")).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s).strip()
    return re.sub(r"(?:\s+(?:S\s?A|LTDA))+$", "", s).strip()


def para_data(v):
    """dd/mm/aaaa, AAAA-MM-DD ou date/datetime → AAAA-MM-DD; senão None."""
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    s = str(v or "").strip()
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.match(r"\d{4}-\d{2}-\d{2}", s)
    return m.group(0) if m else None


def _limpo(v):
    return re.sub(r"[^\d,.\-]", "", str(v).replace("IPCA", "").replace("DI", ""))


def numero(v):
    """Valor (R$, quantidade): número, ou texto pt-BR ("5.408,11", "1.000", "1.000.000"); vazio → None. Sem vírgula,
    ponto em grupos de três dígitos é separador de milhar ("1.000" = 1000); senão é decimal ("1234.5")."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = _limpo(v)
    if not re.search(r"\d", s):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def taxa_pct(v):
    """Taxa em % (a.a., ou % do CDI): número, ou texto ("7,60%", "IPCA + 6,3170%", "13.7000%", "1.067,00%"); vazio →
    None. Sem vírgula, o ponto é decimal (as telas escrevem "13.7000%")."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = _limpo(v)
    if not re.search(r"\d", s):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None
