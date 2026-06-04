// BridgeManager — Singleton managing multiple JDBC bridge instances
// Allows simultaneous connections to different SGBD via JDBC bridges on incrementing ports
// Author: Dr Hamid MADANI drmdh@msn.com
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { JdbcNormalizer, parseUri } from './JdbcNormalizer.js';
import { getJdbcDriverInfo } from './jdbc-registry.js';
// ============================================================
// BridgeManager singleton
// ============================================================
export class BridgeManager {
    static instance = null;
    bridges = new Map();
    nextPort;
    basePort;
    portIncrement;
    maxRetries;
    retryResetMs;
    startAttempts = new Map();
    cleanupRegistered = false;
    constructor() {
        this.basePort = parseInt(process.env.MOSTA_BRIDGE_PORT_BASE || '8765');
        this.nextPort = this.basePort;
        this.portIncrement = (process.env.MOSTA_BRIDGE_PORT_INCREMENT ?? 'true') !== 'false';
        this.maxRetries = parseInt(process.env.MOSTA_BRIDGE_MAX_RETRIES || '3');
        this.retryResetMs = 60_000;
        this.registerCleanupHandlers();
        this.cleanupOrphans();
    }
    static getInstance() {
        if (!BridgeManager.instance) {
            BridgeManager.instance = new BridgeManager();
        }
        return BridgeManager.instance;
    }
    /** Reset singleton (for testing) */
    static resetInstance() {
        if (BridgeManager.instance) {
            BridgeManager.instance.stopAllSync();
            BridgeManager.instance = null;
        }
    }
    // ============================================================
    // Public API
    // ============================================================
    /**
     * Get an existing bridge or create a new one for the given dialect/URI.
     * If a bridge with the same key already exists and is alive, reuse it.
     * IMPORTANT: Only ONE bridge per dialect/URI — scans ports to reuse existing bridges
     * across Next.js module contexts.
     */
    async getOrCreate(dialect, uri, options) {
        const key = this.buildKey(dialect, uri);
        const parsed = parseUri(dialect, uri);
        const jdbcUrl = JdbcNormalizer.composeJdbcUrl(dialect, parsed);
        // 1. Check in-memory map first
        if (this.bridges.has(key)) {
            const bridge = this.bridges.get(key);
            if (await this.isAlive(bridge)) {
                return bridge;
            }
            // Dead bridge — clean up and re-create
            this.bridges.delete(key);
            this.removePidFile(bridge.port);
        }
        // 2. Scan known ports to find an existing bridge for this dialect/URI
        //    This handles Next.js module isolation: bridge started by route A
        //    is invisible to route B's BridgeManager singleton.
        const existingBridge = await this.findExistingBridge(dialect, jdbcUrl);
        if (existingBridge) {
            this.bridges.set(key, existingBridge);
            return existingBridge;
        }
        // Anti-loop protection
        this.checkStartAttempts(key);
        // Autostart check
        const autostart = process.env.MOSTA_BRIDGE_AUTOSTART ?? 'true';
        if (autostart === 'false') {
            const info = getJdbcDriverInfo(dialect);
            throw new Error(`JDBC bridge disabled (MOSTA_BRIDGE_AUTOSTART=false).\n` +
                `Start the bridge manually:\n` +
                `  java --source 11 -cp ${info?.jarPrefix || 'driver'}*.jar \\\n` +
                `    MostaJdbcBridge.java \\\n` +
                `    --jdbc-url <jdbc-url> \\\n` +
                `    --port ${this.basePort}\n` +
                `Or set MOSTA_BRIDGE_AUTOSTART=true in .env`);
        }
        // Launch a new bridge
        try {
            const bridge = await this.startBridge(dialect, uri, options);
            this.startAttempts.delete(key); // Success — reset counter
            return bridge;
        }
        catch (e) {
            // Increment attempt counter
            const current = this.startAttempts.get(key) || { count: 0, lastAttempt: new Date() };
            current.count++;
            current.lastAttempt = new Date();
            this.startAttempts.set(key, current);
            throw e;
        }
    }
    /**
     * Stop a specific bridge by key.
     */
    async stop(key) {
        const bridge = this.bridges.get(key);
        if (!bridge)
            return;
        bridge.normalizer.stop();
        this.removePidFile(bridge.port);
        this.bridges.delete(key);
        console.log(`[BridgeManager] Stopped bridge ${key} on port ${bridge.port}`);
    }
    /**
     * Stop ALL bridges (called on app exit).
     */
    async stopAll() {
        for (const [key, bridge] of this.bridges) {
            try {
                bridge.normalizer.stop();
                this.removePidFile(bridge.port);
                console.log(`[BridgeManager] Stopped bridge ${key} on port ${bridge.port}`);
            }
            catch {
                // scan-ignore: best-effort bridge cleanup
            }
        }
        this.bridges.clear();
    }
    /**
     * List all active bridges.
     */
    list() {
        return Array.from(this.bridges.values());
    }
    /**
     * Check if a bridge exists for the given key.
     */
    has(key) {
        return this.bridges.has(key);
    }
    /**
     * Build a bridge key from dialect and URI.
     */
    buildKey(dialect, uri) {
        const parsed = parseUri(dialect, uri);
        return `${dialect}:${parsed.host}:${parsed.port || ''}/${parsed.database || ''}`;
    }
    // ============================================================
    // Internal
    // ============================================================
    async startBridge(dialect, uri, options) {
        const parsed = parseUri(dialect, uri);
        const expectedJdbcUrl = JdbcNormalizer.composeJdbcUrl(dialect, parsed);
        const port = this.getNextPort();
        // Check port availability
        if (await this.detectExistingBridge(port)) {
            // Port taken — check if the existing bridge serves the same JDBC URL
            try {
                const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1000) });
                if (res.ok) {
                    const health = (await res.json());
                    if (health.jdbcUrl === expectedJdbcUrl) {
                        // Same JDBC URL — adopt this bridge instead of creating a duplicate
                        const key = this.buildKey(dialect, uri);
                        const normalizer = new JdbcNormalizer();
                        normalizer._active = true;
                        normalizer.bridgeUrl = `http://localhost:${port}`;
                        const bridge = {
                            key, dialect, port,
                            url: `http://localhost:${port}`,
                            pid: 0, jdbcUrl: expectedJdbcUrl,
                            startedAt: new Date(), normalizer,
                        };
                        this.bridges.set(key, bridge);
                        console.log(`[BridgeManager] Adopted existing bridge on port ${port} (same JDBC URL)`);
                        return bridge;
                    }
                }
            }
            catch { /* not responding properly — increment */ }
            if (!this.portIncrement) {
                throw new Error(`Port ${port} already in use.\n` +
                    `Set MOSTA_BRIDGE_PORT_INCREMENT=true to auto-increment,\n` +
                    `or change MOSTA_BRIDGE_PORT_BASE,\n` +
                    `or stop the process using port ${port}: lsof -i :${port}`);
            }
            this.nextPort++;
            return this.startBridge(dialect, uri, options);
        }
        const normalizer = new JdbcNormalizer();
        await normalizer.start(dialect, uri, {
            bridgePort: port,
            jarDir: options?.jarDir,
            bridgeJavaFile: options?.bridgeJavaFile,
        });
        const pid = normalizer.process?.pid ?? 0;
        const jdbcUrl = expectedJdbcUrl;
        const key = this.buildKey(dialect, uri);
        const bridge = {
            key,
            dialect,
            port,
            url: `http://localhost:${port}`,
            pid,
            jdbcUrl,
            startedAt: new Date(),
            normalizer,
        };
        this.bridges.set(key, bridge);
        this.writePidFile(port, pid);
        // Advance port for next bridge
        if (this.portIncrement) {
            this.nextPort = port + 1;
        }
        console.log(`[BridgeManager] Bridge started: ${key}\n` +
            `  Port: ${port} | PID: ${pid} | JDBC: ${jdbcUrl}`);
        return bridge;
    }
    getNextPort() {
        return this.nextPort;
    }
    async isAlive(bridge) {
        try {
            const res = await fetch(`${bridge.url}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            return res.ok;
        }
        catch {
            // scan-ignore: health probe timeout/down — boolean false=unreachable
            return false;
        }
    }
    /**
     * Scan ports to find an already-running bridge matching the expected JDBC URL.
     * Solves Next.js module isolation where different route modules have different singletons.
     */
    async findExistingBridge(dialect, expectedJdbcUrl) {
        for (let port = this.basePort; port < this.basePort + 10; port++) {
            try {
                const res = await fetch(`http://localhost:${port}/health`, {
                    signal: AbortSignal.timeout(1000),
                });
                if (!res.ok)
                    continue;
                const health = (await res.json());
                if (health.jdbcUrl === expectedJdbcUrl) {
                    // Found a matching bridge — adopt it
                    const key = `${dialect}:adopted:${port}`;
                    const normalizer = new JdbcNormalizer();
                    normalizer._active = true;
                    normalizer.bridgeUrl = `http://localhost:${port}`;
                    const bridge = {
                        key,
                        dialect,
                        port,
                        url: `http://localhost:${port}`,
                        pid: 0,
                        jdbcUrl: expectedJdbcUrl,
                        startedAt: new Date(),
                        normalizer,
                    };
                    // Advance nextPort past this one
                    if (port >= this.nextPort)
                        this.nextPort = port + 1;
                    console.log(`[BridgeManager] Adopted existing bridge on port ${port} for ${dialect} (${expectedJdbcUrl})`);
                    return bridge;
                }
            }
            catch {
                // scan-ignore: port scan — pas un bridge ici, continue
            }
        }
        return null;
    }
    async detectExistingBridge(port) {
        try {
            const res = await fetch(`http://localhost:${port}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            return res.ok;
        }
        catch {
            // scan-ignore: detect probe — boolean false=pas de bridge sur ce port
            return false;
        }
    }
    checkStartAttempts(key) {
        const attempts = this.startAttempts.get(key);
        if (!attempts)
            return;
        const elapsed = Date.now() - attempts.lastAttempt.getTime();
        if (elapsed < this.retryResetMs && attempts.count >= this.maxRetries) {
            throw new Error(`JDBC bridge for "${key}" failed ${this.maxRetries} times in the last ${this.retryResetMs / 1000}s. Giving up.\n` +
                `Diagnostic:\n` +
                `  1. Java installed?  → java --version\n` +
                `  2. JAR valid?       → ls jar_files/\n` +
                `  3. SGBD running?    → check target port\n` +
                `  4. Firewall?        → check bridge port\n` +
                `Check Java installation, JAR file, and SGBD server.`);
        }
        if (elapsed >= this.retryResetMs) {
            this.startAttempts.delete(key); // Reset after cooldown
        }
    }
    // --- PID file management ---
    getJarDir() {
        return process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files');
    }
    writePidFile(port, pid) {
        try {
            const dir = this.getJarDir();
            if (existsSync(dir)) {
                writeFileSync(join(dir, `.bridge-${port}.pid`), String(pid));
            }
        }
        catch {
            // scan-ignore: PID file write/remove — non-critical (orphan cleanup is best-effort)
        }
    }
    removePidFile(port) {
        try {
            const pidFile = join(this.getJarDir(), `.bridge-${port}.pid`);
            if (existsSync(pidFile)) {
                unlinkSync(pidFile);
            }
        }
        catch {
            // scan-ignore: PID file write/remove — non-critical (orphan cleanup is best-effort)
        }
    }
    /**
     * Clean up PID files for dead processes only.
     * NEVER kills alive processes — they may be bridges from other module contexts.
     * Adjusts nextPort to avoid collisions with alive bridges.
     */
    cleanupOrphans() {
        try {
            const dir = this.getJarDir();
            if (!existsSync(dir))
                return;
            const pidFiles = readdirSync(dir).filter(f => f.startsWith('.bridge-') && f.endsWith('.pid'));
            for (const file of pidFiles) {
                try {
                    const pidStr = readFileSync(join(dir, file), 'utf-8').trim();
                    const pid = parseInt(pidStr);
                    const portMatch = file.match(/\.bridge-(\d+)\.pid/);
                    const port = portMatch ? parseInt(portMatch[1]) : 0;
                    if (isNaN(pid) || pid <= 0) {
                        unlinkSync(join(dir, file));
                        continue;
                    }
                    // Check if process is still alive
                    let alive = false;
                    try {
                        process.kill(pid, 0);
                        alive = true;
                    }
                    catch { /* dead */ }
                    if (alive) {
                        // Process alive — do NOT kill. Advance nextPort to avoid collision.
                        if (port > 0 && port >= this.nextPort) {
                            this.nextPort = port + 1;
                        }
                    }
                    else {
                        // Process dead — clean up stale PID file
                        unlinkSync(join(dir, file));
                    }
                }
                catch {
                    // scan-ignore: individual PID file parse error — skip and continue
                }
            }
        }
        catch {
            // scan-ignore: orphan cleanup is best-effort
        }
    }
    // --- Cleanup handlers ---
    registerCleanupHandlers() {
        if (this.cleanupRegistered)
            return;
        this.cleanupRegistered = true;
        const cleanup = () => this.stopAllSync();
        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(0); });
        process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    }
    stopAllSync() {
        for (const [, bridge] of this.bridges) {
            try {
                bridge.normalizer.stop();
                this.removePidFile(bridge.port);
            }
            catch {
                // scan-ignore: best-effort bridge cleanup
            }
        }
        this.bridges.clear();
    }
}
