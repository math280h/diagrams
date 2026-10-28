# Compose

A Compose file (`compose.yaml` or `docker-compose.yml`) lists `services`. The source of a service is `services.<name>`.

## Parts

Each service is a card. Its image gives its kind:

| Image (examples)                                                                     | Draw as                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `postgres`, `mysql`, `mariadb`, `mongo`, `redis`, `valkey`, `minio`, `elasticsearch` | `datastore` card                            |
| `rabbitmq`, `kafka`, `redpanda`, `nats`                                              | `queue` card                                |
| `nginx`, `traefik`, `caddy`, `envoy`                                                 | `service` card at the entry of the system   |
| A service with `build` and no image, or an image of the project                      | `service` card with the name of the service |

- Call `search_icons` with the image name, for example "postgres", to get the product icon.
- Put the image and tag in `lines`, for example `postgres:16`.
- Leave out services that run once, such as a migration or a seed job, and services in a profile for tools or debugging, unless the user asks for them.
- Compose puts all services in one network. Draw a boundary for a named network only when the services are in more than one network.

## Connections

- An environment variable with the name of another service as a host shows a call, for example `DATABASE_URL: postgres://db:5432/shop` from the service to `db`. Label it with the protocol: "SQL" for a database, "HTTP" or "gRPC" for a service, "publish" or "consume" for a queue.
- `depends_on` gives the start order. It is not always a call, so draw an edge from it only when another fact agrees.
- A service that publishes `ports` to the host is an entry. Add a `client` card, for example "Browser", with an edge to it.
