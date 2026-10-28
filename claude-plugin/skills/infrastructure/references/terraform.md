# Terraform

Read the `resource` and `module` blocks. The address of a resource is `<type>.<name>`, with `module.<name>.` before it for a resource in a module. A resource with `count` or `for_each` is one card. Put the number in `lines`, for example "3 instances".

## Parts

| Resource types (examples)                                                                                                                                                                                                                     | Draw as                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `aws_instance`, `aws_ecs_service`, `aws_apprunner_service`, `azurerm_linux_web_app`, `azurerm_container_app`, `google_cloud_run_v2_service`, `google_compute_instance`                                                                        | `service` card                                                                                   |
| `aws_lambda_function`, `azurerm_linux_function_app`, `google_cloudfunctions2_function`                                                                                                                                                        | `function` card                                                                                  |
| `aws_db_instance`, `aws_rds_cluster`, `aws_dynamodb_table`, `aws_elasticache_replication_group`, `aws_s3_bucket`, `azurerm_postgresql_flexible_server`, `azurerm_cosmosdb_account`, `azurerm_storage_account`, `google_sql_database_instance` | `datastore` card                                                                                 |
| `aws_sqs_queue`, `aws_sns_topic`, `aws_kinesis_stream`, `aws_msk_cluster`, `azurerm_servicebus_topic`, `azurerm_eventhub`, `google_pubsub_topic`                                                                                              | `queue` card                                                                                     |
| `aws_lb`, `aws_apigatewayv2_api`, `aws_cloudfront_distribution`, `azurerm_application_gateway`, `azurerm_api_management`                                                                                                                      | `service` card at the entry of the system                                                        |
| `aws_vpc`, `azurerm_virtual_network`, `google_compute_network`                                                                                                                                                                                | network boundary                                                                                 |
| `aws_subnet`, `azurerm_subnet`, `google_compute_subnetwork`                                                                                                                                                                                   | subnet boundary. An AWS subnet with `map_public_ip_on_launch = true` is public                   |
| `aws_eks_cluster`, `azurerm_kubernetes_cluster`, `google_container_cluster`                                                                                                                                                                   | cluster boundary. Draw the workloads in it from the Kubernetes files, if the repository has them |
| `azurerm_resource_group`                                                                                                                                                                                                                      | resource group boundary                                                                          |

Use the facts of a resource for `lines`: `engine` and `engine_version`, `runtime`, `instance_class`, `node_type`, the image of a task definition. Put the region of the provider in `detail` of the account or the network boundary. Draw a region boundary only when the code uses more than one region.

Leave out IAM roles and policies, security group rules, DNS records, certificates, log groups, alarms, parameters and secrets. Draw a security group as a boundary only when the user asks.

## Connections

| In the code                                                                                                   | Edge                                                         |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `aws_lambda_event_source_mapping`: `event_source_arn` and `function_name`                                     | from the queue or stream to the function, label "consume"    |
| `aws_sns_topic_subscription`, `google_pubsub_subscription` with a push endpoint                               | from the topic to the subscriber, label "deliver"            |
| `aws_cloudwatch_event_target`                                                                                 | from the rule or the bus to the target, label the event name |
| A listener and a target group of `aws_lb`, or `load_balancer` of `aws_ecs_service`                            | from the load balancer to the service, label the protocol    |
| `aws_apigatewayv2_integration`, `aws_api_gateway_integration`                                                 | from the API to the function or the service, label "HTTPS"   |
| An environment variable of a function, a task definition or an app that names another resource or its address | from the part to that resource, label the protocol           |

Label a connection to a database "SQL", to a cache with its protocol, and to a queue "publish" or "consume".
