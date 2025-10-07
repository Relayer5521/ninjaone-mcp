FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json .npmrc* ./
RUN npm i --production=false
COPY src ./src
COPY .env ./.env
EXPOSE 3030
CMD ["npm", "run", "dev"]
