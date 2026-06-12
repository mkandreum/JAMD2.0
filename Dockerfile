FROM node:20-alpine
WORKDIR /app

COPY server.js index.html package.json ./
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
