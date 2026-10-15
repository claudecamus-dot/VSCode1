// Classement des erreurs du filet terminal (src/erreurs.js), fonctions pures.
// La VRAIE erreur SQLITE_BUSY est produite (second DatabaseSync en BEGIN EXCLUSIVE
// pendant qu'une ecriture a un timeout court) : node:sqlite ne pose pas
// code='SQLITE_BUSY' mais code='ERR_SQLITE_ERROR' + errcode=5 (mesure 2026-10-14).
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { classerErreur, resumeSortiePython, ligneJournal } = require('../src/erreurs');
const { check, terminer } = require('./harnais-robustesse');

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'erreurs-classement-'));
const p = path.join(dossier, 'e.db');
const a = new DatabaseSync(p, { timeout: 50 });
a.exec('PRAGMA journal_mode = WAL; CREATE TABLE t (x TEXT UNIQUE)');
const b = new DatabaseSync(p, { timeout: 50 });

let busy;
b.exec('BEGIN EXCLUSIVE');
try { a.exec("INSERT INTO t VALUES ('a')"); } catch (e) { busy = e; }
b.exec('ROLLBACK');
check(busy && busy.errcode === 5, `preparation : vraie erreur BUSY produite (errcode=${busy && busy.errcode}, code=${busy && busy.code})`);

a.exec("INSERT INTO t VALUES ('secret@example.com')");
let unique;
try { a.prepare('INSERT INTO t VALUES (?)').run('secret@example.com'); } catch (e) { unique = e; }
check(unique && unique.errcode === 2067, `preparation : vraie violation d'unicite (errcode=${unique && unique.errcode})`);

const c503 = classerErreur(busy);
check(c503.statut === 503 && c503.retryAfter > 0, `BUSY -> 503 avec Retry-After (${JSON.stringify(c503)})`);
check(classerErreur(unique).statut === 500, "violation d'unicite -> 500 (pas une indisponibilite)");
check(classerErreur(Object.assign(new Error('x'), { code: 'ERR_SQLITE_ERROR', errcode: 6 })).statut === 503, 'LOCKED (6) -> 503');
const cFull = classerErreur(Object.assign(new Error('x'), { code: 'ERR_SQLITE_ERROR', errcode: 13 }));
check(cFull.statut === 503 && cFull.retryAfter === undefined, `FULL (13) -> 503 SANS Retry-After : reessayer ne sert a rien (${JSON.stringify(cFull)})`);
const cIo = classerErreur(Object.assign(new Error('x'), { code: 'ERR_SQLITE_ERROR', errcode: 10 | (2 << 8) }));
check(cIo.statut === 503 && cIo.retryAfter === undefined, `IOERR etendu -> 503 sans Retry-After (${JSON.stringify(cIo)})`);
check(classerErreur(Object.assign(new Error('x'), { code: 'ERR_SQLITE_ERROR', errcode: 6 })).retryAfter > 0, 'LOCKED (6) garde son Retry-After');
check(classerErreur(Object.assign(new Error('x'), { code: 'AUTRE', errcode: 5 })).statut === 500, 'errcode 5 sans code ERR_SQLITE_ERROR -> 500');
check(classerErreur(Object.assign(new Error('x'), { code: 'LIMIT_FILE_SIZE' })).statut === 413, 'multer LIMIT_FILE_SIZE -> 413');
check(classerErreur(Object.assign(new Error('x'), { expose: true, status: 413 })).statut === 413, 'body-parser 413 relaye');
check(classerErreur(Object.assign(new Error('x'), { expose: true, status: 400 })).statut === 400, 'body-parser 400 relaye');
check(classerErreur(Object.assign(new Error('x'), { expose: true, status: 500 })).statut === 500, '5xx expose non relaye');
check(classerErreur(new Error('boom')).statut === 500 && classerErreur(undefined).statut === 500, 'erreur quelconque / undefined -> 500');
check(!JSON.stringify(classerErreur(new Error('SELECT secret'))).includes('secret'), 'le message brut de l\'erreur ne fuit pas dans la reponse');

const req = { method: 'POST', path: '/api/sessions/abc/repondants', originalUrl: '/api/sessions/abc/repondants?equipe=Zorglub&email=jean@example.com' };
const ligne = ligneJournal(req, unique);
check(ligne.includes('POST') && ligne.includes('/api/sessions/abc/repondants'), `ligne : methode et chemin (${ligne})`);
check(!ligne.includes('Zorglub') && !ligne.includes('?'), 'ligne : pas de query string');
check(!ligne.includes('secret@example.com') && !ligne.includes('UNIQUE constraint'), "ligne : ni e-mail ni message SQL brut");
check(!ligne.includes('\n') && !/\bat \S+ \(/.test(ligne), 'ligne : une seule ligne, sans pile');
check(ligneJournal(undefined, undefined).includes('erreur non geree'), 'ligneJournal tolere req/err absents');

a.close(); b.close();
fs.rmSync(dossier, { recursive: true, force: true });
// Resume de la sortie d'erreur Python : seul le TYPE de l'exception, jamais le texte (qui peut citer le payload).
check(resumeSortiePython('Traceback (most recent call last):\n  File "x.py", line 3\nKeyError: \'Equipe Alpha de jean@example.com\'') === 'KeyError', 'resume Python : type de l\'exception seulement');
check(!resumeSortiePython('ValueError: jean@example.com').includes('jean'), 'resume Python : aucune valeur du message');
check(resumeSortiePython('') === 'sortie-non-identifiee' && resumeSortiePython(null) === 'sortie-non-identifiee' && resumeSortiePython('???') === 'sortie-non-identifiee', 'resume Python : sortie vide ou illisible -> libelle neutre');
terminer();
console.log('Classement des erreurs OK');
