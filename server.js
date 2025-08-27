import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import express from "express";
import cors from "cors";
import { setupApi } from "./src/api.js";
import { TemplateManager, initializeTemplateManager } from "./src/templateManager.js";
import { FarmManager, initializeFarmManager } from "./src/farmManager.js";
import { WPlacer, initializeWplacerDependencies } from "./src/wplacer.js";
import { TokenManager } from "./src/tokenManager.js";
import { log, duration, sleep, SuspensionError, NetworkError } from "./src/utils.js";

// --- Veri Dizinini Ayarla ---
const dataDir = "./data";
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

// --- İstatistik Kaydı ---
const statsLogPath = path.join(dataDir, "stats.log");
const logStat = (stat) => {
    // Olayı istatistik günlüğü dosyasına yeni bir satır olarak ekleyin.
    const logEntry = JSON.stringify({ ...stat, timestamp: Date.now() }) + '\n';
    appendFileSync(statsLogPath, logEntry);
}

let loadedProxies = [];
const loadProxies = () => {
    const proxyPath = path.join(dataDir, "proxies.txt");
    if (!existsSync(proxyPath)) {
        const exampleContent = "# Proxy'lerinizi buraya, her satıra bir tane olacak şekilde ekleyin.\n# Biçim: protocol://user:pass@host:port\n# Örnek: http://myuser:mypass@proxy.server.com:8080\n# Örnek (kimlik doğrulama yok): socks5://1.2.3.4:1080\n";
        writeFileSync(proxyPath, exampleContent);
        console.log('[SİSTEM] `data/proxies.txt` bulunamadı, örneklerle boş bir tane oluşturuldu.');
        loadedProxies = [];
        return;
    }

    const lines = readFileSync(proxyPath, "utf8").split('\n');
    const proxies = [];
    const proxyRegex = /^(http|https|socks4|socks5):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            continue; // Boş satırları ve yorumları atla
        }
        const match = trimmedLine.match(proxyRegex);
        if (match) {
            proxies.push({
                protocol: match[1],
                username: match[2] || '',
                password: match[3] || '',
                host: match[4],
                port: parseInt(match[5], 10)
            });
        } else {
            console.log(`[SİSTEM] UYARI: Geçersiz proxy biçimi atlandı: "${trimmedLine}"`);
        }
    }
    loadedProxies = proxies;
};


let nextProxyIndex = 0;
const getNextProxy = () => {
    const { proxyEnabled, proxyRotationMode } = currentSettings;
    if (!proxyEnabled || loadedProxies.length === 0) {
        return null;
    }

    let proxy;
    if (proxyRotationMode === 'random') {
        const randomIndex = Math.floor(Math.random() * loadedProxies.length);
        proxy = loadedProxies[randomIndex];
    } else { // Varsayılan olarak sıralı
        proxy = loadedProxies[nextProxyIndex];
        nextProxyIndex = (nextProxyIndex + 1) % loadedProxies.length;
    }

    if (currentSettings.logProxyUsage) {
        log('SİSTEM', 'ProxyYöneticisi', `Proxy kullanma: ${proxy.protocol}://${proxy.host}:${proxy.port}`);
    }

    let proxyUrl = `${proxy.protocol}://`;
    if (proxy.username && proxy.password) {
        proxyUrl += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    proxyUrl += `${proxy.host}:${proxy.port}`;
    return proxyUrl;
};

// --- Veri Kalıcılığı ---
const loadJSON = (filename) => existsSync(path.join(dataDir, filename)) ? JSON.parse(readFileSync(path.join(dataDir, filename), "utf8")) : {};
const saveJSON = (filename, data) => writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 4));

const users = loadJSON("users.json");
const proxyStatusCache = loadJSON("proxy-status.json");
const saveProxyStatus = () => saveJSON("proxy-status.json", proxyStatusCache);
const saveUsers = () => saveJSON("users.json", users);

const templates = {}; // Etkin TemplateManager örnekleri için bellek içi depo
const saveTemplates = () => {
    const templatesToSave = {};
    for (const id in templates) {
        const t = templates[id];
        templatesToSave[id] = {
            name: t.name, template: t.template, coords: t.coords,
            canBuyCharges: t.canBuyCharges, canBuyMaxCharges: t.canBuyMaxCharges,
            antiGriefMode: t.antiGriefMode, userIds: t.userIds
        };
    }
    saveJSON("templates.json", templatesToSave);
};

let currentSettings = {
    turnstileNotifications: false, accountCooldown: 20000, purchaseCooldown: 5000,
    keepAliveCooldown: 5000, dropletReserve: 0, antiGriefStandby: 600000,
    drawingDirection: 'ttb', drawingOrder: 'linear', chargeThreshold: 0.5,
    outlineMode: false, interleavedMode: false, skipPaintedPixels: false, accountCheckCooldown: 1000,
    proxyEnabled: false,
    proxyRotationMode: 'sequential',
    logProxyUsage: false,
    farmTileX: 0,
    farmTileY: 0,
    templateConcurrency: 5,
    requestTimeout: 60000,
    statusCheckInterval: 300000, // 5 dakika
    discordWebhookUrl: ""
};
if (existsSync(path.join(dataDir, "settings.json"))) {
    currentSettings = { ...currentSettings, ...loadJSON("settings.json") };
}
const saveSettings = () => {
    saveJSON("settings.json", currentSettings);
};

// --- Sunucu Durumu ---
const activeBrowserUsers = new Map(); // Zaman damgalarını depolamak için Set'ten Map'e değiştirildi
const activeFarms = {};
let botStatus = {
    lastCheckDuration: 0,
    nextCheckTimestamp: 0
};
let statusUpdateTimeout = null;
let totalPixelsPainted = 0; // Bu artık şirket içinde yönetilecek.
const botStartTime = Date.now();
const userCooldowns = new Map();
let activePaintingTasks = 0;
let userStates = {}; // Kullanıcı durumu için merkezi önbellek

const STALE_LOCK_TIMEOUT = 5 * 60 * 1000; // 5 dakika

const isUserBusy = (id, name) => {
    if (!activeBrowserUsers.has(id)) {
        return false;
    }
    const lockTime = activeBrowserUsers.get(id);
    if (Date.now() - lockTime > STALE_LOCK_TIMEOUT) {
        log(id, name || 'Bilinmiyor', `⚠️ Eski kilit bulundu ${duration(Date.now() - lockTime)}). Kırmak için kilitlendi.`);
        activeBrowserUsers.delete(id);
        return false;
    }
    return true;
};

const lockUser = (id) => activeBrowserUsers.set(id, Date.now());
const unlockUser = (id) => activeBrowserUsers.delete(id);

// --- Server-Sent Events (SSE) for Real-time UI Updates ---
let sseClients = [];

function broadcastEvent(type, data) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => client.res.write(payload));
}

setInterval(() => {
    if (sseClients.length > 0) {
        broadcastEvent('runtime_stats', { uptime: Date.now() - botStartTime, totalPixelsPainted });
    }
}, 1000);

// --- Error Handling ---
function logUserError(error, id, name, context) {
    const message = error.message || "Bilinmeyen bir hata oluştu.";

    // --- Centralized Failure Counting for Auth-related errors ---
    const isAuthFailure = message.includes('(401)') || message.includes('authenticate') || message.includes('parse') || message.includes('Cloudflare kesintisi');
    if (users[id] && isAuthFailure) {
        users[id].failureCount = (users[id].failureCount || 0) + 1;
        if (users[id].failureCount >= 3 && users[id].status !== 'invalid') {
            users[id].status = 'invalid';
            log(id, name, `🚨 Kullanıcı, 3 kez üst üste kimlik doğrulama başarısızlığı yaşadıktan sonra geçersiz olarak işaretlendi. Lütfen uzantı aracılığıyla çerezlerini yenileyin.`);
            sendDiscordNotification({
                title: "Kullanıcı Geçersiz Olarak İşaretlendi",
                description: `Kullanıcı **${name}** (#${id}) Tekrarlanan kimlik doğrulama hataları nedeniyle geçersiz olarak işaretlenmiştir.`,
                color: 15105570, // Orange
                timestamp: new Date().toISOString()
            });
            saveUsers();
        }
    }

    // --- İpuçları ile Özel Hata Günlüğü Kaydı ---
    if (message.includes('UnexpectedEof') || message.includes('closed connection') || message.includes('ConnectionReset') || message.includes('10054')) {
        let hint = ' (İpucu: wplace.live bağlantısı, sunucuları tarafından zorla kapatıldı (Bağlantı Sıfırlandı). Bu durum genellikle IP tabanlı hız sınırlamasından kaynaklanır.';
        if (loadedProxies.length > 0 && currentSettings.proxyEnabled) {
            hint += ' Proxy kullanıyorsunuz, bu durum proxynin kararsız veya engellenmiş olduğunu gösterebilir. Bot bir sonrakine geçecektir.)';
        } else {
            hint += ' En iyi çözüm, `data/proxies.txt` dosyasına proxyleri eklemek ve ayarlarda bunları etkinleştirmektir.)';
        }
        log(id, name, `❌ Başarısız ${context}: Ağ bağlantısı sıfırlandı.${hint}`);
    } else if (message.includes('Request timeout')) {
        const hint = ' (İpucu: wplace.livea yapılan istek zaman aşımına uğradı. Bunun nedeni sunucunun yavaş olması, ağ bağlantısının zayıf olması veya kullanıyorsanız sorunlu bir proxy olabilir. Ayarlarda “İstek Zaman Aşımı”nı artırmayı deneyebilirsiniz.)';
        log(id, name, `❌ Başarısız ${context}: ${message}${hint}`);
    } else if (error.name === 'NetworkError' || message.includes("(500)") || message.includes("(1015)") || message.includes("(502)") || error.name === "SuspensionError") {
        let hint = '';
        if (message.includes('(500)')) {
            hint = ' (İpucu: Bu, wplace.live sunucusunun kendisinden kaynaklanan bir hatadır. Genellikle geçicidir. Yalnızca bir kullanıcıda devam ederse, bu kullanıcının çerezini yeniden eklemeyi deneyin.)';
        } else if (message.includes('(401)')) {
            hint = ' (İpucu: Bu, bir kimlik doğrulama sorununa işaret eder. Geçersiz bir çerez veya IP tabanlı hız sınırı olabilir. Sorun devam ederse, uzantı aracılığıyla kullanıcıyı yeniden eklemeyi veya proxy kullanmayı deneyin.)';
        } else if (error.name === 'NetworkError' && loadedProxies.length === 0) {
            hint = ' (İpucu: Bu genellikle IP hız sınırlamalarından kaynaklanır. data/proxies.txt dosyasına proxy eklemeyi ve ayarlarda bunları etkinleştirmeyi düşünün.)';
        }
        log(id, name, `❌ Başarısız ${context}: ${message}${hint}`);
    } else if (message.includes('is not valid JSON') && message.includes("Unexpected token '<'")) {
        const hint = ' (İpucu: Sunucu, beklenen JSON verisi yerine bir HTML sayfası döndürdü. Bu durum neredeyse her zaman, hız sınırlaması veya şüpheli trafik nedeniyle bir Cloudflare doğrulama sayfasından (CAPTCHA veya "tarayıcınız kontrol ediliyor" ekranı gibi) kaynaklanır. Proxy kullanmak en etkili çözümdür.)';
        log(id, name, `❌ Başarısız ${context}: Geçersiz sunucu yanıtı (JSON yerine HTML).${hint}`);
    } else {
        // Gerçekten bilinmeyen hatalar için, hata giderme amacıyla tam hata nesnesini günlüğe kaydedin.
        log(id, name, `❌ Başarısız ${context}: ${message}`, error);
    }
}

async function sendDiscordNotification(embed) {
    if (!currentSettings.discordWebhookUrl || !currentSettings.discordWebhookUrl.startsWith("https://discord.com/api/webhooks/")) {
        return;
    }

    try {
        await fetch(currentSettings.discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: "WPlacer Bot",
                avatar_url: "https://raw.githubusercontent.com/luluwaffless/wplacer/main/public/icons/favicon.png",
                embeds: [embed]
            })
        });
    } catch (error) {
        console.error("Discord bildirimi gönderilemedi:", error);
    }
}

function isUserReadyToPaint(userId, now) {
    const user = users[userId];
    const state = userStates[userId];

    if (!user || !state || user.mode === 'farm') return false;

    const isOnCooldown = userCooldowns.has(userId) && now < userCooldowns.get(userId);
    if (isOnCooldown || isUserBusy(userId, user.name) || (user.suspendedUntil && now < user.suspendedUntil)) {
        return false;
    }

    const requiredCharges = Math.max(1, Math.floor(state.charges.max * currentSettings.chargeThreshold));
    return Math.floor(state.charges.count) >= requiredCharges;
}

const getSanitizedTemplates = () => {
    const sanitizedTemplates = {};
    for (const id in templates) {
        const t = templates[id];
        sanitizedTemplates[id] = {
            id: id, name: t.name, template: t.template, coords: t.coords,
            canBuyCharges: t.canBuyCharges, canBuyMaxCharges: t.canBuyMaxCharges,
            antiGriefMode: t.antiGriefMode, userIds: t.userIds,
            running: t.running, status: t.status,
            pixelsRemaining: t.pixelsRemaining, totalPixels: t.totalPixels
        };
    }
    return sanitizedTemplates;
};

// --- Arka Plan Durumu Anketi ---
const scheduleNextStatusUpdate = () => {
    if (statusUpdateTimeout) clearTimeout(statusUpdateTimeout);
    statusUpdateTimeout = setTimeout(updateUserStatuses, currentSettings.statusCheckInterval);
};

const updateUserStatuses = async () => {
    const userIds = Object.keys(users);
    if (userIds.length === 0) {
        scheduleNextStatusUpdate();
        return;
    }
    log('SİSTEM', 'wplacer', '⚙️ Tüm kullanıcı durumları için arka plan kontrolü başlatılıyor...');
    const startTime = Date.now();

    const concurrencyLimit = 5;
    const queue = [...userIds];

    const checkUser = async (id) => {
        const user = users[id];
        if (!user) {
            // Kontrol devam ederken kullanıcı muhtemelen silinmiştir. Bu sorun değildir.
            return;
        }
        const userName = user.name;

        if (isUserBusy(id, userName)) {
            log(id, userName, '⚠️ Durum kontrolü atlanıyor: kullanıcı şu anda meşgul.');
            return;
        }
        lockUser(id);
        const wplacer = new WPlacer();
        try {
            const userInfo = await wplacer.login(user.cookies);
            if (user.status === 'invalid' || (user.failureCount || 0) > 0) {
                user.status = 'valid';
                user.failureCount = 0;
                log(id, userName, `✅ Kullanıcı durumu, başarılı bir kontrolün ardından artık geçerlidir.`);
                saveUsers();
            }
            userStates[id] = { charges: userInfo.charges };
        } catch (error) {
            logUserError(error, id, userName, 'arka plan durum kontrolü gerçekleştir');
            delete userStates[id];
        } finally {
            unlockUser(id);
        }
    };

    const workers = Array(concurrencyLimit).fill(null).map(async () => {
        while (queue.length > 0) {
            const userId = queue.shift();
            if (userId) {
                await checkUser(userId);
                await sleep(currentSettings.accountCheckCooldown);
            }
        }
    });

    await Promise.all(workers);
    botStatus.lastCheckDuration = Date.now() - startTime;
    log('SİSTEM', 'wplacer', '✅ Arka plan durumu kontrolü tamamlandı.');
    broadcastEvent('users_updated', users);
    scheduleNextStatusUpdate();
};


// --- Sunucu Başlatma ---
(async () => {
    console.clear();
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    console.log(`\n--- WPLACER v${version} BY Emir ÇOBAN ---\n`);

    // WPlacer sınıfı için bağımlılıkları başlatın
    initializeWplacerDependencies({
        getNextProxy: getNextProxy,
        logStat: logStat,
        incrementTotalPixelsPainted: (count) => { totalPixelsPainted += count; },
        getSettings: () => currentSettings
    });
    initializeTemplateManager({
        users,
        userStates,
        userCooldowns,
        currentSettings,
        logUserError,
        saveUsers,
        TokenManager,
        sendDiscordNotification,
        isUserBusy,
        lockUser,
        unlockUser,
        isUserReadyToPaint,
        broadcastEvent,
        incrementActivePaintingTasks: () => { activePaintingTasks++; },
        decrementActivePaintingTasks: () => { activePaintingTasks--; }
    });
    initializeFarmManager({
        users, userStates, currentSettings, logUserError,
        saveUsers, TokenManager, isUserBusy, lockUser, unlockUser
    });
    const apiContext = {
        users, saveUsers, userStates, templates, saveTemplates, getSanitizedTemplates,
        currentSettings, saveSettings, log, logUserError, activeFarms, FarmManager, WPlacer,
        TokenManager, broadcastEvent, loadProxies, getLoadedProxies: () => loadedProxies, proxyStatusCache, saveProxyStatus,
        botStatus, statusUpdateTimeout, sendDiscordNotification,
        get botStartTime() { return botStartTime; },
        get totalPixelsPainted() { return totalPixelsPainted; },
        isUserBusy, lockUser, unlockUser, statsLogPath, sseClients
    };
    // Tüm çiftlik modlarını sıfırlayın ve önceki oturumun durumlarını başlatın.
    let farmModesReset = 0;
    for (const userId in users) {
        if (users[userId].mode === 'farm') {
            users[userId].mode = 'idle';
            farmModesReset++;
        }
        users[userId].failureCount = 0; // Başlangıçta hata sayısını sıfırla
    }
    if (farmModesReset > 0) saveUsers();

    const loadedTemplates = loadJSON("templates.json");
    for (const id in loadedTemplates) {
        const t = loadedTemplates[id];
        if (t.userIds.every(uid => users[uid])) {
            templates[id] = new TemplateManager(t.name, t.template, t.coords, t.canBuyCharges, t.canBuyMaxCharges, t.antiGriefMode, t.userIds);
            templates[id].id = id;
        } else {
            console.warn(`⚠️ Şablon "${t.name}" atanan kullanıcı(lar) artık mevcut olmadığı için yüklenmedi.`);
        }
    }

    loadProxies();

    console.log(`✅ Yüklendi ${Object.keys(templates).length} şablonlar, ${Object.keys(users).length} kullanıcılar ve ${loadedProxies.length} proxy.`);

    const port = Number(process.env.PORT) || 80;
    const host = "0.0.0.0";

    const app = express();
    app.use(cors());
    app.use(express.static("public"));
    app.use(express.json({ limit: Infinity }));

    setupApi(app, apiContext);

    app.listen(port, host, () => {
        console.log(`✅ Sunucu dinleme http://localhost:${port}`);
        console.log(`   Başlamak için tarayıcınızda web kullanıcı arayüzünü açın`);

        // İlk durum kontrolü, ardından aralık ayarlama
        updateUserStatuses();
    });
})();