"""Gera os arquivos sintéticos de tests/fixtures/idex/ no formato dos arquivos do IDEX-Infra: a planilha de dados (aba
"Detalhado", 2 dias × 3 papéis) e um relatório mensal em PDF (página "Histórico de performance"). Papéis, pesos e
retornos são inventados.

Uso: python tests/fixtures/idex/gerar.py
"""
from pathlib import Path

import datetime as dt
import openpyxl
import pymupdf

AQUI = Path(__file__).resolve().parent

CABECALHO = ["Data", "Debênture", "Peso no índice (%)", "MTM ponderado (%)", "Variação ponderada (%)",
             "Carrego ponderado (%)", "Duration", "MID spread (Bps/NTNB)", "Segmento", "Callable", "Emissor",
             "Número Índice", "Preço Unitário"]
# data, ticker, peso (fração: soma 1 por dia), duration, spread em bps
DIAS = [
    (dt.datetime(2026, 9, 22), [("TSTR11", 0.5, 4.0, 100.0), ("FERX11", 0.3, 8.0, 150.0), ("ENRG11", 0.2, 6.0, 50.0)]),
    (dt.datetime(2026, 9, 23), [("TSTR11", 0.4, 4.1, 110.0), ("FERX11", 0.4, 8.1, 140.0), ("ENRG11", 0.2, 6.1, 60.0)]),
]

# ano → {nome: [meses de jan até o último com dado]}; o acumulado impresso vem do produto dos meses
RETORNOS = {
    2026: {"Idex-Infra Geral": [1.50, -0.40, 0.30], "Idex-Infra Core": [1.40, -0.50, 0.20]},
    2025: {"Idex-Infra Geral": [1.10, 0.50, -0.30, 0.80, 1.20, 0.40, -0.20, 0.90, 0.60, -0.10, 0.70, 0.30],
           "Idex-Infra Core": [1.00, 0.60, -0.20, 0.70, 1.10, 0.50, -0.10, 0.80, 0.50, -0.20, 0.60, 0.20]},
}
MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def acumulado(meses):
    p = 1.0
    for m in meses:
        p *= 1 + m / 100
    return round((p - 1) * 100, 2)


def pct(v):
    return f"{v:.2f}".replace(".", ",") + " %"


def planilha(destino):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Detalhado"
    ws.append(CABECALHO)
    for dia, papeis in DIAS:
        for ticker, peso, duration, spread in papeis:
            ws.append([dia, ticker, peso, peso * 0.01, peso * 0.02, peso * 0.01, duration, spread, "Teste", False,
                       "Emissor Teste", 1.0, 1000.0])
    wb.save(destino)


def relatorio(destino):
    doc = pymupdf.open()
    capa = doc.new_page(width=842, height=595)
    capa.insert_text((60, 100), "IDEX | Infra", fontsize=24)
    capa.insert_text((60, 140), "Julho 2026", fontsize=14)
    pg = doc.new_page(width=842, height=595)
    pg.insert_text((40, 40), "IDEX | Infra - RELATÓRIO MENSAL | Julho 2026", fontsize=10)
    pg.insert_text((40, 70), "Histórico de performance", fontsize=14)
    y = 100
    for i, c in enumerate(["Ano", *MESES, "Acum. Ano"]):
        pg.insert_text((40 + 55 * i, y), c, fontsize=8)
    for ano, linhas in RETORNOS.items():
        y += 20
        pg.insert_text((40, y), str(ano), fontsize=8)
        for nome, meses in linhas.items():
            y += 20
            pg.insert_text((40, y), nome, fontsize=8)
            for i, v in enumerate(meses):
                pg.insert_text((150 + 45 * i, y), pct(v), fontsize=8)
            pg.insert_text((150 + 45 * 12, y), pct(acumulado(meses)), fontsize=8)
    pg.insert_text((40, 560), "FONTE: IDEX Analytics (dados de teste)", fontsize=8)
    doc.save(destino)


if __name__ == "__main__":
    planilha(AQUI / "idex_teste_datafile.xlsx")
    relatorio(AQUI / "relatorio_teste.pdf")
