let currentAutoRate = true;
let currentProvider = '';
let currentUpdatedAt = 0;

const STORAGE_KEYS = [
  'yuanRate',
  'spreadPercent',
  'autoRate',
  'rateProvider',
  'rateUpdatedAt',
  'enableConversion',
  'blockPopup',
  'enableSearchHelper',
  'enableSlangAlerts'
];

const STALE_MS = 3 * 60 * 60 * 1000; // 3 horas

document.addEventListener('DOMContentLoaded', () => {
  const rateInput = document.getElementById('rate');
  const spreadInput = document.getElementById('spread');
  const syncBtn = document.getElementById('syncRateBtn');

  chrome.storage.sync.get(STORAGE_KEYS, (data) => {
    currentAutoRate = data.autoRate !== false;
    currentProvider = data.rateProvider || '';
    currentUpdatedAt = Number(data.rateUpdatedAt) || 0;

    const savedRate = parseFloat(data.yuanRate) || 0;
    const savedSpread = parseFloat(data.spreadPercent) || 0;

    if (savedRate > 0) {
      rateInput.value = savedRate;
    }
    spreadInput.value = savedSpread;
    highlightSpreadPreset(savedSpread);

    document.getElementById('enableConversion').checked = data.enableConversion !== false;
    document.getElementById('blockPopup').checked = data.blockPopup !== false;
    document.getElementById('enableSearchHelper').checked = data.enableSearchHelper !== false;
    document.getElementById('enableSlangAlerts').checked = data.enableSlangAlerts !== false;

    renderRateMeta();
    updateHint();

    // Sincroniza automaticamente ao abrir caso ainda não tenha cotação ou esteja expirada em modo automático
    if (savedRate <= 0 || (currentAutoRate && Date.now() - currentUpdatedAt >= STALE_MS)) {
      triggerRateSync(true);
    }
  });

  // Se o usuário digitar manualmente uma cotação própria, muda para modo manual
  rateInput.addEventListener('input', () => {
    currentAutoRate = false;
    renderRateMeta();
    updateHint();
  });

  spreadInput.addEventListener('input', () => {
    const val = parseFloat(spreadInput.value) || 0;
    highlightSpreadPreset(val);
    updateHint();
  });

  document.querySelectorAll('#spreadPresets .preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = parseFloat(chip.getAttribute('data-spread')) || 0;
      spreadInput.value = val;
      highlightSpreadPreset(val);
      updateHint();
    });
  });

  syncBtn.addEventListener('click', () => {
    triggerRateSync(false);
  });

  document.getElementById('saveBtn').addEventListener('click', saveAllSettings);
});

function formatTimeShort(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return '';
  }
}

function renderRateMeta(errorMsg) {
  const meta = document.getElementById('rate-meta');
  meta.classList.remove('auto', 'error');

  if (errorMsg) {
    meta.textContent = errorMsg;
    meta.classList.add('error');
    return;
  }

  const rateVal = parseFloat(document.getElementById('rate').value);
  if (!rateVal || rateVal <= 0) {
    meta.textContent = 'Clique em Sincronizar ou informe a cotação.';
    return;
  }

  if (currentAutoRate) {
    const timeStr = formatTimeShort(currentUpdatedAt);
    const providerLabel = currentProvider ? ` (${currentProvider})` : '';
    meta.textContent = timeStr
      ? `Automática${providerLabel} · Atualizada às ${timeStr}`
      : `Cotação automática ativa${providerLabel}`;
    meta.classList.add('auto');
  } else {
    meta.textContent = 'Cotação manual personalizada';
  }
}

function highlightSpreadPreset(spreadVal) {
  document.querySelectorAll('#spreadPresets .preset-chip').forEach((chip) => {
    const chipVal = parseFloat(chip.getAttribute('data-spread'));
    chip.classList.toggle('active', chipVal === spreadVal);
  });
}

function updateHint() {
  const hint = document.getElementById('rate-hint');
  const baseRate = parseFloat(document.getElementById('rate').value);
  const spread = Math.max(0, parseFloat(document.getElementById('spread').value) || 0);

  if (baseRate && baseRate > 0) {
    const effectiveRate = baseRate * (1 + spread / 100);
    const ex100 = (100 * effectiveRate).toFixed(2);
    if (spread > 0) {
      hint.textContent = `Taxa efetiva (+${spread}%): 1 ¥ = R$ ${effectiveRate.toFixed(4)} · ¥ 100 = R$ ${ex100}`;
    } else {
      hint.textContent = `Sem spread adicional · ¥ 100 = R$ ${ex100}`;
    }
  } else {
    hint.textContent = '';
  }
}

function triggerRateSync(silentFeedback) {
  const syncBtn = document.getElementById('syncRateBtn');
  const syncBtnText = document.getElementById('syncBtnText');
  const rateInput = document.getElementById('rate');

  syncBtn.disabled = true;
  syncBtn.classList.add('loading');
  syncBtnText.textContent = 'Buscando...';

  chrome.runtime.sendMessage({ type: 'FETCH_YUAN_RATE', force: true, setAutoRate: true }, (res) => {
    syncBtn.disabled = false;
    syncBtn.classList.remove('loading');
    syncBtnText.textContent = 'Sincronizar';

    if (chrome.runtime.lastError || !res || !res.ok) {
      const msg = (res && res.error) || 'Sem conexão com API de câmbio. Digite manualmente.';
      renderRateMeta(msg);
      return;
    }

    currentAutoRate = true;
    currentProvider = res.provider || 'API';
    currentUpdatedAt = res.updatedAt || Date.now();
    rateInput.value = res.rate;

    renderRateMeta();
    updateHint();
    broadcastToActiveTab();

    if (!silentFeedback) {
      showSavedToast('Cotação sincronizada com sucesso');
    }
  });
}

function collectCurrentSettings() {
  const rawRate = parseFloat(document.getElementById('rate').value);
  const rawSpread = parseFloat(document.getElementById('spread').value);
  return {
    yuanRate: rawRate && rawRate > 0 ? rawRate : 0,
    spreadPercent: !isNaN(rawSpread) && rawSpread >= 0 ? Math.min(100, rawSpread) : 0,
    autoRate: currentAutoRate,
    enableConversion: document.getElementById('enableConversion').checked,
    blockPopup: document.getElementById('blockPopup').checked,
    enableSearchHelper: document.getElementById('enableSearchHelper').checked,
    enableSlangAlerts: document.getElementById('enableSlangAlerts').checked
  };
}

function broadcastToActiveTab() {
  const payload = collectCurrentSettings();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'UPDATE_SETTINGS',
        ...payload
      }).catch(() => {});
    }
  });
}

function showSavedToast(text) {
  const status = document.getElementById('status');
  status.textContent = text || 'Configurações aplicadas';
  status.classList.add('show');
  setTimeout(() => status.classList.remove('show'), 2200);
}

function saveAllSettings() {
  const next = collectCurrentSettings();

  if (next.enableConversion && next.yuanRate <= 0) {
    renderRateMeta('Informe uma cotação válida ou clique em Sincronizar.');
    return;
  }

  chrome.storage.sync.set(next, () => {
    renderRateMeta();
    broadcastToActiveTab();
    showSavedToast('Configurações aplicadas');
  });
}
