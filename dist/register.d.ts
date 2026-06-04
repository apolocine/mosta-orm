import type { ModuleRegistration } from '@mostajs/socle';
/**
 * ORM is the foundation module. It doesn't provide schemas/repos/permissions
 * of its own — it provides the infrastructure for other modules.
 * Its register() makes it visible in the dependency graph.
 */
export declare function register(registry: {
    register(r: ModuleRegistration): void;
}): void;
