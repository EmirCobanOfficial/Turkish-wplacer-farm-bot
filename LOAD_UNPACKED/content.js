// --- Constants ---
const RELOAD_FLAG = 'wplacer_reload_in_progress';

// --- Main Logic ---
console.log("✅ wplacer: İçerik betiği yüklendi.");

// Bu yüklemenin uzantımız tarafından tetiklenip tetiklenmediğini kontrol edin
if (sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.removeItem(RELOAD_FLAG);
    console.log("wplacer: Yeni bir jeton yakalamak için sayfa yeniden yüklendi.");
}

const sentTokens = new Set();

const postToken = (token) => {
    if (!token || typeof token !== 'string' || sentTokens.has(token)) {
        return;
    }
    sentTokens.add(token);
    console.log(`✅ wplacer: CAPTCHA Jetonu Yakalandı. Sunucuya gönderiliyor.`);
    chrome.runtime.sendMessage({ type: "SEND_TOKEN", token: token });
};

// --- Event Listeners ---

// 1. Cloudflare Turnstile iframe'inden gelen mesajları dinle (birincil yöntem)
window.addEventListener('message', (event) => {
    if (event.origin !== "https://challenges.cloudflare.com" || !event.data) {
        return;
    }
    try {
        const token = event.data.token || event.data.response || event.data['cf-turnstile-response'];
        if (token) {
            postToken(token);
        }
    } catch {
        // Mesaj verilerini ayrıştırırken oluşan hataları yoksay
    }
}, true);

// 2. Arka plan betiğinden gelen komutları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "reloadForToken") {
        console.log("wplacer: Arka plan betiğinden yeniden yükleme komutu alındı. Yeniden yükleniyor...");
        sessionStorage.setItem(RELOAD_FLAG, 'true');
        location.reload();
    }
});