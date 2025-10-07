FROM node:20-alpine
WORKDIR /app

# Copy manifest and config files
COPY package.json package-lock.json* tsconfig.json .npmrc* ./
RUN npm i --production=false

# Copy source code
COPY src ./src

# Do NOT copy .env here — it’s provided at runtime
EXPOSE 3030
CMD ["npm", "run", "dev"]

