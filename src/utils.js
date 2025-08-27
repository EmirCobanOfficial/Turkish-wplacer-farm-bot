import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = "./data";
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

export const log = async (id, name, data, error) => {
    const timestamp = new Date().toLocaleString();
    const identifier = `(${name}#${id})`;
    if (error) {
        console.error(`[${timestamp}] ${identifier} ${data}:`, error);
        appendFileSync(path.join(dataDir, `errors.log`), `[${timestamp}] ${identifier} ${data}: ${error.stack || error.message}\n`);
    } else {
        console.log(`[${timestamp}] ${identifier} ${data}`);
        appendFileSync(path.join(dataDir, `logs.log`), `[${timestamp}] ${identifier} ${data}\n`);
    };
};

export const duration = (durationMs) => {
    if (durationMs <= 0) return "0sn";
    const totalSeconds = Math.floor(durationMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const parts = [];
    if (hours) parts.push(`${hours}sa`);
    if (minutes) parts.push(`${minutes}dk`);
    if (seconds || parts.length === 0) parts.push(`${seconds}sn`);
    return parts.join(' ');
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class SuspensionError extends Error {
    constructor(message, durationMs) {
        super(message);
        this.name = "SuspensionError";
        this.durationMs = durationMs;
        this.suspendedUntil = Date.now() + durationMs;
    }
}

export class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = "NetworkError";
    }
}