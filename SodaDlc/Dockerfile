FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY fonts ./fonts

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
