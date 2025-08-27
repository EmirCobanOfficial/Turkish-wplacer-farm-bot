import { WPlacer } from "./wplacer.js";
import { log, duration, sleep } from "./utils.js";

// server.js'den enjekte edilen bağımlılıklar
let deps = {};

export function initializeFarmManager(dependencies) {
    deps = dependencies;
}

export class FarmManager {
    constructor(userId) {
        this.userId = userId;
        this.running = false;
        this.status = "Başlamayı bekliyor.";
        this.sleepResolve = null;
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
            this.sleepResolve();
            this.sleepResolve = null;
        }
    }

    async start() {
        this.running = true;
        this.status = "Farm yapılıyor...";
        const userName = deps.users[this.userId]?.name || 'Bilinmiyor';
        log(this.userId, userName, `▶️ Çiftlik modu başlatılıyor...`);

        try {
            while (this.running) {
                if (deps.isUserBusy(this.userId, userName)) {
                    log(this.userId, userName, '⚠️ Kullanıcı meşgul, çiftçilik yapmak için bekliyor...');
                    await this.sleep(5000);
                    continue;
                }

                const farmTx = deps.currentSettings.farmTileX || 0;
                const farmTy = deps.currentSettings.farmTileY || 0;
                const farmWplacer = new WPlacer(
                    { width: 1, height: 1, data: [[1]] }, // Yapıcıyı tatmin etmek için sahte 1x1 şablonu
                    [farmTx, farmTy, 0, 0],
                    deps.currentSettings,
                    'FARM'
                );

                deps.lockUser(this.userId);
                try {
                    const userInfo = await farmWplacer.login(deps.users[this.userId].cookies);
                    deps.userStates[this.userId] = { charges: userInfo.charges };

                    if (Math.floor(userInfo.charges.count) < 1) {
                        const waitTime = userInfo.charges.cooldownMs + 2000;
                        log(this.userId, userName, `⏳ Yük kalmadı. Bekleniyor: ${duration(waitTime)}.`);
                        deps.unlockUser(this.userId); // Uzun süreli uyku öncesinde kilidi açın
                        await this.sleep(waitTime);
                        continue;
                    }

                    let paintingComplete = false;
                    while (!paintingComplete && this.running) {
                        try {
                            farmWplacer.token = await deps.TokenManager.getToken();

                            // --- Akıllı Yerleştirme Mantığı ---
                            await farmWplacer.loadTiles(); // Tek hedef karoyu yükler
                            const tileData = farmWplacer.tiles.get(`${farmTx}_${farmTy}`);
                            let targetPx = Math.floor(Math.random() * 1000);
                            let targetPy = Math.floor(Math.random() * 1000);

                            if (tileData) {
                                const paintedPixels = [];
                                for (let x = 0; x < 1000; x++) {
                                    if (!tileData.data[x]) continue;
                                    for (let y = 0; y < 1000; y++) {
                                        if (tileData.data[x][y] !== 0) paintedPixels.push({ x, y });
                                    }
                                }
                                if (paintedPixels.length > 0) {
                                    const randomTarget = paintedPixels[Math.floor(Math.random() * paintedPixels.length)];
                                    targetPx = randomTarget.x;
                                    targetPy = randomTarget.y;
                                    log(this.userId, userName, `[FARM] Akıllı yerleştirme: Alanda ${paintedPixels.length} piksel bulundu. Üzerine yazılıyor: ${targetPx},${targetPy}.`);
                                } else {
                                    log(this.userId, userName, `[FARM] Alan boş. Piksel rastgele yerleştiriliyor.`);
                                }
                            }

                            const randomColor = Math.floor(Math.random() * 31) + 1; // Sadece temel renkler
                            const paintBody = { colors: [randomColor], coords: [targetPx, targetPy], t: farmWplacer.token };
                            await farmWplacer._executePaint(farmTx, farmTy, paintBody);
                            paintingComplete = true;

                        } catch (error) {
                            if (error.message === 'REFRESH_TOKEN') {
                                log(this.userId, userName, `[FARM] 🔄 Jeton geçersiz veya süresi dolmuş. Yeniden deniyor...`);
                                await this.sleep(1000);
                            } else {
                                throw error;
                            }
                        }
                    }
                } catch (error) {
                    if (error.name === "SuspensionError") {
                        const suspendedUntilDate = new Date(error.suspendedUntil).toLocaleString();
                        log(this.userId, userName, `[FARM] 🛑 Hesap, boyama yapmaktan askıya alındı. Bitiş: ${suspendedUntilDate}.`);
                        deps.users[this.userId].suspendedUntil = error.suspendedUntil;
                        deps.saveUsers();
                        await this.sleep(error.durationMs + 5000);
                    } else {
                        deps.logUserError(error, this.userId, userName, "çiftlik eylemi gerçekleştirmek");
                        await this.sleep(30000);
                    }
                } finally {
                    deps.unlockUser(this.userId);
                }

                if (this.running) await this.sleep(deps.currentSettings.accountCooldown);
            }
        } finally {
            this.status = "Durduruldu.";
            log(this.userId, userName, `⏹️ Çiftlik modunu durdurma işlemi tamamlandı.`);
        }
    }

    stop() {
        this.running = false;
        this.interruptSleep();
    }
}