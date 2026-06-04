// R010-MISSING-AUDIT-TABLE — détecte l'absence d'une table dédiée à l'audit
// (trace des actions admin). Seulement un `hint` — un projet peut volontairement
// ne pas avoir d'audit (CRUD simple, prototype, etc.).
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R010_MISSING_AUDIT_TABLE = {
    id: 'R010-MISSING-AUDIT-TABLE',
    description: 'Vérifie qu\'au moins un schéma ressemble à AuditLog (actor + action + at).',
    defaultSeverity: 'hint',
    apply(ctx) {
        const findings = [];
        if (ctx.schemas.length === 0)
            return findings;
        // Un schema "audit" a :
        //   - un champ 'actor' OU 'user' OU 'createdBy' (qui a fait)
        //   - un champ 'action' OU 'event' OU 'kind' (quoi)
        //   - un timestamp 'at' OU 'createdAt' OU 'timestamp'
        const hasAuditTable = ctx.schemas.some(s => {
            const fieldNames = new Set(Object.keys(s.fields ?? {}));
            const actorFields = ['actor', 'user', 'createdBy', 'performedBy'];
            const actionFields = ['action', 'event', 'kind', 'operation'];
            const hasActor = actorFields.some(f => fieldNames.has(f));
            const hasAction = actionFields.some(f => fieldNames.has(f));
            const hasTimestamp = s.timestamps || ['at', 'createdAt', 'timestamp'].some(f => fieldNames.has(f));
            return hasActor && hasAction && hasTimestamp;
        });
        if (hasAuditTable)
            return findings;
        findings.push({
            ruleId: R010_MISSING_AUDIT_TABLE.id,
            severity: R010_MISSING_AUDIT_TABLE.defaultSeverity,
            message: 'Aucun schéma ne ressemble à AuditLog — pas de trace forensique des actions admin.',
            location: {},
            suggestion: [
                `Si le projet a des actions sensibles (suppression, archivage, clone, export), ajouter :`,
                ``,
                `  export const AuditLogSchema: EntitySchema = {`,
                `    name: 'AuditLog',`,
                `    collection: 'audit_logs',`,
                `    timestamps: true,`,
                `    fields: {`,
                `      actor: { type: 'string', required: true },     // email ou userId`,
                `      action: { type: 'string', required: true },    // 'project.delete', etc.`,
                `      entityType: { type: 'string' },`,
                `      entityId: { type: 'string' },`,
                `      payloadJson: { type: 'string' },                // contexte JSON`,
                `      ip: { type: 'string' },`,
                `      userAgent: { type: 'string' },`,
                `    },`,
                `    indexes: [`,
                `      { fields: { actor: 'asc', createdAt: 'desc' } },`,
                `      { fields: { entityType: 'asc', entityId: 'asc' } },`,
                `      { fields: { action: 'asc' } },`,
                `    ],`,
                `  }`,
            ].join('\n'),
            fixable: false,
        });
        return findings;
    },
};
