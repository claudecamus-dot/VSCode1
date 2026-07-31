// Garde-fou : aucun secret dans un fichier .env VERSIONNE.
//
// Pourquoi ce test existe. Les fichiers .env.dev / .env.preprod / .env.prod sont
// suivis par git (ils ne portent que APP_ENV / PORT / DB_PATH, du parametrage
// d'environnement, pas des secrets) et .gitignore ne les couvre pas. Or src/auth.js
// invite l'exploitant a poser AUTH_USER / AUTH_PASS pour activer la barriere sur la
// surface PII : poses dans .env.prod, ces identifiants partiraient dans l'historique
// git sans le moindre avertissement. Le canal des secrets est .env.<env>.local,
// ignore par git et charge par --env-file-if-exists (voir package.json).
//
// Ce test echoue si une variable au nom sensible porte une valeur non vide dans un
// fichier .env suivi par git. Il regarde ce que git suit reellement, pas ce que le
// .gitignore est cense couvrir.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RACINE_APP = path.join(__dirname, '..');

// Noms qui designent un secret. Volontairement large : un faux positif se corrige
// en renommant la variable ou en la deplacant dans un .local, un faux negatif
// laisse un mot de passe dans l'historique.
const MOTIF_SENSIBLE = /(SECRET|PASS|PASSWD|PASSWORD|TOKEN|API_?KEY|CREDENTIAL|PRIVATE|SALT|JWT|SESSION|AUTH_USER)/i;

let echecs = 0;
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) echecs += 1;
}

// Les .env que git suit REELLEMENT sous app/. Si git n'est pas disponible (tarball
// sans .git), on retombe sur les .env presents sur le disque : le test reste utile
// et le dit, plutot que de passer en silence.
function envVersionnes() {
  try {
    const sortie = execFileSync('git', ['ls-files', '-z', '--', '.env*'], {
      cwd: RACINE_APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return sortie.split('\0').filter(Boolean);
  } catch {
    console.log('  (git indisponible : repli sur les .env presents sur le disque)');
    // .local est le canal des secrets, PAS un fichier versionne : l'inspecter ici le
    // signalerait a tort (il porte des secrets par construction, git absent ou pas).
    return fs.readdirSync(RACINE_APP).filter((f) => f.startsWith('.env') && !f.endsWith('.local'));
  }
}

// Variables reellement posees : on ignore les lignes commentees et les valeurs vides.
function variablesPosees(cheminRelatif) {
  const brut = fs.readFileSync(path.join(RACINE_APP, cheminRelatif), 'utf8');
  return brut.split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne && !ligne.startsWith('#'))
    .map((ligne) => {
      const sep = ligne.indexOf('=');
      if (sep === -1) return null;
      return { nom: ligne.slice(0, sep).trim(), valeur: ligne.slice(sep + 1).trim() };
    })
    .filter((v) => v && v.valeur !== '');
}

console.log('Secrets dans les .env versionnes :');

const fichiers = envVersionnes();
check(fichiers.length > 0, `des fichiers .env sont inspectes (${fichiers.length} trouve(s))`);

for (const fichier of fichiers) {
  const suspectes = variablesPosees(fichier)
    .filter((v) => MOTIF_SENSIBLE.test(v.nom))
    .map((v) => v.nom); // le NOM seulement : ne jamais afficher la valeur
  check(
    suspectes.length === 0,
    suspectes.length === 0
      ? `${fichier} : aucune variable sensible posee`
      : `${fichier} : variable(s) sensible(s) posee(s) dans un fichier suivi par git -> ${suspectes.join(', ')} (deplacer dans .env.<env>.local)`,
  );
}

// Le canal des secrets doit rester ignore par git, sinon le conseil ci-dessus est faux.
try {
  execFileSync('git', ['check-ignore', '-q', '.env.prod.local'], { cwd: RACINE_APP, stdio: 'ignore' });
  check(true, '.env.<env>.local est bien ignore par git');
} catch (e) {
  // check-ignore sort 1 quand le chemin n'est PAS ignore ; 128 si hors depot git ;
  // ENOENT (git absent du PATH) laisse status a null/undefined, pas 128.
  const gitIndisponible = e.status === 128 || e.code === 'ENOENT';
  check(gitIndisponible, gitIndisponible
    ? '(git indisponible : couverture de .env.<env>.local non verifiee)'
    : '.env.<env>.local N EST PAS ignore par git : le canal des secrets fuiterait');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
