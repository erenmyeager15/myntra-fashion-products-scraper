FROM apify/actor-node:20

COPY --chown=myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm ci --include=dev \
    && echo "Node.js version:" \
    && node --version

COPY --chown=myuser . ./

RUN npm run build \
    && npm prune --omit=dev --no-package-lock

CMD ["node", "dist/main.js"]
