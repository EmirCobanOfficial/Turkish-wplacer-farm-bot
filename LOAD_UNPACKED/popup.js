document.addEventListener('DOMContentLoaded', () => {
    const statusEl = document.getElementById('status');
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const sendCookieBtn = document.getElementById('sendCookieBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    let initialHost = '127.0.0.1';
    let initialPort = 80;

    // Load current settings
    chrome.storage.local.get(['wplacerPort', 'wplacerHost'], (result) => {
        initialHost = result.wplacerHost || '127.0.0.1';
        initialPort = result.wplacerPort || 80;
        hostInput.value = initialHost;
        portInput.value = initialPort;
    });

    // Save settings
    saveBtn.addEventListener('click', () => {
        const host = hostInput.value.trim();
        const port = parseInt(portInput.value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            statusEl.textContent = 'Hata: Geçersiz bağlantı noktası numarası.';
            return;
        }

        chrome.storage.local.set({ wplacerPort: port, wplacerHost: host }, () => {
            statusEl.textContent = `Ayarlar kaydedildi. Sunucu adresi ${host}:${port}.`;
            // Inform background script if port changed, so it can reconnect SSE
            if (port !== initialPort || host !== initialHost) {
                chrome.runtime.sendMessage({ action: "settingsUpdated" });
                initialHost = host;
                initialPort = port;
            }
        });
    });

    // Manually send cookie
    sendCookieBtn.addEventListener('click', () => {
        statusEl.textContent = 'Sunucuya çerez gönderiliyor...';
        chrome.runtime.sendMessage({ action: "sendCookie" }, (response) => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = `Hata: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (response.success) {
                statusEl.textContent = `Başarılı! Kullanıcı: ${response.name}.`;
            } else {
                statusEl.textContent = `Hata: ${response.error}`;
            }
        });
    });

    // Quick logout
    logoutBtn.addEventListener('click', () => {
        statusEl.textContent = 'Oturumu kapatma işlemi yapılıyor...';
        chrome.runtime.sendMessage({ action: "quickLogout" }, (response) => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = `Hata: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (response.success) {
                statusEl.textContent = 'Oturum kapatma başarılı. Site verileri silindi..';
            } else {
                statusEl.textContent = `Hata: ${response.error}`;
            }
        });
    });
});