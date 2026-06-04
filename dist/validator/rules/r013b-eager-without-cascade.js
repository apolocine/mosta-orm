// R013B-EAGER-WITHOUT-CASCADE — détecte les relations avec `fetch: 'eager'`
// (opt-in depuis 2.0) qui n'ont PAS d'onDelete explicite.
//
// Eager fetching = la relation est chargée à chaque findById/findAll. Si le
// parent est supprimé et qu'il n'y a pas d'onDelete cascade/set-null/restrict,
// le comportement par défaut SQL est 'no-action' : les enfants restent
// orphelins, mais le populate eager tente de les fetcher → undefined ou
// crash silencieux selon le dialect.
//
// Plus pernicieux : avec `select` partiel, l'erreur ne se manifeste qu'au
// runtime, pas au schema-init.
//
// Sévérité : warning. Auto-fixable (insertion d'onDelete).
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R013B_EAGER_WITHOUT_CASCADE = {
    id: 'R013B-EAGER-WITHOUT-CASCADE',
    description: "Détecte les relations `fetch: 'eager'` sans `onDelete` explicite — orphelins populés silencieusement.",
    defaultSeverity: 'warning',
    apply(ctx) {
        const findings = [];
        for (const schema of ctx.schemas) {
            const relations = schema.relations ?? {};
            for (const [relName, rel] of Object.entries(relations)) {
                if (rel.fetch !== 'eager')
                    continue;
                if (rel.onDelete)
                    continue;
                // Sur many-to-many, onDelete sur la junction = N/A (R013 ne s'applique
                // pas non plus aux M2M, on garde la cohérence — R013B suit le même
                // périmètre many-to-one + one-to-one + one-to-many).
                if (rel.type === 'many-to-many')
                    continue;
                const suggestedOnDelete = rel.type === 'one-to-many' ? 'cascade' : (rel.required ? 'cascade' : 'set-null');
                findings.push({
                    ruleId: R013B_EAGER_WITHOUT_CASCADE.id,
                    severity: R013B_EAGER_WITHOUT_CASCADE.defaultSeverity,
                    message: `Relation \`${schema.name}.${relName}\` (${rel.type} → ${rel.target}) est eager ` +
                        `mais n'a pas d'onDelete — orphelins populés au prochain findById/findAll.`,
                    location: { schema: schema.name, field: relName },
                    suggestion: [
                        `Spécifier explicitement le comportement à la suppression du parent :`,
                        ``,
                        `  relations: {`,
                        `    ${relName}: {`,
                        `      type: '${rel.type}', target: '${rel.target}', fetch: 'eager',`,
                        `      onDelete: '${suggestedOnDelete}',   // ← ajouter`,
                        `    },`,
                        `  }`,
                        ``,
                        `Choix :`,
                        `  - 'cascade'   : supprimer l'enfant (parent supprimé = enfant supprimé)`,
                        `  - 'set-null'  : nullifier la FK (parent supprimé = enfant orphelin gardé)`,
                        `  - 'restrict'  : interdire la suppression du parent tant qu'enfants existent`,
                        ``,
                        `Alternative : retirer \`fetch: 'eager'\` si la relation peut rester lazy ` +
                            `(évite aussi N+1 silencieux).`,
                    ].join('\n'),
                    fixable: true,
                    contextDataJson: JSON.stringify({
                        schemaName: schema.name,
                        relationName: relName,
                        relationType: rel.type,
                        target: rel.target,
                        suggestedOnDelete,
                    }),
                });
            }
        }
        return findings;
    },
};
