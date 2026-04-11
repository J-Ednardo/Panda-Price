let settings = {
  yuanRate: 0,
  enableConversion: true,
  blockPopup: true
};

// ─── 1. CARREGA CONFIGURAÇÕES ──────────────────────────────────────────────
chrome.storage.sync.get(['yuanRate', 'enableConversion', 'blockPopup'], (data) => {
  settings.yuanRate = parseFloat(data.yuanRate) || 0;
  settings.enableConversion = data.enableConversion !== false;
  settings.blockPopup = data.blockPopup !== false;
  init();
});

// Escuta mudanças enviadas pelo popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_SETTINGS') {
    settings.yuanRate = msg.yuanRate;
    settings.enableConversion = msg.enableConversion;
    settings.blockPopup = msg.blockPopup;
    if (settings.enableConversion && settings.yuanRate > 0) {
      convertAllPrices();
    }
  }
});

// ─── 2. INICIALIZAÇÃO ──────────────────────────────────────────────────────
function init() {
  if (settings.blockPopup) {
    setupPopupBlocker();
  }
  if (settings.enableConversion && settings.yuanRate > 0) {
    convertAllPrices();
    setupPriceObserver();
  }
}

// ─── 3. BLOQUEIO DE POP-UP DE LOGIN ───────────────────────────────────────
function setupPopupBlocker() {
  injectBlockerCSS();

  const observer = new MutationObserver((mutations) => {
    let shouldUnblock = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            removeLoginPopups(node);
            shouldUnblock = true;
          }
        }
      } else if (mutation.type === 'attributes') {
        shouldUnblock = true;
      }
    }
    if (shouldUnblock) {
      unblockScroll();
      removeLoginPopups(document.body);
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  removeLoginPopups(document.body);
  unblockScroll();
}

function removeLoginPopups(root) {
  // Seletores comuns de pop-up de login
  const selectors = [
    '[class*="login-dialog"]',
    '[class*="loginDialog"]',
    '[class*="login-modal"]',
    '[class*="loginModal"]',
    '[class*="login-popup"]',
    '[class*="loginPopup"]',
    '[class*="login-mask"]',
    '[class*="loginMask"]',
    '[class*="login-layer"]',
    '[class*="J_loginDiag"]',
    '[id*="login-dialog"]',
    '[id*="loginDialog"]',
    '.sufei-dialog-wrap[style*="display: block"]',
    '[class*="sufei-dialog"]',
    '[class*="dialog-mask"][style*="display: block"]',
    '[class*="modal-overlay"]',
    '[class*="fish-login"]',
    '[class*="xianyu-login"]',
    '[class*="idle-login"]',
    '[class*="loginGuide"]',
    '[class*="login-guide"]',
    '[class*="not-login"]',
    '[class*="login-close"]'
  ];

  const combined = selectors.join(', ');
  try {
    const elements = root.querySelectorAll ? root.querySelectorAll(combined) : [];
    elements.forEach(el => {
      const closeBtn = el.querySelector('[class*="close"]') ||
                       el.querySelector('[aria-label="close"]') ||
                       el.querySelector('[aria-label="关闭"]');
      if (closeBtn) {
        closeBtn.click();
      }
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });

    unblockScroll();
  } catch (e) {

  }
}

function unblockScroll() {
  const elements = [document.documentElement, document.body];
  const scrollClasses = [
    'modal-open', 'noscroll', 'stop-scroll', 'lock-scroll', 
    'is-locked', 'main-scroll-disabled', 'body-fixed',
    '_no-scroll', 'no-scroll'
  ];
  
  elements.forEach(el => {
    if (!el) return;
    
    const style = window.getComputedStyle(el);
    if (style.overflow === 'hidden' || style.overflowY === 'hidden' || el.style.overflow === 'hidden') {
      el.style.setProperty('overflow', 'auto', 'important');
      el.style.setProperty('overflow-y', 'auto', 'important');
    }
    
    if (el.style.height === '100%' || el.style.height === '100vh') {
      el.style.setProperty('height', 'auto', 'important');
    }

    scrollClasses.forEach(cls => {
      if (el.classList.contains(cls)) {
        el.classList.remove(cls);
      }
    });
  });
}

function injectBlockerCSS() {
  if (document.getElementById('xianyu-helper-blocker-css')) return;
  const style = document.createElement('style');
  style.id = 'xianyu-helper-blocker-css';
  style.textContent = `
    /* Força o scroll em todos os níveis */
    html, body {
      overflow: auto !important;
      overflow-y: auto !important;
      height: auto !important;
      position: static !important;
    }

    /* Esconde modais de login e overlays */
    [class*="login-dialog"],
    [class*="loginDialog"],
    [class*="login-modal"],
    [class*="loginModal"],
    [class*="login-popup"],
    [class*="loginPopup"],
    [class*="login-mask"],
    [class*="loginMask"],
    [class*="login-layer"],
    [class*="J_loginDiag"],
    [id*="login-dialog"],
    [id*="loginDialog"],
    .sufei-dialog-wrap,
    [class*="sufei-dialog"],
    [class*="dialog-mask"],
    [class*="modal-overlay"],
    [class*="fish-login"],
    [class*="xianyu-login"],
    [class*="idle-login"],
    [class*="loginGuide"],
    [class*="login-guide"],
    [class*="not-login"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── 4. CONVERSÃO DE PREÇOS ────────────────────────────────────────────────

// Seletores de preço para Xianyu
const PRICE_SELECTORS = [
  '[class*="price"]',
  '[class*="Price"]',
  '[class*="amount"]',
  '[class*="Amount"]',
  '[class*="cost"]',
  '[class*="Cost"]',
  '[class*="money"]',
  '[class*="Money"]',
  '[class*="fish-price"]',
  '[class*="item-price"]',
  '[class*="sale-price"]',
  '[class*="goods-price"]',
  '[class*="price--"]',
  '.price-value' 
];


const YUAN_REGEX = /(?:[¥￥]\s*)(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)(?:\s*元)/;
const PROCESSED_ATTR = 'data-brl-converted';

function convertAllPrices() {
  const combined = PRICE_SELECTORS.join(', ');
  const elements = document.querySelectorAll(combined);
  elements.forEach(el => convertElement(el));
}

function convertElement(el) {
  if (el.getAttribute(PROCESSED_ATTR) || el.classList.contains('xianyu-brl-badge')) return;

  if (el.parentElement && el.parentElement.closest(`[${PROCESSED_ATTR}]`)) {
    el.setAttribute(PROCESSED_ATTR, 'true');
    return;
  }

  let text = (el.innerText || el.textContent || '').trim();
  if (!text) return;

  const numPart = '\\d+(?:[.,]\\d{1,2})?';
  const rangeWithSymbol = new RegExp(`(?:[¥￥]\\s*)(${numPart})\\s*-\\s*(?:[¥￥]\\s*)?(${numPart})|(${numPart})\\s*-\\s*(${numPart})(?:\\s*元)`);
  const rangePure = new RegExp(`^(${numPart})\\s*-\\s*(${numPart})$`);
  const numPure = new RegExp(`^${numPart}$`);

  let yuan1, yuan2;
  let isRange = false;
  let match;

  match = rangeWithSymbol.exec(text);
  if (match) {
    yuan1 = parseFloat((match[1] || match[3]).replace(',', '.'));
    yuan2 = parseFloat((match[2] || match[4]).replace(',', '.'));
    isRange = true;
  } else {
    match = YUAN_REGEX.exec(text);
    if (match) {
      const rawValue = match[1] || match[2] || (match[0].replace(/[¥￥元\s]/g, ''));
      yuan1 = parseFloat(rawValue.replace(',', '.'));
    } else {
      const isP = numPure.test(text);
      const isR = rangePure.test(text);
      
      if (isP || isR) {
        if (el.parentElement && el.parentElement.getAttribute(PROCESSED_ATTR)) {
          el.setAttribute(PROCESSED_ATTR, 'true');
          return;
        }

        const parentText = el.parentElement ? el.parentElement.innerText : '';
        const prevText = el.previousElementSibling ? el.previousElementSibling.innerText : '';
        
        const hasSymbolInContext = (/[¥￥元]/.test(parentText) && !parentText.includes('≈ R$')) || 
                                   (/[¥￥]/.test(prevText));

        if (hasSymbolInContext && parentText.length < 50) {
          if (isR) {
            const rMatch = rangePure.exec(text);
            yuan1 = parseFloat(rMatch[1].replace(',', '.'));
            yuan2 = parseFloat(rMatch[2].replace(',', '.'));
            isRange = true;
          } else {
            yuan1 = parseFloat(text.replace(',', '.'));
          }
        }
      }
    }
  }

  if (isNaN(yuan1) || yuan1 <= 0) return;

  const brl1 = (yuan1 * settings.yuanRate).toFixed(2);
  let brlDisplay = brl1;

  if (isRange && !isNaN(yuan2)) {
    const brl2 = (yuan2 * settings.yuanRate).toFixed(2);
    brlDisplay = `${brl1} - ${brl2}`;
  }

  // 3. LOGICA DE DIMENSIONAMENTO INTELIGENTE
  const originalStyle = window.getComputedStyle(el);
  const fontSizeNum = parseFloat(originalStyle.fontSize) || 14;
  const isMini = fontSizeNum < 16;

  const badge = document.createElement('span');
  badge.className = 'xianyu-brl-badge';
  badge.setAttribute('data-yuan', yuan1);
  
  badge.textContent = isMini ? `R$ ${brlDisplay}` : ` ≈ R$ ${brlDisplay}`;
  
  const padding = isMini ? '1px 6px' : '2px 10px';
  const fontSize = isMini ? '10px' : '12px';
  const margin = isMini ? '4px' : '8px';

  badge.style.cssText = `
    display: inline-block;
    margin-left: ${margin};
    padding: ${padding};
    background: #27ae60;
    color: #ffffff;
    border-radius: 100px;
    font-size: ${fontSize};
    font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    vertical-align: middle;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(39, 174, 96, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: default;
    transition: transform 0.2s ease;
  `;

  badge.onmouseenter = () => badge.style.transform = 'scale(1.05)';
  badge.onmouseleave = () => badge.style.transform = 'scale(1)';

  el.setAttribute(PROCESSED_ATTR, 'true');
  el.appendChild(badge);
}

function setupPriceObserver() {
  const observer = new MutationObserver((mutations) => {
    if (!settings.enableConversion || settings.yuanRate <= 0) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Verifica o próprio nó e seus filhos
          const combined = PRICE_SELECTORS.join(', ');
          if (node.matches && node.matches(combined)) {
            convertElement(node);
          }
          node.querySelectorAll && node.querySelectorAll(combined).forEach(el => convertElement(el));
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
