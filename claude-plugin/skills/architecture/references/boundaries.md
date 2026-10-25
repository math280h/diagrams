# Boundaries

A group with a `boundary` kind draws the outline, the label and the icon of that kind. Get all kinds from `list_boundary_kinds`. Each kind has a tier, and the tier sets the line style.

## Nesting order

Put boundaries inside each other from the outside in:

scope > logical > location > network > zone > subnet > security > runtime

A custom group (`custom`, a group without a kind) can go at any level.

| Tier     | Examples                                                       | Kind ids                                                                           |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| scope    | AWS account, Azure subscription, Google Cloud project          | `aws.account`, `azure.subscription`, `gcp.project`, `general.system`               |
| logical  | Azure resource group, environment, team                        | `azure.rg`, `general.environment`, `general.team`                                  |
| location | Region, data center, on-premises                               | `aws.region`, `azure.region`, `gcp.region`, `general.datacenter`, `general.onprem` |
| network  | VPC, virtual network                                           | `aws.vpc`, `azure.vnet`, `gcp.vpc`                                                 |
| zone     | Availability zone                                              | `aws.az`, `azure.az`, `gcp.zone`                                                   |
| subnet   | Public and private subnets                                     | `aws.subnet.public`, `aws.subnet.private`, `azure.subnet`, `gcp.subnet`            |
| security | Security group, trust boundary                                 | `aws.sg`, `azure.nsg`, `general.trust`                                             |
| runtime  | Kubernetes cluster, node pool, Auto Scaling group, application | `k8s.cluster`, `k8s.nodepool`, `aws.asg`, `general.app`                            |

Kubernetes is the one exception: a namespace (`k8s.namespace`) goes inside its cluster.

## Rules

- Runtime boundaries draw solid. A cluster that spans two availability zones covers the zone lines under it, so put the cluster in the network boundary and around its workloads.
- Put each card in the smallest boundary that holds it. A database in a private subnet goes in that subnet, not in the VPC.
- Use `detail` for a fact that identifies the boundary, such as an account id, a CIDR range or a region code.
- Use the `label` for the name that the user gave, for example "payments". The canvas shows the kind ("AWS VPC") beside it.
- Draw only the boundaries that help the reader. Leave out the organization and the region when the diagram shows one account in one region.
