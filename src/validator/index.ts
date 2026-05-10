// @mostajs/orm/validator — API publique
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Usage :
//   import { validateSchemas, formatText } from '@mostajs/orm/validator'
//   import * as schemas from './schemas'
//   const report = await validateSchemas(Object.values(schemas), {
//     sourceRoot: './lib',
//   })
//   console.log(formatText(report))
//
// CLI :
//   npx mostajs-orm-validator ./schemas --src ./lib --format text

export { validateSchemas, DEFAULT_RULES } from './runner.js'
export { formatText, formatJson, formatMarkdown } from './reporters.js'
export type {
  Severity, Finding, Report, ValidateOptions,
  SoftDeletePattern, Thresholds, RuleContext, Rule, SourceFile,
} from './types.js'
export {
  DEFAULT_SOFT_DELETE_PATTERNS, DEFAULT_AUDIT_BY_FIELDS, DEFAULT_THRESHOLDS,
} from './types.js'

// Re-export des règles individuelles pour permettre la composition.
export { R001_EMPTY_RELATIONS } from './rules/r001-empty-relations.js'
export { R002_FK_NAMING } from './rules/r002-fk-naming.js'
export { R003_SOFT_DELETE } from './rules/r003-soft-delete.js'
export { R004_DUPLICATE_ENTITY } from './rules/r004-duplicate-entity.js'
export { R005_ANY_TYPED_REPO } from './rules/r005-any-typed-repo.js'
