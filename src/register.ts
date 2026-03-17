// @mostajs/orm — Runtime module registration
// Author: Dr Hamid MADANI drmdh@msn.com

import type { ModuleRegistration } from '@mostajs/socle'

/**
 * ORM is the foundation module. It doesn't provide schemas/repos/permissions
 * of its own — it provides the infrastructure for other modules.
 * Its register() makes it visible in the dependency graph.
 */
export function register(registry: { register(r: ModuleRegistration): void }): void {
  registry.register({
    manifest: {
      name: 'orm',
      package: '@mostajs/orm',
      version: '2.0.0',
      type: 'core',
      priority: 0,
      displayName: 'MostaORM',
      description: 'Multi-dialect ORM — schema registry, repository pattern, 13 databases',
      icon: 'Database',
      register: './dist/register.js',
    },
  })
}
