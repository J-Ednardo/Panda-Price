// Carrega configurações salvas ao abrir o popup
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['yuanRate', 'enableConversion', 'blockPopup'], (data) => {
    if (data.yuanRate) {
      document.getElementById('rate').value = data.yuanRate;
      updateHint(data.yuanRate);
    }
    if (data.enableConversion !== undefined) {
      document.getElementById('enableConversion').checked = data.enableConversion;
    }
    if (data.blockPopup !== undefined) {
      document.getElementById('blockPopup').checked = data.blockPopup;
    }
  });
});

document.getElementById('rate').addEventListener('input', (e) => {
  updateHint(e.target.value);
});

function updateHint(val) {
  const hint = document.getElementById('rate-hint');
  if (val && parseFloat(val) > 0) {
    hint.textContent = `Ex: ¥ 100 = R$ ${(100 * parseFloat(val)).toFixed(2)}`;
    hint.style.color = '#3d9e5a';
  } else {
    hint.textContent = '';
  }
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const rate = parseFloat(document.getElementById('rate').value);
  const enableConversion = document.getElementById('enableConversion').checked;
  const blockPopup = document.getElementById('blockPopup').checked;

  if (!rate || rate <= 0) {
    const hint = document.getElementById('rate-hint');
    hint.textContent = '⚠ Digite uma cotação válida';
    hint.style.color = '#e74c3c';
    return;
  }

  chrome.storage.sync.set({ yuanRate: rate, enableConversion, blockPopup }, () => {
    // Mostra feedback
    const status = document.getElementById('status');
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 2000);

    // Envia mensagem para a aba ativa aplicar as mudanças imediatamente
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'UPDATE_SETTINGS',
          yuanRate: rate,
          enableConversion,
          blockPopup
        }).catch(() => {}); // ignora se a aba não tiver o content script
      }
    });
  });
});
