FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js db.js ./
COPY public ./public

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "server.js"]
