// ─── PANDA PRICE: CONTENT SCRIPT (GOOFISH.COM) ──────────────────────────────

let settings = {
  yuanRate: 0,
  spreadPercent: 0,
  autoRate: true,
  enableConversion: true,
  blockPopup: true,
  enableSearchHelper: true,
  enableSlangAlerts: true
};

let isInitialized = false;

// Estado dos observers e agendamentos (evita duplicação e loops de CPU)
let popupAttributeObserver = null;
let popupChildObserver = null;
let unblockRafId = null;

let priceObserver = null;
let priceRafId = null;
const pendingPriceNodes = new Set();

let slangObserver = null;
let slangRafId = null;
const pendingSlangNodes = new Set();
let lastObservedUrl = location.href;

// ─── SELETORES E EXPRESSÕES PRÉ-COMPILADOS ──────────────────────────────────
// Seletores exclusivos de modais/banners de login (seguros para ocultar via CSS)
// IMPORTANTE: Não incluir .sufei-dialog, .baxia-dialog (Captcha da busca) nem [class*="not-login"]
const DIRECT_LOGIN_SELECTORS = [
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
  '[class*="loginGuide"]',
  '[class*="login-guide"]',
  '[class*="loginBar"]',
  '[class*="bottomLead"]'
];
const COMBINED_DIRECT_LOGIN_SELECTOR = DIRECT_LOGIN_SELECTORS.join(', ');

// Seletores avaliados via JS para diferenciar modal de login vs. Captcha de verificação da busca
const CONDITIONAL_MODAL_SELECTORS = [
  '.baxia-dialog',
  '[class*="baxia-dialog"]',
  '.sufei-dialog-wrap',
  '[class*="sufei-dialog"]',
  '.ant-modal-root',
  '.ant-modal-wrap',
  '[class*="fish-login"]',
  '[class*="xianyu-login"]',
  '[class*="idle-login"]'
];
const COMBINED_ALL_MODAL_SELECTOR = [...DIRECT_LOGIN_SELECTORS, ...CONDITIONAL_MODAL_SELECTORS].join(', ');

const MODAL_WRAPPER_SELECTOR = '.baxia-dialog, [class*="baxia-dialog"], .sufei-dialog-wrap, [class*="sufei-dialog"], .ant-modal-root, .ant-modal-wrap';
const BACKDROP_MASK_SELECTOR = '.baxia-dialog-mask, .sufei-dialog-mask, .ant-modal-mask, [class*="dialog-mask"], [class*="modal-mask"], [class*="modal-overlay"], [class*="popup-mask"], [class*="login-mask"], [class*="loginMask"]';

// Importante: 'baxia' NÃO deve entrar em CAPTCHA_URL_REGEX pois o login mini_login também usa baxia-dialog
const LOGIN_URL_REGEX = /mini_login|passport\.goofish\.com|login\.taobao\.com|login\.alibaba\.com|havana/i;
const CAPTCHA_URL_REGEX = /punish|nocaptcha|captcha|x5sec|validate/i;

const SCROLL_LOCK_CLASSES = [
  'ant-modal-open', 'ant-scrolling-effect',
  'modal-open', 'noscroll', 'stop-scroll', 'lock-scroll',
  'is-locked', 'main-scroll-disabled', 'body-fixed',
  '_no-scroll', 'no-scroll'
];

// Seletores de preço para Goofish (Xianyu)
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
const COMBINED_PRICE_SELECTOR = PRICE_SELECTORS.join(', ');

// Seletores de cards de produto e descrição para alertas de gírias
const PRODUCT_CARD_SELECTORS = [
  'a[href*="/item?"]',
  'a[href*="/item.htm"]',
  'a[href*="detail.html"]',
  '[class*="feeds-item"]',
  '[class*="feed-item"]',
  '[class*="feeds-card"]',
  '[class*="feed-card"]',
  '[class*="cardWarp"]',
  '[class*="cardWrap"]',
  '[class*="card-wrap"]',
  '[class*="search-item-card"]',
  '[class*="Card--card"]',
  '[class*="item-card"]'
];
const COMBINED_CARD_SELECTOR = PRODUCT_CARD_SELECTORS.join(', ');

const DETAIL_DESC_SELECTORS = [
  '[class*="desc--"]',
  '[class*="desc-"]',
  '[class*="detail-desc"]',
  '[class*="item-desc"]',
  '[class*="description"]',
  '[class*="detail-content"]',
  '[class*="item-content"]'
];
const COMBINED_DETAIL_DESC_SELECTOR = DETAIL_DESC_SELECTORS.join(', ');

const NUM_PART = '\\d+(?:[.,]\\d{1,2})?';
const YUAN_REGEX = /(?:[¥￥]\s*)(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)(?:\s*元)/;
const RANGE_WITH_SYMBOL_REGEX = new RegExp(
  `(?:[¥￥]\\s*)(${NUM_PART})\\s*-\\s*(?:[¥￥]\\s*)?(${NUM_PART})|(${NUM_PART})\\s*-\\s*(${NUM_PART})(?:\\s*元)`
);
const RANGE_PURE_REGEX = new RegExp(`^(${NUM_PART})\\s*-\\s*(${NUM_PART})$`);
const NUM_PURE_REGEX = new RegExp(`^${NUM_PART}$`);

const PROCESSED_ATTR = 'data-brl-converted';
const BLOCKED_POPUP_ATTR = 'data-panda-blocked';
const SLANG_PROCESSED_ATTR = 'data-panda-slang-done';
const PANDA_UI_ATTR = 'data-panda-ui';

const BLOCKER_STYLE_ID = 'xianyu-helper-blocker-css';
const BADGE_STYLE_ID = 'panda-price-badge-css';
const SEARCH_STYLE_ID = 'panda-search-helper-css';
const SEARCH_ROOT_ID = 'panda-search-helper-root';
const SLANG_STYLE_ID = 'panda-slang-alerts-css';
const XRAY_PANEL_ID = 'panda-xray-panel';

const STORAGE_KEYS = [
  'yuanRate',
  'spreadPercent',
  'autoRate',
  'enableConversion',
  'blockPopup',
  'enableSearchHelper',
  'enableSlangAlerts'
];

// ─── DICIONÁRIO ANTI-CILADA E GÍRIAS DO XIANYU / GOOFISH ────────────────────
const DEFAULT_NEGATIONS = ['无', '没', '没有', '未', '未见', '非', '不是', '绝非', '拒绝', '不'];

function hasUnnegatedTerm(text, terms, negations = DEFAULT_NEGATIONS) {
  for (let t = 0; t < terms.length; t++) {
    const term = terms[t];
    let idx = text.indexOf(term);
    while (idx !== -1) {
      const prefix = text.slice(Math.max(0, idx - 2), idx);
      let negated = false;
      for (let n = 0; n < negations.length; n++) {
        if (prefix.endsWith(negations[n])) {
          negated = true;
          break;
        }
      }
      if (!negated) {
        return term;
      }
      idx = text.indexOf(term, idx + term.length);
    }
  }
  return null;
}

function hasExactAny(text, terms) {
  for (let i = 0; i < terms.length; i++) {
    if (text.includes(terms[i])) return terms[i];
  }
  return null;
}

const XIANYU_SLANG_RULES = [
  // PERIGO / CILADA (Prioridade máxima)
  {
    id: 'corpse',
    level: 'danger',
    label: 'Sucata / Morto',
    desc: 'Produto NÃO funciona ("cadáver"), vendido apenas para retirada de peças.',
    match: (txt) => hasUnnegatedTerm(txt, ['尸体', '当配件', '配件机'])
  },
  {
    id: 'empty-box',
    level: 'danger',
    label: 'Caixa Vazia',
    desc: 'Cuidado! Anúncio vendendo apenas a caixa/embalagem vazia, sem o produto.',
    match: (txt) => hasExactAny(txt, ['仅盒子', '空盒', '只有盒子', '只卖盒子', '空箱子'])
  },
  {
    id: 'dummy',
    level: 'danger',
    label: 'Modelo Cenográfico',
    desc: 'Aparelho maquete/vitrine sem componentes reais internos.',
    match: (txt) => hasUnnegatedTerm(txt, ['模型机', '展示模型', '仿真机'])
  },
  {
    id: 'deposit',
    level: 'danger',
    label: 'Sinal / Link Reservado',
    desc: 'Valor refere-se apenas a sinal/pré-venda ou link exclusivo para outro comprador.',
    match: (txt) => hasExactAny(txt, ['定金', '补款', '专拍', '勿拍', '乱拍不发'])
  },
  {
    id: 'hidden-defect',
    level: 'danger',
    label: 'Defeito Oculto',
    desc: 'O vendedor relata problema intermitente ou falha escondida ("暗病").',
    match: (txt) => hasUnnegatedTerm(txt, ['暗病'])
  },
  {
    id: 'broken',
    level: 'danger',
    label: 'Com Defeito / Não Liga',
    desc: 'Item avariado, com falha de funcionamento ou que não liga/não dá vídeo.',
    match: (txt) => hasExactAny(txt, ['不开机', '点不亮', '坏的', '坏了', '已坏', '掉盘', '炸机']) || hasUnnegatedTerm(txt, ['故障', '损坏'])
  },
  {
    id: 'water-damage',
    level: 'danger',
    label: 'Dano por Água',
    desc: 'Aparelho teve contato com água/líquido ("进水" / "泡水").',
    match: (txt) => hasUnnegatedTerm(txt, ['进水', '泡水'])
  },
  {
    id: 'screen-defect',
    level: 'danger',
    label: 'Defeito na Tela',
    desc: 'Tela com burn-in, vazamento, linha verde, falha de toque ou artefatos.',
    match: (txt) => hasUnnegatedTerm(txt, ['烧屏', '漏液', '绿线', '断触', '花屏', '碎屏'])
  },
  {
    id: 'locked',
    level: 'danger',
    label: 'Bloqueio Chip/iCloud',
    desc: 'Aparelho com bloqueio de operadora (RSIM/卡贴) ou conta/iCloud (ID锁).',
    match: (txt) => hasExactAny(txt, ['有锁', '卡贴机', '卡贴', '绕过机']) || hasUnnegatedTerm(txt, ['ID锁', '激活锁'])
  },
  {
    id: 'expanded-mem',
    level: 'danger',
    label: 'Memória Adulterada',
    desc: 'Armazenamento expandido via solda na placa ("扩容"), maior risco de defeito.',
    match: (txt) => hasUnnegatedTerm(txt, ['扩容机', '扩容'])
  },
  {
    id: 'replica',
    level: 'danger',
    label: 'Réplica / Recondicionado',
    desc: 'Item paralelo ("祖国版" / Huaqiangbei), cópia ou recondicionado.',
    match: (txt) => hasUnnegatedTerm(txt, ['祖国版', '高仿', '华强北', '翻新机', '翻新'])
  },
  {
    id: 'mining',
    level: 'danger',
    label: 'Usada em Mineração',
    desc: 'Placa de vídeo utilizada em mineração de criptomoedas ("矿卡").',
    match: (txt) => hasUnnegatedTerm(txt, ['矿卡', '锻炼过', '默认矿'])
  },

  // ATENÇÃO / CONDIÇÕES DO VENDEDOR
  {
    id: 'no-return',
    level: 'warn',
    label: 'Sem Devolução',
    desc: 'Vendedor não aceita devolução nem troca após o envio ("不退不换").',
    match: (txt) => hasExactAny(txt, ['不退不换', '售出不退', '概不退换'])
  },
  {
    id: 'shipping-extra',
    level: 'warn',
    label: 'Frete Pago à Parte',
    desc: 'Frete interno na China não incluso ou cobrado na entrega ("到付").',
    match: (txt) => hasExactAny(txt, ['不包邮', '邮费自理', '运费自理']) || hasUnnegatedTerm(txt, ['到付'])
  },
  {
    id: 'cosmetic-flaw',
    level: 'warn',
    label: 'Marcas / Avarias',
    desc: 'Possui marcas visíveis de uso, arranhões ou desgaste estético.',
    match: (txt) => hasExactAny(txt, ['伊拉克成色', '战损']) || hasUnnegatedTerm(txt, ['瑕疵', '划痕', '磕碰'])
  },
  {
    id: 'repaired',
    level: 'warn',
    label: 'Já Aberto / Peça Trocada',
    desc: 'Item já passou por abertura, manutenção ou troca de bateria/tela.',
    match: (txt) => hasExactAny(txt, ['有拆修', '修过', '换过电池', '换过屏', '换过屏幕', '第三方电池'])
  },
  {
    id: 'bare-item',
    level: 'warn',
    label: 'Só o Aparelho (Sem Caixa)',
    desc: 'Vendido avulso ("单机" / "裸机"), sem caixa original ou acessórios.',
    match: (txt) => hasUnnegatedTerm(txt, ['裸机', '单机无配件', '无盒无配件', '仅单机', '无包装'])
  },
  {
    id: 'out-of-warranty',
    level: 'warn',
    label: 'Fora da Garantia',
    desc: 'Garantia oficial de fábrica na China já expirada ("过保").',
    match: (txt) => hasUnnegatedTerm(txt, ['过保'])
  },
  {
    id: 'firm-price',
    level: 'warn',
    label: 'Preço Fixo',
    desc: 'Vendedor informa que não aceita oferta ou pechincha ("不刀" / "一口价").',
    match: (txt) => hasExactAny(txt, ['不刀', '勿刀', '不接刀', '一口价', '谢绝还价'])
  },

  // SELOS POSITIVOS / VANTAGENS E INFORMAÇÕES ÚTEIS
  {
    id: 'free-shipping',
    level: 'good',
    label: 'Frete Grátis (CN)',
    desc: 'Frete doméstico grátis na China até o armazém do seu agente ("包邮").',
    match: (txt) => hasUnnegatedTerm(txt, ['包邮'])
  },
  {
    id: 'authentic',
    level: 'good',
    label: 'Original / Autêntico',
    desc: 'Vendedor declara produto original ("正品") ou aceita inspeção oficial.',
    match: (txt) => hasUnnegatedTerm(txt, ['正品', '保真', '支持验货', '验货宝', '原装正品'])
  },
  {
    id: 'no-repair',
    level: 'good',
    label: 'Sem Reparos',
    desc: 'Nunca foi aberto nem consertado; componentes originais ("无拆无修").',
    match: (txt) => hasExactAny(txt, ['无拆无修', '无拆修', '全原装', '纯原装'])
  },
  {
    id: 'working-fine',
    level: 'good',
    label: 'Funcionando 100%',
    desc: 'Vendedor informa que todas as funções estão normais ("功能正常").',
    match: (txt) => hasUnnegatedTerm(txt, ['功能正常', '一切正常', '完美运行', '功能完好'])
  },
  {
    id: 'like-new',
    level: 'good',
    label: 'Estado de Novo',
    desc: 'Produto lacrado, apenas aberto ou impecável ("全新" / "99新").',
    match: (txt) => hasExactAny(txt, ['全新未拆', '全新', '充新', '99新', '98新', '95新', '仅拆封', '仅拆'])
  },
  {
    id: 'full-box',
    level: 'good',
    label: 'Caixa Completa',
    desc: 'Acompanha caixa original, manuais e acessórios ("箱说全").',
    match: (txt) => hasExactAny(txt, ['箱说全', '盒说全', '全套包装', '包装齐全', '原盒', '带箱说'])
  },
  {
    id: 'in-warranty',
    level: 'good',
    label: 'Em Garantia (CN)',
    desc: 'Ainda dentro do período de garantia oficial na China ("在保").',
    match: (txt) => hasUnnegatedTerm(txt, ['在保', '保修期内', '全国联保'])
  },
  {
    id: 'cn-version',
    level: 'good',
    label: 'Versão Chinesa (国行)',
    desc: 'Modelo oficial comercializado na China continental ("国行").',
    match: (txt) => hasUnnegatedTerm(txt, ['国行'])
  },
  {
    id: 'intl-version',
    level: 'good',
    label: 'Versão Importada',
    desc: 'Modelo internacional (EUA/HK/Japão/Europa/TW) — verifique compatibilidade.',
    match: (txt) => hasUnnegatedTerm(txt, ['港版', '美版', '日版', '欧版', '韩版', '台版', '海外版'])
  },
  {
    id: 'negotiable',
    level: 'good',
    label: 'Aceita Negociar',
    desc: 'Vendedor aceita negociar um pequeno desconto no chat ("可小刀").',
    match: (txt) => (!hasExactAny(txt, ['不刀', '勿刀', '不接刀']) ? hasExactAny(txt, ['可小刀', '可刀']) : null)
  },
  {
    id: 'personal-use',
    level: 'good',
    label: 'Uso Pessoal',
    desc: 'Item de uso próprio do vendedor ("自用").',
    match: (txt) => hasUnnegatedTerm(txt, ['个人自用', '女生自用', '一手自用', '自用闲置', '家里闲置', '自用'])
  }
];

const SEARCH_QUICK_TAGS = [
  { zh: '包邮', label: 'Frete Grátis' },
  { zh: '99新', label: 'Quase Novo' },
  { zh: '正品', label: 'Original' },
  { zh: '箱说全', label: 'Com Caixa' },
  { zh: '无拆无修', label: 'Sem Reparo' },
  { zh: '个人自用', label: 'Uso Pessoal' }
];

// ─── 1. CARREGA E SINCRONIZA CONFIGURAÇÕES ──────────────────────────────────
function isPandaNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.hasAttribute && node.hasAttribute(PANDA_UI_ATTR)) return true;
  if (node.classList && node.classList.contains('xianyu-brl-badge')) return true;
  if (node.closest && node.closest(`[${PANDA_UI_ATTR}]`)) return true;
  return false;
}

function getEffectiveRate() {
  const base = settings.yuanRate || 0;
  if (base <= 0) return 0;
  const spread = Math.max(0, settings.spreadPercent || 0);
  return base * (1 + spread / 100);
}

chrome.storage.sync.get(STORAGE_KEYS, (data) => {
  settings.yuanRate = parseFloat(data.yuanRate) || 0;
  settings.spreadPercent = Math.max(0, parseFloat(data.spreadPercent) || 0);
  settings.autoRate = data.autoRate !== false;
  settings.enableConversion = data.enableConversion !== false;
  settings.blockPopup = data.blockPopup !== false;
  settings.enableSearchHelper = data.enableSearchHelper !== false;
  settings.enableSlangAlerts = data.enableSlangAlerts !== false;
  isInitialized = true;

  init();

  // Caso ainda não haja cotação salva em instalação limpa, busca automaticamente em background
  if (settings.yuanRate <= 0 && settings.autoRate) {
    chrome.runtime.sendMessage({ type: 'FETCH_YUAN_RATE', force: false, setAutoRate: true }, () => {
      void chrome.runtime.lastError;
    });
  }
});

// Escuta mudanças enviadas diretamente pelo popup na aba ativa
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'UPDATE_SETTINGS') {
    updateSettingsState(msg);
  }
});

// Sincroniza automaticamente outras abas abertas e atualizações do background
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !isInitialized) return;

  const next = { ...settings };
  for (let i = 0; i < STORAGE_KEYS.length; i++) {
    const key = STORAGE_KEYS[i];
    if (changes[key] !== undefined) {
      next[key] = changes[key].newValue;
    }
  }
  updateSettingsState(next);
});

function updateSettingsState(next) {
  const nextRate = parseFloat(next.yuanRate) || 0;
  const nextSpread = Math.max(0, parseFloat(next.spreadPercent) || 0);
  const nextAuto = next.autoRate !== false;
  const nextConversion = next.enableConversion !== false;
  const nextBlockPopup = next.blockPopup !== false;
  const nextSearchHelper = next.enableSearchHelper !== false;
  const nextSlangAlerts = next.enableSlangAlerts !== false;

  const priceChanged =
    nextRate !== settings.yuanRate ||
    nextSpread !== settings.spreadPercent ||
    nextConversion !== settings.enableConversion;
  const popupChanged = nextBlockPopup !== settings.blockPopup;
  const searchChanged = nextSearchHelper !== settings.enableSearchHelper;
  const slangChanged = nextSlangAlerts !== settings.enableSlangAlerts;

  settings.yuanRate = nextRate;
  settings.spreadPercent = nextSpread;
  settings.autoRate = nextAuto;
  settings.enableConversion = nextConversion;
  settings.blockPopup = nextBlockPopup;
  settings.enableSearchHelper = nextSearchHelper;
  settings.enableSlangAlerts = nextSlangAlerts;

  if (popupChanged) syncPopupBlocker();
  if (priceChanged) syncPriceConversion();
  if (searchChanged) syncSearchHelper();
  if (slangChanged) syncSlangAlerts();
}

// ─── 2. INICIALIZAÇÃO E ORQUESTRAÇÃO REATIVA ────────────────────────────────
let hydrationSweepsScheduled = false;

function scheduleHydrationSweeps() {
  if (hydrationSweepsScheduled) return;
  hydrationSweepsScheduled = true;

  const delays = [350, 750, 1400, 2600, 4200];
  for (let i = 0; i < delays.length; i++) {
    setTimeout(() => {
      if (settings.enableConversion) convertAllPrices();
      if (settings.enableSlangAlerts) scanAllSlangTargets();
    }, delays[i]);
  }

  // Monitora scroll com throttle para páginas infinitas / carrosséis / feed contínuo
  let scrollThrottle = null;
  window.addEventListener('scroll', () => {
    if (scrollThrottle !== null) return;
    scrollThrottle = setTimeout(() => {
      scrollThrottle = null;
      if (settings.enableConversion) convertAllPrices();
      if (settings.enableSlangAlerts) scanAllSlangTargets();
    }, 280);
  }, { passive: true });
}

function init() {
  syncPopupBlocker();
  syncPriceConversion();
  syncSearchHelper();
  syncSlangAlerts();
  scheduleHydrationSweeps();
}

function syncPopupBlocker() {
  if (settings.blockPopup) {
    setupPopupBlocker();
  } else {
    stopPopupBlocker();
  }
}

function syncPriceConversion() {
  if (settings.enableConversion && getEffectiveRate() > 0) {
    injectBadgeCSS();
    updateExistingBadges();
    convertAllPrices();
    setupPriceObserver();
  } else {
    stopPriceObserver();
    clearAllConvertedPrices();
  }
}

function syncSearchHelper() {
  if (settings.enableSearchHelper) {
    setupSearchHelper();
  } else {
    removeSearchHelper();
  }
}

function syncSlangAlerts() {
  if (settings.enableSlangAlerts) {
    injectSlangCSS();
    scanAllSlangTargets();
    setupSlangObserver();
  } else {
    stopSlangObserver();
    clearAllSlangAlerts();
  }
}

// ─── 3. BLOQUEIO DE POP-UP DE LOGIN (PRESERVANDO CAPTCHA DA BUSCA) ──────────
function setupPopupBlocker() {
  injectBlockerCSS();

  if (document.body) {
    removeLoginPopups(document.body);
  }
  unblockScroll();

  if (!popupAttributeObserver) {
    popupAttributeObserver = new MutationObserver(() => {
      if (!settings.blockPopup) return;
      scheduleUnblockScroll();
    });

    popupAttributeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    if (document.body) {
      popupAttributeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  if (!popupChildObserver && document.body) {
    popupChildObserver = new MutationObserver((mutations) => {
      if (!settings.blockPopup) return;
      let foundPopup = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isPandaNode(node)) continue;
          if (node.tagName === 'STYLE') continue;

          if (removeLoginPopups(node)) {
            foundPopup = true;
          }

          // Caso um iframe de login seja injetado dentro de um .baxia-dialog/.sufei-dialog já existente
          if (node.tagName === 'IFRAME' || (node.querySelector && node.querySelector('iframe'))) {
            const parentModal = node.closest ? node.closest(MODAL_WRAPPER_SELECTOR) : null;
            if (parentModal && removeLoginPopups(parentModal)) {
              foundPopup = true;
            }
          }
        }
      }

      if (foundPopup) {
        scheduleUnblockScroll();
      }
    });

    popupChildObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

function stopPopupBlocker() {
  if (popupAttributeObserver) {
    popupAttributeObserver.disconnect();
    popupAttributeObserver = null;
  }
  if (popupChildObserver) {
    popupChildObserver.disconnect();
    popupChildObserver = null;
  }
  if (unblockRafId !== null) {
    cancelAnimationFrame(unblockRafId);
    unblockRafId = null;
  }
  const styleEl = document.getElementById(BLOCKER_STYLE_ID);
  if (styleEl) styleEl.remove();
}

function isCaptchaModal(el) {
  if (!el || !el.querySelector) return false;
  if (el.querySelector('#nc_1_n1z, [class*="nc-container"], [id*="nocaptcha"], [class*="baxia-punish"]')) {
    return true;
  }
  const iframes = el.tagName === 'IFRAME' ? [el] : el.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const src = iframes[i].getAttribute('src') || iframes[i].src || '';
    if (!src) continue;
    // Se a URL for claramente de login (ex: passport.goofish.com/mini_login), NÃO é Captcha
    if (LOGIN_URL_REGEX.test(src) && !/punish|nocaptcha/i.test(src)) {
      return false;
    }
    if (CAPTCHA_URL_REGEX.test(src)) {
      return true;
    }
  }
  return false;
}

function isMainPageContainer(el) {
  if (!el || el === document.body || el === document.documentElement) return true;
  if (el.id === 'root' || el.id === 'app' || el.id === 'ice-container') return true;
  if (el.tagName === 'MAIN' || el.tagName === 'HEADER') return true;
  if (el.querySelector && el.querySelector('[class*="feeds-list"], [class*="search-container"], [class*="search-result"]')) {
    return true;
  }
  return false;
}

function applyHiddenStyles(target) {
  if (!target || target.hasAttribute(BLOCKED_POPUP_ATTR) || isMainPageContainer(target)) return;
  target.setAttribute(BLOCKED_POPUP_ATTR, 'true');
  target.style.setProperty('display', 'none', 'important');
  target.style.setProperty('visibility', 'hidden', 'important');
  target.style.setProperty('opacity', '0', 'important');
  target.style.setProperty('pointer-events', 'none', 'important');
}

function hideLoginElement(el) {
  if (!el || el.hasAttribute(BLOCKED_POPUP_ATTR)) return;

  // Não executamos closeBtn.click() para não disparar ERR_BAXIA_CANCEL / onCancel da busca
  applyHiddenStyles(el);

  // Se estiver dentro de um portal de modal (.baxia-dialog, .sufei-dialog-wrap, .ant-modal-root),
  // esconde o container inteiro (eliminando também a máscara cinza e o loading infinito)
  const outerModal = el.closest ? el.closest(MODAL_WRAPPER_SELECTOR) : null;
  if (outerModal && outerModal !== el && !isMainPageContainer(outerModal) && !isCaptchaModal(outerModal)) {
    applyHiddenStyles(outerModal);
  }

  // Esconde máscaras cinzas irmãs (tela cinza de fundo) associadas ao modal de login
  const prev = el.previousElementSibling;
  if (prev && prev.matches && prev.matches(BACKDROP_MASK_SELECTOR)) {
    applyHiddenStyles(prev);
  }
  const next = el.nextElementSibling;
  if (next && next.matches && next.matches(BACKDROP_MASK_SELECTOR)) {
    applyHiddenStyles(next);
  }

  const parent = el.parentElement;
  if (parent && parent !== document.body && !isMainPageContainer(parent) && !isCaptchaModal(parent)) {
    const masks = parent.querySelectorAll ? parent.querySelectorAll(BACKDROP_MASK_SELECTOR) : [];
    for (let i = 0; i < masks.length; i++) {
      applyHiddenStyles(masks[i]);
    }
  }

  // Limpa qualquer máscara cinza órfã em portais separados (desde que não haja Captcha aberto)
  if (document.body && !isCaptchaModal(document.body)) {
    const orphanMasks = document.body.querySelectorAll(BACKDROP_MASK_SELECTOR);
    for (let i = 0; i < orphanMasks.length; i++) {
      applyHiddenStyles(orphanMasks[i]);
    }
  }
}

function watchIframeForLoginUrl(iframe, modalEl) {
  if (!iframe || iframe.hasAttribute('data-panda-watched')) return;
  iframe.setAttribute('data-panda-watched', 'true');

  const evaluateNow = () => {
    if (!settings.blockPopup || modalEl.hasAttribute(BLOCKED_POPUP_ATTR)) return true;
    if (shouldBlockModalElement(modalEl)) {
      hideLoginElement(modalEl);
      scheduleUnblockScroll();
      return true;
    }
    return isCaptchaModal(modalEl);
  };

  // Observa mudança imediata do atributo src sem esperar o carregamento lento do servidor chinês
  const srcObserver = new MutationObserver(() => {
    if (evaluateNow()) {
      srcObserver.disconnect();
    }
  });
  srcObserver.observe(iframe, { attributes: true, attributeFilter: ['src'] });

  iframe.addEventListener('load', () => {
    evaluateNow();
    srcObserver.disconnect();
  }, { once: true });

  // Verificação rápida de segurança após 80ms e 300ms
  setTimeout(() => {
    if (evaluateNow()) srcObserver.disconnect();
  }, 80);
  setTimeout(() => {
    if (evaluateNow()) srcObserver.disconnect();
  }, 300);
}

function shouldBlockModalElement(el) {
  if (!el || isMainPageContainer(el) || isCaptchaModal(el)) {
    return false;
  }

  if (el.matches && el.matches(COMBINED_DIRECT_LOGIN_SELECTOR)) {
    return true;
  }

  if (el.matches && el.matches(MODAL_WRAPPER_SELECTOR)) {
    if (el.querySelector && el.querySelector(COMBINED_DIRECT_LOGIN_SELECTOR)) {
      return true;
    }

    const iframes = el.querySelectorAll ? el.querySelectorAll('iframe') : [];
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      const src = iframe.getAttribute('src') || iframe.src || '';
      if (src && LOGIN_URL_REGEX.test(src) && !/punish|nocaptcha/i.test(src)) {
        return true;
      }
      if (!src || src === 'about:blank') {
        watchIframeForLoginUrl(iframe, el);
      }
    }
    return false;
  }

  return true;
}

function removeLoginPopups(root) {
  if (!root) return false;
  let blockedAny = false;

  try {
    const matches = [];
    if (root.matches && root.matches(COMBINED_ALL_MODAL_SELECTOR)) {
      matches.push(root);
    }
    if (root.querySelectorAll) {
      const descendants = root.querySelectorAll(COMBINED_ALL_MODAL_SELECTOR);
      for (let i = 0; i < descendants.length; i++) {
        matches.push(descendants[i]);
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const el = matches[i];
      if (el.hasAttribute(BLOCKED_POPUP_ATTR)) continue;

      if (shouldBlockModalElement(el)) {
        hideLoginElement(el);
        blockedAny = true;
      }
    }
  } catch (_e) {
    // Ignora seletores inválidos em nós isolados
  }

  return blockedAny;
}

function scheduleUnblockScroll() {
  if (unblockRafId !== null) return;
  unblockRafId = requestAnimationFrame(() => {
    unblockRafId = null;
    if (settings.blockPopup) {
      unblockScroll();
    }
  });
}

function unblockScroll() {
  const elements = [document.documentElement, document.body];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;

    for (let j = 0; j < SCROLL_LOCK_CLASSES.length; j++) {
      const cls = SCROLL_LOCK_CLASSES[j];
      if (el.classList.contains(cls)) {
        el.classList.remove(cls);
      }
    }

    const inlineOverflow = el.style.overflow;
    const inlineOverflowY = el.style.overflowY;
    if (inlineOverflow === 'hidden' || inlineOverflowY === 'hidden') {
      el.style.setProperty('overflow', 'auto', 'important');
      el.style.setProperty('overflow-y', 'auto', 'important');
    } else {
      const computed = window.getComputedStyle(el);
      if (computed.overflow === 'hidden' || computed.overflowY === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
      }
    }

    if (el.style.position === 'fixed') {
      el.style.setProperty('position', 'static', 'important');
    }
  }
}

function injectBlockerCSS() {
  if (document.getElementById(BLOCKER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BLOCKER_STYLE_ID;
  style.textContent = `
    html, body {
      overflow-y: auto !important;
    }

    ${COMBINED_DIRECT_LOGIN_SELECTOR} {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// ─── 4. CONVERSÃO DE PREÇOS (COM SPREAD E ATUALIZAÇÃO REATIVA) ──────────────
function injectBadgeCSS() {
  if (document.getElementById(BADGE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BADGE_STYLE_ID;
  style.textContent = `
    .xianyu-brl-badge {
      display: inline-block !important;
      margin-left: 7px !important;
      padding: 2px 8px 2px 7px !important;
      background: linear-gradient(135deg, #1E1310 0%, #120B09 100%) !important;
      color: #F2D27A !important;
      border-radius: 3px !important;
      border: 1px solid rgba(212, 175, 55, 0.58) !important;
      border-left: 2.5px solid #C9372C !important;
      font-size: 11.5px !important;
      line-height: 1.35 !important;
      font-weight: 700 !important;
      font-variant-numeric: tabular-nums !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      vertical-align: middle !important;
      white-space: nowrap !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 240, 200, 0.08) !important;
      cursor: help !important;
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease !important;
    }
    .xianyu-brl-badge.xianyu-brl-badge--mini {
      margin-left: 4px !important;
      padding: 1px 6px 1px 5px !important;
      font-size: 10px !important;
      border-left-width: 2px !important;
    }
    .xianyu-brl-badge:hover {
      transform: translateY(-1px) !important;
      border-color: #EDD07A !important;
      border-left-color: #E04338 !important;
      box-shadow: 0 3px 10px rgba(184, 41, 33, 0.30) !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function formatBadgeText(yuan1, yuan2, effectiveRate, isMini) {
  const brl1 = (yuan1 * effectiveRate).toFixed(2);
  const brlDisplay = !isNaN(yuan2) && yuan2 > 0
    ? `${brl1} - ${(yuan2 * effectiveRate).toFixed(2)}`
    : brl1;
  return isMini ? `R$ ${brlDisplay}` : ` ≈ R$ ${brlDisplay}`;
}

function formatBadgeTooltip(yuan1, yuan2) {
  const base = settings.yuanRate || 0;
  const spread = Math.max(0, settings.spreadPercent || 0);
  const eff = getEffectiveRate();
  const yuanLabel = !isNaN(yuan2) && yuan2 > 0 ? `¥ ${yuan1} - ${yuan2}` : `¥ ${yuan1}`;
  const brlLabel = !isNaN(yuan2) && yuan2 > 0
    ? `R$ ${(yuan1 * eff).toFixed(2)} - ${(yuan2 * eff).toFixed(2)}`
    : `R$ ${(yuan1 * eff).toFixed(2)}`;

  if (spread > 0) {
    return `${yuanLabel} × R$ ${base.toFixed(4)} (+${spread}% spread) = ${brlLabel}`;
  }
  return `${yuanLabel} × R$ ${base.toFixed(4)} = ${brlLabel}`;
}

function updateExistingBadges() {
  const effectiveRate = getEffectiveRate();
  if (effectiveRate <= 0) return;

  const badges = document.querySelectorAll('.xianyu-brl-badge');
  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    const yuan1 = parseFloat(badge.getAttribute('data-yuan'));
    if (isNaN(yuan1) || yuan1 <= 0) continue;

    const rawYuan2 = badge.getAttribute('data-yuan-max');
    const yuan2 = rawYuan2 ? parseFloat(rawYuan2) : NaN;
    const isMini = badge.getAttribute('data-mini') === '1';

    const nextText = formatBadgeText(yuan1, yuan2, effectiveRate, isMini);
    if (badge.textContent !== nextText) {
      badge.textContent = nextText;
    }
    badge.title = formatBadgeTooltip(yuan1, yuan2);
  }
}

function clearAllConvertedPrices() {
  const badges = document.querySelectorAll('.xianyu-brl-badge');
  for (let i = 0; i < badges.length; i++) {
    badges[i].remove();
  }
  const converted = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
  for (let i = 0; i < converted.length; i++) {
    converted[i].removeAttribute(PROCESSED_ATTR);
  }
}

function convertAllPrices() {
  if (!settings.enableConversion || getEffectiveRate() <= 0) return;
  const elements = document.querySelectorAll(COMBINED_PRICE_SELECTOR);
  convertElementsBatch(elements);
}

function hasActivePriceBadge(el) {
  if (!el || !el.querySelector) return false;
  const b = el.querySelector('.xianyu-brl-badge');
  return Boolean(b && b.isConnected);
}

function hasProcessedOrPlannedAncestor(el, plannedSet) {
  let curr = el.parentElement;
  while (curr) {
    if (plannedSet.has(curr)) {
      return true;
    }
    if (curr.hasAttribute(PROCESSED_ATTR)) {
      if (hasActivePriceBadge(curr)) {
        return true;
      }
      // Se o ancestral tinha o atributo fantasma mas o badge sumiu, limpa o atributo
      curr.removeAttribute(PROCESSED_ATTR);
    }
    curr = curr.parentElement;
  }
  return false;
}

function convertElementsBatch(elements) {
  if (!elements || elements.length === 0) return;
  const effectiveRate = getEffectiveRate();
  if (effectiveRate <= 0) return;

  const plannedSet = new Set();
  const plannedContextParents = new Set();
  const staleProcessed = [];
  const toRender = [];

  // FASE 1: Somente leituras do DOM/Layout
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el || !el.isConnected) continue;
    if (isPandaNode(el)) continue;

    // Se o elemento foi marcado anteriormente:
    if (el.hasAttribute(PROCESSED_ATTR)) {
      if (hasActivePriceBadge(el)) {
        continue; // Badge ativo e presente no DOM
      }
      // O badge desapareceu (React hydration/re-render removeu)!
      // Limpa a marcação para re-injetar nesta mesma rodada
      el.removeAttribute(PROCESSED_ATTR);
    }

    if (hasProcessedOrPlannedAncestor(el, plannedSet)) continue;
    if (hasActivePriceBadge(el)) continue;

    let text = (el.innerText || el.textContent || '').trim();
    if (text.includes('R$')) {
      const pandaNodes = el.querySelectorAll ? el.querySelectorAll(`[${PANDA_UI_ATTR}], .xianyu-brl-badge`) : [];
      for (let p = 0; p < pandaNodes.length; p++) {
        const pTxt = pandaNodes[p].textContent || '';
        if (pTxt) text = text.replace(pTxt, ' ');
      }
      text = text.trim();
    }
    if (!text) continue;

    let yuan1 = NaN;
    let yuan2 = NaN;
    let isRange = false;

    let match = RANGE_WITH_SYMBOL_REGEX.exec(text);
    if (match) {
      yuan1 = parseFloat((match[1] || match[3]).replace(',', '.'));
      yuan2 = parseFloat((match[2] || match[4]).replace(',', '.'));
      isRange = true;
    } else {
      match = YUAN_REGEX.exec(text);
      if (match) {
        const rawValue = match[1] || match[2] || match[0].replace(/[¥￥元\s]/g, '');
        yuan1 = parseFloat(rawValue.replace(',', '.'));
      } else {
        const isP = NUM_PURE_REGEX.test(text);
        const isR = !isP && RANGE_PURE_REGEX.test(text);

        if (isP || isR) {
          const parent = el.parentElement;
          if (
            parent &&
            !parent.hasAttribute(PROCESSED_ATTR) &&
            !plannedSet.has(parent) &&
            !plannedContextParents.has(parent) &&
            !hasActivePriceBadge(parent)
          ) {
            const parentText = parent.innerText || '';
            const prevText = el.previousElementSibling ? (el.previousElementSibling.innerText || '') : '';
            const hasSymbolInContext = /[¥￥元]/.test(parentText) || /[¥￥]/.test(prevText);

            if (hasSymbolInContext && parentText.length < 50) {
              if (isR) {
                const rMatch = RANGE_PURE_REGEX.exec(text);
                yuan1 = parseFloat(rMatch[1].replace(',', '.'));
                yuan2 = parseFloat(rMatch[2].replace(',', '.'));
                isRange = true;
              } else {
                yuan1 = parseFloat(text.replace(',', '.'));
              }
              if (!isNaN(yuan1) && yuan1 > 0) {
                plannedContextParents.add(parent);
              }
            }
          }
        }
      }
    }

    if (isNaN(yuan1) || yuan1 <= 0) continue;

    const fontSizeNum = parseFloat(window.getComputedStyle(el).fontSize) || 14;
    const isMini = fontSizeNum < 16;

    plannedSet.add(el);
    toRender.push({
      el,
      yuan1,
      yuan2: isRange && !isNaN(yuan2) ? yuan2 : NaN,
      isMini
    });
  }

  // FASE 2: Somente escritas no DOM
  for (let i = 0; i < staleProcessed.length; i++) {
    if (!plannedSet.has(staleProcessed[i])) {
      staleProcessed[i].removeAttribute(PROCESSED_ATTR);
    }
  }

  for (let i = 0; i < toRender.length; i++) {
    const { el, yuan1, yuan2, isMini } = toRender[i];
    if (!el.isConnected) continue;

    // Se já tiver badge antigo dentro dele, remove antes de inserir o novo
    const old = el.querySelectorAll ? el.querySelectorAll('.xianyu-brl-badge') : [];
    for (let o = 0; o < old.length; o++) {
      old[o].remove();
    }

    const badge = document.createElement('span');
    badge.className = isMini ? 'xianyu-brl-badge xianyu-brl-badge--mini' : 'xianyu-brl-badge';
    badge.setAttribute(PANDA_UI_ATTR, 'true');
    badge.setAttribute('data-yuan', String(yuan1));
    if (!isNaN(yuan2) && yuan2 > 0) {
      badge.setAttribute('data-yuan-max', String(yuan2));
    }
    badge.setAttribute('data-mini', isMini ? '1' : '0');
    badge.textContent = formatBadgeText(yuan1, yuan2, effectiveRate, isMini);
    badge.title = formatBadgeTooltip(yuan1, yuan2);

    el.setAttribute(PROCESSED_ATTR, 'true');
    el.appendChild(badge);
  }
}

function flushPendingPriceNodes() {
  priceRafId = null;
  if (!settings.enableConversion || getEffectiveRate() <= 0) {
    pendingPriceNodes.clear();
    return;
  }

  const candidateSet = new Set();
  for (const node of pendingPriceNodes) {
    if (!node.isConnected || isPandaNode(node)) continue;
    if (node.matches && node.matches(COMBINED_PRICE_SELECTOR)) {
      candidateSet.add(node);
    }
    if (node.querySelectorAll) {
      const descendants = node.querySelectorAll(COMBINED_PRICE_SELECTOR);
      for (let i = 0; i < descendants.length; i++) {
        candidateSet.add(descendants[i]);
      }
    }
  }
  pendingPriceNodes.clear();

  if (candidateSet.size > 0) {
    convertElementsBatch(Array.from(candidateSet));
  }
}

function setupPriceObserver() {
  if (priceObserver || !document.body) return;

  priceObserver = new MutationObserver((mutations) => {
    if (!settings.enableConversion || getEffectiveRate() <= 0) return;

    for (const mutation of mutations) {
      // 1. Resiliência a nós removidos: se o React removeu um badge, agenda restauração imediata!
      for (const removed of mutation.removedNodes) {
        if (removed.nodeType === Node.ELEMENT_NODE) {
          if (
            (removed.classList && removed.classList.contains('xianyu-brl-badge')) ||
            (removed.querySelector && removed.querySelector('.xianyu-brl-badge'))
          ) {
            const host = mutation.target.closest ? mutation.target.closest(`[${PROCESSED_ATTR}], ${COMBINED_PRICE_SELECTOR}`) : mutation.target;
            if (host) {
              if (host.removeAttribute) host.removeAttribute(PROCESSED_ATTR);
              pendingPriceNodes.add(host);
            }
          }
        }
      }

      // 2. Nós adicionados
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isPandaNode(node)) continue;
          pendingPriceNodes.add(node);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          const parent = node.parentElement;
          if (!isPandaNode(parent)) {
            const convertedTarget = parent.closest ? parent.closest(`[${PROCESSED_ATTR}]`) : null;
            if (convertedTarget) {
              // Adiciona aos pendentes para que convertElementsBatch valide sem deletar o badge prematuramente
              pendingPriceNodes.add(convertedTarget);
            } else {
              pendingPriceNodes.add(parent);
            }
          }
        }
      }
    }

    if (pendingPriceNodes.size > 0 && priceRafId === null) {
      priceRafId = requestAnimationFrame(flushPendingPriceNodes);
    }
  });

  priceObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function stopPriceObserver() {
  if (priceObserver) {
    priceObserver.disconnect();
    priceObserver = null;
  }
  if (priceRafId !== null) {
    cancelAnimationFrame(priceRafId);
    priceRafId = null;
  }
  pendingPriceNodes.clear();
}

// ─── 5. ASSISTENTE DE BUSCA INTELIGENTE (PT-BR -> CHINÊS + FILTROS XIANYU) ───
function injectSearchHelperCSS() {
  if (document.getElementById(SEARCH_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SEARCH_STYLE_ID;
  style.textContent = `
    #${SEARCH_ROOT_ID} {
      position: fixed !important;
      bottom: 20px !important;
      left: 20px !important;
      z-index: 2147483640 !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      color: #F4EBDC !important;
    }

    .panda-search-fab {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 14px 8px 10px !important;
      background: linear-gradient(135deg, #1E1310 0%, #120B09 100%) !important;
      color: #F4EBDC !important;
      border: 1px solid rgba(212, 175, 55, 0.58) !important;
      border-left: 3px solid #C9372C !important;
      border-radius: 4px !important;
      font-size: 12.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.02em !important;
      cursor: pointer !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 240, 200, 0.08) !important;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease !important;
    }

    .panda-search-fab:hover {
      transform: translateY(-2px) !important;
      border-color: #EDD07A !important;
      border-left-color: #E04338 !important;
      box-shadow: 0 10px 26px rgba(143, 29, 23, 0.42) !important;
    }

    .panda-fab-seal {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 22px !important;
      height: 22px !important;
      background: linear-gradient(145deg, #B82921, #7E1510) !important;
      border: 1px solid rgba(237, 208, 122, 0.78) !important;
      border-radius: 2px !important;
      color: #FAF0DC !important;
      font-family: "Noto Serif SC", "Songti SC", "SimSun", serif !important;
      font-size: 12px !important;
      font-weight: 900 !important;
      line-height: 1 !important;
    }

    .panda-search-card {
      position: relative !important;
      width: 336px !important;
      background: #140D0B !important;
      border: 1px solid rgba(212, 175, 55, 0.42) !important;
      border-radius: 5px !important;
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.72) !important;
      overflow: hidden !important;
      display: none !important;
      flex-direction: column !important;
    }

    #${SEARCH_ROOT_ID}.expanded .panda-search-card {
      display: flex !important;
    }

    #${SEARCH_ROOT_ID}.expanded .panda-search-fab {
      display: none !important;
    }

    .panda-sc-header {
      background: linear-gradient(135deg, #5A0E0A 0%, #8F1D17 50%, #470A07 100%) !important;
      padding: 11px 14px !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      border-bottom: 1px solid rgba(212, 175, 55, 0.42) !important;
    }

    .panda-sc-title {
      font-size: 13px !important;
      font-weight: 700 !important;
      letter-spacing: 0.04em !important;
      color: #F4EBDC !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .panda-sc-huiwen {
      height: 7px !important;
      width: 100% !important;
      background: #1A110E !important;
      border-bottom: 1px solid rgba(212, 175, 55, 0.22) !important;
      overflow: hidden !important;
    }

    .panda-sc-huiwen svg {
      width: 100% !important;
      height: 7px !important;
      display: block !important;
      opacity: 0.48 !important;
    }

    .panda-sc-close {
      background: rgba(17, 11, 10, 0.36) !important;
      border: 1px solid rgba(237, 208, 122, 0.32) !important;
      color: #EDD07A !important;
      width: 24px !important;
      height: 24px !important;
      border-radius: 3px !important;
      font-size: 13px !important;
      line-height: 1 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: background 0.15s ease, border-color 0.15s ease !important;
    }

    .panda-sc-close:hover {
      background: rgba(17, 11, 10, 0.65) !important;
      border-color: #EDD07A !important;
    }

    .panda-sc-body {
      position: relative !important;
      padding: 13px 14px 14px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 11px !important;
      background:
        radial-gradient(circle at 50% 0%, rgba(184, 41, 33, 0.10), transparent 65%),
        #140D0B !important;
    }

    .panda-sc-label {
      font-size: 10px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.09em !important;
      color: #C7B69E !important;
      margin-bottom: 5px !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    }

    .panda-sc-row {
      display: flex !important;
      gap: 6px !important;
    }

    .panda-sc-input {
      flex: 1 !important;
      min-width: 0 !important;
      height: 34px !important;
      padding: 0 10px !important;
      background: #1C1310 !important;
      border: 1px solid rgba(212, 175, 55, 0.25) !important;
      border-radius: 3px !important;
      color: #F4EBDC !important;
      font-size: 12.5px !important;
      outline: none !important;
      transition: border-color 0.18s ease !important;
    }

    .panda-sc-input:focus {
      border-color: #D4AF37 !important;
    }

    .panda-sc-input::placeholder {
      color: #746455 !important;
    }

    .panda-sc-mini-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      height: 34px !important;
      padding: 0 11px !important;
      background: linear-gradient(180deg, #281A15 0%, #1B110E 100%) !important;
      border: 1px solid rgba(212, 175, 55, 0.36) !important;
      border-radius: 3px !important;
      color: #EDD07A !important;
      font-size: 11.5px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      white-space: nowrap !important;
      transition: border-color 0.15s ease, background 0.15s ease !important;
    }

    .panda-sc-mini-btn:hover {
      background: linear-gradient(180deg, #34211A 0%, #241612 100%) !important;
      border-color: #EDD07A !important;
    }

    .panda-sc-tags {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 5px !important;
    }

    .panda-sc-tag {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 4px 8px !important;
      background: #1B120F !important;
      border: 1px solid rgba(212, 175, 55, 0.18) !important;
      border-radius: 3px !important;
      color: #C7B69E !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
    }

    .panda-sc-tag-zh {
      color: #D4AF37 !important;
      font-family: "Noto Serif SC", "Songti SC", serif !important;
      font-weight: 700 !important;
      font-size: 10.5px !important;
    }

    .panda-sc-tag:hover {
      border-color: rgba(212, 175, 55, 0.48) !important;
      color: #F4EBDC !important;
    }

    .panda-sc-tag.active {
      background: linear-gradient(180deg, rgba(184, 41, 33, 0.36) 0%, rgba(110, 19, 14, 0.52) 100%) !important;
      border-color: #D4AF37 !important;
      color: #FAF0DC !important;
      font-weight: 600 !important;
    }

    .panda-sc-tag.active .panda-sc-tag-zh {
      color: #EDD07A !important;
    }

    .panda-sc-actions {
      display: flex !important;
      gap: 7px !important;
      margin-top: 2px !important;
    }

    .panda-sc-submit {
      position: relative !important;
      overflow: hidden !important;
      flex: 1 !important;
      height: 36px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      background: linear-gradient(135deg, #7D1712 0%, #B82921 50%, #7D1712 100%) !important;
      border: 1px solid rgba(237, 208, 122, 0.58) !important;
      border-radius: 3px !important;
      color: #FAF0DC !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      letter-spacing: 0.04em !important;
      cursor: pointer !important;
      box-shadow: inset 0 1px 0 rgba(255, 240, 200, 0.2) !important;
      transition: border-color 0.18s ease, box-shadow 0.18s ease !important;
    }

    .panda-sc-submit:hover {
      border-color: #EDD07A !important;
      box-shadow: 0 4px 14px rgba(184, 41, 33, 0.42) !important;
    }

    .panda-sc-actions .panda-sc-mini-btn {
      height: 36px !important;
    }

    .panda-sc-svg {
      width: 13px !important;
      height: 13px !important;
      stroke: currentColor !important;
      fill: none !important;
      flex-shrink: 0 !important;
    }

    .panda-sc-status {
      font-size: 10.5px !important;
      color: #63C7A4 !important;
      font-weight: 500 !important;
      text-transform: none !important;
      letter-spacing: 0 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function getCurrentUrlSearchQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('q') || params.get('keyword') || '').trim();
  } catch (_e) {
    return '';
  }
}

function setupSearchHelper() {
  if (!document.body) return;
  injectSearchHelperCSS();
  if (document.getElementById(SEARCH_ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = SEARCH_ROOT_ID;
  root.setAttribute(PANDA_UI_ATTR, 'true');

  try {
    if (sessionStorage.getItem('panda_search_expanded') === '1') {
      root.classList.add('expanded');
    }
  } catch (_e) {}

  const activeTags = new Set();
  const initialUrlQuery = getCurrentUrlSearchQuery();

  const tagsHtml = SEARCH_QUICK_TAGS.map(
    (t) => `<button type="button" class="panda-sc-tag" data-zh="${t.zh}" title="Adicionar '${t.zh}' à busca"><span class="panda-sc-tag-zh">${t.zh}</span><span>${t.label}</span></button>`
  ).join('');

  root.innerHTML = `
    <button type="button" class="panda-search-fab" id="pandaSearchOpenBtn" title="Traduzir pesquisa do português para chinês no Goofish">
      <span class="panda-fab-seal">译</span>
      <span>Busca PT → Chinês</span>
    </button>

    <div class="panda-search-card">
      <div class="panda-sc-header">
        <div class="panda-sc-title">
          <span class="panda-fab-seal">闲</span>
          <span>Busca Inteligente Goofish</span>
        </div>
        <button type="button" class="panda-sc-close" id="pandaSearchCloseBtn" title="Minimizar">—</button>
      </div>

      <div class="panda-sc-huiwen" aria-hidden="true">
        <svg viewBox="0 0 336 7" preserveAspectRatio="none">
          <defs>
            <pattern id="panda-sc-huiwen-pat" x="0" y="0" width="16" height="7" patternUnits="userSpaceOnUse">
              <path d="M1,6 L1,1 L13,1 L13,4.5 L5,4.5 L5,2.5 L10,2.5 M15,1 L15,6 L3,6" fill="none" stroke="#D4AF37" stroke-width="0.9"/>
            </pattern>
          </defs>
          <rect width="336" height="7" fill="url(#panda-sc-huiwen-pat)" />
        </svg>
      </div>

      <div class="panda-sc-body">
        <div>
          <div class="panda-sc-label">
            <span>Pesquisa em Português</span>
            <span class="panda-sc-status" id="pandaTranslateStatus"></span>
          </div>
          <div class="panda-sc-row">
            <input type="text" class="panda-sc-input" id="pandaPtInput" placeholder="Ex: placa de vídeo RTX 3070" autocomplete="off" />
            <button type="button" class="panda-sc-mini-btn" id="pandaTranslateBtn">Traduzir</button>
          </div>
        </div>

        <div>
          <div class="panda-sc-label">
            <span>Termo em Chinês (editável)</span>
          </div>
          <div class="panda-sc-row">
            <input type="text" class="panda-sc-input" id="pandaZhInput" placeholder="Ex: 显卡 RTX 3070" autocomplete="off" />
          </div>
        </div>

        <div>
          <div class="panda-sc-label">
            <span>Filtros Tradicionais do Xianyu</span>
          </div>
          <div class="panda-sc-tags" id="pandaQuickTags">
            ${tagsHtml}
          </div>
        </div>

        <div class="panda-sc-actions">
          <button type="button" class="panda-sc-submit" id="pandaRunSearchBtn">
            <svg class="panda-sc-svg" viewBox="0 0 16 16" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5"/>
              <line x1="10.4" y1="10.4" x2="14" y2="14"/>
            </svg>
            <span>Buscar no Goofish</span>
          </button>
          <button type="button" class="panda-sc-mini-btn" id="pandaCopyZhBtn" title="Copiar termo em chinês">
            <svg class="panda-sc-svg" viewBox="0 0 16 16" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/>
              <path d="M10.5 5.5V3.7c0-.7-.5-1.2-1.2-1.2H3.7c-.7 0-1.2.5-1.2 1.2v5.6c0 .7.5 1.2 1.2 1.2h1.8"/>
            </svg>
            <span id="pandaCopyZhLabel">Copiar</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const openBtn = root.querySelector('#pandaSearchOpenBtn');
  const closeBtn = root.querySelector('#pandaSearchCloseBtn');
  const ptInput = root.querySelector('#pandaPtInput');
  const zhInput = root.querySelector('#pandaZhInput');
  const translateBtn = root.querySelector('#pandaTranslateBtn');
  const statusEl = root.querySelector('#pandaTranslateStatus');
  const runSearchBtn = root.querySelector('#pandaRunSearchBtn');
  const copyBtn = root.querySelector('#pandaCopyZhBtn');
  const tagButtons = root.querySelectorAll('.panda-sc-tag');

  if (initialUrlQuery) {
    zhInput.value = initialUrlQuery;
    tagButtons.forEach((btn) => {
      const zhTag = btn.getAttribute('data-zh');
      if (zhTag && initialUrlQuery.includes(zhTag)) {
        activeTags.add(zhTag);
        btn.classList.add('active');
      }
    });
  }

  let debounceTimer = null;
  let lastTranslatedPt = '';

  function setExpanded(expanded) {
    root.classList.toggle('expanded', expanded);
    try {
      sessionStorage.setItem('panda_search_expanded', expanded ? '1' : '0');
    } catch (_e) {}
    if (expanded) {
      setTimeout(() => ptInput.focus(), 40);
    }
  }

  openBtn.addEventListener('click', () => setExpanded(true));
  closeBtn.addEventListener('click', () => setExpanded(false));

  function buildFinalChineseQuery(baseZh) {
    let base = (baseZh || '').trim();
    activeTags.forEach((tag) => {
      if (!base.includes(tag)) {
        base = base ? `${base} ${tag}` : tag;
      }
    });
    return base.replace(/\s+/g, ' ').trim();
  }

  function requestTranslation(ptText) {
    return new Promise((resolve) => {
      const trimmed = (ptText || '').trim();
      if (!trimmed) {
        statusEl.textContent = '';
        resolve('');
        return;
      }

      statusEl.textContent = 'Traduzindo...';
      chrome.runtime.sendMessage({ type: 'TRANSLATE_QUERY', text: trimmed }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          statusEl.textContent = 'Erro na tradução';
          resolve(trimmed);
          return;
        }
        lastTranslatedPt = trimmed;
        statusEl.textContent = 'Traduzido';
        zhInput.value = buildFinalChineseQuery(res.translated);
        resolve(zhInput.value);
      });
    });
  }

  ptInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = ptInput.value.trim();
    if (!val) {
      statusEl.textContent = '';
      return;
    }
    debounceTimer = setTimeout(() => {
      requestTranslation(val);
    }, 450);
  });

  translateBtn.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    requestTranslation(ptInput.value);
  });

  tagButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const zhTag = btn.getAttribute('data-zh');
      if (!zhTag) return;

      if (activeTags.has(zhTag)) {
        activeTags.delete(zhTag);
        btn.classList.remove('active');
        zhInput.value = zhInput.value
          .replace(new RegExp(`\\s*${zhTag}\\s*`, 'g'), ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        activeTags.add(zhTag);
        btn.classList.add('active');
        zhInput.value = buildFinalChineseQuery(zhInput.value);
      }
    });
  });

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.offsetParent !== null) return true;
    return Boolean(el.getClientRects && el.getClientRects().length > 0);
  }

  function findGoofishNativeSearchInput() {
    const selectors = [
      'input[class*="search-input"]',
      'input[class*="searchInput"]',
      'input[placeholder*="搜"]',
      'input[placeholder*="闲鱼"]',
      'input[type="search"]',
      'input[name="q"]',
      '[class*="search-bar"] input',
      '[class*="search-box"] input',
      '[class*="search-content"] input',
      '[class*="search-wrap"] input',
      '[class*="search-container"] input',
      'header input[type="text"]',
      'form input[type="text"]'
    ];

    const candidates = document.querySelectorAll(selectors.join(', '));
    for (let i = 0; i < candidates.length; i++) {
      const input = candidates[i];
      if (isPandaNode(input)) continue;
      if (input.disabled || input.readOnly) continue;
      if (isElementVisible(input)) return input;
    }
    return null;
  }

  function setReactInputValue(inputEl, value) {
    inputEl.focus();

    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(inputEl, value);
    } else {
      inputEl.value = value;
    }

    // Reseta o _valueTracker interno do React para garantir disparo do onChange
    if (inputEl._valueTracker && typeof inputEl._valueTracker.setValue === 'function') {
      inputEl._valueTracker.setValue('');
    }

    inputEl.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  function isIgnoredSearchSubElement(el, scopeBox) {
    let curr = el;
    while (curr && curr !== scopeBox && curr !== document.body) {
      const cls = typeof curr.className === 'string' ? curr.className : '';
      if (/clear|clean|close|delete|del|reset|suggest|history|dropdown|hot[-_]?word/i.test(cls)) {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  function findGoofishNativeSearchButton(nativeInput) {
    const scopeBox = nativeInput.closest(
      'form, [class*="search-bar"], [class*="search-box"], [class*="search-input"], [class*="search-wrap"], [class*="search-container"], header'
    ) || (nativeInput.parentElement && nativeInput.parentElement.parentElement) || nativeInput.parentElement;

    if (!scopeBox) return null;

    const btnSelectors = [
      'button[type="submit"]',
      '[class*="search-btn"]',
      '[class*="searchBtn"]',
      '[class*="search-button"]',
      '[class*="searchButton"]',
      'button[class*="search"]',
      '[class*="search-submit"]'
    ];

    const directBtns = scopeBox.querySelectorAll(btnSelectors.join(', '));
    for (let i = 0; i < directBtns.length; i++) {
      const btn = directBtns[i];
      if (isPandaNode(btn) || btn === scopeBox || btn.contains(nativeInput)) continue;
      if (isIgnoredSearchSubElement(btn, scopeBox)) continue;
      if (isElementVisible(btn)) return btn;
    }

    // Procura o botão nativo do Goofish com o texto "搜索" (Pesquisar)
    const allEls = scopeBox.querySelectorAll('button, div, span, a');
    let bestTextMatch = null;
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i];
      if (isPandaNode(el) || el.contains(nativeInput)) continue;
      if (isIgnoredSearchSubElement(el, scopeBox)) continue;
      if (!isElementVisible(el)) continue;
      const txt = (el.textContent || '').replace(/\s+/g, '');
      if (txt === '搜索') {
        bestTextMatch = el; // Prefere o nó mais específico/interno com texto "搜索"
      }
    }
    if (bestTextMatch) return bestTextMatch;

    // Fallback para qualquer <button> válido dentro da barra de busca
    const fallbackBtns = scopeBox.querySelectorAll('button');
    for (let i = 0; i < fallbackBtns.length; i++) {
      const btn = fallbackBtns[i];
      if (!isPandaNode(btn) && !btn.contains(nativeInput) && !isIgnoredSearchSubElement(btn, scopeBox) && isElementVisible(btn)) {
        return btn;
      }
    }

    return null;
  }

  function submitQueryLikeHuman(query) {
    const nativeInput = findGoofishNativeSearchInput();
    setExpanded(false);

    if (nativeInput) {
      setReactInputValue(nativeInput, query);

      // Aguarda o React 18 processar o novo estado do input antes de acionar o botão nativo
      setTimeout(() => {
        const nativeBtn = findGoofishNativeSearchButton(nativeInput);
        if (nativeBtn) {
          nativeBtn.click();
          return;
        }

        // Caso não encontre botão explícito, envia Enter no input nativo / submete o form
        const enterOpts = {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        };
        nativeInput.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        nativeInput.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        nativeInput.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        if (nativeInput.form) {
          if (typeof nativeInput.form.requestSubmit === 'function') {
            nativeInput.form.requestSubmit();
          } else {
            nativeInput.form.submit();
          }
        }
      }, 50);
      return;
    }

    // Fallback apenas para subpáginas sem barra de busca no topo (mantendo Referer e spm)
    const link = document.createElement('a');
    link.href = `https://www.goofish.com/search?q=${encodeURIComponent(query)}&spm=a21ybx.home.searchInput.0`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function executeGoofishSearch() {
    clearTimeout(debounceTimer);
    const ptVal = ptInput.value.trim();

    if (ptVal && (ptVal !== lastTranslatedPt || !zhInput.value.trim())) {
      await requestTranslation(ptVal);
    }

    const finalQuery = buildFinalChineseQuery(zhInput.value || ptVal);
    if (!finalQuery) {
      ptInput.focus();
      return;
    }

    zhInput.value = finalQuery;
    submitQueryLikeHuman(finalQuery);
  }

  ptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeGoofishSearch();
    }
  });

  zhInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const finalQuery = buildFinalChineseQuery(zhInput.value);
      if (finalQuery) {
        zhInput.value = finalQuery;
        submitQueryLikeHuman(finalQuery);
      }
    }
  });

  runSearchBtn.addEventListener('click', executeGoofishSearch);

  copyBtn.addEventListener('click', async () => {
    const ptVal = ptInput.value.trim();
    if (ptVal && !zhInput.value.trim()) {
      await requestTranslation(ptVal);
    }
    const textToCopy = buildFinalChineseQuery(zhInput.value);
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      const copyLabel = root.querySelector('#pandaCopyZhLabel');
      if (copyLabel) {
        copyLabel.textContent = 'Copiado';
        setTimeout(() => {
          copyLabel.textContent = 'Copiar';
        }, 1500);
      }
    } catch (_e) {}
  });
}

function removeSearchHelper() {
  const root = document.getElementById(SEARCH_ROOT_ID);
  if (root) root.remove();
}

// ─── 6. ALERTAS ANTI-CILADA E GÍRIAS DO XIANYU (CARDS + RAIO-X DO ANÚNCIO) ─
function injectSlangCSS() {
  if (document.getElementById(SLANG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SLANG_STYLE_ID;
  style.textContent = `
    .panda-slang-bar {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 4px !important;
      margin-top: 6px !important;
      padding: 2px 0 !important;
      width: 100% !important;
      overflow: visible !important;
      flex-shrink: 0 !important;
      position: relative !important;
      z-index: 2 !important;
      line-height: 1.2 !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .panda-slang-pill {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 2px 7px 2px 6px !important;
      border-radius: 3px !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.01em !important;
      line-height: 1.35 !important;
      white-space: nowrap !important;
      cursor: help !important;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22) !important;
    }

    .panda-slang-pill::before {
      content: '' !important;
      display: inline-block !important;
      width: 4.5px !important;
      height: 4.5px !important;
      transform: rotate(45deg) !important;
      flex-shrink: 0 !important;
    }

    /* Vermelho Cinábrio Imperial (朱砂) */
    .panda-slang-pill--danger {
      background: linear-gradient(135deg, #2D0C0A 0%, #1F0706 100%) !important;
      color: #FFD5CE !important;
      border: 1px solid rgba(201, 55, 44, 0.72) !important;
      border-left: 2.5px solid #EF4B3F !important;
    }
    .panda-slang-pill--danger::before {
      background: #FF6B61 !important;
    }

    /* Âmbar Dourado Imperial (琥珀金) */
    .panda-slang-pill--warn {
      background: linear-gradient(135deg, #271A08 0%, #1B1105 100%) !important;
      color: #F7DFA0 !important;
      border: 1px solid rgba(212, 160, 44, 0.62) !important;
      border-left: 2.5px solid #EAB543 !important;
    }
    .panda-slang-pill--warn::before {
      background: #EDD07A !important;
    }

    /* Jade Celadon Imperial (翡翠玉) */
    .panda-slang-pill--good {
      background: linear-gradient(135deg, #0D241D 0%, #081813 100%) !important;
      color: #C4F0E1 !important;
      border: 1px solid rgba(62, 158, 126, 0.58) !important;
      border-left: 2.5px solid #52C49E !important;
    }
    .panda-slang-pill--good::before {
      background: #63C7A4 !important;
    }

    /* Placa de Inspeção Imperial (鉴宝牌) na página do produto */
    #${XRAY_PANEL_ID} {
      position: relative !important;
      margin: 14px 0 !important;
      padding: 13px 15px !important;
      background: linear-gradient(180deg, #1A110E 0%, #130C0A 100%) !important;
      border: 1px solid rgba(212, 175, 55, 0.46) !important;
      border-left: 3px solid #D4AF37 !important;
      border-radius: 4px !important;
      color: #F4EBDC !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.26) !important;
    }

    #${XRAY_PANEL_ID}.panda-xray--danger {
      background: linear-gradient(180deg, #220E0C 0%, #160908 100%) !important;
      border-color: rgba(201, 55, 44, 0.68) !important;
      border-left: 3px solid #E04338 !important;
    }

    .panda-xray-corner {
      position: absolute !important;
      width: 8px !important;
      height: 8px !important;
      border-color: #D4AF37 !important;
      border-style: solid !important;
      opacity: 0.65 !important;
      pointer-events: none !important;
    }
    .panda-xray-corner.tr { top: 3px !important; right: 3px !important; border-width: 1.5px 1.5px 0 0 !important; }
    .panda-xray-corner.br { bottom: 3px !important; right: 3px !important; border-width: 0 1.5px 1.5px 0 !important; }

    .panda-xray-header {
      display: flex !important;
      align-items: center !important;
      gap: 9px !important;
      margin-bottom: 10px !important;
      padding-bottom: 8px !important;
      border-bottom: 1px solid rgba(212, 175, 55, 0.20) !important;
      font-size: 12.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.03em !important;
      color: #EDD07A !important;
    }

    #${XRAY_PANEL_ID}.panda-xray--danger .panda-xray-header {
      color: #FFB4AB !important;
      border-bottom-color: rgba(201, 55, 44, 0.28) !important;
    }

    .panda-xray-seal {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 22px !important;
      height: 22px !important;
      background: linear-gradient(145deg, #291814, #180E0B) !important;
      border: 1px solid rgba(212, 175, 55, 0.68) !important;
      border-radius: 2px !important;
      color: #EDD07A !important;
      font-family: "Noto Serif SC", "Songti SC", "SimSun", serif !important;
      font-size: 12px !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      flex-shrink: 0 !important;
    }

    #${XRAY_PANEL_ID}.panda-xray--danger .panda-xray-seal {
      background: linear-gradient(145deg, #B82921, #7E1510) !important;
      border-color: rgba(237, 208, 122, 0.78) !important;
      color: #FAF0DC !important;
    }

    .panda-xray-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 7px !important;
    }

    .panda-xray-item {
      display: flex !important;
      align-items: flex-start !important;
      gap: 9px !important;
      font-size: 12px !important;
      line-height: 1.45 !important;
      color: #EAE0D0 !important;
    }

    .panda-xray-term {
      font-size: 11px !important;
      color: #B09E88 !important;
      margin-left: 4px !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function detectSlangAlerts(text) {
  if (!text || text.length < 2) return [];
  const detected = [];

  for (let i = 0; i < XIANYU_SLANG_RULES.length; i++) {
    const rule = XIANYU_SLANG_RULES[i];
    const matchedTerm = rule.match(text);
    if (matchedTerm) {
      detected.push({
        id: rule.id,
        level: rule.level,
        label: rule.label,
        desc: rule.desc,
        matchedTerm
      });
    }
  }
  return detected;
}

function isItemDetailPage() {
  const path = location.pathname || '';
  const href = location.href || '';
  return path.includes('/item') || href.includes('detail.html');
}

function extractItemIdFromHref(href) {
  if (!href) return '';
  const m = /[?&]id=(\d+)/.exec(href) || /\/item\/(\d+)/.exec(href);
  return m ? m[1] : href;
}

function hasMultipleDistinctItems(container) {
  if (!container || !container.querySelectorAll) return false;
  const links = container.querySelectorAll('a[href*="/item"], a[href*="detail.html"]');
  if (links.length <= 1) return false;

  let firstId = '';
  for (let i = 0; i < links.length; i++) {
    const id = extractItemIdFromHref(links[i].getAttribute('href') || '');
    if (!id) continue;
    if (!firstId) {
      firstId = id;
    } else if (id !== firstId) {
      return true;
    }
  }
  return false;
}

function getCleanCardText(el) {
  if (!el) return '';
  let full = el.textContent || '';
  const pandaEls = el.querySelectorAll ? el.querySelectorAll(`[${PANDA_UI_ATTR}], .xianyu-brl-badge`) : [];
  for (let i = 0; i < pandaEls.length; i++) {
    const pTxt = pandaEls[i].textContent;
    if (pTxt) {
      full = full.replace(pTxt, ' ');
    }
  }
  return full.replace(/\s+/g, ' ').trim();
}

const CARD_LIST_CONTAINER_REGEX = /feeds-list|search-list|item-list|card-list|waterfall|masonry|page-container/i;

function resolveProductCardRoot(candidate) {
  if (!candidate || !candidate.isConnected || isPandaNode(candidate)) return null;
  let curr = candidate;

  // Caso candidate seja um <a> envolvendo só a foto ou só o título, sobe até achar o card completo do produto
  for (let depth = 0; depth < 4; depth++) {
    const txt = getCleanCardText(curr);
    const hasImg = Boolean(curr.querySelector && curr.querySelector('img'));
    const hasPrice =
      /[¥￥元]/.test(txt) ||
      Boolean(curr.querySelector && curr.querySelector(`[${PROCESSED_ATTR}], [class*="price"], [class*="Price"]`));
    if (hasImg && hasPrice && hasMeaningfulListingTitle(txt)) {
      break;
    }

    const parent = curr.parentElement;
    if (!parent || parent === document.body || isMainPageContainer(parent)) break;
    if (typeof parent.className === 'string' && CARD_LIST_CONTAINER_REGEX.test(parent.className)) break;
    if (hasMultipleDistinctItems(parent)) break;
    if ((parent.textContent || '').length > 900) break;
    curr = parent;
  }

  if (hasMultipleDistinctItems(curr)) return null;
  return curr;
}

function isClampedOrClippedBox(el) {
  if (!el || el === document.body) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === '-webkit-box' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) {
    return true;
  }
  const maxH = parseFloat(cs.maxHeight);
  if (!isNaN(maxH) && maxH > 0 && maxH < 64 && cs.overflow === 'hidden') {
    return true;
  }
  return false;
}

function findBestCardMountTarget(card) {
  // 1. Tenta localizar a coluna vertical de informações onde fica o preço (fora do -webkit-line-clamp do título)
  const priceEl = card.querySelector(
    `[${PROCESSED_ATTR}], [class*="price--"], [class*="item-price"], [class*="price"], [class*="Price"]`
  );
  if (priceEl && priceEl !== card) {
    let curr = priceEl.parentElement;
    let fallbackCol = null;
    while (curr && curr !== card) {
      if (!isClampedOrClippedBox(curr)) {
        fallbackCol = curr;
        const cs = window.getComputedStyle(curr);
        const isVerticalContainer =
          cs.display === 'block' ||
          ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('column'));
        // Prefere o container de coluna mais amplo da seção de detalhes (evitando colocar dentro do micro-span do preço)
        if (isVerticalContainer && curr !== priceEl) {
          return curr;
        }
      }
      curr = curr.parentElement;
    }
    if (fallbackCol) return fallbackCol;
  }

  // 2. Se o card inteiro for horizontal (flex-direction: row), escolhe a coluna de texto ao lado da imagem
  const cardStyle = window.getComputedStyle(card);
  if ((cardStyle.display === 'flex' || cardStyle.display === 'inline-flex') && cardStyle.flexDirection === 'row') {
    const children = card.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!isPandaNode(child) && !(child.querySelector && child.querySelector('img')) && !isClampedOrClippedBox(child)) {
        return child;
      }
    }
  }

  // 3. Se o próprio elemento tiver line-clamp (ex: link isolado de título), usa o pai seguro
  if (isClampedOrClippedBox(card) && card.parentElement && !hasMultipleDistinctItems(card.parentElement)) {
    return card.parentElement;
  }

  return card;
}

function hasMeaningfulListingTitle(cleanText) {
  // Remove preços, contadores de "pessoas querem" ("15人想要") e pontuação para checar se o título já carregou
  const stripped = cleanText
    .replace(/[¥￥]\s*\d+(?:[.,]\d+)?/g, '')
    .replace(/\d+\s*人想要/g, '')
    .replace(/[0-9.,\s¥￥元+\-/]+/g, '');
  return stripped.length >= 2;
}

function scanProductCardsBatch(rawCandidates) {
  if (!rawCandidates || rawCandidates.length === 0) return;

  // Deduplica candidatos que apontam para o mesmo card raiz
  const uniqueCards = new Set();
  for (let i = 0; i < rawCandidates.length; i++) {
    const resolved = resolveProductCardRoot(rawCandidates[i]);
    if (resolved) {
      uniqueCards.add(resolved);
    }
  }
  if (uniqueCards.size === 0) return;

  const toInject = [];

  // FASE 1: Leitura
  for (const card of uniqueCards) {
    if (!card.isConnected || isPandaNode(card)) continue;
    if (card.parentElement && card.parentElement.closest(`[${SLANG_PROCESSED_ATTR}]`)) continue;

    const cleanText = getCleanCardText(card);
    // Se o card ainda está em skeleton loading (sem título carregado), NÃO trava com SLANG_PROCESSED_ATTR!
    if (cleanText.length < 6 || cleanText.length > 850 || !hasMeaningfulListingTitle(cleanText)) {
      continue;
    }

    const textSig = `${cleanText.length}:${cleanText.slice(0, 28)}`;
    const existingBar = card.querySelector('.panda-slang-bar');
    const hasActiveBar = Boolean(existingBar && existingBar.isConnected);
    const alertCountAttr = card.getAttribute('data-panda-alert-count');

    // Se já analisado com a mesma assinatura:
    if (card.getAttribute(SLANG_PROCESSED_ATTR) === textSig) {
      // Se não havia alertas (alertCountAttr === '0'), pula
      if (alertCountAttr === '0') continue;
      // Se havia alertas e a barra ainda está fisicamente no DOM, pula
      if (hasActiveBar) continue;
      // Se tinha alertas mas a barra SUMIU (o React do Goofish deletou após 1 segundo):
      // NÃO PULA! Restaura imediatamente!
    }

    const alerts = detectSlangAlerts(cleanText);
    const mountTarget = alerts.length > 0 ? findBestCardMountTarget(card) : null;

    toInject.push({
      card,
      mountTarget,
      textSig,
      alerts: alerts.length > 0 ? alerts.slice(0, 3) : null
    });
  }

  // FASE 2: Escrita
  for (let i = 0; i < toInject.length; i++) {
    const { card, mountTarget, textSig, alerts } = toInject[i];
    if (!card.isConnected) continue;

    card.setAttribute(SLANG_PROCESSED_ATTR, textSig);
    card.setAttribute('data-panda-alert-count', alerts ? String(alerts.length) : '0');

    // Remove barra anterior caso o texto do card tenha sido atualizado pelo React
    const oldBars = card.querySelectorAll('.panda-slang-bar');
    for (let b = 0; b < oldBars.length; b++) {
      oldBars[b].remove();
    }

    if (!alerts || alerts.length === 0 || !mountTarget) continue;

    const bar = document.createElement('div');
    bar.className = 'panda-slang-bar';
    bar.setAttribute(PANDA_UI_ATTR, 'true');

    for (let j = 0; j < alerts.length; j++) {
      const a = alerts[j];
      const pill = document.createElement('span');
      pill.className = `panda-slang-pill panda-slang-pill--${a.level}`;
      pill.textContent = a.label;
      pill.title = `[Termo chinês: "${a.matchedTerm}"] — ${a.desc}`;
      bar.appendChild(pill);
    }

    mountTarget.appendChild(bar);
  }
}

function scanItemDetailPageXray() {
  if (!isItemDetailPage() || !document.body) return;

  const descCandidates = document.querySelectorAll(COMBINED_DETAIL_DESC_SELECTOR);
  let targetDescEl = null;
  let descText = '';

  for (let i = 0; i < descCandidates.length; i++) {
    const el = descCandidates[i];
    if (isPandaNode(el)) continue;
    const txt = getCleanCardText(el);
    if (txt.length >= 4 && txt.length < 5000) {
      targetDescEl = el;
      descText = txt;
      break;
    }
  }

  if (!targetDescEl) return;

  // Inclui também o título principal da página de detalhes caso separado da descrição
  let titleText = '';
  const titleEl = document.querySelector('h1, [class*="title--"], [class*="item-title"], [class*="main-title"]');
  if (titleEl && !isPandaNode(titleEl) && !targetDescEl.contains(titleEl)) {
    titleText = getCleanCardText(titleEl);
  }

  const combinedText = `${titleText} ${descText}`.trim();

  const existingPanel = document.getElementById(XRAY_PANEL_ID);
  const textSignature = `${combinedText.length}:${combinedText.slice(0, 60)}`;
  if (existingPanel && existingPanel.isConnected && existingPanel.getAttribute('data-sig') === textSignature) {
    return;
  }
  if (existingPanel) {
    existingPanel.remove();
  }

  const alerts = detectSlangAlerts(combinedText);
  if (alerts.length === 0) return;

  const hasDanger = alerts.some((a) => a.level === 'danger');

  const panel = document.createElement('div');
  panel.id = XRAY_PANEL_ID;
  panel.setAttribute(PANDA_UI_ATTR, 'true');
  panel.setAttribute('data-sig', textSignature);
  if (hasDanger) {
    panel.classList.add('panda-xray--danger');
  }

  const sealChar = hasDanger ? '险' : '鉴';
  const headerTitle = hasDanger
    ? 'Inspeção Panda — Riscos Detectados neste Anúncio'
    : 'Inspeção Panda — Termos Identificados no Anúncio';

  const itemsHtml = alerts.map((a) => `
    <div class="panda-xray-item">
      <span class="panda-slang-pill panda-slang-pill--${a.level}">${a.label}</span>
      <div>
        <span>${a.desc}</span>
        <span class="panda-xray-term">("${a.matchedTerm}")</span>
      </div>
    </div>
  `).join('');

  panel.innerHTML = `
    <span class="panda-xray-corner tr"></span>
    <span class="panda-xray-corner br"></span>
    <div class="panda-xray-header">
      <span class="panda-xray-seal">${sealChar}</span>
      <span>${headerTitle}</span>
    </div>
    <div class="panda-xray-list">
      ${itemsHtml}
    </div>
  `;

  targetDescEl.insertAdjacentElement('beforebegin', panel);
}

function scanAllSlangTargets() {
  if (!settings.enableSlangAlerts || !document.body) return;
  const cards = document.querySelectorAll(COMBINED_CARD_SELECTOR);
  scanProductCardsBatch(cards);
  scanItemDetailPageXray();
}

function clearAllSlangAlerts() {
  const bars = document.querySelectorAll('.panda-slang-bar');
  for (let i = 0; i < bars.length; i++) {
    bars[i].remove();
  }
  const xray = document.getElementById(XRAY_PANEL_ID);
  if (xray) xray.remove();

  const processed = document.querySelectorAll(`[${SLANG_PROCESSED_ATTR}]`);
  for (let i = 0; i < processed.length; i++) {
    processed[i].removeAttribute(SLANG_PROCESSED_ATTR);
  }
}

function flushPendingSlangNodes() {
  slangRafId = null;
  if (!settings.enableSlangAlerts) {
    pendingSlangNodes.clear();
    return;
  }

  if (location.href !== lastObservedUrl) {
    lastObservedUrl = location.href;
    const oldXray = document.getElementById(XRAY_PANEL_ID);
    if (oldXray) oldXray.remove();
  }

  const candidateCards = new Set();
  for (const node of pendingSlangNodes) {
    if (!node.isConnected || isPandaNode(node)) continue;

    // Verifica tanto para cima (caso texto/título tenha sido injetado dentro de um card já existente)
    // quanto o próprio nó e seus descendentes
    const ancestorCard = node.closest ? node.closest(COMBINED_CARD_SELECTOR) : null;
    if (ancestorCard) {
      candidateCards.add(ancestorCard);
    } else if (node.matches && node.matches(COMBINED_CARD_SELECTOR)) {
      candidateCards.add(node);
    } else {
      // Caso o título seja hidratado em uma <div> irmã do <a href="/item?..."> dentro de um card com CSS Module ofuscado
      let p = node.parentElement;
      for (let depth = 0; depth < 4 && p && p !== document.body; depth++) {
        if (isMainPageContainer(p) || (p.textContent || '').length > 900) break;
        if (typeof p.className === 'string' && CARD_LIST_CONTAINER_REGEX.test(p.className)) break;
        if (hasMultipleDistinctItems(p)) break;
        if (p.querySelector && p.querySelector('a[href*="/item"], a[href*="detail.html"]')) {
          candidateCards.add(p);
          break;
        }
        p = p.parentElement;
      }
    }

    if (node.querySelectorAll) {
      const found = node.querySelectorAll(COMBINED_CARD_SELECTOR);
      for (let i = 0; i < found.length; i++) {
        candidateCards.add(found[i]);
      }
    }
  }
  pendingSlangNodes.clear();

  if (candidateCards.size > 0) {
    scanProductCardsBatch(Array.from(candidateCards));
  }
  if (isItemDetailPage()) {
    scanItemDetailPageXray();
  }
}

function setupSlangObserver() {
  if (slangObserver || !document.body) return;

  slangObserver = new MutationObserver((mutations) => {
    if (!settings.enableSlangAlerts) return;

    for (const mutation of mutations) {
      // 1. Resiliência a nós removidos: se o React removeu a barra de gírias ou o painel Raio-X!
      for (const removed of mutation.removedNodes) {
        if (removed.nodeType === Node.ELEMENT_NODE) {
          if (
            (removed.classList && removed.classList.contains('panda-slang-bar')) ||
            (removed.querySelector && removed.querySelector('.panda-slang-bar')) ||
            removed.id === XRAY_PANEL_ID
          ) {
            const card = mutation.target.closest ? mutation.target.closest(COMBINED_CARD_SELECTOR) : mutation.target;
            if (card) {
              if (card.removeAttribute) card.removeAttribute(SLANG_PROCESSED_ATTR);
              pendingSlangNodes.add(card);
            }
          }
        }
      }

      // 2. Nós adicionados
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (!isPandaNode(node)) {
            pendingSlangNodes.add(node);
          }
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          if (!isPandaNode(node.parentElement)) {
            pendingSlangNodes.add(node.parentElement);
          }
        }
      }
    }

    if (pendingSlangNodes.size > 0 && slangRafId === null) {
      slangRafId = requestAnimationFrame(flushPendingSlangNodes);
    }
  });

  slangObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function stopSlangObserver() {
  if (slangObserver) {
    slangObserver.disconnect();
    slangObserver = null;
  }
  if (slangRafId !== null) {
    cancelAnimationFrame(slangRafId);
    slangRafId = null;
  }
  pendingSlangNodes.clear();
}
