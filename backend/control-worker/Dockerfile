FROM golang:1.22-alpine AS builder
WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /control-worker ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app

COPY --from=builder /control-worker /app/control-worker

EXPOSE 8081
CMD ["/app/control-worker"]
