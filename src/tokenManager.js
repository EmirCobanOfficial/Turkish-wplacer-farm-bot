import { log } from "./utils.js";

export const TokenManager = {
    tokenQueue: [], // Şimdi nesneleri depolar: { token: string, receivedAt: number }
    tokenPromise: null,
    resolvePromise: null,
    isTokenNeeded: false,
    TOKEN_EXPIRATION_MS: 2 * 60 * 1000, // 2 dakika

    _purgeExpiredTokens() {
        const now = Date.now();
        const initialSize = this.tokenQueue.length;
        this.tokenQueue = this.tokenQueue.filter(
            item => now - item.receivedAt < this.TOKEN_EXPIRATION_MS
        );
        const removedCount = initialSize - this.tokenQueue.length;
        if (removedCount > 0) {
            log('SİSTEM', 'wplacer', `TOKEN_YÖNETİCİ: Süresi dolmuş ${removedCount} jeton silindi.`);
        }
    },

    async getToken() {
        this._purgeExpiredTokens();

        if (this.tokenQueue.length > 0) {
            const item = this.tokenQueue.shift(); // Atomically get and remove the token
            log('SİSTEM', 'wplacer', `TOKEN_YÖNETİCİ: Jeton kullanılıyor. Sırada ${this.tokenQueue.length} jeton kaldı.`);
            return Promise.resolve(item.token);
        }

        if (!this.tokenPromise) {
            log('SİSTEM', 'wplacer', 'TOKEN_YÖNETİCİ: Bir görev jeton bekliyor. İstemcilere bildiriliyor.');
            this.isTokenNeeded = true;
            this.tokenPromise = new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        }
        return await this.tokenPromise; // Yeni bir jetonun gelmesini bekleyin
    },

    setToken(t) {
        log('SİSTEM', 'wplacer', `✅ TOKEN_YÖNETİCİ: Jeton alındı. Kuyruk boyutu: ${this.tokenQueue.length + 1}`);
        this.isTokenNeeded = false;
        const newToken = { token: t, receivedAt: Date.now() };
        this.tokenQueue.push(newToken);

        if (this.resolvePromise) {
            const firstInQueue = this.tokenQueue.shift(); // Yeni jetonu hemen dağıtın
            this.resolvePromise(firstInQueue.token);
            this.tokenPromise = null;
            this.resolvePromise = null;
        }
    }
};