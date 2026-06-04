import type { DialectType } from '../core/types.js';
import { JdbcNormalizer } from './JdbcNormalizer.js';
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
export declare class BridgeManager {
    private static instance;
    private bridges;
    private nextPort;
    private readonly basePort;
    private readonly portIncrement;
    private readonly maxRetries;
    private readonly retryResetMs;
    private startAttempts;
    private cleanupRegistered;
    private constructor();
    static getInstance(): BridgeManager;
    /** Reset singleton (for testing) */
    static resetInstance(): void;
    /**
     * Get an existing bridge or create a new one for the given dialect/URI.
     * If a bridge with the same key already exists and is alive, reuse it.
     * IMPORTANT: Only ONE bridge per dialect/URI — scans ports to reuse existing bridges
     * across Next.js module contexts.
     */
    getOrCreate(dialect: DialectType, uri: string, options?: {
        jarDir?: string;
        bridgeJavaFile?: string;
    }): Promise<BridgeInstance>;
    /**
     * Stop a specific bridge by key.
     */
    stop(key: string): Promise<void>;
    /**
     * Stop ALL bridges (called on app exit).
     */
    stopAll(): Promise<void>;
    /**
     * List all active bridges.
     */
    list(): BridgeInstance[];
    /**
     * Check if a bridge exists for the given key.
     */
    has(key: string): boolean;
    /**
     * Build a bridge key from dialect and URI.
     */
    buildKey(dialect: DialectType, uri: string): string;
    private startBridge;
    private getNextPort;
    private isAlive;
    /**
     * Scan ports to find an already-running bridge matching the expected JDBC URL.
     * Solves Next.js module isolation where different route modules have different singletons.
     */
    private findExistingBridge;
    private detectExistingBridge;
    private checkStartAttempts;
    private getJarDir;
    private writePidFile;
    private removePidFile;
    /**
     * Clean up PID files for dead processes only.
     * NEVER kills alive processes — they may be bridges from other module contexts.
     * Adjusts nextPort to avoid collisions with alive bridges.
     */
    private cleanupOrphans;
    private registerCleanupHandlers;
    private stopAllSync;
}
