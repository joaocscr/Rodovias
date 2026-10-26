"""Gera as planilhas sintéticas de tests/fixtures/debentures/ (telas.xlsx e negocios.xlsx), no formato das planilhas
das corretoras (abas BTG e XP), e os arquivos de taxas indicativas da ANBIMA de publico/anbima_ms/ (msAAMMDD.txt, texto
latin-1 separado por `@`, com 4 NTN-B por dia e uma LTN e uma NTN-F que o leitor deve ignorar). Emissores, papéis e números
são inventados.

Uso: python tests/fixtures/debentures/gerar.py
"""
from pathlib import Path

import openpyxl

AQUI = Path(__file__).resolve().parent

TELA_BTG = (["Ticker", "Asset", "Break Even", "Duration", "Emissor", "Emissor Abreviado", "Incentivado", "Indexador", "PU",
             "Quantidade Emitida", "Ref. NTNB", "Resgate Antecipado", "Setor", "Taxa Emissão", "Taxa Indicativa Anbima",
             "Valor Nominal (Emissão)", "Vencimento", "Volume Emitido", "% PU", "Última Atualização Book"], [
    ["TSTR11", "DEBENTURES", 6.4, 4.1, "EMISSORA TESTE RODOVIAS S.A.", "EMISSORA TESTE RODOVIAS S.A.", "S", "IPCA+", 1010.5,
     "500.000", "15/08/2032", "N", "Transporte", "IPCA + 6,5000%", 6.9, "R$\xa01.000,00", "15/05/2032", 500000000, 98.1,
     "2026-10-22T14:00:00.000000000Z"],
    ["TSTR21", "DEBENTURES", "-", 3.2, "EMISSORA TESTE RODOVIAS S.A.", "EMISSORA TESTE RODOVIAS S.A.", "N", "PRÉ", 990.0,
     "200.000", "15/08/2030", "N", "Transporte", "13.2000%", 13.6, "R$\xa01.000,00", "15/08/2030", 200000000, 99.0,
     "2026-10-22T14:00:00.000000000Z"],
    ["FERX11", "DEBENTURES", 6.8, 9.0, "FERROVIA EXEMPLO S/A", "FERROVIA EXEMPLO S/A", "S", "IPCA+", 1001.0, "300.000",
     "15/05/2045", "N", "Transporte", "IPCA + 6,9000%", 7.1, "R$\xa01.000,00", "15/05/2040", 300000000, 97.0,
     "2026-10-21T18:00:00.000000000Z"],
    ["NOVA11", "DEBENTURES", 6.5, 5.0, "CONCESSIONARIA NOVA SEM CADASTRO S.A.", "CONCESSIONARIA NOVA SEM CADASTRO S.A.", "S",
     "IPCA+", 1000.0, "100.000", "15/05/2035", "N", "Transporte", "IPCA + 7,0000%", 7.2, "R$\xa01.000,00", "15/05/2034",
     100000000, 99.5, "2026-10-22T14:00:00.000000000Z"],
    ["ENRG11", "DEBENTURES", 6.1, 6.0, "ENERGIA FICTICIA S.A.", "ENERGIA FICTICIA S.A.", "S", "IPCA+", 1000.0, "400.000",
     "15/05/2035", "N", "Energia Elétrica - Transmissão", "IPCA + 6,1000%", 6.4, "R$\xa01.000,00", "15/05/2035",
     400000000, 99.0, "2026-10-22T14:00:00.000000000Z"],
])

TELA_XP = (["Ticker", "Emissor", "Tipo", "Índice", "Taxa Emissão", "Vencimento", "Atualização", "Rating", "Duration",
            "Anbima", "BRef", "Isento", "BreakEven"], [
    ["TSTR11", "TESTE RODOVIAS", "DEB", "IPCA", 0.065, "15/05/2032", "11:00:00", "AAA Fitch", 4.1, 6.9, "B32", "Sim", ""],
    ["FERX99", "FERROVIA EXEMPLO", "DEB", "DI", 0.012, "15/05/2031", "11:00:00", "", 3.0, 1.3, "", "Sim", ""],
    ["LOCA11", "LOCADORA FICTICIA", "DEB", "IPCA", 0.07, "15/05/2031", "11:00:00", "brAA S&P", 3.0, 7.3, "B30", "Sim", ""],
])

NEGOCIOS_BTG = (["symbol", "asset", "maturity_date", "issuer", "linked_index", "rate", "qty", "pu", "vol", "aggressor",
                 "transact_time"], [
    ["TSTR11", "DEBENTURES", "2032-05-15", "EMISSORA TESTE RODOVIAS S.A.", "IPCA+", 7.0, 100, 1000.0, 100000.0, "Buy",
     "2026-10-01T13:00:00.000000000Z"],
    ["TSTR11", "DEBENTURES", "2032-05-15", "EMISSORA TESTE RODOVIAS S.A.", "IPCA+", 7.2, 300, 1000.0, 300000.0, "Sell",
     "2026-10-01T19:30:00.000000000Z"],
    ["TSTR11", "DEBENTURES", "2032-05-15", "EMISSORA TESTE RODOVIAS S.A.", "IPCA+", 7.1, 200, 1000.0, 200000.0, "Sell",
     "2026-10-02T14:00:00.000000000Z"],
    ["TSTR21", "DEBENTURES", "2030-08-15", "EMISSORA TESTE RODOVIAS S.A.", "PRÉ", 13.5, 50, 1000.0, 50000.0, "Buy",
     "2026-10-02T15:00:00.000000000Z"],
    ["FERX11", "DEBENTURES", "2040-05-15", "FERROVIA EXEMPLO S/A", "IPCA+", 7.4, 100, 1000.0, 100000.0, "Buy",
     "2026-10-02T16:00:00.000000000Z"],
    ["NOVA11", "DEBENTURES", "2034-05-15", "CONCESSIONARIA NOVA SEM CADASTRO S.A.", "IPCA+", 7.5, 10, 1000.0, 10000.0,
     "Buy", "2026-10-01T16:00:00.000000000Z"],
    ["ENRG11", "DEBENTURES", "2035-05-15", "ENERGIA FICTICIA S.A.", "IPCA+", 6.3, 10, 1000.0, 10000.0, "Buy",
     "2026-10-01T16:00:00.000000000Z"],
    # dia sem curva do Tesouro no arquivo de exemplo
    ["TSTR11", "DEBENTURES", "2032-05-15", "EMISSORA TESTE RODOVIAS S.A.", "IPCA+", 7.3, 20, 1000.0, 20000.0, "Buy",
     "2026-10-05T20:00:00.000000000Z"],
    # volume zero e taxa fora do lugar, depois do último negócio de verdade: conta em n, não vira o último
    ["TSTR11", "DEBENTURES", "2032-05-15", "EMISSORA TESTE RODOVIAS S.A.", "IPCA+", 50.0, 0, 0, 0, "Buy",
     "2026-10-05T21:00:00.000000000Z"],
])

INTENCOES_XP = (["Solicitado em", "Ativo", "Emissor/Risco", "Direção", "Quantidade", "Taxa Bruta", "Spread Over B",
                 "Tipo da Intenção", "Tipo", "Indexador", "Vencimento", "Financeiro"], [
    ["01/10/2026 10:15:00.000", "TSTR11", "TESTE RODOVIAS", "Compra", 150, "7,60%", "-", "Taxa Nominal", "DEB", "IPCA+",
     "15/05/2032", 150000.0],
    ["02/10/2026 11:00:00.000", "TSTR11", "TESTE RODOVIAS", "Venda", 50, "7,00%", "-", "Taxa Nominal", "DEB", "IPCA+",
     "15/05/2032", 50000.0],
    ["02/10/2026 12:30:00.000", "FERX99", "FERROVIA EXEMPLO", "Compra", 80, "1,20%", "-", "Taxa Nominal", "DEB", "DI+",
     "15/05/2031", 80000.0],
    ["02/10/2026 12:45:00.000", "LOCA11", "LOCADORA FICTICIA", "Venda", 10, "7,10%", "-", "Taxa Nominal", "DEB", "IPCA+",
     "15/05/2031", 10000.0],
    ["03/10/2026 09:00:00.000", "XYZW11", "OUTRA EMPRESA NOVA", "Compra", 10, "8,00%", "-", "Taxa Nominal", "DEB", "IPCA+",
     "15/05/2033", 10000.0],
])


CABECALHO_MS = ("Titulo@Data Referencia@Codigo SELIC@Data Base/Emissao@Data Vencimento@Tx. Compra@Tx. Venda@Tx. Indicativas@PU@"
                "Desvio padrao@Interv. Ind. Inf. (D0)@Interv. Ind. Sup. (D0)@Interv. Ind. Inf. (D+1)@Interv. Ind. Sup. (D+1)@Criterio")
# dia -> [(vencimento AAAAMMDD, taxa indicativa)] das NTN-B
NTNB_MS = {
    "20261001": [("20290515", "5,8000"), ("20300815", "6,0000"), ("20350515", "6,5000"), ("20350815", "6,5500")],
    "20261002": [("20290515", "5,7000"), ("20300815", "6,1000"), ("20350515", "6,4000"), ("20350815", "6,4500")],
}


def _ms(dia, ntnb):
    linhas = ["ANBIMA - Associação Brasileira das Entidades dos Mercados Financeiro e de Capitais", "", CABECALHO_MS,
              f"LTN@{dia}@100000@20230101@20270701@9,9900@9,9800@9,9850@900,000000@0,00100000000000@9,9@10,1@9,9@10,1@Calculado"]
    linhas += [f"NTN-B@{dia}@760199@20000715@{v}@{t}@{t}@{t}@4000,000000@0,00100000000000@5,0@7,0@5,0@7,0@Calculado"
               for v, t in ntnb]
    linhas.append(f"NTN-F@{dia}@950199@20000101@20310101@12,9000@12,8000@12,8500@900,000000@0,00100000000000@12,5@13,0@12,5@13,0@Calculado")
    return "\r\n".join(linhas) + "\r\n"


def _salva(caminho, abas):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nome, (cab, linhas) in abas.items():
        ws = wb.create_sheet(nome)
        ws.append(cab)
        for linha in linhas:
            ws.append(linha)
    wb.save(caminho)


def main():
    _salva(AQUI / "telas.xlsx", {"BTG": TELA_BTG, "XP": TELA_XP})
    _salva(AQUI / "negocios.xlsx", {"BTG": NEGOCIOS_BTG, "XP": INTENCOES_XP})
    pasta = AQUI / "publico" / "anbima_ms"
    pasta.mkdir(parents=True, exist_ok=True)
    for dia, ntnb in NTNB_MS.items():
        (pasta / f"ms{dia[2:]}.txt").write_bytes(_ms(dia, ntnb).encode("latin-1"))


if __name__ == "__main__":
    main()
