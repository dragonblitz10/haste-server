FROM node:14.8.0-stretch

RUN mkdir -p /app && \
    chown node:node /app

USER node:node 

WORKDIR /app

COPY --chown=node:node . . 

RUN npm ci

CMD ["npm", "start"]
