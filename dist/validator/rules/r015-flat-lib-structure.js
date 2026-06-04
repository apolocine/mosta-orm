// R015-FLAT-LIB-STRUCTURE — détecte un dossier lib/ avec trop de fichiers à
// la racine. Suggère un découpage en sous-dossiers thématiques.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R015_FLAT_LIB_STRUCTURE = {
    id: 'R015-FLAT-LIB-STRUCTURE',
    description: 'Détecte un dossier lib/ plat avec > threshold fichiers à la racine.',
    defaultSeverity: 'hint',
    needsSource: true,
    apply(ctx) {
        if (!ctx.sourceFiles)
            return [];
        const threshold = ctx.options.thresholds.flatLibMaxFiles ?? 25;
        // Compte par dossier-parent direct (relatif à sourceRoot)
        const filesByDir = new Map();
        for (const sf of ctx.sourceFiles) {
            const segments = sf.relPath.split('/');
            const dir = segments.length > 1 ? segments[0] : '.';
            if (!filesByDir.has(dir))
                filesByDir.set(dir, []);
            filesByDir.get(dir).push(sf.relPath);
        }
        const findings = [];
        for (const [dir, files] of filesByDir) {
            // Compte uniquement les fichiers directement dans `dir`, pas dans sub-dirs
            const directFiles = files.filter(f => f.split('/').length === (dir === '.' ? 1 : 2));
            if (directFiles.length < threshold)
                continue;
            findings.push({
                ruleId: R015_FLAT_LIB_STRUCTURE.id,
                severity: R015_FLAT_LIB_STRUCTURE.defaultSeverity,
                message: `'${dir}/' contient ${directFiles.length} fichiers à plat — pensez à un découpage thématique.`,
                location: { file: dir + '/' },
                suggestion: [
                    `Organiser par domaine logique :`,
                    `  ${dir}/auth/    — magic-link, session, RBAC helpers`,
                    `  ${dir}/archive/ — export, import, manifest`,
                    `  ${dir}/admin/   — actions admin (delete, validate, etc.)`,
                    `  ${dir}/data/    — repos, ORM helpers`,
                    `  ${dir}/ui/      — formatters, validators côté serveur`,
                    ``,
                    `Adapter les imports — TypeScript path aliases (\`@/lib/auth\`) facilitent.`,
                ].join('\n'),
                fixable: false,
                contextDataJson: JSON.stringify({ dir, fileCount: directFiles.length }),
            });
        }
        return findings;
    },
};
