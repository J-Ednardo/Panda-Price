// ─── PANDA PRICE: BACKGROUND SERVICE WORKER (MV3) ───────────────────────────
// Centraliza busca automática da cotação CNY➔BRL e tradução de pesquisa PT➔ZH
// evitando bloqueios de CORS e Content-Security-Policy dentro do goofish.com.

const RATE_ALARM_NAME = 'panda-rate-refresh';
const RATE_REFRESH_MINUTES = 180; // 3 horas
const RATE_STALE_MS = RATE_REFRESH_MINUTES * 60 * 1000;
const FETCH_TIMEOUT_MS = 6500;

const translationCache = new Map();

// ─── 1. AGENDAMENTO E CICLO DE VIDA ─────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  chrome.storage.sync.get(['yuanRate', 'autoRate'], (data) => {
    const autoRate = data.autoRate !== false;
    if (autoRate || !data.yuanRate || parseFloat(data.yuanRate) <= 0) {
      refreshAndStoreYuanRate(autoRate);
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  maybeRefreshStaleRate();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === RATE_ALARM_NAME) {
    maybeRefreshStaleRate();
  }
});

function ensureAlarm() {
  chrome.alarms.get(RATE_ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(RATE_ALARM_NAME, { periodInMinutes: RATE_REFRESH_MINUTES });
    }
  });
}

function maybeRefreshStaleRate() {
  chrome.storage.sync.get(['autoRate', 'rateUpdatedAt', 'yuanRate'], (data) => {
    if (data.autoRate === false) return;
    const lastUpdated = Number(data.rateUpdatedAt) || 0;
    const hasValidRate = parseFloat(data.yuanRate) > 0;
    if (!hasValidRate || Date.now() - lastUpdated >= RATE_STALE_MS) {
      refreshAndStoreYuanRate(true);
    }
  });
}

// ─── 2. ROTEADOR DE MENSAGENS (POPUP & CONTENT SCRIPT) ──────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'FETCH_YUAN_RATE') {
    handleFetchRateRequest(Boolean(msg.force), Boolean(msg.setAutoRate))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err ? err.message : 'Erro ao buscar cotação' }));
    return true; // Mantém canal assíncrono aberto
  }

  if (msg.type === 'TRANSLATE_QUERY') {
    translatePtToChinese(String(msg.text || ''))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err ? err.message : 'Erro ao traduzir busca' }));
    return true;
  }

  return false;
});

// ─── 3. SERVIÇO DE COTAÇÃO CNY ➔ BRL (COM 3 PROVEDORES EM FALLBACK) ─────────
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveYuanRate() {
  const providers = [
    {
      name: 'AwesomeAPI',
      url: 'https://economia.awesomeapi.com.br/json/last/CNY-BRL',
      extract: (json) => json && json.CNYBRL ? parseFloat(json.CNYBRL.ask || json.CNYBRL.bid) : NaN
    },
    {
      name: 'ExchangeRate-API',
      url: 'https://open.er-api.com/v6/latest/CNY',
      extract: (json) => json && json.rates ? parseFloat(json.rates.BRL) : NaN
    },
    {
      name: 'Frankfurter',
      url: 'https://api.frankfurter.app/latest?from=CNY&to=BRL',
      extract: (json) => json && json.rates ? parseFloat(json.rates.BRL) : NaN
    }
  ];

  let lastError = null;
  for (const provider of providers) {
    try {
      const data = await fetchWithTimeout(provider.url);
      const rawRate = provider.extract(data);
      if (!isNaN(rawRate) && rawRate > 0.05 && rawRate < 20) {
        const roundedRate = Number(rawRate.toFixed(4));
        return {
          ok: true,
          rate: roundedRate,
          provider: provider.name,
          updatedAt: Date.now()
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Não foi possível obter a cotação do Yuan no momento.');
}

async function refreshAndStoreYuanRate(keepAutoFlag = true) {
  const result = await fetchLiveYuanRate();
  const payload = {
    yuanRate: result.rate,
    rateProvider: result.provider,
    rateUpdatedAt: result.updatedAt
  };
  if (keepAutoFlag) {
    payload.autoRate = true;
  }
  await chrome.storage.sync.set(payload);
  return result;
}

async function handleFetchRateRequest(force, setAutoRate) {
  if (!force) {
    const stored = await chrome.storage.sync.get(['yuanRate', 'rateProvider', 'rateUpdatedAt', 'autoRate']);
    const existingRate = parseFloat(stored.yuanRate);
    const updatedAt = Number(stored.rateUpdatedAt) || 0;
    if (existingRate > 0 && Date.now() - updatedAt < RATE_STALE_MS) {
      return {
        ok: true,
        rate: existingRate,
        provider: stored.rateProvider || 'Cache',
        updatedAt
      };
    }
  }
  return await refreshAndStoreYuanRate(setAutoRate);
}

// ─── 4. TRADUTOR INTELIGENTE DE BUSCA (PT-BR ➔ CHINÊS DO XIANYU) ────────────
// Dicionário curado para evitar traduções literais erradas em termos de compras
const EXACT_SHOPPING_DICTIONARY = {
  'placa de video': '显卡',
  'placa de vídeo': '显卡',
  'placa mae': '主板',
  'placa mãe': '主板',
  'processador': '处理器 CPU',
  'memoria ram': '内存条',
  'memória ram': '内存条',
  'fonte': '电脑电源',
  'fonte pc': '电脑电源',
  'gabinete': '机箱',
  'water cooler': '水冷散热器',
  'cooler': '散热器',
  'ssd': '固态硬盘 SSD',
  'hd': '机械硬盘',
  'notebook': '笔记本电脑',
  'notebook gamer': '游戏笔记本电脑',
  'celular': '手机',
  'smartphone': '手机',
  'tela': '屏幕总成',
  'bateria': '电池',
  'carregador': '充电器',
  'fone': '耳机',
  'fone de ouvido': '耳机',
  'fone bluetooth': '蓝牙耳机',
  'teclado': '键盘',
  'teclado mecanico': '机械键盘',
  'teclado mecânico': '机械键盘',
  'mouse': '鼠标',
  'mouse sem fio': '无线鼠标',
  'mousepad': '鼠标垫',
  'controle': '游戏手柄',
  'joystick': '游戏手柄',
  'gamepad': '游戏手柄',
  'console portatil': '掌机',
  'console portátil': '掌机',
  'videogame portatil': '掌机',
  'videogame portátil': '掌机',
  'videogame': '游戏机',
  'console': '游戏机',
  'cartucho': '游戏卡带',
  'camera': '相机',
  'câmera': '相机',
  'lente': '镜头',
  'relogio': '手表',
  'relógio': '手表',
  'smartwatch': '智能手表',
  'action figure': '手办',
  'figure': '手办',
  'boneco': '手办',
  'miniatura': '模型',
  'pelucia': '毛绒公仔',
  'pelúcia': '毛绒公仔',
  'tenis': '运动鞋',
  'tênis': '运动鞋',
  'jaqueta': '夹克',
  'moletom': '卫衣',
  'camiseta': 'T恤',
  'calca': '裤子',
  'calça': '裤子',
  'bolsa': '包包',
  'mochila': '背包',
  'oculos': '眼镜',
  'óculos': '眼镜'
};

// Substituições idiomáticas aplicadas antes da tradução de frases compostas
const IDIOMATIC_PRE_REPLACEMENTS = [
  [/\bplacas?\s+de\s+v[ií]deo\b/gi, '显卡'],
  [/\bplacas?\s+m[aã]e\b/gi, '主板'],
  [/\bmem[oó]rias?\s+ram\b/gi, '内存条'],
  [/\bwater\s*cooler\b/gi, '水冷散热器'],
  [/\bnotebooks?\s+gamer\b/gi, '游戏笔记本电脑'],
  [/\bnotebooks?\b/gi, '笔记本电脑'],
  [/\bteclados?\s+mec[aâ]nicos?\b/gi, '机械键盘'],
  [/\bconsoles?\s+port[aá]t(?:il|eis)\b/gi, '掌机'],
  [/\bvideogames?\s+port[aá]t(?:il|eis)\b/gi, '掌机'],
  [/\baction\s+figures?\b/gi, '手办'],
  [/\bfones?\s+de\s+ouvido\b/gi, '耳机'],
  [/\bcontroles?\s+(ps[345]|xbox|switch|pro|sem\s+fio|original|bluetooth)\b/gi, '游戏手柄 $1'],
  [/\btenis\b/gi, '运动鞋'],
  [/\btênis\b/gi, '运动鞋'],
  [/\bfrete\s+gr[aá]tis\b/gi, '包邮'],
  [/\bsem\s+reparos?\b/gi, '无拆无修'],
  [/\bcom\s+caixa\b/gi, '箱说全'],
  [/\bquase\s+novo\b/gi, '99新']
];

function containsOnlyChineseOrModelCodes(str) {
  // Se após as substituições idiomáticas sobraram apenas caracteres chineses, números e códigos (ex: "显卡 RTX 3070 8GB")
  const stripped = str
    .replace(/[\u4e00-\u9fff]/g, '')
    .replace(/\b\d+\s*(?:gb|tb|mb|g|t|mah|hz|khz|mhz|ghz|w|mm|cm)\b/gi, '')
    .replace(/\b(?:iphone|ipad|macbook|airpods|switch|xbox|ryzen|intel|geforce|radeon|gtx|rtx|rx)\b/gi, '')
    .replace(/\b[a-z]{1,5}\s*\d+[a-z0-9+.-]*\b/gi, '')
    .replace(/\b(pro|max|plus|ultra|mini|air|lite|se|oled|ti|super|xt|xtx|fe|oc|gb|tb)\b/gi, '')
    .replace(/[0-9\s\-+./()]/g, '');
  return stripped.length === 0;
}

async function translateViaGoogleGtx(query) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=zh-CN&dt=t&q=${encodeURIComponent(query)}`;
  const data = await fetchWithTimeout(url);
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const joined = data[0]
      .map((part) => (Array.isArray(part) && part[0] ? part[0] : ''))
      .join('')
      .trim();
    if (joined) return joined;
  }
  throw new Error('Resposta inválida do Google Translate');
}

async function translateViaMyMemory(query) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=pt-BR|zh-CN`;
  const data = await fetchWithTimeout(url);
  const translated = data && data.responseData && data.responseData.translatedText
    ? String(data.responseData.translatedText).trim()
    : '';
  if (translated && !translated.includes('MYMEMORY WARNING')) {
    return translated;
  }
  throw new Error('Resposta inválida do MyMemory');
}

function offlineFallbackTranslate(raw) {
  let result = raw;
  for (const [regex, replacement] of IDIOMATIC_PRE_REPLACEMENTS) {
    result = result.replace(regex, replacement);
  }
  const tokens = result.split(/\s+/).map((tok) => {
    const clean = tok.toLowerCase();
    return EXACT_SHOPPING_DICTIONARY[clean] || tok;
  });
  return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

async function translatePtToChinese(rawInput) {
  const cleaned = rawInput.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { ok: true, translated: '', source: 'empty' };
  }

  const normalizedKey = cleaned.toLowerCase();
  if (EXACT_SHOPPING_DICTIONARY[normalizedKey]) {
    return {
      ok: true,
      translated: EXACT_SHOPPING_DICTIONARY[normalizedKey],
      source: 'dictionary'
    };
  }

  if (translationCache.has(normalizedKey)) {
    return {
      ok: true,
      translated: translationCache.get(normalizedKey),
      source: 'cache'
    };
  }

  // Pré-substitui termos idiomáticos de e-commerce antes da tradução online
  let prepared = cleaned;
  for (const [regex, replacement] of IDIOMATIC_PRE_REPLACEMENTS) {
    prepared = prepared.replace(regex, replacement);
  }
  prepared = prepared.replace(/\s+/g, ' ').trim();

  // Se a frase inteira já foi resolvida pelo dicionário + códigos de modelo (ex: "placa de vídeo RTX 3070")
  if (containsOnlyChineseOrModelCodes(prepared) && /[\u4e00-\u9fff]/.test(prepared)) {
    translationCache.set(normalizedKey, prepared);
    return { ok: true, translated: prepared, source: 'dictionary' };
  }

  let translated = '';
  let source = 'google';

  try {
    translated = await translateViaGoogleGtx(prepared);
  } catch (_e1) {
    try {
      translated = await translateViaMyMemory(prepared);
      source = 'mymemory';
    } catch (_e2) {
      translated = offlineFallbackTranslate(cleaned);
      source = 'offline';
    }
  }

  if (translationCache.size >= 120) {
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
  translationCache.set(normalizedKey, translated);

  return { ok: true, translated, source };
}
