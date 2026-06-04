// R016-AUDIT-EMAIL-AS-STRING — détecte les champs d'audit (createdBy,
// validatedBy, etc.) typés `string` au lieu d'une FK vers User. Orphelins
// possibles si l'email du user change.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R016_AUDIT_EMAIL_AS_STRING = {
    id: 'R016-AUDIT-EMAIL-AS-STRING',
    description: 'Détecte les champs audit (createdBy, validatedBy…) typés string sans FK User.',
    defaultSeverity: 'info',
    apply(ctx) {
        const findings = [];
        const auditFields = new Set(ctx.options.auditByFields);
        // Un schema 'User' (ou RbacUser) doit exister pour suggérer la FK.
        const hasUserSchema = ctx.schemas.some(s => s.name === 'User' || s.name === 'RbacUser' || s.name === 'AuthUser');
        if (!hasUserSchema)
            return findings; // pas de User → suggestion pas pertinente
        for (const schema of ctx.schemas) {
            for (const [fieldName, fieldDef] of Object.entries(schema.fields ?? {})) {
                if (!auditFields.has(fieldName))
                    continue;
                if (fieldDef.type !== 'string')
                    continue;
                // Le champ pourrait être une FK vers User mais déclaré en string ?
                // Vérifie qu'il n'y a pas déjà une relation pour ce champ
                const hasRelation = schema.relations && fieldName in schema.relations;
                if (hasRelation)
                    continue;
                findings.push({
                    ruleId: R016_AUDIT_EMAIL_AS_STRING.id,
                    severity: R016_AUDIT_EMAIL_AS_STRING.defaultSeverity,
                    message: `'${schema.name}.${fieldName}' typé string — perd l'intégrité référentielle si l'email/id du user change.`,
                    location: { schema: schema.name, field: fieldName },
                    suggestion: [
                        `Option 1 (recommandé) : convertir en FK vers User :`,
                        `  fields: { /* retirer ${fieldName} */ },`,
                        `  relations: {`,
                        `    ${fieldName}: { type: 'many-to-one', target: 'User', onDelete: 'set-null' },`,
                        `  }`,
                        ``,
                        `Option 2 (audit historique, pas de re-référencement) : laisser en string mais documenter`,
                        `que c'est un snapshot immutable de l'email à l'instant T.`,
                    ].join('\n'),
                    fixable: true,
                });
            }
        }
        return findings;
    },
};
