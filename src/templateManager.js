import { WPlacer } from "./wplacer.js";
import { log, duration, sleep } from "./utils.js";

// Döngüsel içe aktarmaları önlemek için server.js'den enjekte edilen bağımlılıklar
let deps = {};

export function initializeTemplateManager(dependencies) {
    deps = dependencies;
}

export class TemplateManager {
    constructor(name, templateData, coords, canBuyCharges, canBuyMaxCharges, antiGriefMode, userIds) {
        this.name = name;
        this.template = templateData;
        this.coords = coords;
        this.canBuyCharges = canBuyCharges;
        this.canBuyMaxCharges = canBuyMaxCharges;
        this.antiGriefMode = antiGriefMode;
        this.userIds = userIds;
        this.running = false;
        this.status = "Boşta.";
        this.masterId = this.userIds[0];
        this.masterName = deps.users[this.masterId]?.name || 'Bilinmiyor';
        this.isFirstRun = true;
        this.sleepResolve = null;
        this.totalPixels = this.template.data.flat().filter(p => p > 0).length;
        this.pixelsRemaining = this.totalPixels;

        // Üstel geri çekilme durumu
        this.initialRetryDelay = 30 * 1000; // 30 saniye
        this.maxRetryDelay = 5 * 60 * 1000; // 5 dakika
        this.currentRetryDelay = this.initialRetryDelay;
    }

    sleep(ms) {
        return new Promise(resolve => {
            this.sleepResolve = resolve;
            setTimeout(() => {
                if (this.sleepResolve) {
                    this.sleepResolve = null;
                    resolve();
                }
            }, ms);
        });
    }

    interruptSleep() {
        if (this.sleepResolve) {
            log('SİSTEM', 'wplacer', `[${this.name}] ⚙️ Ayarlar değiştirildi, uyanma.`);
            this.sleepResolve();
            this.sleepResolve = null;
        }
    }

    async handleUpgrades(wplacer) {
        if (!this.canBuyMaxCharges) return;
        await wplacer.loadUserInfo();
        const affordableDroplets = wplacer.userInfo.droplets - deps.currentSettings.dropletReserve;
        const amountToBuy = Math.floor(affordableDroplets / 500);
        if (amountToBuy > 0) {
            log(wplacer.userInfo.id, wplacer.userInfo.name, `💰 ${amountToBuy} adet maksimum yük yükseltmesi satın alınmaya çalışılıyor.`);
            try {
                await wplacer.buyProduct(70, amountToBuy);
                await this.sleep(deps.currentSettings.purchaseCooldown);
                await wplacer.loadUserInfo();
            } catch (error) {
                deps.logUserError(error, wplacer.userInfo.id, wplacer.userInfo.name, "maksimum yük yükseltmeleri satın alımı");
            }
        }
    }

    async _performPaintTurn(wplacer) {
        const MAX_RETRIES = 3;
        let attempt = 0;
        let paintingComplete = false;

        while (attempt < MAX_RETRIES && !paintingComplete && this.running) {
            attempt++;
            try {
                wplacer.token = await deps.TokenManager.getToken();
                await wplacer.paint();
                paintingComplete = true; // Başarılı!
            } catch (error) {
                if (error.name === "SuspensionError") {
                    // Bu, bu kullanıcı için son durumdur, ana döngü tarafından işlenmek üzere yeniden atılır.
                    throw error;
                }
                if (error.message === 'REFRESH_TOKEN') {
                    log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] 🔄 Jetonun süresi doldu veya geçersiz. Sonraki jetonu deneme ${attempt}/${MAX_RETRIES}...`);
                    // Bunu tam bir deneme olarak saymayın, sadece yeni bir jeton alın.
                    attempt--;
                    await this.sleep(1000);
                    continue;
                }
                if (error.name === 'NetworkError') {
                    // Bu, yeniden denenebilir bir hatadır (ör. 500, 1015, zaman aşımı).
                    if (attempt >= MAX_RETRIES) {
                        log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] ❌ ${MAX_RETRIES} denemeden sonra başarısız olundu. Bu tur atlanıyor.`);
                        throw error; // Give up and let the main loop handle cooldown
                    }
                    const backoffTime = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s...
                    const jitter = Math.random() * 1000; // Add up to 1s of jitter
                    const waitTime = backoffTime + jitter;
                    log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] ⏱️ Boyama sırasında ağ hatası (Deneme ${attempt}/${MAX_RETRIES}). ${duration(waitTime)} içinde yeniden denenecek...`);
                    await this.sleep(waitTime);
                } else {
                    // Ağ dışı, askıya alınmamış hatalar için, hemen yeniden atın.
                    throw error;
                }
            }
        }
    }

    broadcastUpdate() {
        deps.broadcastEvent('template_update', {
            id: this.id, // Sunucu, yönetici oluştururken bir kimlik ataması yapmalıdır.
            name: this.name,
            status: this.status,
            running: this.running,
            pixelsRemaining: this.pixelsRemaining,
            totalPixels: this.totalPixels,
            userIds: this.userIds,
            coords: this.coords
        });
    }

    async start() {
        this.running = true;
        this.currentRetryDelay = this.initialRetryDelay;
        this.status = "Çalışıyor...";
        log('SİSTEM', 'wplacer', `▶️ Başlangıç şablonu baslatılıyor "${this.name}"...`);
        deps.incrementActivePaintingTasks();

        try {
            while (this.running) {
                let pixelsChecked = false;
                const availableCheckUsers = this.userIds.filter(id => !deps.isUserBusy(id, deps.users[id]?.name));
                if (availableCheckUsers.length === 0) {
                    log('SİSTEM', 'wplacer', `[${this.name}] ⏳ Tüm kullanıcılar meşgul. Bekleniyor...`);
                    await this.sleep(5000);
                    continue;
                }

                for (const userId of availableCheckUsers) {
                    const checkWplacer = new WPlacer(this.template, this.coords, deps.currentSettings, this.name);
                    try {
                        await checkWplacer.login(deps.users[userId].cookies);
                        this.pixelsRemaining = await checkWplacer.pixelsLeft();
                        this.broadcastUpdate();
                        this.currentRetryDelay = this.initialRetryDelay;
                        pixelsChecked = true;
                        break;
                    } catch (error) {
                        deps.logUserError(error, userId, deps.users[userId].name, "kalan pikselleri kontrol et");
                    }
                }

                if (!pixelsChecked) {
                    log('SİSTEM', 'wplacer', `[${this.name}] Kullanılabilir tüm kullanıcılar tuval kontrolünü gerçekleştiremedi. Bekleniyor... ${duration(this.currentRetryDelay)} yeniden denemeden önce.`);
                    await this.sleep(this.currentRetryDelay);
                    this.currentRetryDelay = Math.min(this.currentRetryDelay * 2, this.maxRetryDelay);
                    continue;
                }

                if (this.pixelsRemaining === 0) {
                    if (this.antiGriefMode) {
                        this.status = "Anti-grief beklemede...";
                        log('SİSTEM', 'wplacer', `[${this.name}] 🖼 Şablon tamamlandı. Anti-grief modu aktif. ${duration(deps.currentSettings.antiGriefStandby)} içinde tekrar kontrol edilecek.`);
                        await this.sleep(deps.currentSettings.antiGriefStandby);
                        continue;
                    } else {
                        log('SİSTEM', 'wplacer', `[${this.name}] 🖼 Şablon tamamlandı!`);
                        deps.sendDiscordNotification({
                            title: "Şablon Tamamlandı!",
                            description: `Şablon **"${this.name}"** başarıyla tamamlandı.`,
                            color: 3066993, // YEŞİL
                            timestamp: new Date().toISOString()
                        });
                        this.status = "Tamamlandı.";
                        this.running = false;
                        break;
                    }
                }

                const now = Date.now();
                let readyUsers = this.userIds
                    .filter(id => deps.isUserReadyToPaint(id, now))
                    .sort((a, b) => deps.userStates[b].charges.count - deps.userStates[a].charges.count);

                if (readyUsers.length > 0) {
                    const usersToRun = readyUsers.slice(0, deps.currentSettings.templateConcurrency);
                    this.status = `Çalıştırılıyor: ${usersToRun.length} kullanıcı...`;

                    let severeRateLimitDetected = false;

                    const paintPromises = usersToRun.map(userId => (async () => {
                        deps.userCooldowns.set(userId, now + deps.currentSettings.accountCooldown); // bekleme süresini hemen ayarla
                        deps.lockUser(userId);
                        const wplacer = new WPlacer(this.template, this.coords, deps.currentSettings, this.name);
                        try {
                            const userInfo = await wplacer.login(deps.users[userId].cookies);
                            deps.userStates[userId] = { charges: userInfo.charges };
                            log(userInfo.id, userInfo.name, `[${this.name}] 🔋 Kullanıcının ${Math.floor(userInfo.charges.count)} yükü var. Sıra başlıyor...`);

                            await this._performPaintTurn(wplacer);

                            await wplacer.loadUserInfo();
                            if (wplacer.userInfo) deps.userStates[userId] = { charges: wplacer.userInfo.charges };

                            await this.handleUpgrades(wplacer);
                            this.currentRetryDelay = this.initialRetryDelay;
                        } catch (error) {
                            if (error.name === "SuspensionError") {
                                const suspendedUntilDate = new Date(error.suspendedUntil).toLocaleString();
                                log(userId, deps.users[userId].name, `[${this.name}] 🛑 Hesap, resim yapmaktan askıya alındı. ${suspendedUntilDate}.`);
                                deps.sendDiscordNotification({
                                    title: "Hesap Askıya Alındı!",
                                    description: `Kullanıcı **${deps.users[userId].name}** resim yapmaktan uzaklaştırılmıştır.\nYeniden kullanılabilir hale geleceklerdir: **${suspendedUntilDate}**`,
                                    color: 15158332, // Kırmızı
                                    timestamp: new Date().toISOString()
                                });
                                deps.users[userId].suspendedUntil = error.suspendedUntil;
                                deps.saveUsers();
                            } else if (error.name === 'NetworkError') {
                                if (error.message.includes('(401)')) {
                                    severeRateLimitDetected = true;
                                }
                                // Ağ hatasında, kısa bir bekleme süresi daha iyidir.
                                deps.userCooldowns.set(userId, now + 15000); // 15s bekletme süresi
                            }
                            deps.logUserError(error, userId, deps.users[userId].name, "boya dönüşü yap");
                        } finally {
                            deps.unlockUser(userId);
                        }
                    })());

                    await Promise.all(paintPromises);

                    if (severeRateLimitDetected) {
                        const cooldownDuration = 5 * 60 * 1000; // 5 minutes
                        const cooldownUntil = new Date(Date.now() + cooldownDuration).toLocaleTimeString();
                        this.status = `Duraklatıldı (Hız Sınırlaması: ${cooldownUntil})`;
                        log('SİSTEM', 'wplacer', `[${this.name}] 🛑 Ciddi hız sınırı tespit edildi. Şablon ${duration(cooldownDuration)} duraklatılıyor.`);
                        await this.sleep(cooldownDuration);
                    } else {
                        await this.sleep(1000); // Sıkı döngüleri önlemek için kısa bir duraklama
                    }

                } else {
                    if (this.canBuyCharges && !deps.isUserBusy(this.masterId, this.masterName)) {
                        deps.lockUser(this.masterId);
                        const chargeBuyer = new WPlacer(this.template, this.coords, deps.currentSettings, this.name);
                        try {
                            await chargeBuyer.login(deps.users[this.masterId].cookies);
                            const affordableDroplets = chargeBuyer.userInfo.droplets - deps.currentSettings.dropletReserve;
                            if (affordableDroplets >= 500) {
                                const amountToBuy = Math.min(
                                    Math.ceil(this.pixelsRemaining / 30),
                                    Math.floor(affordableDroplets / 500)
                                );
                                if (amountToBuy > 0) {
                                    this.status = "Yük satın alınıyor...";
                                    log(this.masterId, this.masterName, `[${this.name}] 💰 Piksel yükleri satın alınmaya çalışılıyor... ${amountToBuy} adet.`);
                                    await chargeBuyer.buyProduct(80, amountToBuy);
                                    await this.sleep(deps.currentSettings.purchaseCooldown);
                                    continue;
                                }
                            }
                        } catch (error) {
                            deps.logUserError(error, this.masterId, this.masterName, "piksel yükleri satın alma girişimi");
                        } finally {
                            deps.unlockUser(this.masterId);
                        }
                    }

                    const nowForCooldown = Date.now();
                    const cooldowns = this.userIds.map(id => deps.userCooldowns.get(id) || 0)
                        .concat(Object.values(deps.userStates).map(s => s.charges?.cooldownMs || 0))
                        .map(id => deps.userStates[id]?.charges)
                        .filter(Boolean)
                        .map(c => Math.max(0, (Math.max(1, Math.floor(c.max * deps.currentSettings.chargeThreshold)) - Math.floor(c.count)) * c.cooldownMs))
                        .map(cd => cd + nowForCooldown);

                    const waitTime = (cooldowns.length > 0 ? Math.min(...cooldowns) : 60000) + 2000;
                    this.status = `Kullanıcı bekleniyor...`;
                    log('SİSTEM', 'wplacer', `[${this.name}] ⏳ Boyamaya hazır kullanıcı yok. Yüklerin yenilenmesi bekleniyor. ${duration(waitTime)} içinde yeniden denenecek.`);
                    await this.sleep(waitTime);
                }
            }
        } finally {
            deps.decrementActivePaintingTasks();
            if (this.status !== "Tamamlandı.") {
                this.running = false; // Durumu ayarlamadan önce çalışmanın yanlış olduğundan emin olun
                this.status = "Durduruldu.";
            }
        }
    }
}