# Controle Financeiro

Versão em aplicativo da planilha `Controle Financeiro.xlsm`, feita para rodar
a partir do pendrive no Linux e no Windows, com os dados gravados no próprio
pendrive.

**A cópia oficial é o repositório no GitHub.** O app se atualiza sozinho de lá;
o pendrive virou só mais um lugar onde o programa pode morar.

---

## Estrutura

```
Controle Financeiro/
├── app/                       Interface (HTML/CSS/JS puro, sem build)
│   ├── index.html
│   ├── css/estilo.css
│   └── js/
│       ├── app.js             Controlador e navegação entre telas
│       ├── calculos.js        Porte de AtualizarPainel() do VBA
│       ├── dominio.js         Regras dos módulos de Receitas/Despesas/
│       │                      Devedores/Investimento
│       ├── telas.js           Comportamento das quatro telas de lista
│       ├── listas.js          Montagem das tabelas
│       ├── formulario.js      Modais de formulário, confirmação e aviso
│       ├── planta.js          Porte de Log_Modulo.bas (sequência + planta)
│       ├── plantaSvg.js       Desenho da planta por estágio
│       ├── recompensas.js     Progressão, cores, fontes e aplicação visual
│       ├── temas.js           As 18 paletas desbloqueáveis
│       ├── fundos.js          Fundos ilustrados, desenhados em SVG
│       ├── telaRecompensas.js Tela de recompensas e personalização
│       ├── armazenamento.js   Leitura/gravação do arquivo de dados
│       └── util.js            Datas, meses e formatação em Real
├── electron/                  Empacotamento como aplicativo de desktop
│   ├── main.js
│   └── preload.js
├── dados/
│   ├── controle-financeiro.json        Arquivo de trabalho (começa vazio)
│   └── backup-planilha-2026-09-03.json Conversão da planilha original
├── build-assets/              Ícones do aplicativo
├── build/                     Saída do empacotamento
├── pendrive/                  ← pronto para copiar no pendrive
│   ├── Controle Financeiro.AppImage
│   ├── Windows/Controle Financeiro.exe
│   ├── dados/controle-financeiro.json
│   └── LEIA-ME.txt
├── package.json
└── LEIA-ME.md
```

---

## Onde os dados ficam

Tudo fica em **um único arquivo JSON**, apontado pelo botão de engrenagem
(canto superior direito) → *Arquivo de dados*. O padrão é
`dados/controle-financeiro.json`, ao lado do executável — ou seja, no pendrive.

O app escolhe automaticamente um dos três modos:

| Modo | Quando | Grava direto no arquivo? |
|---|---|---|
| **Electron** | Rodando o aplicativo de desktop | Sim, sempre |
| **Navegador (Chrome/Edge)** servido por `http://` | Abrindo pelo navegador | Sim, depois de escolher o arquivo |
| **Navegador** abrindo o `index.html` direto (`file://`) | Duplo clique no arquivo | Não — usa a memória do navegador; use *Exportar* / *Importar* |

> Para o uso em pendrive, **o modo Electron é o recomendado**: é o único que
> grava no arquivo sem depender de permissão do navegador.

---

## Como rodar

### No pendrive (pronto)

Copie o **conteúdo da pasta `pendrive/`** para a raiz do pendrive:

```
Pendrive/
├── Controle Financeiro.AppImage      ← Linux
├── Windows/
│   └── Controle Financeiro.exe       ← Windows
├── dados/
│   └── controle-financeiro.json      ← um só arquivo, para os dois
└── LEIA-ME.txt
```

Os dois executáveis gravam no **mesmo** `dados/controle-financeiro.json`. O
`.exe` está uma pasta abaixo, mas o app sobe os diretórios (até quatro níveis)
procurando a pasta `dados` — por isso não separe as pastas.

No Linux, se o AppImage não abrir com duplo clique: botão direito →
Propriedades → Permissões → *Permitir execução como programa*.

### Gerando de novo

Precisa do Node.js **na máquina que gera**, não na que roda.

```bash
npm install
npm run dist
```

Sai em `build/`: o `.AppImage` do Linux e a pasta `win-unpacked` do Windows.

Duas observações sobre o build feito aqui:

- O alvo do Windows é `dir` (pasta) em vez de `portable` (um `.exe` único),
  porque o `.exe` autoextraível precisa do **Wine** para ser montado no Linux.
  A pasta funciona igual: é só abrir o executável dentro dela.
- Pelo mesmo motivo (`signAndEditExecutable: false`), o ícone não fica embutido
  no `.exe` — o Windows mostra o ícone padrão do Electron. Rodando
  `npm run dist` **no Windows**, ou com o Wine instalado, o ícone entra.

### Como site local

```bash
python3 -m http.server 8123
```

Abra `http://localhost:8123/app/index.html` no Chrome ou Edge e use o botão de
configuração para apontar o arquivo de dados.

## Atualização automática

A cópia oficial do projeto é o repositório **thlordz/controle-financeiro**, no
GitHub, e não mais o pendrive. É de lá que os aplicativos já instalados
descobrem que existe versão nova.

### Como funciona

Uma vez por dia, ao abrir, o app pergunta ao GitHub qual é a última release e
baixa dela um arquivinho de menos de 1 KB, o `atualizacao.json`, que lista os
pacotes daquela versão com o tamanho e a soma de verificação de cada um. O app
compara com o que já tem e baixa **só o que mudou**.

No computador a troca acontece na hora de fechar o app, não na de abrir — assim
ninguém vê o programa reiniciar sozinho no meio de um lançamento. No Linux é o
próprio arquivo `.AppImage` que é substituído; no Windows, a pasta
`resources/app`, por um ajudante que espera o programa morrer, porque o Windows
não deixa apagar arquivo aberto.

No Android é diferente: o sistema **nunca** instala nada calado fora da loja. O
APK é baixado em silêncio e, na próxima vez que a pessoa abrir o app, aparece a
pergunta do Android — uma vez por versão. Quem disser "agora não" encontra o
número da versão nos Ajustes virado em botão.

### Por que o `asar` está desligado

O `package.json` traz `"asar": false`, e isso é de propósito. Com o
empacotamento ligado, o executável do Windows guarda dentro de si a impressão
digital do pacote; mudar uma vírgula no código mudava o executável inteiro, e a
atualização passava a custar 181 MB. Sem ele, o executável é o do Electron de
fábrica e nunca muda: a atualização do Windows são 148 KB.

### O token

O repositório é privado, então tudo passa por um token de leitura. Ele **não
mora no projeto**: fica em `~/.config/controle-financeiro-tokens/leitura.txt` e
é copiado para `app/token-leitura.txt` só durante o empacotamento, saindo logo
depois. Assim ele nunca é gravado no histórico do Git, e trocar de token um dia
é mudar um arquivo e gerar os pacotes de novo.

Rodando a partir do código-fonte esse arquivo não existe, e a atualização
automática simplesmente não acontece — o app funciona igual.

O token de escrita, usado para publicar, fica em
`~/.config/controle-financeiro-tokens/publicacao.txt` (ou na variável
`TOKEN_PUBLICACAO`, só para aquela vez).

### Publicando uma versão

1. Mudar o número em `app/js/versao.js`.
2. `./publicar.sh` — gera Linux e Windows, atualiza as cópias locais e cria a
   release.
3. `movel/gerar-apk.sh` — gera o APK e o anexa à **mesma** release.

Os dois podem rodar em momentos diferentes: o que ainda não existe é pulado, e
a release é completada depois. Para gerar sem publicar, `SEM_GITHUB=1`.

O executável do Windows, de 181 MB, só é enviado quando muda de verdade — o
script guarda em `ferramentas/.github-anexos.json` a soma de cada anexo já
enviado e reaproveita o que está lá.

---

## O que a tela de Início reproduz da planilha

Todos os cálculos são um porte direto de `Início_Módulo.bas → AtualizarPainel()`
e foram conferidos valor a valor contra a planilha (as 11 células do painel
bateram exatamente).

| No app | Célula | Cálculo |
|---|---|---|
| Saldo em conta | `B5` | ajuste + receitas recebidas + devedores pagos − despesas pagas (**histórico completo**, não só o mês) |
| Quanto posso gastar / Quanto estou devendo | `E5` / `E4` | saldo em conta + receitas pendentes + devedores pendentes − despesas pendentes. O rótulo troca sozinho quando o valor fica negativo |
| Receitas do mês | `B8` | receitas do mês + devedores pagos + devedores pendentes |
| Recebido | `B10` | receitas com status *Recebido* + devedores pagos |
| Falta receber | `C10` | receitas pendentes + devedores pendentes |
| Despesas do mês | `E8` | todas as despesas do mês, inclusive *Aguardando* |
| Pago | `E10` | despesas com status *Pago* |
| Falta pagar | `F10` | despesas *Pendente* + *Aguardando* |
| Fatura atual | `B13` | cartão de crédito, só *Pendente* |
| Total prevista | `B15` | cartão de crédito, *Pendente* + *Aguardando* |
| Fatura paga | `C15` | cartão de crédito, só *Pago* |

O status dos devedores não é armazenado: é recalculado como na fórmula da
coluna A da tabela `Devedores` — *Perdoado* quando "Pagou em" é `-`, *Pago*
quando há data, *Pendente* quando o vencimento ainda não chegou, e *Atrasado*
depois disso.

As setas ao lado do mês fazem o mesmo que `MudarMesEsquerda` / `MudarMesDireita`,
inclusive virando o ano. Clicar no nome do mês volta para o mês atual.

A aba Início da planilha tem exatamente três botões — `MudarMesEsquerda`,
`MudarMesDireita` e `ReajustarSaldoConta` — e os três estão na tela.

### O ajuste do saldo (`O3`) — porte de `ReajustarSaldoConta()`

`O3` **não é um "saldo inicial" digitado à mão**: é um ajuste acumulado, e o
único jeito de mexer nele é o botão **Reajustar**, no cartão de Saldo em conta.
O fluxo é o mesmo do VBA:

```
saldoAtual = saldo em conta calculado no painel (B5)
valorReal  = quanto você informa ter na conta agora
diferenca  = valorReal − saldoAtual
O3         = O3 + diferenca          (acumula, não substitui)
```

Assim o saldo do painel passa a bater exatamente com o valor informado, sem
que nenhum lançamento seja alterado. O app mostra a diferença ao vivo enquanto
você digita ("Acrescenta R$ 93,07 de ajuste") e aceita os formatos `3200,50`,
`3.200,50`, `3200.50` e `R$ 1.234,56`.

No arquivo de dados esse valor é o campo `config.ajusteSaldo`. A tela de
configuração só o exibe, para conferência — quem altera é o botão Reajustar.

---

## A planta (frequência de acesso)

Porte de `Log_Modulo.bas`. O app registra a data de cada acesso (uma por dia,
sem duplicar) e conta a **sequência de dias seguidos** que termina no último
registro.

**Crescendo** — pela sequência:

| Sequência | Estágio |
|---|---|
| até 1 dia | 🌱 Semente |
| 2 a 4 dias | 🌿 Brotando |
| 5 a 9 dias | 🪴 Crescendo |
| 10 dias ou mais | 🌸 Florescendo |

**Murchando** — pelos dias sem entrar:

| Dias fora | Estágio |
|---|---|
| até 4 | 🥀 Murchando |
| 5 a 9 | 🍂 Seca |
| 10 ou mais | 🕸️ Abandonada |

A cor da mensagem segue o mesmo gradiente do VBA: verde enquanto a sequência
se mantém e, ao quebrar, `RGB(200, 130 − 130 × min(dias/10, 1), 0)` — do âmbar
ao vermelho conforme a ausência aumenta. As 12 frases de incentivo são
sorteadas sem repetir a última, como na planilha.

---

## As telas de lista

O mês é **compartilhado entre todas as telas**, como o `SincronizarAbas()` fazia
com as células `F2`/`G2` de cada aba. Trocar o mês em qualquer tela troca em
todas. Os totais do topo acompanham o filtro ativo, igual ao `SUBTOTAL(103)`
das fórmulas originais.

Toda linha abre em um formulário para editar ou excluir. Onde a planilha
encadeava vários `InputBox`, o app usa um diálogo único.

### Receitas — `Receita_Módulo`

| Botão | Origem |
|---|---|
| Nova receita | `Receita_Inserir` |
| Copiar fixas do mês anterior | `Receita_CopiarFixasMesAnterior` |
| Parcelar | `Despesa_AdicionarParcelas` (com destino Receitas) |
| Todos os meses | `Receita_LimparFiltros` |
| Limpar busca | volta ao mês selecionado |

Uma receita de categoria **Investimento** marcada como *Recebido* é uma
retirada. Se ela deixasse o saldo investido negativo, o lançamento é recusado —
porte de `ValidarSaldoInvestimento()`.

### Despesas — `Despesas_Módulo`

| Botão | Origem |
|---|---|
| Nova despesa | `Despesa_Inserir` |
| Copiar fixas do mês anterior | `Despesa_CopiarFixasMesAnterior` |
| Parcelar | `Despesa_AdicionarParcelas` |
| Só a fatura do mês | `Despesa_FiltrarFaturaDoMes` |
| Todos os meses | `Despesa_LimparFiltros` |
| Limpar filtros | volta ao mês selecionado |

O formulário de parcelas troca de conteúdo conforme o destino, como as
funções `ArrayCategorias(wsNome)` e `ArrayFormaPagamento()` faziam: em
Despesas são 12 categorias e a forma de pagamento vem de uma lista; em
Receitas são 3 categorias e a origem é texto livre.

O parcelamento usa a mesma regra de datas do `ProximoMes()`: avança mês a mês
mantendo o dia e, quando o dia não existe no mês de destino, cai no último dia
dele. Uma compra em 31/12 vira 31/01, 28/02, 31/03. A observação de cada
parcela sai como `Parcela (2/4) - texto`.

Ao copiar as fixas, o VBA leva só valor, descrição, categoria e forma de
pagamento — comprovante e observação ficam de fora, e o status vai como
*Pendente*. O app faz igual.

### Devedores — `Devedores_Módulo`

| Botão | Origem |
|---|---|
| Novo devedor | `Devedores_Inserir` |
| Copiar recorrentes do mês anterior | `Devedores_CopiarRecorrentesMesAnterior` |
| Só atrasados | `Devedores_FiltrarAtrasados` |
| Todos os meses | `Devedores_LimparFiltros` |
| Limpar filtros | volta ao mês selecionado |

O status continua sendo calculado, nunca digitado — era isso que o
`Devedores_ProtegerColunasCalculadas()` defendia na planilha. Ao copiar os
recorrentes, "Pagou em", forma e comprovante são zerados, e o status se
recalcula sozinho.

### Investimento — `Investimento_Módulo`

| Botão | Origem |
|---|---|
| Novo aporte | `InvestimentoNovaLinhaDespesa` |
| Nova retirada | `InvestimentoNovaLinhaReceita` |
| Lançar rendimento | `Investimento_Inserir` → `InvestimentoNovaLinhaRendimento` |
| Simulador | `AbrirSimulador` |
| Todos os meses | `Investimento_LimparFiltros` |
| Definir meta | célula `C2`, digitada direto na planilha |

Esta tela tem **mês próprio**, separado das outras quatro — exatamente como na
planilha, onde ela usa as células `H2`/`I2` e o `SincronizarAbas()`
deliberadamente não a inclui.

A lista **não é digitada**: é reconstruída a cada abertura, como o
`Investimento_AtualizarListaEGrafico()` fazia no `Worksheet_Activate`. Por isso
não existe botão "Atualizar" — ela nunca fica velha. Linhas de Aporte/Retirada
gravadas no arquivo são descartadas na leitura: elas eram só o cache da última
execução daquela macro, e contariam em dobro.

- **Aporte** — despesa de categoria *Investimentos* que já esteja **Paga**
- **Retirada** — receita de categoria *Investimento* que já esteja **Recebida**
- **Rendimento** — único lançamento que mora na própria tela, porque esse
  dinheiro não passa pela conta principal

Enquanto a despesa está *Pendente* ou *Aguardando*, o dinheiro ainda não saiu
da conta, então não entra na soma. Clicar num aporte ou numa retirada leva
direto ao lançamento de origem em Despesas ou Receitas — porte do
`Worksheet_BeforeDoubleClick`.

O **simulador** é o porte de `Investimento_Simulador.frm`:
`total projetado = valor mensal × meses` e `total final = projetado + já
guardado`. O botão "Até o fim do ano" preenche `12 − mês atual`, sem contar o
mês corrente.

---

## Aparência

A tipografia é serifada em toda a interface, com pilhas que têm equivalente no
Linux e no Windows (Palatino/P052/Georgia nos títulos, Charter/Cambria/Georgia
no corpo). Valores monetários usam `tabular-nums`, para as colunas ficarem
alinhadas.

A troca de tela desliza no sentido da navegação — para a esquerda ao avançar no
menu, para a direita ao voltar — e os cartões entram em cascata logo atrás.
Quem tiver `prefers-reduced-motion` ligado no sistema não vê animação nenhuma.

Abaixo de 620px as tabelas deixam de ser tabelas: cada linha vira um bloco de
três andares (data · status · valor / descrição / categoria · complemento), e
as colunas secundárias saem de cena. Nenhuma tela rola na horizontal.

---

## Diferenças deliberadas em relação ao VBA

Dois pontos onde o app **não** copia o comportamento original, de propósito:

**1. Dia que não existe no mês de destino.** Ao copiar fixas, o VBA monta
`DateSerial(anoAtual, mesAtual, Day(dataAntiga))`. O `DateSerial` normaliza o
estouro, então um salário do dia 31 copiado para fevereiro vira **3 de março** —
sai do mês de destino. O `Despesa_CopiarFixasMesAnterior` até tem um tratamento
de erro que calcularia o último dia do mês, mas ele nunca dispara, porque
`DateSerial` não gera erro nesse caso. O app trava no último dia do mês
(28/02), que é o que o código original claramente pretendia. Isso afeta os
lançamentos de dia 29 a 31 — no arquivo atual, o salário recorrente do dia 29.

**2. Valores fora da lista de validação.** As listas da planilha mudaram com o
tempo: as linhas 138–154 e 179–182 de Despesas ainda usam "Fundo Emergência",
que saiu da lista de formas de pagamento. Quando o valor gravado não está mais
na lista, o formulário o adiciona marcado como *(fora da lista)*, em vez de
mostrar o campo em branco e apagá-lo ao salvar.

**3. Retirada de investimento acima do saldo.** O `ValidarSaldoInvestimento`
deixava a linha criada e apagava só a célula de valor. O app recusa o
lançamento inteiro e mantém o que você digitou na tela, para você corrigir o
valor sem redigitar o resto.

E uma funcionalidade substituída: o `frmBuscaLancamentos` era uma busca global
com lista de resultados e marca-texto amarelo. No lugar dele há uma busca por
tela, combinada com o botão **Todos os meses**.

### Coisas do VBA que não têm equivalente

- `Investimento_MigrarDadosAntigos()` — rotina de uso único, já executada. Os
  lançamentos de Aporte/Retirada que ainda estão gravados na aba Investimento
  do arquivo são o cache da última execução do `AtualizarListaEGrafico` e são
  ignorados pelo app, que os recalcula a partir de Despesas/Receitas. Só os
  quatro rendimentos daquela lista são realmente lidos.
- `Devedores_Inserir()` limpava a fórmula que o Excel colocava sozinho na
  coluna Observação — um problema que só existe dentro do Excel.
- `Devedores_ProtegerColunasCalculadas()` restaurava a fórmula de Status quando
  alguém a sobrescrevia. No app o Status nem aparece como campo editável.
- `EscolherDaLista()` e `RemoverAcentos()` existiam para simular um combo box
  dentro de um `InputBox`. Viraram `<select>`; o `RemoverAcentos` sobrevive na
  busca, que ignora acentos e maiúsculas.

---

## Recompensas por frequência

A planta mostra a **sequência atual** e murcha quando você some. O sistema de
recompensas é o outro lado: o **total de dias de acesso** vira progresso
permanente, que vai liberando a personalização. Quebrar a sequência murcha a
planta, mas nunca tira um item já conquistado — a punição em dobro só
desanimaria.

Toque no cartão da planta, na tela de Início, para abrir a tela.

### Patentes

| Dias | Patente |
|---|---|
| 0 | Recém-chegado |
| 3 | Curioso |
| 7 | Explorador |
| 14 | Aventureiro |
| 21 | Veterano |
| 30 | Mestre |
| 45 | Lenda |
| 60 | Interdimensional |
| 80 | Rick C-137 |
| 100 | Vingador |
| 120 | Titã |
| 150 | Eternidade |

### O que se desbloqueia

São **47 itens** ao longo de 120 dias: 18 temas, 11 cores de destaque, 6 fontes
e 12 fundos.

**Temas** — 6 de Rick and Morty (Portal C-137, Caixa de Meeseeks, Pickle Rick,
Cronenberg, Federação Galáctica, Cidadela dos Ricks), 7 da Marvel (Homem de
Ferro, Hulk, Capitão América, Wakanda, Doutor Estranho, Asgard, Manopla do
Infinito) e 5 de clima geek geral (Menta, Neon, Terminal CRT, Nebulosa,
Masmorra). Cada um tem variante clara e escura, e a vitrine os agrupa por
origem.

**Fundos** — os quatro primeiros são padrões simples (gradiente, grade,
pontilhado, estrelas); depois vêm os ilustrados: Portais, Circuito, Skyline,
Topografia, Favo e Cosmos. Todos são desenhos originais em SVG, montados na
hora **com as cores do tema em uso**, então acompanham a paleta e não dependem
de internet. O último desbloqueio é **Sua imagem**, aos 95 dias: você escolhe
um arquivo do computador e ele passa a ser o fundo.

Os itens bloqueados aparecem com a paleta visível e o contador de dias que
faltam — ver o que vem pela frente é o que dá vontade de voltar.

### Conquistas de sequência

Seis medalhas que dependem de constância, não de acúmulo: 3, 7, 14, 30, 60 e
100 dias **seguidos**. Essas você perde se sumir, e reconquista voltando.

### A morte da planta

A planta murcha conforme os dias sem entrar — e passados **15 dias**, morre.
Quando isso acontece:

- uma semente nova é plantada e a **sequência recomeça do zero**;
- o contador de *plantas perdidas* sobe em um;
- a *melhor sequência* fica registrada, mesmo tendo sido perdida;
- **nada do que você desbloqueou é retirado** — os desbloqueios vêm do total de
  dias de acesso, que nunca regride.

A tela de recompensas mostra os três números lado a lado: sequência atual,
melhor sequência e plantas perdidas.

### Sobre a arte

Tudo o que o app desenha é original: as paletas, os fundos em SVG e o ícone.
Não há arte, logotipo nem imagem de terceiros embutida — o que existe são
nomes de tema e combinações de cor. Para usar arte de verdade, o caminho é o
fundo **Sua imagem**, onde você escolhe o arquivo que quiser.

---

## Próxima etapa

Empacotar como executável portátil (`npm run dist`), o que depende de instalar
o Node.js.
