---
name: infrastructure
description: Draws a Diagrams diagram from infrastructure code (Terraform, docker-compose or Kubernetes files), or checks a diagram against that code and reports the parts that the diagram misses and the parts that the code no longer has. Records the source of each part in its links. Use when the user asks to draw their infrastructure from code, or asks if a diagram is still up to date with the code.
---

# Diagrams from infrastructure code

The app does not read Terraform, Compose or Kubernetes files. You read them with the file tools of your client, and you change the diagram with the Diagrams tools. Each call that changes a diagram is one undo step for the user.

## Sources

Each card and boundary that comes from the code keeps its source, so that a later check finds it again. A source is a link of the node:

- `label`: `Source: ` and the address of the resource in the code:
  - Terraform: the resource address, for example `Source: aws_db_instance.orders` or `Source: module.network.aws_vpc.main`.
  - Compose: the service, for example `Source: services.api`.
  - Kubernetes: the namespace, the kind and the name, for example `Source: shop/Deployment/orders`.
- `url`: the file on the code host, at the line of the resource, for example `https://github.com/acme/shop/blob/main/infra/db.tf#L12`. Get the host address from `git remote get-url origin` and use the default branch, not a commit, so that the link follows the code.

Links take only web and mail addresses. When the repository has no web address, put the source on the last line of `description` instead: `Source: infra/db.tf, aws_db_instance.orders`.

Give each node one source: the resource that runs or stores the part. A Kubernetes Service, an ingress rule or a security group gives a connection or a boundary, not a source of its own.

`links` replaces all links of a node. When you set a source on a node that has links, call `get_diagram` with `detail: "full"` first and send the other links again.

## Read the code

Find the files first: `*.tf`, `compose.yaml` or `docker-compose.yml`, and Kubernetes manifests (files with `apiVersion` and `kind`). For a Helm chart or a Kustomize folder, ask the user to render it (`helm template`, `kubectl kustomize`) or read the rendered files that the repository keeps.

Then make two lists, with the reference for each kind of file:

- **Parts:** each resource that runs or stores data, with its source, its kind (card form or boundary kind) and its facts: engine and version, image and tag, replicas, port, region. Leave out roles, policies, rules, secrets and config, unless the user asks for them.
- **Connections:** each place where one part calls another. The code shows them in references to another resource, in host names and addresses in environment variables (for example `DATABASE_URL`), and in event sources and subscriptions.

References: [Terraform](references/terraform.md), [Compose](references/compose.md), [Kubernetes](references/kubernetes.md).

## Draw a diagram from code

1. Read the code and make the two lists.
2. Follow the architecture skill: call `search_icons` for the products, `list_boundary_kinds` for the boundaries, then add all nodes and edges in one `add_elements` call. Set the source in `links` of each node. Put the facts that people copy, such as an engine version or an image tag, in `lines`.
3. Add the parts that the code calls but does not hold, such as a payment provider or the users, as `external` and `client` cards without a source.
4. Call `layout_diagram`, then `render_image`, and fix what looks wrong.
5. Tell the user what you left out, for example "12 IAM resources and 3 config maps".

## Check a diagram against the code

1. Call `get_diagram` with `detail: "full"`. Collect the source of each node from its links or its description.
2. Read the code and make the two lists.
3. Match the parts to the nodes. A node matches the part that its source names. A node without a source matches a part with the same name and kind; tell the user that it has no source.
4. Report the differences in short lists. Nodes without a source that match nothing, such as people and outside services, are not differences, so leave them out.
   - **Missing from the diagram:** parts in the code that no node shows.
   - **Gone from the code:** nodes whose source names an address that the code no longer has.
   - **Changed:** nodes whose facts are different in the code, such as a new engine version, image tag or replica count.
   - **Connections:** calls in the code without an edge, and edges between two sourced nodes that the code does not show.
5. Ask the user before you change the diagram. Then fix it in a few calls: `add_elements` for missing parts, with their sources; `delete_elements` for the parts that are gone; `update_elements` for changed facts and for sources that are missing.
6. The user often places the nodes by hand. Do not call `layout_diagram` after a check, unless the user asks. New nodes without `x` and `y` get a free place.
