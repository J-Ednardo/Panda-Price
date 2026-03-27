# Documentação Técnica: Panda Price 🐼

O **Panda Price** é uma extensão para Google Chrome (Manifest V3) projetada para facilitar a experiência de compra de usuários brasileiros em plataformas chinesas, especificamente **Xianyu (Goofish)** e **Taobao**. Ela foca em duas frentes: conversão dinâmica de moedas e melhoria da usabilidade através do bloqueio de interrupções.

---

## 📂 Estrutura de Arquivos

- `manifest.json`: Manifesto de configuração da extensão.
- `popup.html`: Interface visual do menu da extensão.
- `popup.js`: Lógica de controle da interface e persistência de configurações.
- `content.js`: Script principal que injeta a lógica de conversão e bloqueio nas páginas web.
- `README.md`: Guia rápido de instalação e uso.
- `icons/`: Repositório de ícones da extensão.

---

## ⚙️ Configurações (manifest.json)

A extensão utiliza as seguintes permissões:
- `storage`: Para salvar a cotação do Yuan e as preferências do usuário.
- `activeTab`: Para interagir com a aba aberta no momento.
- `scripting`: Para execução de scripts necessários.
- `host_permissions`: Aplicado a domínios `*.xianyu.taobao.com`, `2.taobao.com`, `*.taobao.com` e `*.alibaba.com`.

---

## 🛠️ Script de Conteúdo (content.js)

Este é o "coração" da extensão. Ele monitora o DOM e aplica as transformações visualmente.

### Variáveis Globais
- `settings`: Objeto que armazena localmente a cotação (`yuanRate`), se a conversão está ativa (`enableConversion`) e se o bloqueio de pop-up está ativo (`blockPopup`).

### Métodos Principais

#### `init()`
- **Função:** Orquestrador inicial. Verifica as configurações e inicia o bloqueador de pop-ups e/ou a conversão de preços.

#### `setupPopupBlocker()`
- **Função:** Configura a proteção contra pop-ups de login.
- **Ações:** Chama `injectBlockerCSS()`, executa uma varredura inicial e configura um `MutationObserver` para detectar novos modais injetados dinamicamente pelo site.

#### `removeLoginPopups(root)`
- **Função:** Localiza e remove elementos de login baseando-se em uma lista exaustiva de seletores CSS (ex: `.login-modal`, `[class*="login-mask"]`).
- **Ações:** Tenta clicar em botões de fechar (se existirem) e aplica `display: none !important` para garantir que o elemento não obstrua a visão.

#### `unblockScroll()`
- **Função:** Restaura a rolagem da página.
- **Ações:** Muitos sites chineses travam o `overflow` do `body` ou `html` quando um pop-up aparece. Este método força `overflow: auto !important` e remove classes de bloqueio conhecidas.

#### `injectBlockerCSS()`
- **Função:** Injeta uma folha de estilo global na página.
- **Ações:** Esconde preventivamente elementos de login via CSS e garante que o scroll esteja sempre habilitado, evitando o "piscar" de modais antes de serem removidos pelo JS.

#### `convertAllPrices()`
- **Função:** Varre a página em busca de elementos que correspondam aos seletores de preço definidos em `PRICE_SELECTORS`.

#### `convertElement(el)`
- **Função:** Processa um elemento individual para conversão.
- **Lógica:**
  1. Verifica se já foi processado (`data-brl-converted`).
  2. Usa expressões regulares (`YUAN_REGEX`) para extrair o valor em Yuan.
  3. Calcula o valor em Real com base na cotação salva.
  4. Cria um "badge" (pílula verde) com o valor convertido e o anexa ao lado do preço original.

#### `setupPriceObserver()`
- **Função:** Monitora mudanças no DOM.
- **Ações:** Como sites como o Xianyu carregam produtos via scroll infinito, este observer garante que novos preços sejam convertidos assim que aparecerem na tela.

---

## 📱 Interface de Usuário (popup.js)

Responsável por permitir que o usuário configure a extensão.

### Métodos Principais

#### `updateHint(val)`
- **Função:** Atualiza o texto de exemplo no popup em tempo real enquanto o usuário digita a cotação.
- **Exemplo:** Se o usuário digita `0.80`, o hint mostra `Ex: ¥ 100 = R$ 80.00`.

#### Listener `saveBtn`
- **Função:** Valida e salva as configurações.
- **Ações:** 
  1. Lê os valores dos inputs e checkboxes.
  2. Valida se a cotação é um número positivo.
  3. Salva no `chrome.storage.sync`.
  4. Envia uma mensagem (`UPDATE_SETTINGS`) via `chrome.tabs.sendMessage` para que a página aberta aplique as mudanças imediatamente sem precisar de recarregamento.

---

## 🎨 Identidade Visual

A extensão utiliza a paleta de cores **Panda Green**:
- **Principal:** `#27ae60` (Verde Esmeralda)
- **Secundária:** `#2ecc71` (Verde Claro)
- **Fundo:** `#0d0d0d` (Dark Mode)
- **Tipografia:** Syne (títulos) e DM Sans (corpo).

---

## 📋 Requisitos de Manutenção

Caso o site mude sua estrutura (seletores CSS), os seguintes pontos devem ser revisados:
1. `PRICE_SELECTORS` em `content.js`: Se os preços pararem de ser detectados.
2. `selectors` dentro de `removeLoginPopups()`: Se novos tipos de pop-ups de login começarem a aparecer.
