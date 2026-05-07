FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

COPY package*.json ./
RUN npm ci --omit=dev

COPY h5 ./h5
COPY server ./server

EXPOSE 8787

CMD ["node", "server/server.js"]
