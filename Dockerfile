# ── OPTIPUB — image Docker (Node/Express + frontend statique) ──
FROM node:20-alpine

WORKDIR /app

# Dépendances backend (cache de couche)
COPY app/backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Code de l'application (backend + frontend statique)
COPY app ./

# Le serveur tourne depuis app/backend et sert app/frontend/public
WORKDIR /app/backend

EXPOSE 5000
CMD ["node", "server.js"]
