// Arret propre du serveur (SIGTERM/SIGINT) et filets de dernier recours
// (uncaughtException / unhandledRejection) : TOUS passent par le meme arret.
//
// Sequence : le serveur cesse d'accepter (les requetes en cours finissent), puis
// checkpoint WAL (TRUNCATE) et fermeture de la base, puis sortie. Un delai maximal
// force la sortie en code 1 si une connexion ne se ferme jamais ; son minuteur est
// unref() pour ne pas retenir le processus quand tout s'est bien ferme.
//
// `processus`, `serveur`, `db` sont injectes : la fonction se teste sans signal
// reel (sous Windows, kill() est un arret dur qui ne declenche aucun handler).

const DELAI_ARRET_DEFAUT_MS = 10000;

// Delai depuis l'environnement (ARRET_DELAI_MS) ; valeur invalide -> defaut.
function delaiDepuisEnv(env = process.env) {
  const n = Number(env.ARRET_DELAI_MS);
  return Number.isInteger(n) && n > 0 ? n : DELAI_ARRET_DEFAUT_MS;
}

function installerArret({ serveur, db, delaiMs = DELAI_ARRET_DEFAUT_MS, journal = console.error, processus = process }) {
  let enCours = false;
  let termine = false;
  let codeFinal = 0;

  function arreter(code, raison, parSignal = false) {
    if (code !== 0) codeFinal = code; // un filet declenche PENDANT l'arret ne doit pas finir en 0
    if (enCours) {
      // Second signal (Ctrl+C insistant, ou SIGKILL imminent de Docker) : on n'attend plus.
      if (parSignal && !termine) {
        journal(`[arret] ${raison} recu pendant l'arret : sortie forcee`);
        processus.exit(1);
      }
      return;
    }
    enCours = true;
    codeFinal = code;
    journal(`[arret] ${raison} : arret du serveur`);
    const minuteur = setTimeout(() => {
      journal(`[arret] delai de ${delaiMs} ms depasse : sortie forcee`);
      processus.exit(1);
    }, delaiMs);
    if (typeof minuteur.unref === 'function') minuteur.unref();

    const fermerBase = () => {
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch (err) {
        journal(`[arret] checkpoint WAL impossible : ${err && err.name}`);
      }
      try {
        db.close();
      } catch (err) {
        journal(`[arret] fermeture de la base impossible : ${err && err.name}`);
      }
      termine = true;
      processus.exit(codeFinal);
    };

    try {
      serveur.close(() => fermerBase());
      // Les connexions keep-alive INACTIVES retiendraient close() jusqu'au delai.
      if (typeof serveur.closeIdleConnections === 'function') serveur.closeIdleConnections();
    } catch (err) {
      journal(`[arret] fermeture du serveur impossible : ${err && err.name}`);
      fermerBase();
    }
  }

  processus.on('SIGTERM', () => arreter(0, 'SIGTERM', true));
  processus.on('SIGINT', () => arreter(0, 'SIGINT', true));
  // Journal SANS donnee nominative : nom et code seulement (ni message, ni pile).
  processus.on('uncaughtException', (err) => {
    journal(`[uncaughtException] ${err && err.name} code=${err && err.code}`);
    arreter(1, 'uncaughtException');
  });
  processus.on('unhandledRejection', (raisonRejet) => {
    journal(`[unhandledRejection] ${raisonRejet && raisonRejet.name} code=${raisonRejet && raisonRejet.code}`);
    arreter(1, 'unhandledRejection');
  });

  return { arreter };
}

module.exports = { installerArret, delaiDepuisEnv, DELAI_ARRET_DEFAUT_MS };
