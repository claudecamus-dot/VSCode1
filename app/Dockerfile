# Dockerfile de deploiement pour un PaaS a disque persistant (Render, Fly.io).
# Base : node:sqlite (DatabaseSync, src/db.js) exige Node >= 22 (package.json "engines").
FROM node:22-slim

WORKDIR /app

# Dependances de production uniquement (package.json / package-lock.json d'abord
# pour profiter du cache Docker sur les couches suivantes).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Code applicatif.
COPY src ./src
COPY scripts ./scripts

# DB_PATH pointe vers un volume monte par le PaaS (disque persistant Render/Fly.io) :
# aucune donnee n'est ecrite dans l'image ni perdue a chaque redeploy.
ENV DB_PATH=/data/app.db
VOLUME /data

# Aucun secret dans l'image : AUTH_USER/AUTH_PASS (voir src/auth.js) sont injectes
# a l'execution par le PaaS, jamais copies ni ARG ici.

# Utilisateur non-root (l'image node officielle fournit deja "node", uid 1000).
# Le volume /data doit appartenir a cet utilisateur pour que DatabaseSync puisse y ecrire.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

# server.js lit process.env.PORT (src/server.js:1452) avec repli sur 3000.
ENV PORT=3000
EXPOSE 3000

# Pas de HEALTHCHECK : aucune route /health (ou equivalente) n'existe dans src/server.js
# au 2026-09-23 (grep "health" : aucune correspondance).

CMD ["node", "src/server.js"]
