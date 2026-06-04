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
export { validateSchemas, DEFAULT_RULES } from './runner.js';
export { formatText, formatJson, formatMarkdown } from './reporters.js';
export { applyFixes, rollbackFixes } from './fixer.js';
export { DEFAULT_SOFT_DELETE_PATTERNS, DEFAULT_AUDIT_BY_FIELDS, DEFAULT_THRESHOLDS, } from './types.js';
// Re-export des règles individuelles pour permettre la composition.
export { R001_EMPTY_RELATIONS } from './rules/r001-empty-relations.js';
export { R002_FK_NAMING } from './rules/r002-fk-naming.js';
export { R003_SOFT_DELETE } from './rules/r003-soft-delete.js';
export { R004_DUPLICATE_ENTITY } from './rules/r004-duplicate-entity.js';
export { R004B_LEGACY_ENTITY } from './rules/r004b-legacy-entity.js';
export { R005_ANY_TYPED_REPO } from './rules/r005-any-typed-repo.js';
export { R006_JSON_AS_RELATION } from './rules/r006-json-as-relation.js';
export { R009_MISSING_LOOKUP_INDEX } from './rules/r009-missing-lookup-index.js';
export { R010_MISSING_AUDIT_TABLE } from './rules/r010-missing-audit-table.js';
export { R013_MISSING_CASCADE } from './rules/r013-missing-cascade.js';
export { R014_REPO_FACTORY_BOILERPLATE } from './rules/r014-repo-factory-boilerplate.js';
export { R015_FLAT_LIB_STRUCTURE } from './rules/r015-flat-lib-structure.js';
export { R016_AUDIT_EMAIL_AS_STRING } from './rules/r016-audit-email-as-string.js';
export { R017_UNBOUNDED_BLOB } from './rules/r017-unbounded-blob.js';
export { R007_REDUNDANT_DERIVED_FIELD, R008_BEST_EFFORT_RESOLVER, R011_LEGACY_DEAD_CODE, R012_DUPLICATE_IMPLEMENTATION, R018_EXTERNAL_SCHEMA_OVERSCOPED, } from './rules/r007-r008-r011-r012-r018-stubs.js';
export { R019_FINDBYID_OBJECT_INPUT } from './rules/r019-findbyid-object-input.js';
export { R020_NATURAL_KEY_LOOKUP_OPPORTUNITY } from './rules/r020-natural-key-lookup-opportunity.js';
export { R021_DIRECT_RELATION_COMPARISON } from './rules/r021-direct-relation-comparison.js';
export { R003B_UNIQUE_WITH_SOFTDELETE_CONFLICT } from './rules/r003b-unique-with-softdelete-conflict.js';
export { R013B_EAGER_WITHOUT_CASCADE } from './rules/r013b-eager-without-cascade.js';
