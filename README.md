# Panda Price 🐼

Extensão Chrome para compradores brasileiros em sites chineses (Xianyu).

## Funcionalidades

- 💱 **Conversão de preços** — Coloca o valor em R$ ao lado de cada preço em Yuan (¥)
- 🚫 **Bloqueio de pop-up de login** — Remove automaticamente os modais que pedem para você logar

## Como instalar 

1. Acesse a loja de extensões do chrome.
2. Busque por Panda Price.
3. Clique em "Usar no Chrome".


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

## Notas

- A cotação não é atualizada automaticamente — você precisa atualizar manualmente no popup
  
