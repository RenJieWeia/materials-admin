FROM node:24-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
# better-sqlite3 ships prebuilt binaries and esbuild uses platform-specific
# optional dependencies, so lifecycle scripts are not needed. Skipping them
# avoids requiring python/make/g++ in the Alpine build image.
RUN npm ci --ignore-scripts

FROM node:24-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["npm", "run", "start"]
