FROM node:22-slim AS frontend-build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM python:3.12-slim AS production

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api ./api
COPY Modis ./Modis
COPY viirs-20 ./viirs-20
COPY viirs-21 ./viirs-21

COPY --from=frontend-build /app/dist ./frontend-dist

EXPOSE 10000

CMD ["sh", "-c", "uvicorn api.app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
