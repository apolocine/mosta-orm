// JAR Upload Handler — receives a JAR file and saves it to jar_files/
// Used by mosta-setup ReconfigPanel for JDBC dialect configuration
// Author: Dr Hamid MADANI drmdh@msn.com

import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JDBC_REGISTRY, type JdbcDriverInfo } from './jdbc-registry.js';
import type { DialectType } from '../core/types.js';

// Resolve jar_files directory
const __filename_resolved = typeof __filename !== 'undefined'
  ? __filename
  : fileURLToPath(import.meta.url);
const __dirname_resolved = dirname(__filename_resolved);

function getJarDir(): string {
  if (process.env.MOSTA_JAR_DIR) return process.env.MOSTA_JAR_DIR;
  const candidates = [
    join(process.cwd(), 'jar_files'),
    join(__dirname_resolved, '..', '..', 'jar_files'),
    join(__dirname_resolved, '..', '..', '..', 'jar_files'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]; // Default: cwd/jar_files
}

export interface JarUploadResult {
  ok: boolean;
  fileName?: string;
  dialect?: string;
  jarDir?: string;
  replaced?: string;
  error?: string;
}

/**
 * Detect which dialect a JAR file belongs to based on its filename.
 */
export function detectDialectFromJar(fileName: string): { dialect: DialectType; info: JdbcDriverInfo } | null {
  const lowerName = fileName.toLowerCase();
  for (const [dialect, info] of Object.entries(JDBC_REGISTRY)) {
    if (info && lowerName.startsWith(info.jarPrefix)) {
      return { dialect: dialect as DialectType, info };
    }
  }
  return null;
}

/**
 * List all JAR files currently in the jar_files directory.
 */
export function listJarFiles(): { fileName: string; dialect: string | null; label: string | null }[] {
  const dir = getJarDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.jar'))
    .map(fileName => {
      const detected = detectDialectFromJar(fileName);
      return {
        fileName,
        dialect: detected?.dialect ?? null,
        label: detected?.info.label ?? null,
      };
    });
}

/**
 * Save an uploaded JAR file to the jar_files directory.
 * If a JAR for the same dialect already exists, it is replaced.
 *
 * @param fileName - Original filename (e.g. "hsqldb-2.7.2.jar")
 * @param data - File content as Buffer or Uint8Array
 */
export function saveJarFile(fileName: string, data: Buffer | Uint8Array): JarUploadResult {
  // Validate filename
  if (!fileName.endsWith('.jar')) {
    return { ok: false, error: 'Le fichier doit etre un .jar' };
  }

  // Sanitize filename
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeName || safeName.length < 5) {
    return { ok: false, error: 'Nom de fichier invalide' };
  }

  // Detect dialect
  const detected = detectDialectFromJar(safeName);

  // Ensure jar_files directory exists
  const dir = getJarDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Remove existing JAR for the same dialect (if any)
  let replaced: string | undefined;
  if (detected) {
    try {
      const existing = readdirSync(dir)
        .filter(f => f.startsWith(detected.info.jarPrefix) && f.endsWith('.jar'));
      for (const old of existing) {
        if (old !== safeName) {
          unlinkSync(join(dir, old));
          replaced = old;
        }
      }
    } catch {
      // Non-critical
    }
  }

  // Write file
  writeFileSync(join(dir, safeName), data);

  return {
    ok: true,
    fileName: safeName,
    dialect: detected?.dialect ?? undefined,
    jarDir: dir,
    replaced,
  };
}

/**
 * Delete a JAR file from the jar_files directory.
 */
export function deleteJarFile(fileName: string): JarUploadResult {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  const dir = getJarDir();
  const filePath = join(dir, safeName);

  if (!existsSync(filePath)) {
    return { ok: false, error: `Fichier ${safeName} introuvable` };
  }

  unlinkSync(filePath);
  return { ok: true, fileName: safeName };
}

/**
 * Get the list of JDBC-eligible dialects with their JAR status.
 */
export function getJdbcDialectStatus(): {
  dialect: DialectType;
  label: string;
  jarPrefix: string;
  hasJar: boolean;
  jarFile: string | null;
}[] {
  const dir = getJarDir();
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.jar')) : [];

  return Object.entries(JDBC_REGISTRY).map(([dialect, info]) => {
    if (!info) return null;
    const match = files.find(f => f.startsWith(info.jarPrefix));
    return {
      dialect: dialect as DialectType,
      label: info.label,
      jarPrefix: info.jarPrefix,
      hasJar: !!match,
      jarFile: match ?? null,
    };
  }).filter(Boolean) as {
    dialect: DialectType;
    label: string;
    jarPrefix: string;
    hasJar: boolean;
    jarFile: string | null;
  }[];
}
