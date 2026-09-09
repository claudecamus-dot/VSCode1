// Build d'artefact de deploiement versionne (US8.1).
//
// Produit dist/<nom>.tgz : un artefact autoportant (sources + dependances de prod
// + template + requirements Python) qu'on deploie tel quel dans le dossier d'un
// environnement (promotion DEV->PRE-PROD->PROD) ou qui sert de base au conteneur.
// Le projet A des devDependencies (eslint, c8, puppeteer-core...) : on les exclut
// de l'artefact. node_modules n'est donc PAS copie depuis le node_modules de dev
// en cours d'usage ; on l'installe a neuf, prod-only, dans le staging lui-meme
// (npm ci --omit=dev, a partir du package-lock.json copie juste avant) — versions
// figees comme en dev, mais sans les paquets qui ne servent qu'au developpement.
// On embarque aussi package-lock.json pour tracer/rejouer les versions.
//
// Usage :   node scripts/build-artifact.js     (ou : npm run build:artifact)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const APP = path.join(__dirname, '..');
const REPO = path.join(APP, '..');
const pkg = require(path.join(APP, 'package.json'));

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const name = `${pkg.name}-${pkg.version}-${stamp}`;
const distRoot = path.join(REPO, 'dist');
const stage = path.join(distRoot, name);
const stageApp = path.join(stage, 'app');

console.log('Artefact :', name);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stageApp, { recursive: true });

// 1) Sources de l'app (src/ inclut public/). data/, .env.* reels, backups exclus.
fs.cpSync(path.join(APP, 'src'), path.join(stageApp, 'src'), { recursive: true });

// 2) Scripts strictement utiles au runtime (export PPT + sauvegarde DB). On exclut
//    tests, captures et scripts de dev.
const SCRIPTS_KEEP = ['backup-db.js', 'restore-db.js', 'export-restitution-ppt.py', 'pptx_deck.py'];
fs.mkdirSync(path.join(stageApp, 'scripts'), { recursive: true });
for (const f of SCRIPTS_KEEP) {
  fs.cpSync(path.join(APP, 'scripts', f), path.join(stageApp, 'scripts', f));
}

// 3) Config + manifeste de deps.
for (const f of ['package.json', 'package-lock.json', '.env.example']) {
  if (fs.existsSync(path.join(APP, f))) fs.cpSync(path.join(APP, f), path.join(stageApp, f));
}

// 4) Dependances de PROD uniquement : installees a neuf dans le staging (jamais
//    dans le node_modules de dev en cours d'usage) via `npm ci --omit=dev`, a
//    partir du package.json/package-lock.json deja copies dans stageApp. Fige les
//    memes versions qu'en dev, sans les devDependencies (ex. puppeteer-core, qui
//    ne sert qu'aux scripts de capture/dev, absent de app/src/server.js).
console.log('Installation des dependances de production (npm ci --omit=dev)…');
// execSync (pas execFileSync) : sur Windows, npm est un script .cmd, invocable
// seulement via un shell (execFileSync direct leve EINVAL). Aucun argument
// variable/externe ici (chaine figee), donc pas de risque d'injection.
execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: stageApp, stdio: 'inherit' });

// 5) Template PPT (chemin relatif attendu par export-restitution-ppt.py : ../../template ppt).
fs.mkdirSync(path.join(stage, 'template ppt'), { recursive: true });
fs.cpSync(path.join(REPO, 'template ppt', 'template.pptx'),
  path.join(stage, 'template ppt', 'template.pptx'));

// 6) Dependance Python (export PPT) + manifeste + mini-runbook.
fs.writeFileSync(path.join(stage, 'requirements.txt'), 'python-pptx>=0.6\n');
fs.writeFileSync(path.join(stage, 'VERSION'),
  `${pkg.name} ${pkg.version}\nbuilt ${new Date().toISOString()}\nnode ${process.version}\n`);
fs.writeFileSync(path.join(stage, 'README-deploy.txt'),
  [
    `Artefact ${name}`,
    '',
    'Prerequis : Node >= 22 ; Python 3 + `pip install -r requirements.txt` et Chrome',
    '            (ces deux derniers uniquement pour l\'export PPT).',
    'Config    : copier app/.env.example en app/.env, ajuster APP_ENV / PORT / DB_PATH',
    '            / CHROME_PATH / PYTHON.',
    'Demarrer  : depuis la racine de l\'artefact :',
    '              node --env-file=app/.env app/src/server.js',
    'Donnees   : base creee/migree au 1er demarrage. Sauvegarde :',
    '              node --env-file=app/.env app/scripts/backup-db.js',
    '',
  ].join('\n'));

// 7) Archive .tgz puis on retire le repertoire de staging (l'archive EST l'artefact).
//    On invoque tar depuis distRoot avec des chemins RELATIFS : un chemin Windows
//    absolu (C:\...) serait lu par GNU tar comme un hote distant (host:path) et
//    echouerait avec status 2.
const tgz = path.join(distRoot, `${name}.tgz`);
console.log('Archivage…');
execFileSync('tar', ['-czf', `${name}.tgz`, name], { cwd: distRoot, stdio: 'inherit' });
fs.rmSync(stage, { recursive: true, force: true });

const mo = (fs.statSync(tgz).size / 1024 / 1024).toFixed(1);
console.log(`OK -> ${tgz} (${mo} Mo)`);
