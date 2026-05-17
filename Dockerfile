FROM node:20-alpine as service-email

WORKDIR /usr/src/app

RUN apk add --no-cache g++ make py3-pip git nano tzdata
RUN cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime
RUN echo "Asia/Jakarta" > /etc/timezone
RUN date
RUN apk del tzdata

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN npm run migrate

EXPOSE 5950

CMD ["npm", "start"]
