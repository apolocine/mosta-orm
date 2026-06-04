// R013-MISSING-CASCADE — détecte les relations many-to-one sans `onDelete`
// explicite. Le défaut ORM est souvent 'no-action' (= silencieux), ce qui
// laisse des orphelins si le parent est supprimé.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R013_MISSING_CASCADE = {
    id: 'R013-MISSING-CASCADE',
    description: 'Détecte les relations many-to-one sans onDelete explicite.',
    defaultSeverity: 'warning',
    apply(ctx) {
        const findings = [];
        for (const schema of ctx.schemas) {
            const relations = schema.relations ?? {};
            for (const [relName, rel] of Object.entries(relations)) {
                if (rel.type !== 'many-to-one')
                    continue;
                if (rel.onDelete)
                    continue;
                findings.push({
                    ruleId: R013_MISSING_CASCADE.id,
                    severity: R013_MISSING_CASCADE.defaultSeverity,
                    message: `Relation '${schema.name}.${relName}' (→ ${rel.target}) sans onDelete explicite — comportement par défaut (no-action) laisse des orphelins.`,
                    location: { schema: schema.name, field: relName },
                    suggestion: [
                        `Choisir un comportement explicite :`,
                        `  - 'cascade'   : supprime les enfants quand le parent est supprimé (cas le + courant)`,
                        `  - 'set-null'  : nullifier la FK quand le parent est supprimé`,
                        `  - 'restrict'  : interdire la suppression du parent s'il a des enfants`,
                        ``,
                        `Exemple :`,
                        `  relations: {`,
                        `    ${relName}: { type: 'many-to-one', target: '${rel.target}', onDelete: 'cascade' },`,
                        `  }`,
                    ].join('\n'),
                    fixable: true,
                });
            }
        }
        return findings;
    },
};
