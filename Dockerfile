FROM node:25-alpine

RUN apk add --no-cache postgresql-client

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run api:start"]
