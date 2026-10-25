# Icons

An icon name is a Lucide icon name or a set icon with a prefix.

| Prefix   | Set                            | Example                                                     |
| -------- | ------------------------------ | ----------------------------------------------------------- |
| none     | Lucide icons for general parts | `database`, `server`, `globe`, `smartphone`, `user`, `mail` |
| `aws:`   | AWS Architecture Icons         | `aws:lambda`, `aws:dynamodb`                                |
| `azure:` | Azure architecture icons       | `azure:cosmos-db`                                           |
| `gcp:`   | Google Cloud product icons     | `gcp:bigquery`                                              |
| `k8s:`   | Kubernetes icons               | `k8s:pod`                                                   |
| `logo:`  | Software logos                 | `logo:postgresql`, `logo:redis`, `logo:stripe`              |

## Rules

- Do not guess a name. Find it with `search_icons`. A name that does not exist leaves the node without an icon, and the result tells you so.
- Use the cloud product icon when the user names a cloud product, such as Lambda, Cloud Run or Cosmos DB.
- Use a logo for a software brand, such as PostgreSQL, Kafka, Redis or Stripe.
- Use a Lucide icon for a general part, such as a user, a browser, a phone, a worker or a cron job.
- Google Cloud uses one icon for each product category, so Pub/Sub and Datastream both show the data analytics icon. That is correct.
- Cloud icons keep the colours of their provider.
