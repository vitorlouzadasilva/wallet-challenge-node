FROM node:24.22.2-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run db:generate && npm run dev"]
