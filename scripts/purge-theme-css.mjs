// Vite plugin: drops rules from the built theme stylesheet whose selectors can never match, because a class in every part of the selector
// list appears in no source file (the theme ships styles for pages Alfaiate TL does not have: checkout, blog, style guide, team...).
// Conservative on purpose: classes inside :not/:is/:where/:has are ignored; modifier classes (`is-*`) and Webflow state classes (`w-*`, `w--*`)
// are always kept because markup and scripts compose them; every other class is kept if its name appears anywhere in src/ (outside CSS),
// in the safelist lines of global.css, or in public scripts. Keyframes and fonts are never touched.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(astro|ts|tsx|js|mjs|md)$/.test(name) ? [path] : [];
  });

export function purgeThemeCss(root = process.cwd()) {
  return {
    name: 'purge-theme-css',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const source = [...walk(join(root, 'src')), join(root, 'src/theme/styles/global.css')]
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      const known = (name) => /^(is-|w-|w--)/.test(name) || source.includes(name);
      const deadPart = (part) => {
        const bare = part.replace(/:(not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
        return [...bare.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].some((m) => !known(m[1].replace(/\\/g, '')));
      };
      for (const [file, asset] of Object.entries(bundle)) {
        if (!/ThemeLayout[^/]*\.css$/.test(file) || asset.type !== 'asset') continue;
        const root = postcss.parse(String(asset.source));
        let removed = 0;
        root.walkRules((rule) => {
          if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
          const parts = rule.selectors;
          if (parts.length && parts.every(deadPart)) {
            removed += rule.toString().length;
            rule.remove();
          }
        });
        root.walkAtRules((at) => {
          if (/^(media|supports|layer|container)$/.test(at.name) && at.nodes && at.nodes.length === 0 && at.params !== undefined && !(at.name === 'layer' && !at.params)) at.remove();
        });
        asset.source = root.toString();
        this.info(`purge-theme-css: removed ${removed} bytes from ${file}`);
      }
    },
  };
}
