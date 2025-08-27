import { existsSync, createReadStream } from "node:fs";
import readline from "node:readline";
import { Impit } from "impit";
import { TemplateManager } from "./templateManager.js";
import { FarmManager } from "./farmManager.js";
import { WPlacer } from "./wplacer.js";

export function setupApi(app, context) {
    const {
        users, saveUsers, userStates,
        templates, saveTemplates, getSanitizedTemplates,
        currentSettings, saveSettings,
        log, logUserError,
        activeFarms,
        TokenManager,
        broadcastEvent,
        loadProxies, getLoadedProxies,
        proxyStatusCache, saveProxyStatus,
        botStatus,
        statusUpdateTimeout,
        sendDiscordNotification,
        isUserBusy, lockUser, unlockUser,
        statsLogPath
    } = context;

    app.get("/token-needed", (req, res) => {
        res.json({ needed: TokenManager.isTokenNeeded });
    });

    app.post("/t", (req, res) => {
        const { t } = req.body;
        if (!t) return res.sendStatus(400);
        TokenManager.setToken(t);
        res.sendStatus(200);
    });

    app.get('/api/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const clientId = Date.now();
        const newClient = { id: clientId, res };
        context.sseClients.push(newClient);
        log('SİSTEM', 'SSE', `İstemci ${clientId} bağlandı. Toplam istemci: ${context.sseClients.length}`);

        req.on('close', () => {
            context.sseClients = context.sseClients.filter(client => client.id !== clientId);
            log('SİSTEM', 'SSE', `İstemci ${clientId} bağlantıyı kesti. Kalan istemci: ${context.sseClients.length}`);
        });
    });

    app.get("/users", (_, res) => res.json(users));

    app.post("/user", async (req, res) => {
        if (!req.body.cookies || !req.body.cookies.j) return res.sendStatus(400);
        const wplacer = new WPlacer();
        try {
            const userInfo = await wplacer.login(req.body.cookies);
            users[userInfo.id] = { name: userInfo.name, cookies: req.body.cookies, expirationDate: req.body.expirationDate, mode: 'idle' };
            if (users[userInfo.id]) {
                users[userInfo.id].status = 'valid';
                users[userInfo.id].failureCount = 0;
            }
            userStates[userInfo.id] = { charges: userInfo.charges };
            saveUsers();
            broadcastEvent('users_updated', users);
            res.json(userInfo);
        } catch (error) {
            logUserError(error, 'YENİ_KULLANICI', 'N/A', 'yeni kullanıcı ekleme');
            res.status(500).json({ error: error.message });
        }
    });

    app.delete("/user/:id", async (req, res) => {
        const userIdToDelete = req.params.id;
        if (!userIdToDelete || !users[userIdToDelete]) return res.sendStatus(400);

        const deletedUserName = users[userIdToDelete].name;

        if (activeFarms[userIdToDelete]) {
            activeFarms[userIdToDelete].stop();
            delete activeFarms[userIdToDelete];
        }

        delete users[userIdToDelete];
        delete userStates[userIdToDelete];
        saveUsers();
        broadcastEvent('users_updated', users); // Bu olay, kullanıcı listesini yenilemek için index.js tarafından dinlenir
        log('SİSTEM', 'Kullanıcılar', `Kullanıcı silindi: ${deletedUserName}#${userIdToDelete}.`);

        let templatesModified = false;
        for (const templateId in templates) {
            const template = templates[templateId];
            const initialUserCount = template.userIds.length;
            template.userIds = template.userIds.filter(id => id !== userIdToDelete); // Kullanıcıyı şablondan kaldır

            if (template.userIds.length < initialUserCount) {
                templatesModified = true;
                log('SİSTEM', 'Şablonlar', `Kullanıcı (${deletedUserName}) "${template.name}" şablonundan kaldırıldı.`);
                if (template.masterId === userIdToDelete) {
                    template.masterId = template.userIds[0] || null;
                    template.masterName = template.masterId ? users[template.masterId].name : null;
                }
                if (template.userIds.length === 0 && template.running) {
                    template.running = false;
                    log('SİSTEM', 'wplacer', `[${template.name}] 🛑 Şablon, kullanıcı kalmadığı için durduruldu.`);
                }
            }
        }
        if (templatesModified) saveTemplates();
        broadcastEvent('templates_updated', getSanitizedTemplates());
        res.sendStatus(200);
    });

    app.post("/user/:id/farm", async (req, res) => {
        const { id } = req.params;
        const { action } = req.body;

        if (!users[id]) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        if (action === 'start') {
            if (activeFarms[id]) {
                return res.status(409).json({ error: "Kullanıcı zaten çiftçilik yapıyor." });
            }
            const isUserInRunningTemplate = Object.values(templates).some(t => t.running && t.userIds.includes(id));
            if (isUserInRunningTemplate) {
                return res.status(409).json({ error: "Çiftçiliğe başlanamıyor. Kullanıcı çalışan bir şablona atanmıştır." });
            }

            users[id].mode = 'farm';
            saveUsers();

            const farmManager = new FarmManager(id);
            activeFarms[id] = farmManager;
            farmManager.start().catch(error => logUserError(error, id, users[id].name, "çiftlik modunu başlatma"));

            res.status(200).json({ success: true, message: "Çiftçilik başladı." });

        } else if (action === 'stop') {
            if (!activeFarms[id]) return res.status(404).json({ error: "Kullanıcı çiftçilik yapmıyor" });

            activeFarms[id].stop();
            delete activeFarms[id];
            users[id].mode = 'idle';
            saveUsers();

            res.status(200).json({ success: true, message: "Çiftçilik durdu." });
        } else {
            return res.status(400).json({ error: "Geçersiz eylem." });
        }
    });

    app.get("/user/status/:id", async (req, res) => {
        const { id } = req.params;
        if (!users[id] || isUserBusy(id, users[id]?.name)) return res.sendStatus(409);
        lockUser(id);
        const wplacer = new WPlacer();
        try {
            const userInfo = await wplacer.login(users[id].cookies);
            res.status(200).json(userInfo);
        } catch (error) {
            logUserError(error, id, users[id].name, "çerezi doğrula");
            res.status(500).json({ error: error.message });
        } finally {
            unlockUser(id);
        }
    });

    app.post("/users/status", async (req, res) => {
        const userIds = Object.keys(users);
        const results = {};
        const concurrencyLimit = 5;

        const checkUser = async (id) => {
            if (isUserBusy(id, users[id]?.name)) {
                results[id] = { success: false, error: "Kullanıcı meşgul." };
                return;
            }
            lockUser(id);
            const wplacer = new WPlacer();
            try {
                const userInfo = await wplacer.login(users[id].cookies);
                if (users[id].status === 'invalid' || (users[id].failureCount || 0) > 0) {
                    users[id].status = 'valid';
                    users[id].failureCount = 0;
                    log(id, users[id].name, `✅ Kullanıcı durumu, başarılı bir kontrolün ardından artık geçerlidir.`);
                    saveUsers();
                }
                results[id] = { success: true, data: userInfo };
            } catch (error) {
                logUserError(error, id, users[id].name, "toplu çerez doğrulama");
                results[id] = { success: false, error: error.message };
            } finally {
                unlockUser(id);
            }
        };

        const queue = [...userIds];
        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (queue.length > 0) {
                const userId = queue.shift();
                if (userId) {
                    await checkUser(userId);
                }
            }
        });

        await Promise.all(workers);
        res.json(results);
    });

    app.get("/templates", (_, res) => {
        res.json(getSanitizedTemplates());
    });

    app.post("/template", async (req, res) => {
        const { templateName, template, coords, userIds, canBuyCharges, canBuyMaxCharges, antiGriefMode, priority } = req.body;
        if (!templateName || !template || !coords || !userIds || !userIds.length) return res.sendStatus(400);
        if (Object.values(templates).some(t => t.name === templateName)) {
            return res.status(409).json({ error: "Bu isimde bir şablon zaten var." });
        }
        const templateId = Date.now().toString();
        templates[templateId] = new TemplateManager(templateName, template, coords, canBuyCharges, canBuyMaxCharges, antiGriefMode, userIds, priority || 'normal');
        templates[templateId].id = templateId;
        saveTemplates();
        res.status(200).json({ id: templateId });
    });

    app.delete("/template/:id", async (req, res) => {
        const { id } = req.params;
        if (!id || !templates[id] || templates[id].running) return res.sendStatus(400);
        delete templates[id];
        saveTemplates();
        broadcastEvent('template_delete', { id });
        res.sendStatus(200);
    });

    app.put("/template/edit/:id", async (req, res) => {
        const { id } = req.params;
        if (!templates[id]) return res.sendStatus(404);
        const manager = templates[id];
        const { templateName, coords, userIds, canBuyCharges, canBuyMaxCharges, antiGriefMode, priority, template } = req.body;
        manager.name = templateName;
        if (coords) manager.coords = coords;
        if (userIds) manager.userIds = userIds;
        if (canBuyCharges !== undefined) manager.canBuyCharges = canBuyCharges;
        if (canBuyMaxCharges !== undefined) manager.canBuyMaxCharges = canBuyMaxCharges;
        if (antiGriefMode !== undefined) manager.antiGriefMode = antiGriefMode;
        if (priority) manager.priority = priority;
        if (template) {
            manager.template = template;
            manager.totalPixels = manager.template.data.flat().filter(p => p > 0).length;
        }
        manager.masterId = manager.userIds[0];
        manager.masterName = users[manager.masterId].name;
        saveTemplates();
        manager.broadcastUpdate();
        res.sendStatus(200);
    });

    app.put("/template/:id", async (req, res) => {
        const { id } = req.params;
        if (!id || !templates[id]) return res.sendStatus(400);
        const manager = templates[id];
        if (req.body.running && !manager.running) {
            manager.start();
        } else {
            manager.stop();
        }
        res.sendStatus(200);
    });

    app.post('/api/test-discord', async (req, res) => {
        if (!currentSettings.discordWebhookUrl || !currentSettings.discordWebhookUrl.includes('discord.com')) {
            return res.status(400).json({ error: "Ayarlar'da geçerli bir webhook URL'si yapılandırılmamış." });
        }
        try {
            await sendDiscordNotification({
                title: "Webhook Testi Başarılı! ✅",
                description: "Bu mesajı görebiliyorsanız, Discord bildirimleriniz doğru şekilde yapılandırılmıştır.",
                color: 3066993, // Yeşil
                timestamp: new Date().toISOString()
            });
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(500).json({ error: `Test bildirimi gönderilemedi. Ayrıntılar için webhook URL'sini ve sunucu konsolunu kontrol edin. Hata: ${error.message}` });
        }
    });

    app.get('/settings', (_, res) => {
        res.json({ ...currentSettings, proxyCount: getLoadedProxies().length });
    });

    app.put('/settings', (req, res) => {
        const oldSettings = { ...currentSettings };
        // Sabiti yeniden atamak yerine mevcut ayar nesnesini değiştirin.
        Object.assign(currentSettings, req.body);
        saveSettings();
        if (oldSettings.chargeThreshold !== currentSettings.chargeThreshold) {
            for (const id in templates) {
                if (templates[id].running) templates[id].interruptSleep();
            }
            broadcastEvent('settings_updated', currentSettings);
        }
        res.sendStatus(200);
    });

    app.post('/reload-proxies', (req, res) => {
        loadProxies();
        res.status(200).json({ success: true, count: getLoadedProxies().length });
    });

    app.get('/api/bot-status', (req, res) => {
        botStatus.nextCheckTimestamp = statusUpdateTimeout?._idleStart + statusUpdateTimeout?._idleTimeout - Date.now();
        res.json(botStatus);
    });

    app.get('/api/runtime-stats', (req, res) => {
        res.json({
            uptime: Date.now() - context.botStartTime,
            totalPixelsPainted: context.totalPixelsPainted
        });
    });

    app.get("/canvas", async (req, res) => {
        const { tx, ty } = req.query;
        if (isNaN(parseInt(tx)) || isNaN(parseInt(ty))) return res.sendStatus(400);
        try {
            const url = `https://backend.wplace.live/files/s0/tiles/${tx}/${ty}.png`;
            const response = await fetch(url);
            if (!response.ok) return res.sendStatus(response.status);
            const buffer = Buffer.from(await response.arrayBuffer());
            res.json({ image: `data:image/png;base64,${buffer.toString('base64')}` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/proxies/status', async (req, res) => {
        const statuses = [];
        const now = Date.now();
        const CACHE_DURATION = 5 * 60 * 1000;

        const checkProxy = async (proxy) => {
            const proxyKey = `${proxy.host}:${proxy.port}`;
            const cached = proxyStatusCache[proxyKey];

            if (cached && (now - cached.lastChecked < CACHE_DURATION)) {
                return cached;
            }

            let proxyUrl = `${proxy.protocol}://`;
            if (proxy.username && proxy.password) {
                proxyUrl += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
            }
            proxyUrl += `${proxy.host}:${proxy.port}`;

            const startTime = Date.now();
            let status = 'dead';
            let latency = -1;

            try {
                const impit = new Impit({
                    browser: "chrome",
                    ignoreTlsErrors: true,
                    proxyUrl: proxyUrl,
                    timeout: 10000
                });
                const response = await impit.fetch("https://backend.wplace.live/me");
                latency = Date.now() - startTime;
                if (response.ok) {
                    status = latency > 2000 ? 'slow' : 'healthy';
                }
            } catch (error) {
                // Ölü proxy'ler için beklenen
            }


            const result = { host: proxyKey, status, latency, lastChecked: now }; // 'status' dahili bir anahtardır ('healthy', 'slow', 'dead')
            proxyStatusCache[proxyKey] = result;
            return result;
        };

        const concurrencyLimit = 10; // Proxy kontrolleri için eşzamanlılık artırıldı
        const queue = [...getLoadedProxies()];
        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (queue.length > 0) {
                const proxy = queue.shift();
                if (proxy) {
                    statuses.push(await checkProxy(proxy));
                }
            }
        });

        await Promise.all(workers);
        saveProxyStatus();
        res.json(statuses.sort((a, b) => a.host.localeCompare(b.host))); // Tutarlı sıralama için sırala
    });

    app.get('/api/stats', async (req, res) => {
        try {
            if (!existsSync(statsLogPath)) {
                return res.json({
                    pixelsOverTime: [],
                    userContributions: {},
                    dropletsSpent: {}
                });
            }

            const processStatsStream = () => new Promise((resolve, reject) => {
                const pixelsOverTime = {};
                const userContributions = {};
                const dropletsSpent = {};

                const stream = createReadStream(statsLogPath, { encoding: 'utf8' });
                const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

                rl.on('line', (line) => {
                    if (!line.trim()) return;
                    try {
                        const stat = JSON.parse(line);
                        if (stat.type === 'PIXEL_PAINTED') {
                            const hour = new Date(stat.timestamp).setMinutes(0, 0, 0);
                            pixelsOverTime[hour] = (pixelsOverTime[hour] || 0) + stat.count;
                            const userName = users[stat.userId]?.name || `Bilinmiyor#${stat.userId}`;
                            userContributions[userName] = (userContributions[userName] || 0) + stat.count;
                        } else if (stat.type === 'PURCHASE') {
                            const userName = users[stat.userId]?.name || `Bilinmiyor#${stat.userId}`;
                            let cost = 0;
                            if (stat.productId === 70 || stat.productId === 80) {
                                cost = stat.amount * 500;
                            }
                            dropletsSpent[userName] = (dropletsSpent[userName] || 0) + cost;
                        }
                    } catch (e) {
                        // Hatalı biçimlendirilmiş satırları yok say
                    }
                }); rl.on('error', (err) => {
                    reject(err);
                });


                rl.on('close', () => {
                    resolve({
                        pixelsOverTime: Object.entries(pixelsOverTime).map(([ts, count]) => ({ x: parseInt(ts), y: count })),
                        userContributions,
                        dropletsSpent
                    });
                });

                rl.on('error', (err) => reject(err));
            });

            const aggregatedStats = await processStatsStream();
            res.json(aggregatedStats);

        } catch (error) {
            console.error("İstatistikleri işlerken hata oluştu:", error);
            res.status(500).json({ error: "İstatistikleri işleyemedi." });
        }
    });
}