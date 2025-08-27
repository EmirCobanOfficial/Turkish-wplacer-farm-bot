// elements
const $ = (id) => document.getElementById(id);
const main = $("main");
const openManageUsers = $("openManageUsers");
const openAddTemplate = $("openAddTemplate");
const openManageTemplates = $("openManageTemplates");
const openSettings = $("openSettings");
const openDashboard = $("openDashboard");
const userForm = $("userForm");
const scookie = $("scookie");
const jcookie = $("jcookie");
const submitUser = $("submitUser");
const manageUsers = $("manageUsers");
const manageUsersTitle = $("manageUsersTitle");
const userList = $("userList");
const checkUserStatus = $("checkUserStatus");
const addTemplate = $("addTemplate");
const convert = $("convert");
const details = $("details");
const size = $("size");
const ink = $("ink");
const premiumWarning = $("premiumWarning");
const templateCanvas = $("templateCanvas");
const previewCanvas = $("previewCanvas");
const previewCanvasButton = $("previewCanvasButton");
const previewBorder = $("previewBorder");
const templateForm = $("templateForm");
const templateFormTitle = $("templateFormTitle");
const convertInput = $("convertInput");
const templateName = $("templateName");
const tx = $("tx");
const ty = $("ty");
const px = $("px");
const py = $("py");
const userSelectList = $("userSelectList");
const selectAllUsers = $("selectAllUsers");
const canBuyMaxCharges = $("canBuyMaxCharges");
const canBuyCharges = $("canBuyCharges");
const antiGriefMode = $("antiGriefMode");
const submitTemplate = $("submitTemplate");
const manageTemplates = $("manageTemplates");
const templateList = $("templateList");
const startAll = $("startAll");
const stopAll = $("stopAll");
const settings = $("settings");
const drawingDirectionSelect = $("drawingDirectionSelect");
const dashboard = $("dashboard");
const drawingOrderSelect = $("drawingOrderSelect");
const outlineMode = $("outlineMode");
const interleavedMode = $("interleavedMode");
const skipPaintedPixels = $("skipPaintedPixels");
const turnstileNotifications = $("turnstileNotifications");
const accountCooldown = $("accountCooldown");
const purchaseCooldown = $("purchaseCooldown");
const accountCheckCooldown = $("accountCheckCooldown");
const dropletReserve = $("dropletReserve");
const requestTimeout = $("requestTimeout");
const antiGriefStandby = $("antiGriefStandby");
const templateConcurrency = $("templateConcurrency");
const chargeThreshold = $("chargeThreshold");
const totalCharges = $("totalCharges");
const totalMaxCharges = $("totalMaxCharges");
const messageBoxOverlay = $("messageBoxOverlay");
const discordWebhookUrl = $("discordWebhookUrl");
const lastCheckDuration = $("lastCheckDuration");
const nextCheckIn = $("nextCheckIn");
const statusCheckInterval = $("statusCheckInterval");
const botUptime = $("botUptime");
const totalPixelsStat = $("totalPixelsStat");
const messageBoxTitle = $("messageBoxTitle");
const messageBoxContent = $("messageBoxContent");
const messageBoxConfirm = $("messageBoxConfirm");
const messageBoxCancel = $("messageBoxCancel");
const proxyEnabled = $("proxyEnabled");
const testDiscordBtn = $("testDiscordBtn");
const proxyFormContainer = $("proxyFormContainer");
const proxyRotationMode = $("proxyRotationMode");
const proxyCount = $("proxyCount");
const reloadProxiesBtn = $("reloadProxiesBtn");
const logProxyUsage = $("logProxyUsage");
const farmTileX = $("farmTileX");
const farmTileY = $("farmTileY");
const refreshDashboardBtn = $("refreshDashboardBtn");

// --- Global State ---

// --- Çeviri Yardımcıları ---
const translateTemplateStatus = (status) => {
    if (!status) return "Bilinmiyor";
    if (status.startsWith('Waiting for user')) return status.replace('Waiting for user', 'Kullanıcı bekleniyor');
    const translations = {
        "Finished.": "Tamamlandı.",
        "Running...": "Çalışıyor...",
        "Idle.": "Boşta.",
        "Buying charges...": "Yük satın alınıyor...",
        "Anti-grief standby...": "Anti-grief beklemede...",
        "Stopped": "Durduruldu",
        "Started": "Başlatıldı"
    };
    return translations[status] || status;
};

const translateProxyStatus = (status) => {
    if (!status) return "Bilinmiyor";
    switch (status.toLowerCase()) {
        case 'healthy': return 'Sağlıklı';
        case 'unhealthy': return 'Sağlıksız';
        case 'testing': return 'Test Ediliyor';
        default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
};

// Message Box
let confirmCallback = null;

const showMessage = (title, content) => {
    messageBoxTitle.innerHTML = title;
    messageBoxContent.innerHTML = content;
    messageBoxCancel.classList.add('hidden');
    messageBoxConfirm.textContent = 'Tamam';
    messageBoxOverlay.classList.remove('hidden');
    confirmCallback = null;
};

const showConfirmation = (title, content, onConfirm) => {
    messageBoxTitle.innerHTML = title;
    messageBoxContent.innerHTML = content;
    messageBoxCancel.classList.remove('hidden');
    messageBoxConfirm.textContent = 'Onayla';
    messageBoxOverlay.classList.remove('hidden');
    confirmCallback = onConfirm;
};

const closeMessageBox = () => {
    messageBoxOverlay.classList.add('hidden');
    confirmCallback = null;
};

messageBoxConfirm.addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback();
    }
    closeMessageBox();
});

messageBoxCancel.addEventListener('click', () => {
    closeMessageBox();
});

const handleError = (error) => {
    console.error(error);
    let message = "Bilinmeyen bir hata oluştu. Ayrıntılar için konsolu kontrol edin.";

    if (error.code === 'ERR_NETWORK') {
        message = "Sunucuya bağlanılamadı. Lütfen botun çalıştığından ve erişilebilir olduğundan emin olun.";
    } else if (error.response && error.response.data && error.response.data.error) {
        const errMsg = error.response.data.error;
        if (errMsg.includes("(1015)")) {
            message = "Sunucu tarafından hız sınırına takıldınız. Lütfen bir süre bekleyip tekrar deneyin.";
        } else if (errMsg.includes("(500)")) {
            message = `wplace.live sunucusu bir iç hata bildirdi. Bu genellikle onların tarafında geçici bir sorundur. Lütfen bekleyin ve daha sonra tekrar deneyin. Belirtilen hata: <br><i>${errMsg}</i>`;
        } else if (errMsg.includes("(401)")) {
            message = "Kimlik doğrulama başarısız oldu (Yetkisiz). Bunun iki yaygın nedeni olabilir:<br><br>" +
                "<b>1. Geçersiz Çerez:</b> Kullanıcının çerezi yanlış, süresi dolmuş veya geçersiz kılınmış olabilir. Kullanıcıyı tarayıcı uzantısı aracılığıyla yeniden eklemeyi deneyin.<br>" +
                "<b>2. IP Hız Sınırı:</b> Sunucu, çok fazla istek yaptığınız için IP'nizi engelliyor. Bu, birden fazla hesap çalıştırırken çok yaygındır. <b>Çözüm, ayarlardan proxy eklemek ve etkinleştirmektir.</b>";
        } else if (errMsg.includes("(502)")) {
            message = "Sunucu bir 'Kötü Ağ Geçidi' hatası bildirdi. Geçici olarak kapalı veya yeniden başlatılıyor olabilir. Lütfen birkaç dakika içinde tekrar deneyin.";
        } else if (error.response && error.response.status === 409) { // Conflict
            message = `İşlem bir çakışma nedeniyle başarısız oldu. Sunucunun bildirdiği: "${errMsg}" <br><br><b>Yaygın Neden:</b> Zaten çalışan bir şablona atanmış bir kullanıcıyla farm yapmaya çalışmak. Lütfen önce şablonu durdurun.`;
        } else {
            message = errMsg;
        }
    }
    showMessage("Hata", message);
};

const renderProxyStatusTable = async () => {
    const tableBody = document.querySelector('#proxyStatusTable tbody');
    if (!tableBody) return;

    try {
        // Show a loading state
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Proxy durumları yükleniyor...</td></tr>';
        const { data: proxies } = await axios.get('/api/proxies/status');
        tableBody.innerHTML = ''; // Clear old data

        if (proxies.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Yüklü proxy yok.</td></tr>';
            return;
        }

        for (const proxy of proxies) {
            const row = document.createElement('tr');
            row.className = `status-${proxy.status}`; // e.g., status-healthy

            const lastChecked = proxy.lastChecked ? new Date(proxy.lastChecked).toLocaleString() : 'Hiç';
            const latency = proxy.latency > -1 ? `${proxy.latency}ms` : 'N/A';

            row.innerHTML = `
                <td>${proxy.host}</td>
                <td>${translateProxyStatus(proxy.status)}</td>
                <td>${latency}</td>
                <td>${lastChecked}</td>
            `;
            tableBody.appendChild(row);
        }
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Proxy durumları yüklenemedi.</td></tr>';
        console.error("Proxy durum tablosu oluşturulamadı:", error);
    }
};

const updateRuntimeStats = async () => {
    try {
        const { data } = await axios.get('/api/runtime-stats');

        const uptimeMs = data.uptime;
        const totalSeconds = Math.floor(uptimeMs / 1000);
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');

        botUptime.textContent = `${hours}:${minutes}:${seconds}`;
        totalPixelsStat.textContent = data.totalPixelsPainted.toLocaleString();

    } catch (error) {
        botUptime.textContent = 'Hata';
        totalPixelsStat.textContent = 'Hata';
        // Don't show a popup for a silent background update failure
        console.error("Çalışma zamanı istatistikleri güncellenemedi:", error);
    }
};

const updateBotStatus = async () => {
    try {
        const { data } = await axios.get('/api/bot-status');

        if (lastCheckDuration) {
            lastCheckDuration.textContent = data.lastCheckDuration > 0 ? `${(data.lastCheckDuration / 1000).toFixed(2)}s` : 'Yok';
        }
        if (nextCheckIn) {
            const remainingMs = data.nextCheckTimestamp;
            if (remainingMs > 0) {
                const totalSeconds = Math.floor(remainingMs / 1000);
                const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
                const seconds = String(totalSeconds % 60).padStart(2, '0');
                nextCheckIn.textContent = `${minutes}:${seconds}`;
            } else {
                nextCheckIn.textContent = 'Şimdi...';
            }
        }
    } catch (error) {
        if (lastCheckDuration) lastCheckDuration.textContent = 'Hata';
        if (nextCheckIn) nextCheckIn.textContent = 'Hata';
        console.error("Bot durumu güncellenemedi:", error);
    }
};

// users
const loadUsers = async (f) => {
    try {
        const users = await axios.get("/users");
        if (f) f(users.data);
    } catch (error) {
        handleError(error);
    };
};
userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const response = await axios.post('/user', { cookies: { s: scookie.value, j: jcookie.value } });
        if (response.status === 200) {
            showMessage("Başarılı", `Giriş yapıldı: ${response.data.name} (#${response.data.id})!`);
            userForm.reset();
            openManageUsers.click(); // Refresh the view
        }
    } catch (error) {
        handleError(error);
    };
});

// templates
const basic_colors = { "0,0,0": 1, "60,60,60": 2, "120,120,120": 3, "210,210,210": 4, "255,255,255": 5, "96,0,24": 6, "237,28,36": 7, "255,127,39": 8, "246,170,9": 9, "249,221,59": 10, "255,250,188": 11, "14,185,104": 12, "19,230,123": 13, "135,255,94": 14, "12,129,110": 15, "16,174,166": 16, "19,225,190": 17, "40,80,158": 18, "64,147,228": 19, "96,247,242": 20, "107,80,246": 21, "153,177,251": 22, "120,12,153": 23, "170,56,185": 24, "224,159,249": 25, "203,0,122": 26, "236,31,128": 27, "243,141,169": 28, "104,70,52": 29, "149,104,42": 30, "248,178,119": 31 };
const premium_colors = { "170,170,170": 32, "165,14,30": 33, "250,128,114": 34, "228,92,26": 35, "214,181,148": 36, "156,132,49": 37, "197,173,49": 38, "232,212,95": 39, "74,107,58": 40, "90,148,74": 41, "132,197,115": 42, "15,121,159": 43, "187,250,242": 44, "125,199,255": 45, "77,49,184": 46, "74,66,132": 47, "122,113,196": 48, "181,174,241": 49, "219,164,99": 50, "209,128,81": 51, "255,197,165": 52, "155,82,73": 53, "209,128,120": 54, "250,182,164": 55, "123,99,82": 56, "156,132,107": 57, "51,57,65": 58, "109,117,141": 59, "179,185,209": 60, "109,100,63": 61, "148,140,107": 62, "205,197,158": 63 };
const colors = { ...basic_colors, ...premium_colors };

const colorById = (id) => Object.keys(colors).find(key => colors[key] === id);
const closest = color => {
    const [tr, tg, tb] = color.split(',').map(Number);
    // Search all available colors (basic and premium)
    return Object.keys(colors).reduce((closestKey, currentKey) => {
        const [cr, cg, cb] = currentKey.split(',').map(Number);
        const [clR, clG, clB] = closestKey.split(',').map(Number);
        const currentDistance = Math.pow(tr - cr, 2) + Math.pow(tg - cg, 2) + Math.pow(tb - cb, 2);
        const closestDistance = Math.pow(tr - clR, 2) + Math.pow(tg - clG, 2) + Math.pow(tb - clB, 2);
        return currentDistance < closestDistance ? currentKey : closestKey;
    });
};

const drawTemplate = (template, canvas) => {
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, template.width, template.height);
    const imageData = new ImageData(template.width, template.height);
    for (let x = 0; x < template.width; x++) {
        for (let y = 0; y < template.height; y++) {
            const color = template.data[x][y];
            if (color === 0) continue;
            const i = (y * template.width + x) * 4;
            if (color === -1) {
                imageData.data[i] = 158;
                imageData.data[i + 1] = 189;
                imageData.data[i + 2] = 255;
                imageData.data[i + 3] = 255;
                continue;
            };
            const [r, g, b] = colorById(color).split(',').map(Number);
            imageData.data[i] = r;
            imageData.data[i + 1] = g;
            imageData.data[i + 2] = b;
            imageData.data[i + 3] = 255;
        };
    };
    ctx.putImageData(imageData, 0, 0);
};
const loadTemplates = async (f) => {
    try {
        const templates = await axios.get("/templates");
        if (f) f(templates.data);
    } catch (error) {
        handleError(error);
    };
};
const fetchCanvas = async (txVal, tyVal, pxVal, pyVal, width, height) => {
    const TILE_SIZE = 1000;
    const radius = Math.max(0, parseInt(previewBorder.value, 10) || 0);

    const startX = txVal * TILE_SIZE + pxVal - radius;
    const startY = tyVal * TILE_SIZE + pyVal - radius;
    const displayWidth = width + (radius * 2);
    const displayHeight = height + (radius * 2);
    const endX = startX + displayWidth;
    const endY = startY + displayHeight;

    const startTileX = Math.floor(startX / TILE_SIZE);
    const startTileY = Math.floor(startY / TILE_SIZE);
    const endTileX = Math.floor((endX - 1) / TILE_SIZE);
    const endTileY = Math.floor((endY - 1) / TILE_SIZE);

    previewCanvas.width = displayWidth;
    previewCanvas.height = displayHeight;
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    for (let txi = startTileX; txi <= endTileX; txi++) {
        for (let tyi = startTileY; tyi <= endTileY; tyi++) {
            try {
                const response = await axios.get('/canvas', { params: { tx: txi, ty: tyi } });
                const img = new Image();
                img.src = response.data.image;
                await img.decode();
                const sx = (txi === startTileX) ? startX - txi * TILE_SIZE : 0;
                const sy = (tyi === startTileY) ? startY - tyi * TILE_SIZE : 0;
                const ex = (txi === endTileX) ? endX - txi * TILE_SIZE : TILE_SIZE;
                const ey = (tyi === endTileY) ? endY - tyi * TILE_SIZE : TILE_SIZE;
                const sw = ex - sx;
                const sh = ey - sy;
                const dx = txi * TILE_SIZE + sx - startX;
                const dy = tyi * TILE_SIZE + sy - startY;
                ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
            } catch (error) {
                handleError(error);
                return;
            }
        }
    }

    const baseImage = ctx.getImageData(0, 0, displayWidth, displayHeight);
    const templateCtx = templateCanvas.getContext('2d');
    const templateImage = templateCtx.getImageData(0, 0, width, height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(templateCanvas, radius, radius);
    ctx.globalAlpha = 1;
    const b = baseImage.data;
    const t = templateImage.data;
    for (let i = 0; i < t.length; i += 4) {
        // skip transparent template pixels
        if (t[i + 3] === 0) continue;

        const templateIdx = i / 4;
        const templateX = templateIdx % width;
        const templateY = Math.floor(templateIdx / width);
        const canvasX = templateX + radius;
        const canvasY = templateY + radius;
        const canvasIdx = (canvasY * displayWidth + canvasX) * 4;

        if (b[canvasIdx + 3] === 0) continue;

        ctx.fillStyle = 'rgba(255,0,0,0.8)';
        ctx.fillRect(canvasX, canvasY, 1, 1);
    }
    previewCanvas.style.display = 'block';
};

const nearestimgdecoder = (imageData, width, height) => {
    const d = imageData.data;
    const matrix = Array.from({ length: width }, () => Array(height).fill(0));
    let ink = 0;
    let hasPremium = false;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const a = d[i + 3];
            if (a === 255) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const rgb = `${r},${g},${b}`;
                if (rgb == "158,189,255") {
                    matrix[x][y] = -1;
                } else {
                    const id = colors[rgb] || colors[closest(rgb)];
                    matrix[x][y] = id;
                    if (id >= 32) hasPremium = true;
                }
                ink++;
            } else {
                matrix[x][y] = 0;
            }
        }
    }
    return { matrix, ink, hasPremium };
};

let currentTemplate = { width: 0, height: 0, data: [] };

const processImageFile = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const image = new Image();
        image.src = e.target.result;
        image.onload = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { matrix, ink, hasPremium } = nearestimgdecoder(imageData, canvas.width, canvas.height);

            const template = {
                width: canvas.width,
                height: canvas.height,
                ink,
                data: matrix,
                hasPremium
            };

            canvas.remove();
            callback(template);
        };
    };
    reader.readAsDataURL(file);
};
const processEvent = () => {
    const file = convertInput.files[0];
    if (file) {
        templateName.value = file.name.replace(/\.[^/.]+$/, "");
        processImageFile(file, (template) => {
            currentTemplate = template;
            drawTemplate(template, templateCanvas);
            size.innerHTML = `${template.width}x${template.height}px`;
            ink.innerHTML = template.ink;
            if (template.hasPremium) {
                premiumWarning.innerHTML = "<b>UYARI:</b> Bu şablon premium renkler kullanır. Seçtiğiniz hesapların bunları satın aldığından emin olun.";
                premiumWarning.style.display = "block";
            } else {
                premiumWarning.style.display = "none";
            }
            templateCanvas.style.display = 'block';
            previewCanvas.style.display = 'none';
            details.style.display = "block";
        });
    };
};
convertInput.addEventListener('change', processEvent);

previewCanvasButton.addEventListener('click', async () => {
    const txVal = parseInt(tx.value, 10);
    const tyVal = parseInt(ty.value, 10);
    const pxVal = parseInt(px.value, 10);
    const pyVal = parseInt(py.value, 10);
    if (isNaN(txVal) || isNaN(tyVal) || isNaN(pxVal) || isNaN(pyVal) || currentTemplate.width === 0) {
        showMessage("Hata", "Önizleme yapmadan önce lütfen bir görüntüyü dönüştürün ve geçerli koordinatları girin..");
        return;
    }
    await fetchCanvas(txVal, tyVal, pxVal, pyVal, currentTemplate.width, currentTemplate.height);
});

canBuyMaxCharges.addEventListener('change', () => {
    if (canBuyMaxCharges.checked) {
        canBuyCharges.checked = false;
    }
});

canBuyCharges.addEventListener('change', () => {
    if (canBuyCharges.checked) {
        canBuyMaxCharges.checked = false;
    }
});

const resetTemplateForm = () => {
    templateForm.reset();
    templateFormTitle.textContent = "Şablon Ekle";
    submitTemplate.innerHTML = '<img src="icons/addTemplate.svg">Şablon Ekle';
    delete templateForm.dataset.editId;
    details.style.display = "none";
    premiumWarning.style.display = "none";
    previewCanvas.style.display = 'none';
    currentTemplate = { width: 0, height: 0, data: [] };
};

templateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEditMode = !!templateForm.dataset.editId;

    if (!isEditMode && currentTemplate.width === 0) {
        showMessage("Hata", "Şablon oluşturmadan önce lütfen görüntüyü dönüştürün.");
        return;
    }
    const selectedUsers = Array.from(document.querySelectorAll('input[name="user_checkbox"]:checked')).map(cb => cb.value);
    if (selectedUsers.length === 0) {
        showMessage("Hata", "Lütfen en az bir kullanıcı seçin.");
        return;
    }

    const data = {
        templateName: templateName.value,
        coords: [tx.value, ty.value, px.value, py.value].map(Number),
        userIds: selectedUsers,
        canBuyCharges: canBuyCharges.checked,
        canBuyMaxCharges: canBuyMaxCharges.checked,
        antiGriefMode: antiGriefMode.checked
    };

    if (!isEditMode || (isEditMode && currentTemplate.width > 0)) {
        data.template = currentTemplate;
    }

    try {
        if (isEditMode) {
            await axios.put(`/template/edit/${templateForm.dataset.editId}`, data);
            showMessage("Başarılı", "Şablon güncellendi!");
        } else {
            await axios.post('/template', data);
            showMessage("Başarılı", "Şablon oluşturuldu!");
        }
        resetTemplateForm();
        openManageTemplates.click();
    } catch (error) {
        handleError(error);
    };
});
startAll.addEventListener('click', async () => {
    for (const child of templateList.children) {
        try {
            await axios.put(`/template/${child.id}`, { running: true });
        } catch (error) {
            handleError(error);
        };
    };
    showMessage("Başarılı", "Bitti! Ayrıntılar için konsolu kontrol edin.");
    openManageTemplates.click();
});
stopAll.addEventListener('click', async () => {
    for (const child of templateList.children) {
        try {
            await axios.put(`/template/${child.id}`, { running: false });
        } catch (error) {
            handleError(error);
        };
    };
    showMessage("Başarılı", "Bitti! Ayrıntılar için konsolu kontrol edin.");
    openManageTemplates.click();
});

let pixelsChart = null;
let usersChart = null;
let dropletsChart = null;

const renderDashboard = async () => {
    try {
        // Add a cache-busting parameter to ensure we always get fresh data
        const { data: stats } = await axios.get('/api/stats', {
            params: {
                _: new Date().getTime()
            }
        });

        // Chart 1: Pixels Over Time
        const pixelsCtx = $('pixelsOverTimeChart').getContext('2d');
        if (pixelsChart) pixelsChart.destroy();
        pixelsChart = new Chart(pixelsCtx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Boyanan Pikseller',
                    data: stats.pixelsOverTime,
                    borderColor: 'hsl(25, 95%, 55%)',
                    backgroundColor: 'hsla(25, 95%, 55%, 0.2)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            tooltipFormat: 'MMM d, h a'
                        },
                        title: { display: true, text: 'Tarih' }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Piksel Sayısı' }
                    }
                }
            }
        });

        // Chart 2: User Contributions
        const usersCtx = $('userContributionChart').getContext('2d');
        const sortedUsers = Object.entries(stats.userContributions).sort(([, a], [, b]) => b - a);

        const userLabels = sortedUsers.map(entry => entry[0]);
        const userData = sortedUsers.map(entry => entry[1]);

        if (usersChart) usersChart.destroy();
        usersChart = new Chart(usersCtx, {
            type: 'bar',
            data: {
                labels: userLabels,
                datasets: [{
                    label: 'Toplam Boyanan Pikseller',
                    data: userData,
                    backgroundColor: 'hsla(199, 88%, 60%, 0.6)',
                    borderColor: 'hsl(199, 88%, 60%)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bar chart
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Chart 3: Droplets Spent
        const dropletsCtx = $('dropletsSpentChart').getContext('2d');
        const sortedDroplets = Object.entries(stats.dropletsSpent || {}).sort(([, a], [, b]) => b - a);

        const dropletLabels = sortedDroplets.map(entry => entry[0]);
        const dropletData = sortedDroplets.map(entry => entry[1]);

        if (dropletsChart) dropletsChart.destroy();
        dropletsChart = new Chart(dropletsCtx, {
            type: 'bar',
            data: {
                labels: dropletLabels,
                datasets: [{
                    label: 'Toplam Harcanan Damlacıklar',
                    data: dropletData,
                    backgroundColor: 'hsla(50, 95%, 60%, 0.6)', // Gold/yellow color
                    borderColor: 'hsl(50, 95%, 60%)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bar chart
                scales: {
                    x: {
                        beginAtZero: true,
                        title: { display: true, text: 'Damlacıklar' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

    } catch (error) {
        handleError(error);
    }
};


// tabs
let currentTab = main;
const changeTab = (el) => {
    currentTab.style.display = "none";
    el.style.display = "block";
    currentTab = el;
    localStorage.setItem('wplacer_current_tab', el.id);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
openManageUsers.addEventListener("click", () => {
    userList.innerHTML = "";
    userForm.reset();
    totalCharges.textContent = "?";
    totalMaxCharges.textContent = "?";
    updateBotStatus();
    loadUsers(users => {
        const userCount = Object.keys(users).length;
        manageUsersTitle.textContent = `Mevcut Kullanıcılar (${userCount})`;
        for (const id of Object.keys(users)) {
            const user = document.createElement('div');
            user.className = 'user';
            user.id = `user-${id}`;
            const expirationStr = users[id].expirationDate ? new Date(users[id].expirationDate * 1000).toLocaleString() : 'Yok';
            const isFarming = users[id].mode === 'farm';
            const isInvalid = users[id].status === 'invalid';

            let statusHTML = '';
            if (isInvalid) {
                statusHTML = `<div class="user-status error">⚠️ Çerez Geçersiz <button class="refresh-cookie-btn" data-user-name="${users[id].name}">Yenile</button></div>`;
            } else if (isFarming) {
                statusHTML = '<div class="user-status farming">Farm Yapılıyor</div>';
            }

            user.innerHTML = `
                <div class="user-info ${isInvalid ? 'invalid-user' : ''}">
                    <span>${users[id].name}</span>
                    <span>(#${id})</span>
                    <div class="user-stats">
                        Yük: <b>?</b>/<b>?</b> | Seviye <b>?</b> <span class="level-progress">(?%)</span><br>
                        Bitiş: <b>${expirationStr}</b>
                    </div>
                    ${statusHTML}
                </div>
                <div class="user-actions">
                    <button class="farm-btn ${isFarming ? 'destructive-button' : 'primary-button'}" title="${isFarming ? 'Farmı Durdur' : 'Farmı Başlat'}">
                        <img src="icons/${isFarming ? 'pause' : 'play'}.svg">
                    </button>
                    <button class="delete-btn" title="Kullanıcıyı Sil"><img src="icons/remove.svg"></button>
                    <button class="info-btn" title="Kullanıcı Bilgisini Al"><img src="icons/code.svg"></button>
                </div>`;

            if (isInvalid) {
                user.querySelector('.refresh-cookie-btn').addEventListener('click', (event) => {
                    const userName = event.target.dataset.userName;
                    const instructions = `
                        <b>${userName}</b> kullanıcısının çerezi geçersiz veya süresi dolmuş. Düzeltmek için lütfen şu adımları izleyin:
                        <ol style="text-align: left; margin-top: 10px; padding-left: 20px;">
                            <li>wplacer uzantısının kurulu olduğu bir tarayıcı açın.</li>
                            <li>Doğru wplace.live hesabına (<b>${userName}</b>) giriş yaptığınızdan emin olun.</li>
                            <li>Tarayıcınızın araç çubuğundaki wplacer uzantı simgesine tıklayın.</li>
                            <li>"Kullanıcıyı Manuel Olarak Ekle/Güncelle" düğmesine tıklayın.</li>
                        </ol>
                        Bu, yeni ve geçerli çerezi bota gönderecek ve sorunu çözecektir.`;
                    showMessage("Çerez Nasıl Yenilenir", instructions);
                });
            }

            user.querySelector('.farm-btn').addEventListener('click', async (event) => {
                const button = event.currentTarget;
                // Re-fetch the user's mode from the live object in case it was changed elsewhere
                const currentMode = users[id].mode || 'idle';
                const action = currentMode === 'farm' ? 'stop' : 'start';

                button.disabled = true;

                try {
                    await axios.post(`/user/${id}/farm`, { action });

                    // Update state
                    users[id].mode = action === 'start' ? 'farm' : 'idle';
                    const isNowFarming = users[id].mode === 'farm';

                    // Update button
                    button.title = isNowFarming ? 'Farmı Durdur' : 'Farmı Başlat';
                    button.innerHTML = `<img src="icons/${isNowFarming ? 'pause' : 'play'}.svg">`;
                    button.classList.toggle('destructive-button', isNowFarming);
                    button.classList.toggle('primary-button', !isNowFarming);

                    // Update status indicator
                    let statusDiv = user.querySelector('.user-status.farming');
                    if (isNowFarming && !statusDiv) {
                        statusDiv = document.createElement('div');
                        statusDiv.className = 'user-status farming';
                        statusDiv.textContent = 'Farm Yapılıyor';
                        user.querySelector('.user-info').appendChild(statusDiv);
                    } else if (!isNowFarming && statusDiv) {
                        statusDiv.remove();
                    }
                } catch (error) {
                    handleError(error);
                } finally {
                    button.disabled = false;
                }
            });

            user.querySelector('.delete-btn').addEventListener("click", () => {
                showConfirmation(
                    "Kullanıcıyı Sil",
                    `${users[id].name} (#${id}) kullanıcısını silmek istediğinizden emin misiniz? Bu işlem aynı zamanda kullanıcıyı tüm şablonlardan kaldıracaktır.`,
                    async () => {
                        try {
                            await axios.delete(`/user/${id}`);
                            showMessage("Başarılı", "Kullanıcı silindi.");
                            openManageUsers.click();
                        } catch (error) {
                            handleError(error);
                        };
                    }
                );
            });
            user.querySelector('.info-btn').addEventListener("click", async () => {
                try {
                    const response = await axios.get(`/user/status/${id}`);
                    const info = `
                    <b>Kullanıcı Adı:</b> <span style="color: #f97a1f;">${response.data.name}</span><br>
                    <b>Yük:</b> <span style="color: #f97a1f;">${Math.floor(response.data.charges.count)}</span>/<span style="color: #f97a1f;">${response.data.charges.max}</span><br>
                    <b>Damlacıklar:</b> <span style="color: #f97a1f;">${response.data.droplets}</span><br>
                    <b>Favori Konumlar:</b> <span style="color: #f97a1f;">${response.data.favoriteLocations.length}</span>/<span style="color: #f97a1f;">${response.data.maxFavoriteLocations}</span><br>
                    <b>Donanılan Bayrak:</b> <span style="color: #f97a1f;">${response.data.equippedFlag ? "Evet" : "Hayır"}</span><br>
                    <b>Discord:</b> <span style="color: #f97a1f;">${response.data.discord}</span><br>
                    <b>Ülke:</b> <span style="color: #f97a1f;">${response.data.country}</span><br>
                    <b>Boyanan Pikseller:</b> <span style="color: #f97a1f;">${response.data.pixelsPainted}</span><br>
                    <b>Ekstra Renkler:</b> <span style="color: #f97a1f;">${response.data.extraColorsBitmap}</span><br>
                    <b>İttifak ID:</b> <span style="color: #f97a1f;">${response.data.allianceId}</span><br>
                    <b>İttifak Rolü:</b> <span style="color: #f97a1f;">${response.data.allianceRole}</span><br>
                    <br><b>Ham Json</b> verisini panonuza kopyalamak ister misiniz?
                    `;

                    showConfirmation("Kullanıcı Bilgisi", info, () => {
                        navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
                    });
                } catch (error) {
                    handleError(error);
                };
            });
            userList.appendChild(user);
        };
    });
    changeTab(manageUsers);
});

checkUserStatus.addEventListener("click", async () => {
    checkUserStatus.disabled = true;
    checkUserStatus.innerHTML = "Kontrol ediliyor...";
    const userElements = Array.from(document.querySelectorAll('.user'));

    // Set all users to "checking" state
    userElements.forEach(userEl => {
        const infoSpans = userEl.querySelectorAll('.user-info > span');
        infoSpans.forEach(span => span.style.color = 'var(--warning-color)');
    });

    let totalCurrent = 0;
    let totalMax = 0;

    try {
        const response = await axios.post('/users/status');
        const statuses = response.data;

        for (const userEl of userElements) {
            const id = userEl.id.split('-')[1];
            const status = statuses[id];

            const infoSpans = userEl.querySelectorAll('.user-info > span');
            const currentChargesEl = userEl.querySelector('.user-stats b:nth-of-type(1)');
            const maxChargesEl = userEl.querySelector('.user-stats b:nth-of-type(2)');
            const currentLevelEl = userEl.querySelector('.user-stats b:nth-of-type(3)');
            const levelProgressEl = userEl.querySelector('.level-progress');

            if (status && status.success) {
                const userInfo = status.data;
                const charges = Math.floor(userInfo.charges.count);
                const max = userInfo.charges.max;
                const level = Math.floor(userInfo.level);
                const progress = Math.round((userInfo.level % 1) * 100);

                currentChargesEl.textContent = charges;
                maxChargesEl.textContent = max;
                currentLevelEl.textContent = level;
                levelProgressEl.textContent = `(${progress}%)`;
                totalCurrent += charges;
                totalMax += max;

                infoSpans.forEach(span => span.style.color = 'var(--success-color)');
            } else {
                currentChargesEl.textContent = "HATA";
                maxChargesEl.textContent = "HATA";
                currentLevelEl.textContent = "?";
                levelProgressEl.textContent = "(?%)";
                infoSpans.forEach(span => span.style.color = 'var(--error-color)');
            }
        }
    } catch (error) {
        handleError(error);
        // On general error, mark all as failed
        userElements.forEach(userEl => {
            const infoSpans = userEl.querySelectorAll('.user-info > span');
            infoSpans.forEach(span => span.style.color = 'var(--error-color)');
        });
    }

    totalCharges.textContent = totalCurrent;
    totalMaxCharges.textContent = totalMax;

    checkUserStatus.disabled = false;
    checkUserStatus.innerHTML = '<img src="icons/check.svg">Hesap Durumunu Kontrol Et';
});

openAddTemplate.addEventListener("click", () => {
    resetTemplateForm();
    userSelectList.innerHTML = "";
    loadUsers(users => {
        if (Object.keys(users).length === 0) {
            userSelectList.innerHTML = "<span>Kullanıcı eklenmedi. Lütfen önce bir kullanıcı ekleyin.</span>";
            return;
        }
        for (const id of Object.keys(users)) {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-select-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `user_${id}`;
            checkbox.name = 'user_checkbox';
            checkbox.value = id;
            const label = document.createElement('label');
            label.htmlFor = `user_${id}`;
            label.textContent = `${users[id].name} (#${id})`;
            userDiv.appendChild(checkbox);
            userDiv.appendChild(label);
            userSelectList.appendChild(userDiv);
        }
    });
    changeTab(addTemplate);
});
selectAllUsers.addEventListener('click', () => {
    document.querySelectorAll('#userSelectList input[type="checkbox"]').forEach(cb => cb.checked = true);
});

const createToggleButton = (template, id, buttonsContainer, progressBarText, currentPercent) => {
    const button = document.createElement('button');
    const isRunning = template.running;

    button.className = isRunning ? 'destructive-button' : 'primary-button';
    button.innerHTML = `<img src="icons/${isRunning ? 'pause' : 'play'}.svg">${isRunning ? 'Şablonu Durdur' : 'Şablonu Başlat'}`;

    button.addEventListener('click', async () => {
        try {
            await axios.put(`/template/${id}`, { running: !isRunning });
            template.running = !isRunning;
            const newStatus = !isRunning ? 'Başlatıldı' : 'Durduruldu';
            const newButton = createToggleButton(template, id, buttonsContainer, progressBarText, currentPercent);
            button.replaceWith(newButton);
            progressBarText.textContent = `${currentPercent}% | ${translateTemplateStatus(newStatus)}`;
            const progressBar = progressBarText.previousElementSibling;
            progressBar.classList.toggle('stopped', !isRunning);

        } catch (error) {
            handleError(error);
        }
    });
    return button;
};

openManageTemplates.addEventListener("click", () => {
    templateList.innerHTML = ""; // Clear list before loading
    loadUsers(users => {
        loadTemplates(templates => {
            for (const id of Object.keys(templates)) {
                const t = templates[id];
                const userListFormatted = t.userIds.map(userId => {
                    return users[userId] ? `${users[userId].name}#${userId}` : `Bilinmiyor#${userId}`;
                }).join(", ");

                const template = document.createElement('div');
                template.id = id;
                template.className = "template";

                const total = t.totalPixels || 1;
                const remaining = t.pixelsRemaining !== null ? t.pixelsRemaining : total;
                const completed = total - remaining;
                const percent = Math.floor((completed / total) * 100);

                const infoSpan = document.createElement('span');
                infoSpan.innerHTML = `<b>Şablon Adı:</b> ${t.name}<br><b>Atanan Hesaplar:</b> ${userListFormatted}<br><b>Koordinatlar:</b> ${t.coords.join(", ")}<br><b>Pikseller:</b> <span class="pixel-count">${completed} / ${total}</span>`;
                template.appendChild(infoSpan);

                const progressBarContainer = document.createElement('div');
                progressBarContainer.className = 'progress-bar-container';

                const progressBar = document.createElement('div');
                progressBar.className = 'progress-bar';
                progressBar.style.width = `${percent}%`;

                const progressBarText = document.createElement('span');
                progressBarText.className = 'progress-bar-text';
                progressBarText.textContent = `${percent}% | ${translateTemplateStatus(t.status)}`;

                if (t.status === "Finished.") {
                    progressBar.classList.add('finished');
                } else if (!t.running) {
                    progressBar.classList.add('stopped');
                }

                progressBarContainer.appendChild(progressBar);
                progressBarContainer.appendChild(progressBarText);
                template.appendChild(progressBarContainer);

                const canvas = document.createElement("canvas");
                drawTemplate(t.template, canvas);
                const buttons = document.createElement('div');
                buttons.className = "template-actions";

                const toggleButton = createToggleButton(t, id, buttons, progressBarText, percent);
                buttons.appendChild(toggleButton);

                const editButton = document.createElement('button');
                editButton.className = 'secondary-button';
                editButton.innerHTML = '<img src="icons/settings.svg">Şablonu Düzenle';
                editButton.addEventListener('click', () => {
                    // Reset the form but keep the user list populated
                    openAddTemplate.click();
                    templateFormTitle.textContent = `Şablonu Düzenle: ${t.name}`;
                    submitTemplate.innerHTML = '<img src="icons/edit.svg">Değişiklikleri Kaydet';
                    templateForm.dataset.editId = id;

                    templateName.value = t.name;
                    [tx.value, ty.value, px.value, py.value] = t.coords;
                    canBuyCharges.checked = t.canBuyCharges;
                    canBuyMaxCharges.checked = t.canBuyMaxCharges;
                    antiGriefMode.checked = t.antiGriefMode;

                    document.querySelectorAll('input[name="user_checkbox"]').forEach(cb => {
                        if (t.userIds.includes(cb.value)) {
                            cb.checked = true;
                        }
                    });
                });

                const delButton = document.createElement('button');
                delButton.className = 'destructive-button';
                delButton.innerHTML = '<img src="icons/remove.svg">Şablonu Sil';
                delButton.addEventListener("click", () => {
                    showConfirmation(
                        "Şablonu Sil",
                        `"${t.name}" adlı şablonu silmek istediğinizden emin misiniz?`,
                        async () => {
                            try {
                                await axios.delete(`/template/${id}`);
                                openManageTemplates.click();
                            } catch (error) {
                                handleError(error);
                            };
                        }
                    );
                });
                buttons.append(editButton);
                buttons.append(delButton);
                template.append(canvas);
                template.append(buttons);
                templateList.append(template);
            };
        });
    });
    changeTab(manageTemplates);
});
openDashboard.addEventListener("click", () => {
    renderDashboard();
    changeTab(dashboard);
});

if (refreshDashboardBtn) {
    refreshDashboardBtn.addEventListener('click', () => {
        renderDashboard();
    });
}

openSettings.addEventListener("click", async () => {
    try {
        const response = await axios.get('/settings');
        const currentSettings = response.data;
        drawingDirectionSelect.value = currentSettings.drawingDirection;
        drawingOrderSelect.value = currentSettings.drawingOrder;
        turnstileNotifications.checked = currentSettings.turnstileNotifications;
        outlineMode.checked = currentSettings.outlineMode;
        interleavedMode.checked = currentSettings.interleavedMode;
        skipPaintedPixels.checked = currentSettings.skipPaintedPixels;

        proxyEnabled.checked = currentSettings.proxyEnabled;
        proxyRotationMode.value = currentSettings.proxyRotationMode || 'sequential';
        logProxyUsage.checked = currentSettings.logProxyUsage;
        proxyCount.textContent = `${currentSettings.proxyCount} proxy dosyadan yüklendi.`;
        proxyFormContainer.style.display = proxyEnabled.checked ? 'block' : 'none';
        if (proxyEnabled.checked) {
            renderProxyStatusTable();
        }

        accountCooldown.value = currentSettings.accountCooldown / 1000;
        purchaseCooldown.value = currentSettings.purchaseCooldown / 1000;
        accountCheckCooldown.value = currentSettings.accountCheckCooldown / 1000;
        dropletReserve.value = currentSettings.dropletReserve;
        requestTimeout.value = currentSettings.requestTimeout;
        templateConcurrency.value = currentSettings.templateConcurrency;
        antiGriefStandby.value = currentSettings.antiGriefStandby / 60000;
        statusCheckInterval.value = currentSettings.statusCheckInterval / 60000;
        discordWebhookUrl.value = currentSettings.discordWebhookUrl;
        chargeThreshold.value = currentSettings.chargeThreshold * 100;
        farmTileX.value = currentSettings.farmTileX || 0;
        farmTileY.value = currentSettings.farmTileY || 0;
    } catch (error) {
        handleError(error);
    }
    updateRuntimeStats();
    changeTab(settings);
});

// Settings
const saveSetting = async (setting) => {
    try {
        await axios.put('/settings', setting);
        showMessage("Başarılı", "Ayar kaydedildi!");
    } catch (error) {
        handleError(error);
    }
};

const createNumericValidator = (min, max, name, element) => (val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || (min !== null && num < min) || (max !== null && num > max)) {
        let message = `Lütfen ${name} için geçerli bir sayı girin.`;
        if (min !== null && max !== null) message += ` ${min} ile ${max} arasında olmalıdır.`;
        else if (min !== null) message += ` En az ${min} olmalıdır.`;
        showMessage("Hata", message);
        if (element && min !== null) element.value = min;
        return false;
    }
    return true;
};

const setupSettingListener = (element, key, type = 'value', transform = v => v, validator = () => true) => {
    if (!element) return;
    element.addEventListener('change', () => {
        const rawValue = element[type];
        if (!validator(rawValue)) return;
        const transformedValue = transform(rawValue);
        saveSetting({ [key]: transformedValue });
    });
};

// --- Settings Listeners ---
setupSettingListener(drawingDirectionSelect, 'drawingDirection');
setupSettingListener(drawingOrderSelect, 'drawingOrder');
setupSettingListener(turnstileNotifications, 'turnstileNotifications', 'checked');
setupSettingListener(outlineMode, 'outlineMode', 'checked');
setupSettingListener(interleavedMode, 'interleavedMode', 'checked');
setupSettingListener(skipPaintedPixels, 'skipPaintedPixels', 'checked');
setupSettingListener(logProxyUsage, 'logProxyUsage', 'checked');
setupSettingListener(proxyRotationMode, 'proxyRotationMode');
setupSettingListener(discordWebhookUrl, 'discordWebhookUrl');

proxyEnabled.addEventListener('change', async () => {
    const isEnabled = proxyEnabled.checked;
    proxyFormContainer.style.display = isEnabled ? 'block' : 'none';
    if (isEnabled) {
        await renderProxyStatusTable();
    }
    saveSetting({ proxyEnabled: isEnabled });
});

setupSettingListener(accountCooldown, 'accountCooldown', 'value', v => parseInt(v, 10) * 1000, createNumericValidator(0, null, "Account Cooldown"));
setupSettingListener(purchaseCooldown, 'purchaseCooldown', 'value', v => parseInt(v, 10) * 1000, createNumericValidator(0, null, "Purchase Cooldown"));
setupSettingListener(accountCheckCooldown, 'accountCheckCooldown', 'value', v => parseInt(v, 10) * 1000, createNumericValidator(0, null, "Account Check Cooldown"));
setupSettingListener(dropletReserve, 'dropletReserve', 'value', v => parseInt(v, 10), createNumericValidator(0, null, "Droplet Reserve"));
setupSettingListener(requestTimeout, 'requestTimeout', 'value', v => parseInt(v, 10), createNumericValidator(10000, null, "Request Timeout", requestTimeout));
setupSettingListener(templateConcurrency, 'templateConcurrency', 'value', v => parseInt(v, 10), createNumericValidator(1, 25, "Template Concurrency", templateConcurrency));
setupSettingListener(antiGriefStandby, 'antiGriefStandby', 'value', v => parseInt(v, 10) * 60000, createNumericValidator(1, null, "Anti-Grief Standby"));
setupSettingListener(statusCheckInterval, 'statusCheckInterval', 'value', v => parseInt(v, 10) * 60000, createNumericValidator(1, null, "Status Check Interval", statusCheckInterval));
setupSettingListener(chargeThreshold, 'chargeThreshold', 'value', v => parseInt(v, 10) / 100, createNumericValidator(0, 100, "Charge Threshold"));
setupSettingListener(farmTileX, 'farmTileX', 'value', v => parseInt(v, 10), createNumericValidator(null, null, "Farm Tile X"));
setupSettingListener(farmTileY, 'farmTileY', 'value', v => parseInt(v, 10), createNumericValidator(null, null, "Farm Tile Y"));

tx.addEventListener('blur', () => {
    const value = tx.value.trim();
    const urlRegex = /pixel\/(\d+)\/(\d+)\?x=(\d+)&y=(\d+)/;
    const urlMatch = value.match(urlRegex);

    if (urlMatch) {
        tx.value = urlMatch[1];
        ty.value = urlMatch[2];
        px.value = urlMatch[3];
        py.value = urlMatch[4];
    } else {
        const parts = value.split(/\s+/);
        if (parts.length === 4) {
            tx.value = parts[0].replace(/[^0-9]/g, '');
            ty.value = parts[1].replace(/[^0-9]/g, '');
            px.value = parts[2].replace(/[^0-9]/g, '');
            py.value = parts[3].replace(/[^0-9]/g, '');
        } else {
            tx.value = value.replace(/[^0-9]/g, '');
        }
    }
});

[ty, px, py].forEach(input => {
    input.addEventListener('blur', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
    });
});

// --- On Page Load ---
const initializeEventSource = () => {
    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => console.log("SSE bağlantısı kuruldu.");
    eventSource.onerror = () => console.error("SSE bağlantı hatası. Yeniden bağlanmaya çalışılacak.");

    eventSource.addEventListener('runtime_stats', (e) => {
        const data = JSON.parse(e.data);
        if (currentTab.id === 'settings') {
            updateRuntimeStats(data);
        }
    });

    eventSource.addEventListener('users_updated', (e) => {
        // Eğer şu anda 'manageUsers' sekmesindeysek
        if (currentTab.id === 'manageUsers') {
            // Kullanıcı listesini yeniden çizmek için 'Kullanıcıları Yönet' butonuna tıklamayı simüle et
            openManageUsers.click();
        }
    });
    eventSource.addEventListener('template_update', (e) => {
        if (currentTab.id !== 'manageTemplates') return;
        const t = JSON.parse(e.data);
        const templateElement = $(t.id);
        if (!templateElement) {
            // Öğe mevcut değilse, yenidir. Sekmenin tamamen yeniden yüklenmesini tetikle.
            openManageTemplates.click();
            return;
        }

        const total = t.totalPixels || 1;
        const remaining = t.pixelsRemaining !== null ? t.pixelsRemaining : total;
        const completed = total - remaining;
        const percent = Math.floor((completed / total) * 100);

        const progressBar = templateElement.querySelector('.progress-bar');
        const progressBarText = templateElement.querySelector('.progress-bar-text');
        const pixelCount = templateElement.querySelector('.pixel-count');

        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressBarText) progressBarText.textContent = `${percent}% | ${translateTemplateStatus(t.status)}`;
        if (pixelCount) pixelCount.textContent = `${completed} / ${total}`;

        if (t.status === "Finished.") {
            progressBar.classList.add('finished');
            progressBar.classList.remove('stopped');
        } else if (!t.running) {
            progressBar.classList.add('stopped');
            progressBar.classList.remove('finished');
        } else {
            progressBar.classList.remove('stopped', 'finished');
        }
    });

    eventSource.addEventListener('template_delete', (e) => {
        if (currentTab.id !== 'manageTemplates') return;
        const { id } = JSON.parse(e.data);
        const el = $(id);
        if (el) el.remove();
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const lastTabId = localStorage.getItem('wplacer_current_tab');
    const lastTabElement = lastTabId ? $(lastTabId) : null;

    if (lastTabElement && lastTabId !== 'main') {
        // Sekmenin içeriğini yeniden başlatmak için ilgili düğmeye bir tıklamayı simüle et
        const buttonId = `open${lastTabId.charAt(0).toUpperCase() + lastTabId.slice(1)}`;
        $(buttonId)?.click();
    }
    initializeEventSource();
});