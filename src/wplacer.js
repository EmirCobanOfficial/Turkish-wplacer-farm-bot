import { CookieJar } from "tough-cookie";
import { Impit } from "impit";
import { Image, createCanvas } from "canvas";
import { NetworkError, SuspensionError, log } from "./utils.js";

// Bu bağımlılıklar, döngüsel içe aktarmaları önlemek için server.js'den aktarılacaktır.
let getNextProxy;
let logStat;
let incrementTotalPixelsPainted;
let getSettings;

export function initializeWplacerDependencies(dependencies) {
    getNextProxy = dependencies.getNextProxy;
    logStat = dependencies.logStat;
    incrementTotalPixelsPainted = dependencies.incrementTotalPixelsPainted;
    getSettings = dependencies.getSettings;
}

const basic_colors = { "0,0,0": 1, "60,60,60": 2, "120,120,120": 3, "210,210,210": 4, "255,255,255": 5, "96,0,24": 6, "237,28,36": 7, "255,127,39": 8, "246,170,9": 9, "249,221,59": 10, "255,250,188": 11, "14,185,104": 12, "19,230,123": 13, "135,255,94": 14, "12,129,110": 15, "16,174,166": 16, "19,225,190": 17, "40,80,158": 18, "64,147,228": 19, "96,247,242": 20, "107,80,246": 21, "153,177,251": 22, "120,12,153": 23, "170,56,185": 24, "224,159,249": 25, "203,0,122": 26, "236,31,128": 27, "243,141,169": 28, "104,70,52": 29, "149,104,42": 30, "248,178,119": 31 };
const premium_colors = { "170,170,170": 32, "165,14,30": 33, "250,128,114": 34, "228,92,26": 35, "214,181,148": 36, "156,132,49": 37, "197,173,49": 38, "232,212,95": 39, "74,107,58": 40, "90,148,74": 41, "132,197,115": 42, "15,121,159": 43, "187,250,242": 44, "125,199,255": 45, "77,49,184": 46, "74,66,132": 47, "122,113,196": 48, "181,174,241": 49, "219,164,99": 50, "209,128,81": 51, "255,197,165": 52, "155,82,73": 53, "209,128,120": 54, "250,182,164": 55, "123,99,82": 56, "156,132,107": 57, "51,57,65": 58, "109,117,141": 59, "179,185,209": 60, "109,100,63": 61, "148,140,107": 62, "205,197,158": 63 };
const pallete = { ...basic_colors, ...premium_colors };
const colorBitmapShift = Object.keys(basic_colors).length + 1;

export class WPlacer {
    constructor(template, coords, settings, templateName) {
        this.template = template;
        this.templateName = templateName;
        this.coords = coords;
        this.settings = settings;
        this.cookies = null;
        this.browser = null;
        this.userInfo = null;
        this.tiles = new Map();
        this.token = null;
    };

    async login(cookies) {
        this.cookies = cookies;
        let jar = new CookieJar();
        for (const cookie of Object.keys(this.cookies)) {
            jar.setCookieSync(`${cookie}=${this.cookies[cookie]}; Path=/`, "https://backend.wplace.live");
        }

        const impitOptions = {
            cookieJar: jar,
            browser: "chrome",
            ignoreTlsErrors: true,
            requestTimeout: getSettings().requestTimeout
        };

        const proxyUrl = getNextProxy();
        if (proxyUrl) {
            impitOptions.proxyUrl = proxyUrl;
        }

        this.browser = new Impit(impitOptions);
        await this.loadUserInfo();
        return this.userInfo;
    };

    async loadUserInfo() {
        const me = await this.browser.fetch("https://backend.wplace.live/me");
        const bodyText = await me.text();

        if (bodyText.trim().startsWith("<!DOCTYPE html>")) {
            throw new NetworkError("Cloudflare kesintisi algılandı. Sunucu kapalı olabilir veya hız sınırlaması uygulanıyor olabilir.");
        }

        try {
            const userInfo = JSON.parse(bodyText);
            if (userInfo.error === "Unauthorized") {
                throw new NetworkError(`(401) Yetkisiz. Bu muhtemelen bir hız sınırıdır.`);
            }
            if (userInfo.error) {
                // This is an error from the wplace.live server, not necessarily a cookie issue.
                throw new NetworkError(`(500) wplace.live sunucu hatası: "${userInfo.error}"`);
            }
            if (userInfo.id && userInfo.name) {
                this.userInfo = userInfo;
                return true;
            }
            throw new Error(`/me uç noktasından beklenmedik yanıt: ${JSON.stringify(userInfo)}`);
        } catch (e) {
            // Zaten bir NetworkError ise veya ayrıştırma başarısız olursa, yeniden atın.
            if (e instanceof NetworkError || e instanceof SyntaxError) throw e;
            // Diğer beklenmedik hatalar için, bunları sarın.
            throw new Error(`Beklenmeyen hata işleme /me yanıtı: ${e.message}`);
        }
    };

    async post(url, body) {
        const request = await this.browser.fetch(url, {
            method: "POST",
            headers: { "Accept": "*/*", "Content-Type": "text/plain;charset=UTF-8", "Referer": "https://wplace.live/" },
            body: JSON.stringify(body)
        });
        const data = await request.json();
        return { status: request.status, data: data };
    };

    async loadTiles() {
        this.tiles.clear();
        const [tx, ty, px, py] = this.coords;
        const endPx = px + this.template.width;
        const endPy = py + this.template.height;
        const endTx = tx + Math.floor(endPx / 1000);
        const endTy = ty + Math.floor(endPy / 1000);

        const tilePromises = [];
        for (let currentTx = tx; currentTx <= endTx; currentTx++) {
            for (let currentTy = ty; currentTy <= endTy; currentTy++) {
                const promise = new Promise((resolve) => {
                    const image = new Image();
                    image.crossOrigin = "Anonymous";
                    image.onload = () => {
                        const canvas = createCanvas(image.width, image.height);
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(image, 0, 0);
                        const tileData = { width: canvas.width, height: canvas.height, data: Array.from({ length: canvas.width }, () => []) };
                        const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        for (let x = 0; x < canvas.width; x++) {
                            for (let y = 0; y < canvas.height; y++) {
                                const i = (y * canvas.width + x) * 4;
                                const [r, g, b, a] = [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
                                tileData.data[x][y] = a === 255 ? (pallete[`${r},${g},${b}`] || 0) : 0;
                            }
                        }
                        resolve(tileData);
                    };
                    image.onerror = () => resolve(null);
                    image.src = `https://backend.wplace.live/files/s0/tiles/${currentTx}/${currentTy}.png?t=${Date.now()}`;
                }).then(tileData => {
                    if (tileData) this.tiles.set(`${currentTx}_${currentTy}`, tileData);
                });
                tilePromises.push(promise);
            }
        }
        await Promise.all(tilePromises);
        return true;
    }

    hasColor(id) {
        if (id < colorBitmapShift) return true;
        return !!(this.userInfo.extraColorsBitmap & (1 << (id - colorBitmapShift)));
    }

    async _executePaint(tx, ty, body) {
        if (body.colors.length === 0) return { painted: 0 };
        const response = await this.post(`https://backend.wplace.live/s0/pixel/${tx}/${ty}`, body);

        if (response.data.painted && response.data.painted === body.colors.length) {
            log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 ${tx}, ${ty} alanına ${body.colors.length} piksel boyandı.`);
            incrementTotalPixelsPainted(body.colors.length);
            logStat({
                type: 'PIXEL_PAINTED',
                userId: this.userInfo.id,
                templateName: this.templateName,
                count: body.colors.length
            });
            return { painted: body.colors.length };
        }
        if (response.status === 401 && response.data.error === "Unauthorized") {
            throw new NetworkError(`(401) Boya sırasında yetkisiz. Bu ciddi bir hız sınırlamasıdır.`);
        }
        if (response.status === 403 && (response.data.error === "refresh" || response.data.error === "Unauthorized")) {
            throw new Error('REFRESH_TOKEN');
        }
        if (response.status === 451 && response.data.suspension) {
            throw new SuspensionError(`Hesap askıya alındı.`, response.data.durationMs || 0);
        }
        if (response.status === 500) {
            throw new NetworkError(`(500) wplace.live sunucu hatası boyama sırasında: "${response.data.error || 'Dahili Sunucu Hatası'}"`);
        }
        if (response.status === 429 || (response.data.error && response.data.error.includes("Error 1015"))) {
            throw new NetworkError("(1015) Hız sınırlamasına tabi tutuluyorsunuz.");
        }
        throw Error(`${tx},${ty} alanı için beklenmedik yanıt: ${JSON.stringify(response)}`);
    }

    _getMismatchedPixels() {
        const [startX, startY, startPx, startPy] = this.coords;
        const mismatched = [];
        for (let y = 0; y < this.template.height; y++) {
            for (let x = 0; x < this.template.width; x++) {
                const templateColor = this.template.data[x][y];
                if (templateColor === 0) continue;

                const globalPx = startPx + x;
                const globalPy = startPy + y;
                const targetTx = startX + Math.floor(globalPx / 1000);
                const targetTy = startY + Math.floor(globalPy / 1000);
                const localPx = globalPx % 1000;
                const localPy = globalPy % 1000;

                const tile = this.tiles.get(`${targetTx}_${targetTy}`);
                if (!tile || !tile.data[localPx]) continue;

                const tileColor = tile.data[localPx][localPy];

                const shouldPaint = this.settings.skipPaintedPixels
                    ? tileColor === 0 // Atlama modu açıksa, yalnızca karo boşsa boyayın.
                    : templateColor !== tileColor; // Aksi takdirde, renk yanlışsa boyayın.

                if (templateColor > 0 && shouldPaint && this.hasColor(templateColor)) {
                    const neighbors = [this.template.data[x - 1]?.[y], this.template.data[x + 1]?.[y], this.template.data[x]?.[y - 1], this.template.data[x]?.[y + 1]];
                    const isEdge = neighbors.some(n => n === 0 || n === undefined);
                    mismatched.push({ tx: targetTx, ty: targetTy, px: localPx, py: localPy, color: templateColor, isEdge });
                }
            }
        }
        return mismatched;
    }

    _sortPixelsToPaint(pixels, isOutlineTurn) {
        let pixelsToProcess = [...pixels]; // Orijinal diziyi değiştirmemek için bir kopya üzerinde çalışın.

        // Koordinatlar için yardımcı işlevler
        const [startX, startY] = this.coords;
        const getGlobalY = (p) => (p.ty - startY) * 1000 + p.py;
        const getGlobalX = (p) => (p.tx - startX) * 1000 + p.px;

        // 1. Temel Yönlü Sıralama
        switch (this.settings.drawingDirection) {
            case 'btt': // Aşağıdan Yukarıya
                pixelsToProcess.sort((a, b) => getGlobalY(b) - getGlobalY(a));
                break;
            case 'ltr': // Soldan sağa
                pixelsToProcess.sort((a, b) => getGlobalX(a) - getGlobalX(b));
                break;
            case 'rtl': // Sağdan sola
                pixelsToProcess.sort((a, b) => getGlobalX(b) - getGlobalX(a));
                break;
            case 'ttb': // Yukarıdan aşağıya
            default:
                pixelsToProcess.sort((a, b) => getGlobalY(a) - getGlobalY(b));
                break;
        }

        // 2. Sipariş Değişikliği Uygula
        switch (this.settings.drawingOrder) {
            case 'random':
                for (let i = pixelsToProcess.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pixelsToProcess[i], pixelsToProcess[j]] = [pixelsToProcess[j], pixelsToProcess[i]];
                }
                break;
            case 'color':
            case 'randomColor': {
                const pixelsByColor = pixelsToProcess.reduce((acc, p) => {
                    if (!acc[p.color]) acc[p.color] = [];
                    acc[p.color].push(p);
                    return acc;
                }, {});
                const colors = Object.keys(pixelsByColor);
                if (this.settings.drawingOrder === 'randomColor') {
                    for (let i = colors.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [colors[i], colors[j]] = [colors[j], colors[i]];
                    }
                }
                pixelsToProcess = colors.flatMap(color => pixelsByColor[color]);
                break;
            }
        }

        // 3. Interleave uygulayın (ancak kontur dönüşlerinde değil)
        if (this.settings.interleavedMode && !isOutlineTurn) {
            const firstPass = pixelsToProcess.filter(p => (getGlobalX(p) + getGlobalY(p)) % 2 === 0);
            const secondPass = pixelsToProcess.filter(p => (getGlobalX(p) + getGlobalY(p)) % 2 !== 0);
            pixelsToProcess = [...firstPass, ...secondPass];
        }

        return pixelsToProcess;
    }

    async paint() {
        await this.loadUserInfo();
        await this.loadTiles();
        if (!this.token) throw new Error("Paint yöntemine token sağlanmadı.");

        let mismatchedPixels = this._getMismatchedPixels();
        if (mismatchedPixels.length === 0) return 0;

        log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] ${mismatchedPixels.length} adet uyumsuz piksel bulundu.`);

        let pixelsToProcess = mismatchedPixels;
        let isOutlineTurn = false;

        // 1. Özet Moduna Öncelik Ver
        if (this.settings.outlineMode) {
            const edgePixels = mismatchedPixels.filter(p => p.isEdge);
            if (edgePixels.length > 0) {
                pixelsToProcess = edgePixels;
                isOutlineTurn = true;
            }
        }

        pixelsToProcess = this._sortPixelsToPaint(pixelsToProcess, isOutlineTurn);

        // 5. Boya işini hazırlayın ve gerçekleştirin
        const pixelsToPaint = pixelsToProcess.slice(0, Math.floor(this.userInfo.charges.count));
        const bodiesByTile = pixelsToPaint.reduce((acc, p) => {
            const key = `${p.tx},${p.ty}`;
            if (!acc[key]) acc[key] = { colors: [], coords: [] };
            acc[key].colors.push(p.color);
            acc[key].coords.push(p.px, p.py);
            return acc;
        }, {});

        let totalPainted = 0;
        for (const tileKey in bodiesByTile) {
            const [tx, ty] = tileKey.split(',').map(Number);
            const body = { ...bodiesByTile[tileKey], t: this.token };
            const result = await this._executePaint(tx, ty, body);
            totalPainted += result.painted;
        }
        return totalPainted;
    }

    async buyProduct(productId, amount) {
        const response = await this.post(`https://backend.wplace.live/purchase`, { product: { id: productId, amount: amount } });
        if (response.data.success) {
            let purchaseMessage = `🛒 Ürün satın alma işlemi başarıyla tamamlandı #${productId} (miktar: ${amount})`;
            if (productId === 80) purchaseMessage = `🛒 ${amount * 500} damlacık karşılığında ${amount * 30} piksel satın alındı`;
            else if (productId === 70) purchaseMessage = `🛒 ${amount * 500} damlacık karşılığında ${amount} adet Maksimum Yük Yükseltmesi satın alındı`;
            logStat({
                type: 'PURCHASE',
                userId: this.userInfo.id,
                productId: productId,
                amount: amount
            });
            log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] ${purchaseMessage}`);
            return true;
        }
        if (response.status === 429 || (response.data.error && response.data.error.includes("Error 1015"))) {
            throw new NetworkError("(1015) Satın alma işlemi yapmaya çalışırken hız sınırlamasına tabi tutuluyorsunuz.");
        }
        throw Error(`Satın alma sırasında beklenmedik yanıt: ${JSON.stringify(response)}`);
    };

    async pixelsLeft() {
        await this.loadTiles();
        return this._getMismatchedPixels().length;
    };
}