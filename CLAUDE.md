# Rodovias do Brasil · Centro de Inteligência — instruções para o Claude

Fale sempre em **português** com o usuário. Antes de mudar código ou dados, leia `docs/HANDOFF.md` (arquitetura,
pegadinhas do ambiente) e o `README.md` (roteiros de atualização). Nenhum `data/intel/*.json` se edita à mão.

## Quando o usuário pedir "atualize" (ou "atualizar o dashboard", "atualize tudo")

Faça o roteiro inteiro sem esperar outra instrução. O objetivo é atualizar **tudo o que dá para atualizar daqui** e
terminar com uma lista curta e concreta do que depende do usuário.

1. **Git primeiro.** `git fetch origin` e veja se há branch de atualização sem merge
   (`git branch -r --no-merged origin/main`, nomes `claude/*`). Se houver, junte-a ao branch de trabalho antes de gerar
   qualquer bloco: os históricos versionados (`data/indices/*.json`) guardam dias que a ANBIMA já tirou do ar, e um
   branch esquecido os leva consigo. Na junção, dado vence "sem_arquivo"/"sem_dado"; os blocos gerados se regeram.
2. **Insumos do usuário no Drive.** Procure na pasta `Rodovias` do Google Drive (id `12dLB6bWWw46hpY6DXwSi-410tFPh5eV2`,
   conector do Drive, `'<id>' in ancestors`, ordenado por data) os arquivos mais novos que os do painel e baixe-os com
   `curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`:
   - IDEX-Infra: planilha de dados (`*datafile*.xlsx`) e relatório mensal (PDF) → `data/raw/idex/`;
   - planilhas das corretoras (telas XP/BTG, negócios BTG, intenções XP), se não vieram anexadas → `data/raw/debentures/`
     (tire da pasta as antigas: todas as que estão lá são somadas);
   - SNV (`AAAAMMX.zip`) mais novo que a versão do painel → roteiro "Regenerar com um SNV novo" do README;
   - RoadShow (PDF) de edição nova → roteiro 2 do README.
   Anexos da conversa vão para as mesmas pastas.
3. **Rode a atualização completa:** `python scripts/atualizar.py --baixar` (em segundo plano; demora). Se um domínio
   travar num site lento, rode-o à parte com `--dominios <d>` e limite de tempo, nunca dois `atualizar.py` ao mesmo
   tempo (escrevem o mesmo relatório e manifesto).
4. **Leia o topo de `data/atualizacao.md`**, gerado por `scripts/sentinelas.py`:
   - **Precisa de você** — insumos do usuário e branches sem merge;
   - **Não atualizou nesta rodada** — domínios pulados ou com falha e checagens que não puderam ser feitas;
   - **Novidades nas fontes** — período ou edição nova que o código ainda não lê. Resolva aqui mesmo o que for ajuste de
     constante (README, "Período novo de uma fonte") e rode o domínio de novo.
5. **Curadoria.** Resolva o que der com pesquisa em fonte oficial: leilões realizados (camada de verificação, só com
   ata/edital/B3/DOU; imprensa só em nota), pipeline com data vencida, emissores de debêntures sem classificação. O
   que ficar sem fonte oficial continua pendente e vai para a resposta.
6. **Testes:** `python -m pytest`, `npm test` e `npm run test:e2e -- --trace off`. Teste "dado mudou" com valor
   fixado: confira o valor novo na fonte e só então atualize o teste.
7. **Commit, push e PR** no branch de trabalho, com o que mudou e o que ficou pendente na descrição.
8. **Resposta ao usuário**, sempre nesta ordem:
   - envie o `mapa-rodovias.html` atualizado na conversa;
   - **Atualizado:** o que mudou (com datas dos dados);
   - **Não consegui atualizar:** o quê e por quê (site fora do ar, bloqueio de IP, etc.);
   - **Preciso de você:** cada arquivo que só ele pode fornecer, com onde salvar (pasta `Rodovias` do Drive) e a partir
     de que data;
   - peça o **merge do PR** antes da próxima atualização.

## O que o ambiente não alcança (conhecido)

- Portais do DNIT (SNV, VGeo, dadospnct) e o SIGEL da ANEEL: recusam conexão daqui. O SNV vem do Drive do usuário; o
  VMDa 2025 vem da camada aberta da Infra S.A. (`scripts/intel/vmda2025.py`), com o zip do Drive como alternativa.
- `dados.antt.gov.br` às vezes recusa conexão por horas: tente de novo no fim da atualização.
- A ANBIMA só mantém online os arquivos dos últimos dias úteis: atualize as debêntures com frequência.
