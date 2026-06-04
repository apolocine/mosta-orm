// R005-ANY-TYPED-REPO — détecte les `BaseRepository<any>` dans le code source.
// Nécessite sourceFiles dans le contexte (sourceRoot passé en option).
//
// Note V1 : implémentation simple par regex (pas de parsing AST). Suffisant
// pour le pattern explicite `BaseRepository<any>`. AST (ts-morph) viendra
// en V2 pour les cas plus subtils (alias de type, generics inférés).
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
const RE_BASE_REPO_ANY = /\bBaseRepository<\s*any\s*>/g;
export const R005_ANY_TYPED_REPO = {
    id: 'R005-ANY-TYPED-REPO',
    description: 'Détecte les `BaseRepository<any>` qui perdent le typage côté consumer.',
    defaultSeverity: 'warning',
    needsSource: true,
    apply(ctx) {
        const findings = [];
        if (!ctx.sourceFiles)
            return [];
        for (const sf of ctx.sourceFiles) {
            // Skip dist, node_modules
            if (sf.relPath.includes('node_modules/') || sf.relPath.startsWith('dist/'))
                continue;
            // On veut surtout les fichiers TS
            if (!sf.path.endsWith('.ts') && !sf.path.endsWith('.tsx'))
                continue;
            const lines = sf.content.split('\n');
            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx];
                RE_BASE_REPO_ANY.lastIndex = 0;
                if (!RE_BASE_REPO_ANY.test(line))
                    continue;
                findings.push({
                    ruleId: R005_ANY_TYPED_REPO.id,
                    severity: R005_ANY_TYPED_REPO.defaultSeverity,
                    message: `\`BaseRepository<any>\` détecté — typage perdu côté consumer.`,
                    location: { file: sf.relPath, line: lineIdx + 1 },
                    suggestion: [
                        `Typer le repository avec l'interface de la row correspondante :`,
                        `  - BaseRepository<any>  →  BaseRepository<ProjectRow>`,
                        `  où ProjectRow = type inféré ou déclaré depuis ProjectSchema.`,
                        `  Idéalement : helper TS \`InferRow<typeof ProjectSchema>\` côté @mostajs/orm.`,
                    ].join('\n'),
                    fixable: false,
                });
            }
        }
        return findings;
    },
};
