# syntax=docker/dockerfile:1

FROM node:24-alpine AS dependencies

WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/accounts/package.json ./packages/accounts/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/game-engine/package.json ./packages/game-engine/package.json
RUN npm ci --include=dev

FROM node:24-alpine AS production-dependencies

WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/accounts/package.json ./packages/accounts/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/game-engine/package.json ./packages/game-engine/package.json
RUN npm ci --omit=dev

# The development target keeps esbuild available and runs the project's file
# watchers. Compose bind-mounts standalone/ over this copy so source edits are
# rebuilt and connected browsers reload without rebuilding the image.
FROM node:24-alpine AS development

ENV NODE_ENV=development \
    PORT=3001 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=768

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
COPY --from=dependencies --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node packages ./packages
COPY --chown=node:node infra ./infra
COPY --chown=node:node standalone ./standalone

USER node

EXPOSE 3001
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then((response)=>{if(!response.ok)throw new Error(String(response.status))}).catch(()=>process.exit(1))"]

CMD ["npm", "run", "dev"]

# Build browser assets from source in a throwaway stage. This guarantees the
# production image cannot contain a stale checked-in JavaScript bundle.
FROM dependencies AS browser-build

COPY standalone/build-client.mjs ./standalone/build-client.mjs
COPY standalone/public ./standalone/public
RUN node standalone/build-client.mjs

FROM node:24-alpine AS production

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=768

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
COPY --from=production-dependencies --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node standalone/server.js ./standalone/server.js
COPY --chown=node:node standalone/server ./standalone/server
COPY --chown=node:node packages ./packages
COPY --chown=node:node infra/postgres ./infra/postgres
COPY --from=browser-build --chown=node:node /build/standalone/public ./standalone/public

USER node

EXPOSE 3001
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then((response)=>{if(!response.ok)throw new Error(String(response.status))}).catch(()=>process.exit(1))"]

CMD ["node", "standalone/server.js"]
