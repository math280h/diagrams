# Kubernetes

The source of an object is its namespace, its kind and its name, for example `shop/Deployment/orders`. An object without a namespace is in `default`.

## Parts

| Kind                                                                                                   | Draw as                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Namespace                                                                                              | `k8s.namespace` boundary in a `k8s.cluster` boundary                                                       |
| Deployment, DaemonSet                                                                                  | `service` card. Put the replicas and the image tag in `lines`                                              |
| StatefulSet                                                                                            | `datastore` card for a database or a cache, `queue` card for a broker, else `service` card                 |
| CronJob, Job                                                                                           | `function` card. Put the schedule in `lines`                                                               |
| Service                                                                                                | no card. It gives the host name that other parts call, such as `orders` or `orders.shop.svc.cluster.local` |
| Ingress, Gateway, HTTPRoute                                                                            | no card, unless the user wants the ingress controller. They give the connections from outside              |
| ConfigMap, Secret, ServiceAccount, Role, NetworkPolicy, PersistentVolumeClaim, HorizontalPodAutoscaler | leave out                                                                                                  |

A Service finds its pods with its `selector`. The workload whose pod labels match the selector is the card behind the Service.

## Connections

- An Ingress or an HTTPRoute sends a host and a path to a Service. Draw an edge from a `client` card, or from the ingress controller card, to the workload behind that Service. Label it "HTTPS" or "HTTP".
- An environment variable, a config map value or an argument with the host name of a Service shows a call, for example `PAYMENTS_URL: http://payments:8080`. Draw an edge from the workload to the workload behind that Service, and label it with the protocol.
- A queue or a topic that a workload reads, for example in a KEDA ScaledObject or in its settings, gives an edge from the queue to the workload, label "consume".
