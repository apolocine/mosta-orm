// JdbcNormalizer — Auto-detects JDBC JARs and manages the MostaJdbcBridge process
// Sits between AbstractSqlDialect and MostaJdbcBridge.java
// Author: Dr Hamid MADANI drmdh@msn.com
import { spawn } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getJdbcDriverInfo } from './jdbc-registry.js';
// Resolve paths relative to this file
const __filename_resolved = typeof __filename !== 'undefined'
    ? __filename
    : fileURLToPath(import.meta.url);
const __dirname_resolved = dirname(__filename_resolved);
/** Default directory for JAR files — configurable via env MOSTA_JAR_DIR */
function getDefaultJarDir() {
    if (process.env.MOSTA_JAR_DIR)
        return process.env.MOSTA_JAR_DIR;
    // Look in project root first (process.cwd()), then relative to package
    const candidates = [
        join(process.cwd(), 'jar_files'),
        join(__dirname_resolved, '..', '..', 'bridge'),
        join(__dirname_resolved, '..', '..', '..', 'jar_files'),
        join(__dirname_resolved, '..', '..', 'jar_files'),
    ];
    for (const dir of candidates) {
        if (existsSync(dir))
            return dir;
    }
    return candidates[0];
}
/** Default path to MostaJdbcBridge.java */
function getDefaultBridgeJavaPath() {
    if (process.env.MOSTA_BRIDGE_JAVA)
        return process.env.MOSTA_BRIDGE_JAVA;
    const bridgeFile = 'MostaJdbcBridge.java';
    const candidates = [
        // Relative to dist/bridge/ (normal npm install layout)
        join(__dirname_resolved, '..', '..', 'bridge', bridgeFile),
        // Relative to package root (monorepo / local dev)
        join(__dirname_resolved, '..', '..', '..', 'bridge', bridgeFile),
        // Via process.cwd() (fallback)
        join(process.cwd(), 'node_modules', '@mostajs', 'orm', 'bridge', bridgeFile),
        join(process.cwd(), 'bridge', bridgeFile),
    ];
    for (const p of candidates) {
        if (existsSync(p))
            return p;
    }
    return candidates[0];
}
/**
 * Parse a SGBD_URI into host/port/database/user/password components.
 * Handles formats like:
 *   hsqldb:hsql://localhost:9001/mydb
 *   oracle://user:pass@host:1521/service
 *   db2://user:pass@host:50000/mydb
 */
export function parseUri(dialect, uri) {
    const info = getJdbcDriverInfo(dialect);
    const defaultPort = info?.defaultPort ?? 9001;
    const defaultUser = info?.defaultUser ?? 'SA';
    const defaultPassword = info?.defaultPassword ?? '';
    // Handle hsqldb:hsql://[user:pass@]host:port/db
    const hsqlMatch = uri.match(/^hsqldb:hsql:\/\/(?:([^:@]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?(?:\/(.*))?$/);
    if (hsqlMatch) {
        return {
            host: hsqlMatch[3],
            port: hsqlMatch[4] ? parseInt(hsqlMatch[4]) : defaultPort,
            database: hsqlMatch[5] || '',
            user: hsqlMatch[1] ? decodeURIComponent(hsqlMatch[1]) : defaultUser,
            password: hsqlMatch[2] !== undefined ? decodeURIComponent(hsqlMatch[2]) : defaultPassword,
        };
    }
    // Handle dialect://user:pass@host:port/db
    const standardMatch = uri.match(/^\w+:\/\/(?:([^:@]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?(?:\/(.*))?$/);
    if (standardMatch) {
        return {
            host: standardMatch[3],
            port: standardMatch[4] ? parseInt(standardMatch[4]) : defaultPort,
            database: standardMatch[5] || '',
            user: standardMatch[1] ? decodeURIComponent(standardMatch[1]) : defaultUser,
            password: standardMatch[2] ? decodeURIComponent(standardMatch[2]) : defaultPassword,
        };
    }
    // Fallback
    return {
        host: 'localhost',
        port: defaultPort,
        database: '',
        user: defaultUser,
        password: defaultPassword,
    };
}
// ============================================================
// JdbcNormalizer class
// ============================================================
export class JdbcNormalizer {
    process = null;
    bridgeUrl = '';
    _active = false;
    /**
     * Try to find a JAR for the given dialect.
     * Returns the full path to the JAR, or null if not found.
     */
    static findJar(dialect, jarDir) {
        const info = getJdbcDriverInfo(dialect);
        if (!info)
            return null;
        const dir = jarDir || getDefaultJarDir();
        if (!existsSync(dir))
            return null;
        try {
            const files = readdirSync(dir)
                .filter(f => f.startsWith(info.jarPrefix) && f.endsWith('.jar'))
                .sort();
            if (files.length === 0)
                return null;
            // Return the last (highest version) JAR
            return join(dir, files[files.length - 1]);
        }
        catch {
            // scan-ignore: best-effort JAR discovery — null = "pas de bridge JDBC disponible" (caller fallback npm driver)
            return null;
        }
    }
    /**
     * Check if a JDBC bridge is available for this dialect (JAR exists).
     */
    static isAvailable(dialect, jarDir) {
        return JdbcNormalizer.findJar(dialect, jarDir) !== null;
    }
    /**
     * Compose the JDBC URL from parsed URI components.
     */
    static composeJdbcUrl(dialect, config) {
        const info = getJdbcDriverInfo(dialect);
        if (!info)
            throw new Error(`No JDBC registry entry for dialect "${dialect}"`);
        const port = config.port || info.defaultPort;
        return info.jdbcUrlTemplate
            .replace('{host}', config.host)
            .replace('{port}', String(port))
            .replace('{db}', config.database);
    }
    /**
     * Start the JDBC bridge for a given dialect and URI.
     * Returns the HTTP base URL (e.g. http://localhost:8765).
     */
    async start(dialect, uri, options) {
        const jarDir = options?.jarDir || getDefaultJarDir();
        const jarPath = JdbcNormalizer.findJar(dialect, jarDir);
        if (!jarPath) {
            const info = getJdbcDriverInfo(dialect);
            throw new Error(`No JDBC JAR found for ${info?.label ?? dialect}.\n` +
                `Expected: ${info?.jarPrefix}*.jar in ${jarDir}\n` +
                `Download the JDBC driver and place it in the jar_files/ directory.`);
        }
        const parsed = parseUri(dialect, uri);
        const jdbcUrl = JdbcNormalizer.composeJdbcUrl(dialect, parsed);
        const bridgePort = options?.bridgePort || parseInt(process.env.MOSTA_BRIDGE_PORT || '8765');
        const user = parsed.user || getJdbcDriverInfo(dialect).defaultUser;
        const password = parsed.password ?? getJdbcDriverInfo(dialect).defaultPassword;
        const bridgeJava = options?.bridgeJavaFile || getDefaultBridgeJavaPath();
        if (!existsSync(bridgeJava)) {
            throw new Error(`MostaJdbcBridge.java not found at ${bridgeJava}.\n` +
                `Set MOSTA_BRIDGE_JAVA env or provide bridgeJavaFile option.`);
        }
        // Build classpath: JAR + bridge directory (for any companion JARs)
        const classpath = jarPath;
        this.process = spawn('java', [
            '--source', '11',
            '-cp', classpath,
            bridgeJava,
            '--jdbc-url', jdbcUrl,
            '--user', user,
            '--password', password,
            '--port', String(bridgePort),
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        // Log bridge stderr for debugging
        this.process.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg)
                console.error(`[JdbcBridge:${dialect}] ${msg}`);
        });
        this.process.on('exit', (code) => {
            if (this._active) {
                console.error(`[JdbcBridge:${dialect}] Process exited with code ${code}`);
                this._active = false;
            }
        });
        this.bridgeUrl = `http://localhost:${bridgePort}`;
        // Wait for bridge to be ready
        await this.waitForReady(bridgePort);
        this._active = true;
        console.log(`[JdbcNormalizer] Bridge started for ${dialect} → ${jdbcUrl} on port ${bridgePort}`);
        return this.bridgeUrl;
    }
    /**
     * Wait for the bridge health endpoint to respond.
     */
    async waitForReady(port, timeoutMs = 15000) {
        const start = Date.now();
        let lastError = '';
        while (Date.now() - start < timeoutMs) {
            try {
                const res = await fetch(`http://localhost:${port}/health`);
                if (res.ok)
                    return;
                lastError = `HTTP ${res.status}`;
            }
            catch (e) {
                lastError = e instanceof Error ? e.message : String(e);
            }
            await new Promise(r => setTimeout(r, 300));
        }
        // Kill the process if it didn't start
        this.stop();
        throw new Error(`JDBC bridge not ready after ${timeoutMs}ms on port ${port}.\n` +
            `Last error: ${lastError}\n` +
            `Ensure Java 11+ is installed: java --version`);
    }
    /**
     * Execute a query via the bridge HTTP endpoint.
     */
    async query(sql, params) {
        if (!this._active) {
            throw new Error('JDBC bridge is not active. Call start() first.');
        }
        const response = await fetch(`${this.bridgeUrl}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`JDBC bridge query failed (${response.status}): ${text}`);
        }
        return response.json();
    }
    /**
     * Stop the bridge process.
     */
    stop() {
        this._active = false;
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
        this.bridgeUrl = '';
    }
    /** Whether the bridge is currently active */
    get active() {
        return this._active;
    }
    /** The HTTP base URL of the running bridge */
    get url() {
        return this.bridgeUrl;
    }
}
