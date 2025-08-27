import { WPlacer } from "./wplacer.js";
import { log, duration } from "./utils.js";

// Bağımlılıklar server.js tarafından başlatılacak
let deps = {};
let lockUser;
let unlockUser;
let isUserReadyToPaint;

export function initializeTemplateManager(dependencies) {
    deps = dependencies;
    lockUser = deps.lockUser;
    unlockUser = deps.unlockUser;
    isUserReadyToPaint = deps.isUserReadyToPaint;
}

export class TemplateManager {
    constructor(name, template, coords, canBuyCharges, canBuyMaxCharges, antiGriefMode, userIds, priority) {
        this.name = name;
        this.template = template;
        this.coords = coords;
        this.canBuyCharges = canBuyCharges;
        this.canBuyMaxCharges = canBuyMaxCharges;
        this.antiGriefMode = antiGriefMode;
        this.priority = priority || 'normal';
        this.userIds = userIds;
        this.running = false;
        this.status = "Boşta.";
        this.masterId = this.userIds[0];
        this.masterName = deps.users[this.masterId]?.name || 'Bilinmiyor';
        this.isFirstRun = true;
        this.isTicking = false; // Zamanlayıcının aynı anda birden fazla kez tetiklemesini önlemek için bayrak
        this.sleepResolve = null;
        this.waitUntil = 0; // Bu şablonun bir sonraki çalışmaya uygun olacağı zaman damgası
        this.totalPixels = this.template.data.flat().filter(p => p > 0).length;
        this.pixelsRemaining = this.totalPixels;

        // Üstel geri çekilme durumu
        this.initialRetryDelay = 30 * 1000; // 30 saniye
        this.maxRetryDelay = 5 * 60 * 1000; // 5 dakika
        this.currentRetryDelay = this.initialRetryDelay;
    }

    getSanitized() {
        return {
            id: this.id, name: this.name, template: this.template, coords: this.coords,
            canBuyCharges: this.canBuyCharges, canBuyMaxCharges: this.canBuyMaxCharges,
            antiGriefMode: this.antiGriefMode, userIds: this.userIds, running: this.running,
            status: this.status, pixelsRemaining: this.pixelsRemaining, totalPixels: this.totalPixels,
            priority: this.priority
        };
    }

    broadcastUpdate() {
        deps.broadcastEvent('template_update', this.getSanitized());
    }

    interruptSleep() { // Bu hala ayarlar değiştiğinde anında tepki için yararlı olabilir
        if (this.sleepResolve) {
            log('SİSTEM', 'wplacer', `[${this.name}] ⚙️ Ayarlar değiştirildi, uyanma.`);
            this.sleepResolve();
            this.sleepResolve = null;
        }
    }

    async checkPixelsLeft() {
        if (!this.masterId || !deps.users[this.masterId]) {
            log('SİSTEM', 'wplacer', `[${this.name}] ⚠️ Piksel kontrolü için ana kullanıcı bulunamadı.`);
            return;
        }
        if (deps.isUserBusy(this.masterId, this.masterName)) {
            return;
        }
        deps.lockUser(this.masterId);
        const wplacer = new WPlacer();
        try {
            await wplacer.login(deps.users[this.masterId].cookies);
            this.pixelsRemaining = await wplacer.getPixelsLeft(this.template, this.coords);
            this.broadcastUpdate();
        } catch (error) {
            deps.logUserError(error, this.masterId, this.masterName, "kalan pikselleri kontrol et");
        } finally {
            deps.unlockUser(this.masterId);
        }
    }

    async _performPaintTurn(wplacer) {
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                await wplacer.paint();
                return; // Başarılı, döngüden çık
            } catch (error) {
                if (error.name === 'NetworkError') {
                    if (attempt >= MAX_RETRIES) {
                        log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] ❌ ${MAX_RETRIES} denemeden sonra başarısız olundu. Bu tur atlanıyor.`);
                        throw error; // Vazgeç ve ana döngünün bekleme süresini yönetmesine izin ver
                    }
                    const backoffTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s...
                    const jitter = Math.random() * 1000;
                    const waitTime = backoffTime + jitter;
                    log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] ⏱️ Boyama sırasında ağ hatası (Deneme ${attempt}/${MAX_RETRIES}). ${duration(waitTime)} içinde yeniden denenecek...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    throw error;
                }
            }
        }
    }

    async start() {
        this.running = true;
        this.status = "Başlatıldı";
        log('SİSTEM', 'wplacer', `▶️ Şablon "${this.name}" çalışmak üzere sıraya alındı.`);
        this.broadcastUpdate();
    }

    async stop() {
        this.running = false;
        this.status = "Durduruldu";
        log('SİSTEM', 'wplacer', `⏹️ Şablon "${this.name}" durduruldu.`);
        this.interruptSleep();
        this.broadcastUpdate();
    }

    async tick() {
        if (!this.running || this.isTicking) return;

        this.isTicking = true;
        deps.incrementActivePaintingTasks();
        try {
            if (this.isFirstRun) {
                await this.checkPixelsLeft();
                this.isFirstRun = false;
            }

            if (this.pixelsRemaining === 0) {
                if (this.antiGriefMode) {
                    this.status = "Anti-grief beklemede...";
                    this.waitUntil = Date.now() + deps.currentSettings.antiGriefStandby;
                    log('SİSTEM', 'wplacer', `[${this.name}] 🖼 Şablon tamamlandı. Anti-grief modu aktif. ${duration(deps.currentSettings.antiGriefStandby)} içinde tekrar kontrol edilecek.`);
                    await this.checkPixelsLeft(); // Uyumadan önce tekrar kontrol et
                    return;
                } else {
                    this.status = "Tamamlandı.";
                    log('SİSTEM', 'wplacer', `[${this.name}] ✅ Şablon tamamlandı. Durduruluyor.`);
                    this.running = false;
                    this.broadcastUpdate();
                    deps.sendDiscordNotification({
                        title: "Şablon Tamamlandı",
                        description: `Şablon **${this.name}** başarıyla tamamlandı.`,
                        color: 3066993, // Yeşil
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
            }

            const now = Date.now();
            const readyUsers = this.userIds.filter(id => deps.isUserReadyToPaint(id, now));

            if (readyUsers.length > 0) {
                this.waitUntil = 0; // Aktif olduğumuz için bekleme süresini sıfırla
                const usersToRun = readyUsers.slice(0, deps.currentSettings.templateConcurrency);
                this.status = `Çalıştırılıyor: ${usersToRun.length} kullanıcı...`;

                let severeRateLimitDetected = false;
                const paintPromises = usersToRun.map(async (userId) => {
                    if (!this.running || severeRateLimitDetected) return;
                    deps.lockUser(userId);
                    const wplacer = new WPlacer(this);
                    try {
                        const userInfo = await wplacer.login(deps.users[userId].cookies);
                        deps.userStates[userId] = { charges: userInfo.charges };
                        log(userInfo.id, userInfo.name, `[${this.name}] 🔋 Kullanıcının ${Math.floor(userInfo.charges.count)} yükü var. Sıra başlıyor...`);
                        await this._performPaintTurn(wplacer);
                        this.currentRetryDelay = this.initialRetryDelay;
                    } catch (error) {
                        if (error.message.includes('(401)')) severeRateLimitDetected = true;
                        deps.logUserError(error, userId, deps.users[userId].name, "boya sırası gerçekleştir");
                    } finally {
                        deps.userCooldowns.set(userId, Date.now() + deps.currentSettings.accountCooldown);
                        deps.unlockUser(userId);
                    }
                });

                await Promise.all(paintPromises);
                await this.checkPixelsLeft();

            } else {
                // Boyamaya hazır kullanıcı yok.
                if (this.canBuyCharges && deps.users[this.masterId] && !deps.isUserBusy(this.masterId, this.masterName)) {
                    deps.lockUser(this.masterId);
                    const chargeBuyer = new WPlacer(this);
                    try {
                        const masterInfo = await chargeBuyer.login(deps.users[this.masterId].cookies);
                        if (masterInfo.droplets >= (500 + deps.currentSettings.dropletReserve)) {
                            const affordableDroplets = masterInfo.droplets - deps.currentSettings.dropletReserve;
                            const amountToBuy = Math.min(10, Math.floor(affordableDroplets / 500));
                            if (amountToBuy > 0) {
                                this.status = "Yük satın alınıyor...";
                                log(this.masterId, this.masterName, `[${this.name}] 💰 Piksel yükleri satın alınmaya çalışılıyor... ${amountToBuy} adet.`);
                                await chargeBuyer.buyProduct(80, amountToBuy);
                                this.waitUntil = Date.now() + deps.currentSettings.purchaseCooldown;
                                return; // Satın aldıktan sonra tick'i bitir
                            }
                        }
                    } catch (error) {
                        deps.logUserError(error, this.masterId, this.masterName, "piksel yükleri satın alma girişimi");
                    } finally {
                        deps.unlockUser(this.masterId);
                    }
                }

                const nowForCooldown = Date.now();
                const cooldowns = this.userIds
                    .map(id => deps.userCooldowns.get(id) || 0)
                    .filter(cd => cd > nowForCooldown)
                    .map(cd => cd - nowForCooldown);

                const waitTime = (cooldowns.length > 0 ? Math.min(...cooldowns) : 60000) + 2000;
                this.waitUntil = Date.now() + waitTime;
                this.status = `Kullanıcı bekleniyor...`;
                log('SİSTEM', 'wplacer', `[${this.name}] ⏳ Boyamaya hazır kullanıcı yok. Yüklerin yenilenmesi bekleniyor. ${duration(waitTime)} içinde yeniden denenecek.`);
            }
        } catch (error) {
            log('SİSTEM', 'wplacer', `[${this.name}] 💥 Ana döngüde beklenmeyen hata: ${error.message}`, error);
        } finally {
            this.isTicking = false;
            deps.decrementActivePaintingTasks();
            this.broadcastUpdate();
        }
    }
}