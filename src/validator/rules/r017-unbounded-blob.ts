// R017-UNBOUNDED-BLOB-FIELD — détecte les champs JSON/string susceptibles de
// stocker de gros volumes sans contrainte de taille documentée. Hint :
// stockage hors DB si > 1 MB.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type { Finding, Rule, RuleContext } from '../types.js'

// Heuristique : un field nommé *Json, *Payload, *Blob, *Data, *Content,
// *Manifest sans limite documentée → flag.
const BLOB_NAME_PATTERN = /(Json|Payload|Blob|Data|Content|Manifest|Body|Snapshot|Backup)$/

export const R017_UNBOUNDED_BLOB: Rule = {
  id: 'R017-UNBOUNDED-BLOB-FIELD',
  description: 'Détecte les champs potentiellement très gros (JSON/payload/blob) sans contrainte de taille documentée.',
  defaultSeverity: 'hint',

  apply(ctx: RuleContext): Finding[] {
    const findings: Finding[] = []
    for (const schema of ctx.schemas) {
      for (const [fieldName, fieldDef] of Object.entries(schema.fields ?? {})) {
        if (fieldDef.type !== 'string' && fieldDef.type !== 'json') continue
        if (!BLOB_NAME_PATTERN.test(fieldName)) continue
        // Skip si maxLength est défini sur le field (futur — actuel schéma n'a pas ce field)
        if ((fieldDef as any).maxLength) continue

        findings.push({
          ruleId: R017_UNBOUNDED_BLOB.id,
          severity: R017_UNBOUNDED_BLOB.defaultSeverity,
          message: `'${schema.name}.${fieldName}' (type ${fieldDef.type}) peut grossir sans limite — documenter la taille max attendue.`,
          location: { schema: schema.name, field: fieldName },
          suggestion: [
            `Si la taille attendue est petite (< 100 KB) : ajouter un commentaire JSDoc précisant la borne.`,
            `Si la taille peut dépasser 1 MB : stocker hors DB et garder un FK path/url :`,
            ``,
            `  fields: {`,
            `    ${fieldName}Path: { type: 'string', required: true },  // path FS ou S3 URL`,
            `  }`,
            ``,
            `Voir patterns dans @mostajs/storage (méta DB + bytes FS/S3).`,
          ].join('\n'),
          fixable: false,
        })
      }
    }
    return findings
  },
}
