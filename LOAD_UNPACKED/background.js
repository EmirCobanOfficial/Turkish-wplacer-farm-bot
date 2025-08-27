// --- Constants ---
const POLL_ALARM_NAME = 'wplacer-poll-alarm';
const COOKIE_ALARM_NAME = 'wplacer-cookie-alarm';

// --- Core Functions ---
const getSettings = async () => {
    const result = await chrome.storage.local.get(['wplacerPort', 'wplacerHost']);
    return {
        port: result.wplacerPort || 80,
        host: result.wplacerHost || '127.0.0.1'
    };
};

const getServerUrl = async (path = '') => {
    const { host, port } = await getSettings();
    const serverAddress = `http://${host}:${port}`;
    return `${serverAddress}${path}`;
};

// --- Token Refresh Logic ---
const pollForTokenRequest = async () => {
    console.log("wplacer: Token isteği için oylama sunucusu...");
    try {
        const url = await getServerUrl("/token-needed");
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`wplacer: Sunucu yoklaması başarısız oldu, durum: ${response.status}`);
            return;
        }
        const data = await response.json();
        if (data.needed) {
            console.log("wplacer: Sunucu bir jeton gerektiriyor. Yeniden yükleme başlatılıyor.");
            await initiateReload();
        }
    } catch (error) {
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            console.error("wplacer: Jetonları sorgulamak için sunucuya bağlanılamadı. Bot sunucusu çalışıyor mu (`npm start`)?");
        } else {
            console.error("wplacer: Jetonları yoklarken beklenmedik bir hata oluştu.", error);
        }
    }
};

const initiateReload = async () => {
    let tabs; // Sekme listesini daha geniş bir kapsamda tanımla
    try {
        tabs = await chrome.tabs.query({ url: "https://wplace.live/*" });
        if (tabs.length === 0) {
            console.warn("wplacer: Token talep edildi, ancak wplace.live sekmesi açık değil.");
            return;
        }
        const targetTab = tabs.find(t => t.active) || tabs[0];
        console.log(`wplacer: Sekmeye yeniden yükleme komutu gönderme #${targetTab.id}`);
        // İçerik betiğine sayfayı yeniden yüklemesini söylemeyi dene
        await chrome.tabs.sendMessage(targetTab.id, { action: "reloadForToken" });
    } catch (error) {
        if (error.message?.includes('Alıcı taraf mevcut değil')) {
            // Bu, özellikle bir uzantı yeniden yüklendikten sonra beklenen bir hatadır.
            console.log("wplacer: İçerik betiği dinlemiyor, doğrudan yeniden yüklemeye geçiliyor. (Bu, uzantı güncellemesi sonrası normaldir.)");
        } else {
            // Diğer, beklenmedik hataları daha ayrıntılı olarak günlüğe kaydet.
            console.error("wplacer: Sekmeye yeniden yükleme mesajı gönderilirken beklenmedik bir hata oluştu, doğrudan yeniden yüklemeye geri dönülüyor.", error);
        }

        // Geri dönüş mantığı: doğrudan sekmeyi yeniden yükle.
        try {
            if (tabs && tabs.length > 0) {
                const targetTab = tabs.find(t => t.active) || tabs[0];
                if (targetTab) {
                    console.log(`wplacer: Yedek yeniden yükleme tetikleniyor #${targetTab.id}`);
                    chrome.tabs.reload(targetTab.id);
                }
            }
        } catch (reloadError) {
            console.error("wplacer: Yedek yükleme de başarısız oldu.", reloadError);
        }
    }
};

const attemptCookieRefresh = async () => {
    try {
        const tabs = await chrome.tabs.query({ url: "https://wplace.live/*" });
        if (tabs.length === 0) {
            console.warn("wplacer: Çerezlerin yenilenmesi gerekiyor, ancak wplace.live sekmeleri açık değil.");
            return false;
        }
        // Kullanıcıyı rahatsız etmemek için etkin olmayan bir sekmeyi yeniden yüklemeyi tercih et.
        const targetTab = tabs.find(t => !t.active) || tabs[0];
        console.log(`wplacer: #${targetTab.id} sekmesi çerezi yenilemek için yeniden yükleniyor.`);
        await chrome.tabs.reload(targetTab.id);
        return true;
    } catch (error) {
        console.error("wplacer: Çerez yenileme için sekme yeniden yüklenirken hata oluştu.", error);
        return false;
    }
};

// --- User/Cookie Management ---
const sendCookie = async (callback) => {
    const getCookie = (details) => new Promise(resolve => chrome.cookies.get(details, cookie => resolve(cookie)));

    const [jCookie, sCookie] = await Promise.all([
        getCookie({ url: "https://backend.wplace.live", name: "j" }),
        getCookie({ url: "https://backend.wplace.live", name: "s" })
    ]);

    if (!jCookie) {
        if (callback) callback({ success: false, error: "'j' çerezi bulunamadı. Giriş yaptınız mı?" });
        return;
    }

    // --- NEW: Automatic Cookie Refresh Logic ---
    const EXPIRATION_THRESHOLD_HOURS = 24;
    const nowInSeconds = Date.now() / 1000;
    const hoursUntilExpiration = (jCookie.expirationDate - nowInSeconds) / 3600;

    if (hoursUntilExpiration < EXPIRATION_THRESHOLD_HOURS) {
        console.log(`wplacer: Çerezin süresi ~${Math.round(hoursUntilExpiration)} saat içinde dolacak. Yenileme deneniyor.`);
        const refreshTriggered = await attemptCookieRefresh();
        // Yenileme tetiklendiğinde, onUpdated dinleyicisi yeni çerezi göndermeyi üstlenir.
        // Eski, süresi dolan çerezi göndermemek için burada durabiliriz.
        if (refreshTriggered) {
            if (callback) callback({ success: true, message: "Çerez yenileme, bir sekmenin yeniden yüklenmesiyle tetiklendi." });
            return;
        }
    }
    // --- END NEW LOGIC ---

    const cookies = { j: jCookie.value };
    if (sCookie) cookies.s = sCookie.value;

    try {
        const url = await getServerUrl("/user");
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cookies, expirationDate: jCookie.expirationDate })
        });
        if (!response.ok) throw new Error(`Sunucu şu durumla yanıt verdi: ${response.status}`);
        const userInfo = await response.json();
        if (callback) callback({ success: true, name: userInfo.name });
    } catch (error) {
        if (callback) callback({ success: false, error: "Wplacer sunucusuna bağlanılamadı." });
    }
};

const quickLogout = (callback) => {
    const origins = ["https://backend.wplace.live/", "https://wplace.live/"];
    console.log(`wplacer: ${origins.join(', ')} için tarama verileri temizleniyor.`);
    chrome.browsingData.remove({
        // Hem backend hem de ana site için verileri temizle
        origins: origins
    }, {
        cache: true,
        cookies: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        pluginData: true,
        serviceWorkers: true,
        webSQL: true
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("wplacer: Tarama verileri temizlenirken hata oluştu.", chrome.runtime.lastError);
            if (callback) callback({ success: false, error: "Veriler temizlenemedi." });
        } else {
            console.log("wplacer: Tarama verileri başarıyla silindi. wplace.live sekmeleri yeniden yükleniyor.");
            chrome.tabs.query({ url: "https://wplace.live/*" }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    tabs.forEach(tab => chrome.tabs.reload(tab.id));
                }
            });
            if (callback) callback({ success: true });
        }
    });
};

// --- Event Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "sendCookie") {
        sendCookie(sendResponse);
        return true; // Asenkron yanıt için gereklidir
    }
    if (request.action === "quickLogout") {
        quickLogout(sendResponse);
        return true; // Asenkron yanıt için gereklidir
    }
    if (request.type === "SEND_TOKEN") {
        getServerUrl("/t").then(url => {
            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ t: request.token })
            });
        });
    }
    return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.startsWith("https://wplace.live")) {
        console.log("wplacer: wplace.live sekmesi yüklendi. Çerez gönderiliyor.");
        sendCookie(response => console.log(`wplacer: Çerez gönderme durumu: ${response.success ? 'Başarılı' : 'Başarısız'}`));
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === COOKIE_ALARM_NAME) {
        console.log("wplacer: Periyodik alarm tetiklendi. Çerez gönderiliyor.");
        sendCookie(response => console.log(`wplacer: Periyodik çerez yenileme: ${response.success ? 'Başarılı' : 'Başarısız'}`));
    } else if (alarm.name === POLL_ALARM_NAME) {
        pollForTokenRequest();
    }
});

// --- Initialization ---
const initializeAlarms = () => {
    // 45 saniyede bir token isteği için anket yapın. Bu, hizmet çalışanı için ana canlı tutma işlemidir.
    chrome.alarms.create(POLL_ALARM_NAME, {
        delayInMinutes: 0.1,
        periodInMinutes: 0.75 // 45 seconds
    });
    // Çerezleri daha az sıklıkta yenile.
    chrome.alarms.create(COOKIE_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: 20
    });
    console.log("wplacer: Alarmlar başlatıldı.");
};

chrome.runtime.onStartup.addListener(() => {
    console.log("wplacer: Tarayıcı başlatıldı.");
    initializeAlarms();
});

chrome.runtime.onInstalled.addListener(() => {
    console.log("wplacer: Eklenti yüklendi/güncellendi.");
    initializeAlarms();
});