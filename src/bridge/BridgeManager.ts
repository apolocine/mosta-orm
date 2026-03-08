// BridgeManager — Singleton managing multiple JDBC bridge instances
// Allows simultaneous connections to different SGBD via JDBC bridges on incrementing ports
// Author: Dr Hamid MADANI drmdh@msn.com

import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { DialectType } from '../core/types.js';
import { JdbcNormalizer, parseUri } from './JdbcNormalizer.js';
import { getJdbcDriverInfo } from './jdbc-registry.js';

// ============================================================
// Types
// ============================================================

export interface BridgeInstance {
  /** Unique key: `${dialect}:${host}:${port}/${database}` */
  key: string;
  /** Dialect type */
  dialect: DialectType;
  /** HTTP port of the bridge */
  port: number;
  /** HTTP base URL: http://localhost:{port} */
  url: string;
  /** PID of the Java process */
  pid: number;
  /** JDBC URL used */
  jdbcUrl: string;
  /** When the bridge was started */
  startedAt: Date;
  /** Underlying JdbcNormalizer instance */
  normalizer: JdbcNormalizer;
}

interface StartAttempt {
  count: number;
  lastAttempt: Date;
}

// ============================================================
// BridgeManager singleton
// ============================================================

export class BridgeManager {
  private static instance: BridgeManager | null = null;

  private bridges: Map<string, BridgeInstance> = new Map();
  private nextPort: number;
  private readonly basePort: number;
  private readonly portIncrement: boolean;
  private readonly maxRetries: number;
  private readonly retryResetMs: number;
  private startAttempts: Map<string, StartAttempt> = new Map();
  private cleanupRegistered = false;

  private constructor() {
    this.basePort = parseInt(process.env.MOSTA_BRIDGE_PORT_BASE || '8765');
    this.nextPort = this.basePort;
    this.portIncrement = (process.env.MOSTA_BRIDGE_PORT_INCREMENT ?? 'true') !== 'false';
    this.maxRetries = parseInt(process.env.MOSTA_BRIDGE_MAX_RETRIES || '3');
    this.retryResetMs = 60_000;

    this.registerCleanupHandlers();
    this.cleanupOrphans();
  }

  static getInstance(): BridgeManager {
    if (!BridgeManager.instance) {
      BridgeManager.instance = new BridgeManager();
    }
    return BridgeManager.instance;
  }

  /** Reset singleton (for testing) */
  static resetInstance(): void {
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
  async getOrCreate(dialect: DialectType, uri: string, options?: {
    jarDir?: string;
    bridgeJavaFile?: string;
  }): Promise<BridgeInstance> {
    const key = this.buildKey(dialect, uri);
    const parsed = parseUri(dialect, uri);
    const jdbcUrl = JdbcNormalizer.composeJdbcUrl(dialect, parsed);

    // 1. Check in-memory map first
    if (this.bridges.has(key)) {
      const bridge = this.bridges.get(key)!;
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
      throw new Error(
        `JDBC bridge disabled (MOSTA_BRIDGE_AUTOSTART=false).\n` +
        `Start the bridge manually:\n` +
        `  java --source 11 -cp ${info?.jarPrefix || 'driver'}*.jar \\\n` +
        `    MostaJdbcBridge.java \\\n` +
        `    --jdbc-url <jdbc-url> \\\n` +
        `    --port ${this.basePort}\n` +
        `Or set MOSTA_BRIDGE_AUTOSTART=true in .env`
      );
    }

    // Launch a new bridge
    try {
      const bridge = await this.startBridge(dialect, uri, options);
      this.startAttempts.delete(key); // Success — reset counter
      return bridge;
    } catch (e) {
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
  async stop(key: string): Promise<void> {
    const bridge = this.bridges.get(key);
    if (!bridge) return;

    bridge.normalizer.stop();
    this.removePidFile(bridge.port);
    this.bridges.delete(key);
    console.log(`[BridgeManager] Stopped bridge ${key} on port ${bridge.port}`);
  }

  /**
   * Stop ALL bridges (called on app exit).
   */
  async stopAll(): Promise<void> {
    for (const [key, bridge] of this.bridges) {
      try {
        bridge.normalizer.stop();
        this.removePidFile(bridge.port);
        console.log(`[BridgeManager] Stopped bridge ${key} on port ${bridge.port}`);
      } catch {
        // Best effort
      }
    }
    this.bridges.clear();
  }

  /**
   * List all active bridges.
   */
  list(): BridgeInstance[] {
    return Array.from(this.bridges.values());
  }

  /**
   * Check if a bridge exists for the given key.
   */
  has(key: string): boolean {
    return this.bridges.has(key);
  }

  /**
   * Build a bridge key from dialect and URI.
   */
  buildKey(dialect: DialectType, uri: string): string {
    const parsed = parseUri(dialect, uri);
    return `${dialect}:${parsed.host}:${parsed.port || ''}/${parsed.database || ''}`;
  }

  // ============================================================
  // Internal
  // ============================================================

  private async startBridge(dialect: DialectType, uri: string, options?: {
    jarDir?: string;
    bridgeJavaFile?: string;
  }): Promise<BridgeInstance> {
    const port = this.getNextPort();

    // Check port availability
    if (await this.detectExistingBridge(port)) {
      if (!this.portIncrement) {
        throw new Error(
          `Port ${port} already in use.\n` +
          `Set MOSTA_BRIDGE_PORT_INCREMENT=true to auto-increment,\n` +
          `or change MOSTA_BRIDGE_PORT_BASE,\n` +
          `or stop the process using port ${port}: lsof -i :${port}`
        );
      }
      // Port taken — increment was already handled by getNextPort()
      // but if we detect it's in use, try next
      this.nextPort++;
      return this.startBridge(dialect, uri, options);
    }

    const normalizer = new JdbcNormalizer();
    await normalizer.start(dialect, uri, {
      bridgePort: port,
      jarDir: options?.jarDir,
      bridgeJavaFile: options?.bridgeJavaFile,
    });

    const parsed = parseUri(dialect, uri);
    const jdbcUrl = JdbcNormalizer.composeJdbcUrl(dialect, parsed);
    const pid = (normalizer as unknown as { process: { pid?: number } | null }).process?.pid ?? 0;

    const key = this.buildKey(dialect, uri);
    const bridge: BridgeInstance = {
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

    console.log(
      `[BridgeManager] Bridge started: ${key}\n` +
      `  Port: ${port} | PID: ${pid} | JDBC: ${jdbcUrl}`
    );

    return bridge;
  }

  private getNextPort(): number {
    return this.nextPort;
  }

  private async isAlive(bridge: BridgeInstance): Promise<boolean> {
    try {
      const res = await fetch(`${bridge.url}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Scan ports to find an already-running bridge matching the expected JDBC URL.
   * Solves Next.js module isolation where different route modules have different singletons.
   */
  private async findExistingBridge(dialect: DialectType, expectedJdbcUrl: string): Promise<BridgeInstance | null> {
    for (let port = this.basePort; port < this.basePort + 10; port++) {
      try {
        const res = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (!res.ok) continue;
        const health = (await res.json()) as { jdbcUrl?: string };
        if (health.jdbcUrl === expectedJdbcUrl) {
          // Found a matching bridge — adopt it
          const key = `${dialect}:adopted:${port}`;
          const normalizer = new JdbcNormalizer();
          (normalizer as unknown as { _active: boolean })._active = true;
          (normalizer as unknown as { bridgeUrl: string }).bridgeUrl = `http://localhost:${port}`;
          const bridge: BridgeInstance = {
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
          if (port >= this.nextPort) this.nextPort = port + 1;
          console.log(`[BridgeManager] Adopted existing bridge on port ${port} for ${dialect} (${expectedJdbcUrl})`);
          return bridge;
        }
      } catch {
        // Not a bridge on this port
      }
    }
    return null;
  }

  private async detectExistingBridge(port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private checkStartAttempts(key: string): void {
    const attempts = this.startAttempts.get(key);
    if (!attempts) return;

    const elapsed = Date.now() - attempts.lastAttempt.getTime();
    if (elapsed < this.retryResetMs && attempts.count >= this.maxRetries) {
      throw new Error(
        `JDBC bridge for "${key}" failed ${this.maxRetries} times in the last ${this.retryResetMs / 1000}s. Giving up.\n` +
        `Diagnostic:\n` +
        `  1. Java installed?  → java --version\n` +
        `  2. JAR valid?       → ls jar_files/\n` +
        `  3. SGBD running?    → check target port\n` +
        `  4. Firewall?        → check bridge port\n` +
        `Check Java installation, JAR file, and SGBD server.`
      );
    }
    if (elapsed >= this.retryResetMs) {
      this.startAttempts.delete(key); // Reset after cooldown
    }
  }

  // --- PID file management ---

  private getJarDir(): string {
    return process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files');
  }

  private writePidFile(port: number, pid: number): void {
    try {
      const dir = this.getJarDir();
      if (existsSync(dir)) {
        writeFileSync(join(dir, `.bridge-${port}.pid`), String(pid));
      }
    } catch {
      // Non-critical
    }
  }

  private removePidFile(port: number): void {
    try {
      const pidFile = join(this.getJarDir(), `.bridge-${port}.pid`);
      if (existsSync(pidFile)) {
        unlinkSync(pidFile);
      }
    } catch {
      // Non-critical
    }
  }

  /**
   * Clean up PID files for dead processes only.
   * NEVER kills alive processes — they may be bridges from other module contexts.
   * Adjusts nextPort to avoid collisions with alive bridges.
   */
  private cleanupOrphans(): void {
    try {
      const dir = this.getJarDir();
      if (!existsSync(dir)) return;

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
          try { process.kill(pid, 0); alive = true; } catch { /* dead */ }

          if (alive) {
            // Process alive — do NOT kill. Advance nextPort to avoid collision.
            if (port > 0 && port >= this.nextPort) {
              this.nextPort = port + 1;
            }
          } else {
            // Process dead — clean up stale PID file
            unlinkSync(join(dir, file));
          }
        } catch {
          // Ignore individual file errors
        }
      }
    } catch {
      // Non-critical — orphan cleanup is best-effort
    }
  }

  // --- Cleanup handlers ---

  private registerCleanupHandlers(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => this.stopAllSync();

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  }

  private stopAllSync(): void {
    for (const [, bridge] of this.bridges) {
      try {
        bridge.normalizer.stop();
        this.removePidFile(bridge.port);
      } catch {
        // Best effort
      }
    }
    this.bridges.clear();
  }
}
