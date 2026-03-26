# Xianyu Helper BR 🇧🇷

Extensão Chrome para compradores brasileiros em sites chineses (Xianyu / Taobao).

## Funcionalidades

- 💱 **Conversão de preços** — Coloca o valor em R$ ao lado de cada preço em Yuan (¥)
- 🚫 **Bloqueio de pop-up de login** — Remove automaticamente os modais que pedem para você logar

## Como instalar (modo desenvolvedor)

1. Crie uma pasta chamada `xianyu-helper` e coloque todos os arquivos dentro
2. Crie uma subpasta `icons/` e adicione ícones PNG nos tamanhos 16x16, 48x48 e 128x128 (opcional, mas recomendado)
3. Abra o Chrome e acesse `chrome://extensions`
4. Ative o **Modo do desenvolvedor** (canto superior direito)
5. Clique em **"Carregar sem compactação"**
6. Selecione a pasta `xianyu-helper`
7. A extensão aparecerá na barra do Chrome!

## Como usar

1. Clique no ícone da extensão na barra do Chrome
2. Digite a cotação atual do Yuan (ex: `0.76` para ¥1 = R$0,76)
3. Ative/desative as funções pelos toggles
4. Clique em **Salvar configurações**
5. Acesse o Xianyu — os preços já aparecerão convertidos e os pop-ups não vão mais incomodar!

## Estrutura de arquivos

```
xianyu-helper/
├── manifest.json      # Configuração da extensão
├── popup.html         # Interface do popup
├── popup.js           # Lógica do popup
├── content.js         # Script que roda no site
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Ajustando os seletores de pop-up

O Xianyu pode atualizar as classes CSS dos pop-ups. Se o bloqueador parar de funcionar:

1. Abra o site, clique com botão direito no pop-up → **Inspecionar**
2. Identifique a classe do elemento (ex: `.new-login-modal`)
3. Adicione ao array de seletores em `content.js` na função `setupPopupBlocker()`

## Notas

- A cotação não é atualizada automaticamente — você precisa atualizar manualmente no popup
- A extensão funciona nos domínios `*.xianyu.taobao.com`, `2.taobao.com` e `*.taobao.com`
