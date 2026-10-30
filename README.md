# Panda Price

Extensão Google Chrome (Manifest V3) desenvolvida para compradores brasileiros no **Goofish (`goofish.com` / Xianyu / 闲鱼)**. Converte valores de Yuan (CNY) para Real (BRL) em tempo real com simulação de spread, traduz pesquisas do português para o vocabulário nativo chinês, bloqueia modais intrusivos de login sem interferir no Captcha de verificação e inspeciona anúncios contra armadilhas comuns.

---

## Principais Funcionalidades

### 1. Câmbio Automático CNY → BRL e Simulador de Spread
- **Sincronização automática em segundo plano:** busca a cotação comercial atualizada do Yuan a cada 3 horas com redundância em três provedores públicos (`AwesomeAPI`, `ExchangeRate-API` e `Frankfurter`), mantendo a opção de cotação manual personalizada.
- **Simulador de Spread / Taxa (`+%`):** permite adicionar o percentual cobrado por agentes de compra, IOF ou meios de pagamento (atalhos rápidos de `0%`, `+4%`, `+6%` e `+8%` ou valor livre), exibindo o custo real efetivo em cada anúncio.
- **Atualização instantânea sem recarregar a página:** qualquer alteração de cotação, spread ou preferência no popup recalcula imediatamente todas as etiquetas visíveis nas abas abertas do Goofish.

### 2. Bloqueio Inteligente de Login (Preservando o Captcha)
- **Navegação livre sem conta:** oculta modais de login forçado (`passport.goofish.com`, `mini_login`, máscaras cinzas de fundo) e destrava a rolagem da página automaticamente.
- **Preservação do Captcha de busca:** diferencia modais de autenticação dos desafios de verificação de segurança (`/punish` / slider *Baxia*), garantindo que as pesquisas retornem resultados normalmente.

### 3. Assistente de Busca Inteligente (Português → Chinês)
- **Tradução otimizada para e-commerce chinês:** combina um dicionário curado de hardware, consoles, smartphones, colecionáveis e vestuário com tradução automática híbrida, preservando códigos e modelos técnicos (ex.: `RTX 3070 8GB`, `iPhone 15 Pro`, `OLED`).
- **Filtros rápidos nativos do Xianyu:** adiciona termos estratégicos em 1 clique à pesquisa (`包邮` Frete Grátis, `99新` Quase Novo, `正品` Original, `箱说全` Com Caixa, `无拆无修` Sem Reparo, `个人自用` Uso Pessoal).
- **Acionamento nativo:** preenche e dispara a própria barra de busca React do Goofish para manter o estado da sessão sem acionar bloqueios.

### 4. Inspeção Anti-Cilada e Dicionário de Gírias do Xianyu
- **Etiquetas nos cards de busca e vitrine:** analisa títulos e sinaliza riscos, avisos e vantagens antes mesmo de abrir o anúncio.
- **Placa de Inspeção na página do produto:** exibe um resumo detalhado acima da descrição traduzindo os termos chineses encontrados no anúncio.
- **Análise sensível a negações em chinês:** reconhece prefixos negativos (`无`, `未`, `非`, `不`, `没有`) para evitar falsos alarmes em anúncios honestos (como `无暗病` — "sem defeito oculto" — ou `非矿卡` — "não usada em mineração").

| Categoria | Exemplos Detectados no Goofish |
| :--- | :--- |
| **Perigo / Cilada (Cinábrio)** | Sucata / Morto (`尸体`, `配件机`), Caixa Vazia (`空盒`, `仅盒子`), Modelo Cenográfico (`模型机`), Sinal / Link Reservado (`定金`, `专拍`), Defeito Oculto (`暗病`), Não Liga (`不开机`, `点不亮`), Dano por Água (`进水`), Defeito na Tela (`烧屏`, `漏液`, `绿线`), Bloqueio iCloud/Chip (`有锁`, `卡贴`, `ID锁`), Memória Adulterada (`扩容`), Réplica (`祖国版`, `华强北`), Placa de Mineração (`矿卡`) |
| **Atenção (Âmbar)** | Sem Devolução (`不退不换`), Frete Pago à Parte / Na Entrega (`不包邮`, `到付`), Marcas / Avarias (`瑕疵`, `划痕`, `战损`), Já Aberto / Peça Trocada (`有拆修`, `换过屏`, `换过电池`), Sem Caixa (`裸机`, `仅单机`), Fora da Garantia (`过保`), Preço Fixo (`不刀`, `一口价`) |
| **Condição Favorável (Jade)** | Frete Grátis na China (`包邮`), Original / Autêntico (`正品`, `验货宝`), Sem Reparos (`无拆无修`), Funcionando 100% (`功能正常`), Estado de Novo (`全新`, `99新`), Caixa Completa (`箱说全`), Em Garantia (`在保`), Versão Chinesa (`国行`), Versão Importada (`美版`, `港版`, `日版`), Aceita Negociar (`可小刀`), Uso Pessoal (`自用`) |

### 5. Identidade Visual Tradicional Chinesa
- Interface inspirada em artefatos clássicos de laca preta, vermelho cinábrio imperial, folha de ouro e jade celadon, com frisos geométricos *Huíwén* (`回纹`), cantoneiras tradicionais, selos caligráficos (`汇`, `屏`, `译`, `鉴`) e zero emojis.

---

## Como Instalar

### Pela Chrome Web Store
1. Acesse a Chrome Web Store e pesquise por **Panda Price**.
2. Clique em **Usar no Chrome**.

### Instalação Manual (Modo do Desenvolvedor)
1. Clone ou baixe este repositório:
   ```bash
   git clone https://github.com/J-Ednardo/Panda-Price.git
   ```
2. No navegador Google Chrome (ou Brave / Edge), acesse `chrome://extensions`.
3. Ative a chave **Modo do desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactação** e selecione a pasta `Panda-Price`.

---

## Como Usar

1. Clique no ícone do **Panda Price** na barra de extensões do navegador.
2. A cotação comercial do Yuan será sincronizada automaticamente (você também pode clicar em **Sincronizar** a qualquer momento ou digitar um valor manual).
3. Ajuste o **Spread / Taxa** caso utilize intermediários/agentes de compra ou cartão internacional.
4. Ative ou desative individualmente os módulos desejados e clique em **Salvar Configurações**.
5. Acesse [goofish.com](https://www.goofish.com) para navegar com preços convertidos em Reais, busca traduzida e inspeção automática de anúncios.

---

## Estrutura do Projeto

```text
Panda-Price/
├── manifest.json      # Configuração Manifest V3, permissões e subdomínios goofish.com
├── background.js      # Service worker: sincronização de câmbio (3 APIs) e tradutor PT -> ZH
├── popup.html         # Interface do popup em estilo tradicional chinês (laca, cinábrio e ouro)
├── popup.js           # Controle reativo de cotação, spread e preferências do usuário
├── content.js         # Conversão em tempo real, bloqueador de login, busca e inspeção anti-cilada
├── document.md        # Documentação técnica complementar
├── icons/             # Ícones da extensão (16x16, 48x48, 128x128)
├── LICENSE            # Licença do projeto
└── README.md          # Guia geral do projeto
```

---

## Privacidade e Performance

- **Escopo restrito:** o script de conteúdo é executado exclusivamente em `https://goofish.com/*` e `https://*.goofish.com/*`.
- **Baixo uso de CPU:** observadores de DOM operam em lotes agendados via `requestAnimationFrame` com separação de leituras e escritas e resiliência automática à hidratação do React.
- **Sem coleta de dados:** todas as preferências ficam salvas localmente na conta do navegador via `chrome.storage.sync`.

---

## Licença

Distribuído sob a licença descrita no arquivo [LICENSE](LICENSE).
