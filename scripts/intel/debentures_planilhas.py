"""Leitor das planilhas de debêntures das corretoras (data/raw/debentures/*.xlsx, fora do git).

É a única parte do domínio que conhece o formato das planilhas. Para ler da API interna, escreva um módulo irmão com
as mesmas funções e o mesmo contrato de saída e passe as funções dele a `debentures.montar` (`ler_telas=`,
`ler_negocios=`; a lista de entradas vem de `planilhas`).

Cada aba é reconhecida pelo cabeçalho, não pelo nome do arquivo nem da aba: tela BTG (com "Setor"), tela XP (com
"Índice" e "Rating"), negócios fechados BTG (com "transact_time") e intenções de compra e venda XP (com "Direção" e
"Taxa Bruta").

Contrato (o que o resto do domínio recebe)
- `planilhas(pasta)` → [Path] das entradas (.xlsx, sem os temporários "~$…" do Excel).
- `ler_telas(path)` → [{
      origem: "BTG" | "XP", ticker: str, emissor: str (grafia da fonte), setor: str | None (só a tela BTG),
      indexador: "IPCA+" | "PRÉ" | "DI+" | "% DI" | outro texto, taxa_emissao: float | None (% a.a.; no DI+, a sobretaxa),
      vencimento: "AAAA-MM-DD" | None, volume_emitido: float | None (R$), incentivada: bool | None,
      rating: str | None, data: "AAAA-MM-DD" | None (data da tela, quando a fonte traz)}]
- `ler_negocios(path)` → {"negocios": [{
      ticker, emissor, indexador, vencimento (como acima), taxa: float | None (% a.a.), volume: float | None (R$),
      data: "AAAA-MM-DD" | None (horário de Brasília), hora: "HH:MM" | None}],
  "intencoes": [o mesmo + direcao: "compra" | "venda" | None]}
  Negócios e intenções vêm sempre em listas separadas. Linha com horário ilegível vem com data None: o domínio a deixa
  fora dos totais e a conta no relatório de curadoria.
"""
import datetime as dt
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel.debentures_texto import normalizar, numero, para_data, taxa_pct  # noqa: E402

BRASILIA = dt.timedelta(hours=-3)  # sem horário de verão desde 2019


def planilhas(pasta):
    """Planilhas .xlsx da pasta de entrada (sem os temporários do Excel, "~$…")."""
    return sorted(p for p in Path(pasta).glob("*.xlsx") if not p.name.startswith("~$"))


def _abas(path):
    """[(cabeçalho, [dict por linha])] de cada aba do arquivo, lido só para leitura."""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        out = []
        for ws in wb.worksheets:
            linhas = ws.iter_rows(values_only=True)
            cab = next(linhas, None)
            if not cab:
                continue
            cab = [str(c).strip() if c is not None else None for c in cab]
            dados = [dict(zip(cab, r)) for r in linhas if any(v not in (None, "") for v in r)]
            out.append((set(c for c in cab if c), dados))
        return out
    finally:
        wb.close()


def _indexador(v):
    s = str(v or "").strip()
    if "%" in s:
        return "% DI"
    k = normalizar(s)
    if k.startswith("IPCA"):
        return "IPCA+"
    if k in ("PRE", "PREFIXADO"):
        return "PRÉ"
    if k == "DI":
        return "DI+"
    return s or None


def _sim(v):
    k = normalizar(v)
    return True if k in ("S", "SIM") else False if k in ("N", "NAO") else None


def _texto(v):
    s = str(v).strip() if v is not None else ""
    return s or None


def _hora_btg(v):
    """'2026-10-20T21:06:40.169Z' (UTC) → ('2026-10-20', '18:06') em Brasília; ilegível → (None, None)."""
    if isinstance(v, dt.datetime):
        t = v + BRASILIA
        return t.date().isoformat(), t.strftime("%H:%M")
    try:
        t = dt.datetime.strptime(str(v or "")[:19], "%Y-%m-%dT%H:%M:%S") + BRASILIA
    except ValueError:
        return None, None
    return t.date().isoformat(), t.strftime("%H:%M")


def _hora_xp(v):
    """'01/10/2026 17:25:32.000' (Brasília) → ('2026-10-01', '17:25'); ilegível → (None, None)."""
    if isinstance(v, dt.datetime):
        return v.date().isoformat(), v.strftime("%H:%M")
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2})", str(v or ""))
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}", f"{m.group(4)}:{m.group(5)}"
    return None, None


def ler_telas(path):
    """Linhas das telas de debêntures (abas BTG e XP) do arquivo; abas de outro tipo são ignoradas."""
    out = []
    for cab, linhas in _abas(path):
        if {"Ticker", "Emissor", "Setor", "Indexador", "Taxa Emissão", "Vencimento"} <= cab:
            for r in linhas:
                out.append({"origem": "BTG", "ticker": _texto(r["Ticker"]), "emissor": _texto(r["Emissor"]),
                            "setor": _texto(r["Setor"]), "indexador": _indexador(r["Indexador"]),
                            "taxa_emissao": taxa_pct(r["Taxa Emissão"]), "vencimento": para_data(r["Vencimento"]),
                            "volume_emitido": numero(r.get("Volume Emitido")), "incentivada": _sim(r.get("Incentivado")),
                            "rating": None, "data": para_data(str(r.get("Última Atualização Book") or "")[:10])})
        elif {"Ticker", "Emissor", "Índice", "Taxa Emissão", "Vencimento", "Rating"} <= cab:
            for r in linhas:
                taxa = taxa_pct(r["Taxa Emissão"])  # a tela XP traz a taxa em fração (0,0645 = 6,45% a.a.)
                out.append({"origem": "XP", "ticker": _texto(r["Ticker"]), "emissor": _texto(r["Emissor"]),
                            "setor": None, "indexador": _indexador(r["Índice"]),
                            "taxa_emissao": None if taxa is None else round(taxa * 100, 6),
                            "vencimento": para_data(r["Vencimento"]), "volume_emitido": None,
                            "incentivada": _sim(r.get("Isento")), "rating": _texto(r.get("Rating")),
                            "data": para_data(r.get("Atualização"))})  # só quando a coluna traz a data, não só a hora
    return out


def ler_negocios(path):
    """Negócios fechados (aba BTG) e intenções de compra e venda (aba XP) do arquivo, sempre em listas separadas."""
    out = {"negocios": [], "intencoes": []}
    for cab, linhas in _abas(path):
        if {"symbol", "issuer", "linked_index", "rate", "vol", "transact_time"} <= cab:
            for r in linhas:
                data, hora = _hora_btg(r["transact_time"])
                out["negocios"].append({"ticker": _texto(r["symbol"]), "emissor": _texto(r["issuer"]),
                                        "indexador": _indexador(r["linked_index"]),
                                        "vencimento": para_data(r.get("maturity_date")), "taxa": taxa_pct(r["rate"]),
                                        "volume": numero(r["vol"]), "data": data, "hora": hora})
        elif {"Solicitado em", "Ativo", "Emissor/Risco", "Direção", "Taxa Bruta", "Financeiro"} <= cab:
            for r in linhas:
                data, hora = _hora_xp(r["Solicitado em"])
                direcao = {"COMPRA": "compra", "VENDA": "venda"}.get(normalizar(r["Direção"]))
                out["intencoes"].append({"ticker": _texto(r["Ativo"]), "emissor": _texto(r["Emissor/Risco"]),
                                         "indexador": _indexador(r.get("Indexador")),
                                         "vencimento": para_data(r.get("Vencimento")), "taxa": taxa_pct(r["Taxa Bruta"]),
                                         "volume": numero(r["Financeiro"]), "data": data, "hora": hora,
                                         "direcao": direcao})
    return out
