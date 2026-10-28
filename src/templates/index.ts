import type { Diagram, NodeDetails, Payload } from '@/model/schema'
import { newId } from '@/model/defaults'
import { boundaryKind, TINTED_TIERS } from '@/model/boundaries'
import { fieldsFromExample } from '@/model/payload'
import { DiagramBuilder, edgeStep, nodeStep } from './builder'

export interface Template {
  id: string
  name: string
  description: string
  build: () => Diagram
}

const STILL = { enabled: false, direction: 'forward', style: 'dots', density: 1.4, speed: 80, size: 1.5 } as const
const EVENTS = { ...STILL, enabled: true, style: 'comets', speed: 120 } as const

function body(example: object): Payload {
  return { fields: fieldsFromExample(example) }
}

function details(owner: string, description: string, links: [label: string, url: string][]): NodeDetails {
  return { owner, description, links: links.map(([label, url]) => ({ id: newId('k'), label, url })) }
}

function orderSystem(): Diagram {
  const b = new DiagramBuilder()
  const vpc = b.group(240, 0, 896, 560, {
    kind: 'aws.vpc',
    label: 'payments',
    detail: '10.0.0.0/16',
    icon: 'aws:vpc-group',
    tint: false,
  })
  const browser = b.card(
    0,
    214,
    { form: 'client', title: 'Browser', icon: 'monitor', lines: ['checkout.shop.dev'] },
    192,
  )
  const gateway = b.card(
    40,
    214,
    {
      title: 'API gateway',
      icon: 'logo:envoyproxy',
      lines: ['Envoy'],
      details: details(
        'Platform team',
        'Ends TLS, checks the session cookie with Auth and routes /orders to the Orders service.',
        [['Envoy docs', 'https://www.envoyproxy.io/docs']],
      ),
    },
    192,
    vpc,
  )
  const auth = b.card(320, 60, { title: 'Auth', icon: 'shield-check', lines: ['OIDC'] }, 192, vpc)
  const orders = b.card(
    320,
    214,
    {
      title: 'Orders',
      icon: 'logo:go',
      lines: ['Go · 3 replicas'],
      details: details(
        'Checkout team',
        'Validates the cart, charges the card through Stripe, writes the order and publishes order.created.',
        [],
      ),
    },
    192,
    vpc,
  )
  const postgres = b.card(
    620,
    120,
    { form: 'datastore', title: 'Postgres', icon: 'logo:postgresql', lines: ['orders'] },
    192,
    vpc,
  )
  const redis = b.card(
    620,
    290,
    { form: 'datastore', title: 'Redis', icon: 'logo:redis', lines: ['sessions'] },
    192,
    vpc,
  )
  const topic = b.card(
    320,
    430,
    { form: 'queue', title: 'order.created', icon: 'logo:apachekafka', lines: ['Kafka'] },
    216,
    vpc,
  )
  const mailer = b.card(620, 430, { title: 'Email worker', icon: 'logo:nodedotjs', lines: ['Node 22'] }, 192, vpc)
  const stripe = b.card(
    1220,
    214,
    {
      form: 'external',
      title: 'Stripe',
      icon: 'logo:stripe',
      lines: ['payments API'],
      details: details('Checkout team', 'Takes the card payment. A 429 means a rate limit, and Orders retries it.', [
        ['Payment Intents API', 'https://docs.stripe.com/api/payment_intents'],
      ]),
    },
    192,
  )

  const edge = { traffic: STILL, markerEnd: 'arrow' } as const
  const orderCreated = () => body({ orderId: 'ord_8f2k', email: 'ada@example.com', total: 49 })
  const toGateway = b.edge(browser, gateway, {
    ...edge,
    label: 'HTTPS',
    request: body({ items: [{ sku: 'LAMP-01', qty: 1 }], paymentMethod: 'pm_card_visa' }),
    response: body({ orderId: 'ord_8f2k', status: 'pending' }),
  })
  b.edge(gateway, auth, { ...edge, label: 'gRPC' })
  const toOrders = b.edge(gateway, orders, { ...edge, label: 'gRPC' })
  const toPostgres = b.edge(orders, postgres, { ...edge, label: 'SQL' })
  b.edge(orders, redis, { ...edge, width: 0.75, protocol: 'data' })
  const toTopic = b.edge(orders, topic, { ...edge, label: 'publish', request: orderCreated() })
  const toMailer = b.edge(topic, mailer, { ...edge, label: 'consume', request: orderCreated() })
  const toStripe = b.edge(orders, stripe, {
    ...edge,
    label: 'HTTPS',
    stroke: 'dashed',
    request: body({ amount: 4900, currency: 'eur', customer: 'cus_Q2x' }),
    response: body({ id: 'pi_3Nf', status: 'succeeded' }),
  })

  b.text(0, -120, { text: 'Order system', size: 'xl' })
  b.text(0, -72, { text: 'How a checkout becomes an order and a confirmation email.', size: 'sm', tone: 'muted' })

  b.flow(
    'Place an order',
    [
      nodeStep(browser, 'The shopper presses Pay.', 1300, 'fit', 1, { event: 'POST /orders' }),
      edgeStep(toGateway, '', 1200, 'follow', 1, { event: 'TLS 1.3', latencyMs: 38 }),
      nodeStep(gateway, 'The gateway checks the session and routes the request.', 1500, 'fit', 1, {
        event: 'route /orders',
        latencyMs: 4,
      }),
      edgeStep(toOrders, '', 1200, 'follow', 1, { event: 'CreateOrder', latencyMs: 2 }),
      nodeStep(orders, 'Orders validates the cart.', 1400, 'fit', 1, { event: 'validate cart', latencyMs: 6 }),
      edgeStep(toStripe, 'Stripe rate-limits the first charge, so Orders retries it.', 1600, 'follow', 1, {
        event: 'POST /v1/payment_intents 429',
        latencyMs: 120,
        level: 'warn',
      }),
      edgeStep(toStripe, 'The retry succeeds.', 1300, 'follow', 1, { event: '200 succeeded', latencyMs: 190 }),
      edgeStep(toPostgres, 'Orders writes the order row in one transaction.', 1300, 'follow', 1, {
        event: 'INSERT orders',
        latencyMs: 4,
      }),
      nodeStep(postgres, 'The row is committed.', 1200, 'fit', 1, { event: 'COMMIT', latencyMs: 3 }),
      edgeStep(toPostgres, '', 1000, 'follow', 1, { event: 'OK', latencyMs: 1 }),
      edgeStep(toTopic, 'Orders publishes order.created.', 1300, 'follow', 1, {
        event: 'produce order.created',
        latencyMs: 3,
      }),
      edgeStep(toMailer, '', 1300, 'follow', 1, { event: 'consume', latencyMs: 15 }),
      nodeStep(mailer, 'The email worker sends the confirmation.', 1800, 'fit', 1, {
        event: 'send confirmation',
        latencyMs: 120,
      }),
    ],
    { token: { label: 'POST /orders', icon: '', shape: 'chip' } },
  )

  return b.build('Order system')
}

function eventPipeline(): Diagram {
  const b = new DiagramBuilder()
  const ingest = b.group(256, 32, 304, 432, { kind: 'k8s.namespace', label: 'ingest', icon: 'k8s:namespace' })
  const process = b.group(640, 32, 304, 432, { kind: 'k8s.namespace', label: 'process', icon: 'k8s:namespace' })
  const web = b.card(0, 110, { form: 'client', title: 'Web app', icon: 'app-window', lines: ['SDK v4'] })
  const mobile = b.card(0, 290, { form: 'client', title: 'Mobile app', icon: 'smartphone', lines: ['iOS, Android'] })
  const collector = b.card(42, 90, { title: 'Collector', icon: 'logo:rust', lines: ['Rust'] }, 216, ingest)
  const stream = b.card(
    42,
    260,
    { form: 'queue', title: 'events.raw', icon: 'logo:apachekafka', lines: ['Kafka, 12 partitions'] },
    216,
    ingest,
  )
  const enrich = b.card(42, 90, { title: 'Enricher', icon: 'logo:apacheflink', lines: ['Flink job'] }, 216, process)
  const fraud = b.card(
    42,
    260,
    { form: 'function', title: 'Fraud scoring', icon: 'logo:python', lines: ['Python'] },
    216,
    process,
  )
  const warehouse = b.card(1040, 110, {
    form: 'datastore',
    title: 'Warehouse',
    icon: 'gcp:bigquery',
    lines: ['BigQuery'],
  })
  const pager = b.card(1040, 290, { form: 'external', title: 'PagerDuty', icon: 'logo:pagerduty', lines: ['on-call'] })

  const edge = { traffic: EVENTS, markerEnd: 'arrow' } as const
  b.edge(web, collector, { ...edge, protocol: 'http' })
  b.edge(mobile, collector, { ...edge, protocol: 'http' })
  b.edge(collector, stream, { ...edge, label: 'produce' })
  b.edge(stream, enrich, { ...edge, label: 'consume' })
  b.edge(stream, fraud, { ...edge, protocol: 'messaging' })
  b.edge(enrich, warehouse, {
    ...edge,
    label: 'every 5 min',
    protocol: 'data',
    traffic: { ...EVENTS, style: 'pulse', speed: 200 },
  })
  b.edge(fraud, pager, { ...edge, stroke: 'dashed', protocol: 'http', traffic: { ...EVENTS, density: 0.6 } })
  return b.build('Event pipeline')
}

function checkoutFlow(): Diagram {
  const b = new DiagramBuilder()
  const start = b.shape(0, 196, 132, 52, { shape: 'pill', label: 'Visit' })
  const product = b.card(200, 176, {
    form: 'client',
    title: 'Product page',
    icon: 'package',
    lines: ['/p/aurora-lamp'],
  })
  const cart = b.card(560, 176, { form: 'client', title: 'Cart', icon: 'shopping-cart', lines: ['/cart'] })
  const decision = b.shape(864, 158, 128, 128, { shape: 'diamond', label: 'Signed in?' })
  const login = b.card(1072, 20, { form: 'client', title: 'Sign in', icon: 'key-round', lines: ['email + passkey'] })
  const payment = b.card(1072, 330, {
    form: 'client',
    title: 'Payment',
    icon: 'credit-card',
    lines: ['card or wallet'],
  })
  const done = b.shape(1392, 352, 132, 52, { shape: 'pill', label: 'Order placed' })

  const edge = { traffic: STILL, markerEnd: 'arrow' } as const
  const e1 = b.edge(start, product, edge)
  const e2 = b.edge(product, cart, { ...edge, label: 'Add to cart' })
  const e3 = b.edge(cart, decision, { ...edge, label: 'Checkout' })
  b.edge(decision, login, { ...edge, label: 'no', path: 'smooth' })
  const e5 = b.edge(decision, payment, { ...edge, label: 'yes', path: 'smooth' })
  b.edge(login, payment, { ...edge, path: 'smooth', stroke: 'dashed' })
  const e7 = b.edge(payment, done, edge)

  b.flow(
    'Returning customer',
    [
      nodeStep(start, 'A returning customer lands from a search ad.', 1300, 'follow', 1.15, {
        event: 'utm_source=search',
      }),
      edgeStep(e1, '', 1300, 'follow', 1.1, { event: 'GET /p/aurora-lamp' }),
      nodeStep(product, 'They open the product page.', 1500, 'follow', 1.1, { event: 'view product' }),
      edgeStep(e2, 'Add to cart', 1300, 'follow', 1.1, { event: 'POST /cart/items' }),
      nodeStep(cart, 'The cart shows two items.', 1400, 'follow', 1.1, { event: 'view cart' }),
      edgeStep(e3, '', 1300, 'follow', 1.1, { event: 'click Checkout' }),
      nodeStep(decision, 'The app checks the session.', 1300, 'follow', 1.1, { event: 'GET /session' }),
      edgeStep(e5, 'The session is valid, so sign-in is skipped.', 1300, 'follow', 1.1, { event: '200 signed in' }),
      nodeStep(payment, 'They pay with a saved wallet.', 1600, 'follow', 1.1, { event: 'pay with wallet' }),
      edgeStep(e7, '', 1300, 'follow', 1.1, { event: 'POST /orders' }),
      nodeStep(done, 'Order placed in 41 seconds.', 2000, 'fit', 1, { event: 'order placed' }),
    ],
    { token: { label: 'Customer', icon: '', shape: 'chip' } },
  )
  return b.build('Checkout flow')
}

function boundary(kind: string, label: string, detail: string, parentId?: string, icon = boundaryKind(kind).icon) {
  return { kind, icon, label, detail, tint: TINTED_TIERS.has(boundaryKind(kind).tier), parentId }
}

function multiCloud(): Diagram {
  const b = new DiagramBuilder()
  const account = b.group(592, 176, 3408, 1552, boundary('aws.account', 'prod-commerce', '123456789012'))
  const region = b.group(32, 48, 3344, 1472, boundary('aws.region', '', 'eu-west-1', account))
  const vpc = b.group(336, 48, 2672, 1392, boundary('aws.vpc', 'commerce', '10.0.0.0/16', region))
  const zoneA = b.group(32, 48, 1280, 1312, boundary('aws.az', '', 'eu-west-1a', vpc))
  const zoneB = b.group(1360, 48, 1280, 1312, boundary('aws.az', '', 'eu-west-1b', vpc))
  b.group(16, 48, 1248, 160, boundary('aws.subnet.public', '', '10.0.0.0/24', zoneA))
  b.group(16, 48, 1248, 160, boundary('aws.subnet.public', '', '10.0.1.0/24', zoneB))
  b.group(16, 240, 1248, 816, boundary('aws.subnet.private', '', '10.0.10.0/24', zoneA))
  b.group(16, 240, 1248, 816, boundary('aws.subnet.private', '', '10.0.11.0/24', zoneB))
  const dataA = b.group(224, 1088, 1040, 192, boundary('aws.subnet.private', '', '10.0.20.0/24', zoneA))
  const dataB = b.group(224, 1088, 1040, 192, boundary('aws.subnet.private', '', '10.0.21.0/24', zoneB))
  const cluster = b.group(64, 336, 2544, 752, boundary('k8s.cluster', 'commerce', 'EKS 1.31, 6 nodes', vpc))
  const ordersApp = b.group(32, 208, 752, 336, boundary('general.app', 'Orders', 'Go 1.23, 6 pods', cluster, 'logo:go'))
  const checkoutApp = b.group(
    896,
    48,
    752,
    496,
    boundary('general.app', 'Checkout API', 'Node 22, 6 pods', cluster, 'logo:nodedotjs'),
  )
  const paymentsApp = b.group(
    1760,
    48,
    752,
    496,
    boundary('general.app', 'Payments', 'Java 21, 4 pods', cluster, 'logo:spring'),
  )
  const tenant = b.group(4400, 336, 816, 208, boundary('azure.tenant', 'contoso', 'Entra tenant'))
  const project = b.group(4400, 608, 816, 1392, boundary('gcp.project', 'analytics', 'analytics-prod-4821'))
  const gcpRegion = b.group(32, 48, 752, 1312, boundary('gcp.region', '', 'europe-west1', project))
  const datacenter = b.group(528, 1792, 672, 208, boundary('general.datacenter', 'Frankfurt', 'FRA1'))
  const browser = b.card(
    0,
    256,
    { icon: 'logo:react', form: 'client', title: 'Browser', lines: ['shop.example.com', 'React 19 SPA'] },
    208,
  )
  const mobile = b.card(
    0,
    544,
    { icon: 'smartphone', form: 'client', title: 'Mobile app', lines: ['iOS and Android', 'React Native'] },
    208,
  )
  const cdn = b.card(
    288,
    400,
    {
      icon: 'logo:cloudflare',
      form: 'external',
      title: 'Cloudflare',
      lines: ['CDN and WAF', 'bot management', 'TLS 1.3 at the edge'],
    },
    208,
  )
  const alb = b.card(
    1152,
    128,
    {
      icon: 'aws:alb',
      title: 'Load balancer',
      lines: ['ALB in zones a and b', 'HTTPS :443, ACM cert', 'OIDC sign-in with Entra'],
    },
    368,
    vpc,
  )
  const guard = b.card(
    32,
    48,
    { icon: 'shield-check', title: 'Session guard', lines: ['preHandler hook', 'ALB OIDC token', 'ES256 key cache'] },
    176,
    checkoutApp,
  )
  const router = b.card(
    288,
    48,
    {
      icon: 'logo:fastify',
      title: 'HTTP router',
      badge: ':8443',
      lines: ['POST /checkout', 'Fastify 5', 'zod body schema'],
    },
    176,
    checkoutApp,
  )
  const limiter = b.card(
    544,
    48,
    { icon: 'gauge', title: 'Rate limiter', lines: ['onRequest hook', '{20} req/s per user', 'token bucket'] },
    176,
    checkoutApp,
  )
  const ordersClient = b.card(
    32,
    208,
    { icon: 'plug', title: 'Orders client', lines: ['gRPC stub', 'deadline {500} ms', 'retry 2 times'] },
    176,
    checkoutApp,
  )
  const saga = b.card(
    288,
    208,
    {
      icon: 'workflow',
      title: 'Checkout saga',
      lines: ['price, pay, order', 'compensates on fail', 'Idempotency-Key'],
    },
    176,
    checkoutApp,
  )
  const paymentsClient = b.card(
    544,
    208,
    { icon: 'plug', title: 'Payments client', lines: ['gRPC stub, mTLS', 'deadline {2} s', 'no retry'] },
    176,
    checkoutApp,
  )
  const catalogClient = b.card(
    288,
    368,
    { icon: 'plug', title: 'Catalog client', lines: ['gRPC stub', 'deadline {300} ms', 'retry 2 times'] },
    176,
    checkoutApp,
  )
  const ledger = b.card(
    288,
    48,
    { icon: 'scroll-text', title: 'Ledger', lines: ['double entry', 'conditional writes', 'append only'] },
    176,
    paymentsApp,
  )
  const paymentsGrpc = b.card(
    32,
    208,
    { icon: 'server', title: 'gRPC server', badge: ':9090', lines: ['Authorize, Refund', 'grpc-java 1.68', 'mTLS'] },
    176,
    paymentsApp,
  )
  const authorize = b.card(
    288,
    208,
    { icon: 'credit-card', title: 'Authorize service', lines: ['state machine', 'PCI DSS scope', 'p99 {180} ms'] },
    176,
    paymentsApp,
  )
  const risk = b.card(
    544,
    208,
    { icon: 'scale', title: 'Risk client', lines: ['Vertex AI predict', 'timeout {150} ms', 'block at score {0.8}'] },
    176,
    paymentsApp,
  )
  const stripeAdapter = b.card(
    288,
    368,
    { icon: 'logo:stripe', title: 'Stripe adapter', lines: ['PaymentIntents', 'Idempotency-Key', 'via NAT gateway'] },
    176,
    paymentsApp,
  )
  const relay = b.card(
    32,
    48,
    { icon: 'send', title: 'Outbox relay', lines: ['polls every {500} ms', 'SKIP LOCKED batch', 'FIFO by order id'] },
    176,
    ordersApp,
  )
  const orderService = b.card(
    288,
    48,
    { icon: 'package', title: 'Order service', lines: ['validates the cart', 'assigns order no.', 'sets status PAID'] },
    176,
    ordersApp,
  )
  const ordersGrpc = b.card(
    544,
    48,
    { icon: 'server', title: 'gRPC server', badge: ':9090', lines: ['CreateOrder', 'GetOrder', 'grpc-go 1.67'] },
    176,
    ordersApp,
  )
  const repository = b.card(
    544,
    208,
    {
      icon: 'logo:postgresql',
      title: 'Order repository',
      lines: ['pgx v5', 'orders and outbox', 'in one transaction'],
      meter: 0.45,
      meterText: 'pool 18/40',
    },
    176,
    ordersApp,
  )
  const catalog = b.card(
    1184,
    608,
    {
      icon: 'logo:go',
      title: 'Catalog',
      lines: ['Go 1.23, 4 pods', 'prices and stock', 'gRPC :9090'],
      meter: 0.94,
      meterText: '94% cache hits',
    },
    176,
    cluster,
  )
  const writer = b.card(
    400,
    48,
    {
      icon: 'aws:aurora-postgresql',
      form: 'datastore',
      title: 'Aurora writer',
      lines: ['PostgreSQL 16', 'db.r7g.2xlarge', '2 TB, encrypted'],
    },
    144,
    dataA,
  )
  const reader = b.card(
    256,
    48,
    {
      icon: 'aws:aurora-postgresql',
      form: 'datastore',
      title: 'Aurora reader',
      lines: ['PostgreSQL 16', 'db.r7g.xlarge', 'lag {12} ms'],
    },
    144,
    dataB,
  )
  const queue = b.card(
    32,
    640,
    {
      icon: 'aws:sqs',
      form: 'queue',
      title: 'order-events',
      lines: ['SQS FIFO queue', 'DLQ after 5 tries', '{38} in flight'],
    },
    208,
    region,
  )
  const invoices = b.card(
    32,
    800,
    {
      icon: 'aws:lambda',
      form: 'function',
      title: 'Invoice sync',
      lines: ['Lambda, Python 3.12', '512 MB, 60 s', 'batch of 10'],
      meter: 0.12,
      meterText: '12 of 100 running',
    },
    208,
    region,
  )
  const dynamo = b.card(
    3104,
    480,
    { icon: 'aws:dynamodb', form: 'datastore', title: 'payments-ledger', lines: ['DynamoDB, on-demand', 'PITR on'] },
    208,
    region,
  )
  const stripe = b.card(
    4096,
    1024,
    {
      icon: 'logo:stripe',
      form: 'external',
      title: 'Stripe',
      lines: ['PaymentIntents API', '3-D Secure 2', 'EU data region'],
    },
    208,
  )
  const entra = b.card(
    64,
    64,
    {
      icon: 'azure:entra-external-id',
      title: 'Entra External ID',
      lines: ['customer sign-in', 'OIDC, passkeys', 'custom domain'],
    },
    208,
    tenant,
  )
  const powerBi = b.card(
    576,
    64,
    { icon: 'azure:power-bi-embedded', title: 'Power BI', lines: ['sales reports', 'DirectQuery', 'refresh on open'] },
    208,
    tenant,
  )
  const fraud = b.card(
    32,
    208,
    {
      icon: 'gcp:vertex-ai',
      title: 'Fraud model',
      lines: ['Vertex AI endpoint', 'XGBoost, {41} features', 'autoscale 2 to 8'],
    },
    208,
    gcpRegion,
  )
  const featureStore = b.card(
    336,
    208,
    {
      icon: 'gcp:vertex-ai-feature-store',
      title: 'Feature store',
      lines: ['Vertex AI, online', 'serving p99 {9} ms', 'synced hourly'],
    },
    208,
    gcpRegion,
  )
  const pipeline = b.card(
    32,
    400,
    {
      icon: 'gcp:vertex-ai-pipelines',
      title: 'Training pipeline',
      lines: ['Vertex AI Pipelines', 'nightly at 02:00', 'AUC gate {0.92}'],
    },
    208,
    gcpRegion,
  )
  const bigquery = b.card(
    336,
    400,
    { icon: 'gcp:bigquery', form: 'datastore', title: 'BigQuery', lines: ['sales dataset', 'partitioned by day'] },
    208,
    gcpRegion,
  )
  const datastream = b.card(
    336,
    1168,
    { icon: 'gcp:datastream', title: 'Datastream', lines: ['CDC from Aurora', 'private connectivity', 'lag {4} s'] },
    208,
    gcpRegion,
  )
  const erp = b.card(
    128,
    64,
    { icon: 'logo:sap', title: 'ERP', lines: ['SAP S/4HANA 2023', 'OData v4 API', 'billing documents'] },
    208,
    datacenter,
  )
  const oracle = b.card(
    432,
    64,
    { icon: 'database', form: 'datastore', title: 'Oracle', lines: ['19c RAC', '2 nodes'] },
    208,
    datacenter,
  )

  const still = { enabled: false, direction: 'forward', style: 'dots', density: 1, speed: 80, size: 1.5 } as const
  const edge = { traffic: still, markerEnd: 'arrow', path: 'smooth' } as const
  const crossing = { ...edge, stroke: 'dashed' } as const
  const local = { ...edge, width: 0.75 } as const

  const browserToCdn = b.edge(browser, cdn, { ...crossing, label: 'HTTPS' }, ['right', 'left'])
  b.edge(mobile, cdn, { ...crossing, label: 'HTTPS' }, ['right', 'left'])
  const cdnToAlb = b.edge(cdn, alb, { ...crossing, label: 'HTTPS' }, ['right', 'left'])
  const albToEntra = b.edge(alb, entra, { ...crossing, label: 'OIDC' }, ['right', 'left'])
  const albToRouter = b.edge(alb, router, { ...edge, label: 'HTTP/2', labelPosition: 0.66 }, ['bottom', 'top'])

  b.edge(router, limiter, local, ['right', 'left'])
  b.edge(router, guard, local, ['left', 'right'])
  const routerToSaga = b.edge(router, saga, { ...local, label: 'handler' }, ['bottom', 'top'])
  const sagaToOrders = b.edge(saga, ordersClient, local, ['left', 'right'])
  const sagaToPayments = b.edge(saga, paymentsClient, local, ['right', 'left'])
  b.edge(saga, catalogClient, local, ['bottom', 'top'])

  b.edge(catalogClient, catalog, { ...edge, label: 'gRPC', labelPosition: 0.7 }, ['bottom', 'top'])
  b.edge(catalog, reader, { ...edge, label: 'SQL' }, ['right', 'top'])
  const ordersCall = b.edge(ordersClient, ordersGrpc, { ...edge, label: 'gRPC' }, ['left', 'right'])
  const paymentsCall = b.edge(paymentsClient, paymentsGrpc, { ...edge, label: 'gRPC' }, ['right', 'left'])

  const grpcToService = b.edge(ordersGrpc, orderService, local, ['left', 'right'])
  const serviceToRepository = b.edge(orderService, repository, { ...local, label: 'save' }, ['bottom', 'left'])
  const repositoryToWriter = b.edge(repository, writer, { ...edge, label: 'SQL', labelPosition: 0.35 }, [
    'bottom',
    'top',
  ])
  const relayToWriter = b.edge(relay, writer, { ...edge, label: 'poll outbox', labelPosition: 0.3 }, ['bottom', 'left'])
  const relayToQueue = b.edge(relay, queue, { ...edge, label: 'publish', labelPosition: 0.79 }, ['left', 'right'])
  const queueToInvoices = b.edge(queue, invoices, { ...edge, label: 'poll' }, ['bottom', 'top'])
  const invoicesToErp = b.edge(invoices, erp, { ...crossing, label: 'OData over VPN' }, ['bottom', 'top'])
  const erpToOracle = b.edge(erp, oracle, { ...edge, label: 'SQL' }, ['right', 'left'])
  b.edge(writer, reader, { ...edge, label: 'replication', width: 0.75, labelPosition: 0.25 }, ['right', 'left'])
  const writerToDatastream = b.edge(writer, datastream, { ...crossing, label: 'CDC' }, ['bottom', 'left'])

  const grpcToAuthorize = b.edge(paymentsGrpc, authorize, local, ['right', 'left'])
  const authorizeToRisk = b.edge(authorize, risk, local, ['right', 'left'])
  const authorizeToStripe = b.edge(authorize, stripeAdapter, { ...local, label: 'charge' }, ['bottom', 'top'])
  b.edge(authorize, ledger, { ...local, label: 'append' }, ['top', 'bottom'])
  b.edge(ledger, dynamo, { ...edge, label: 'PutItem', labelPosition: 0.35 }, ['right', 'left'])
  const riskToFraud = b.edge(risk, fraud, { ...crossing, label: 'Interconnect', labelPosition: 0.72 }, [
    'right',
    'left',
  ])
  const stripeCall = b.edge(stripeAdapter, stripe, { ...crossing, label: 'HTTPS', labelPosition: 0.6 }, [
    'right',
    'left',
  ])

  const fraudToFeatures = b.edge(fraud, featureStore, { ...edge, label: 'read' }, ['right', 'left'])
  b.edge(bigquery, featureStore, { ...edge, label: 'sync' }, ['top', 'bottom'])
  const bigqueryToPipeline = b.edge(bigquery, pipeline, { ...edge, label: 'train' }, ['left', 'right'])
  const pipelineToFraud = b.edge(pipeline, fraud, { ...edge, label: 'deploy' }, ['top', 'bottom'])
  const datastreamToBigquery = b.edge(datastream, bigquery, { ...edge, label: 'load' }, ['top', 'bottom'])
  b.edge(powerBi, bigquery, { ...crossing, label: 'DirectQuery' }, ['bottom', 'right'])

  b.text(0, 0, { text: 'Multi-cloud commerce platform', size: 'xl' })
  b.text(0, 48, {
    text: 'Checkout runs on EKS across two AWS zones. Sign-in runs on Azure, fraud scoring and analytics on Google Cloud, invoicing on premises.',
    size: 'sm',
    tone: 'muted',
  })
  b.text(0, 80, {
    text: 'Thin lines are calls inside one process. Dashed lines cross the internet, a VPN or another cloud.',
    size: 'sm',
    tone: 'muted',
  })

  const fit = 'fit' as const
  const follow = 'follow' as const
  b.flow(
    'Checkout',
    [
      nodeStep(browser, 'The shopper presses Pay.', 1600, fit, 1, { event: 'POST /checkout' }),
      edgeStep(browserToCdn, '', 1300, follow, 0.9, { event: 'TLS 1.3', latencyMs: 12 }),
      edgeStep(cdnToAlb, 'Cloudflare checks the request and sends it to AWS.', 1700, follow, 0.8, {
        event: 'POST /checkout',
        latencyMs: 18,
      }),
      edgeStep(
        albToEntra,
        'The load balancer signs the shopper in with Entra External ID on Azure.',
        2000,
        follow,
        0.7,
        {
          event: 'POST /oauth2/v2.0/token',
          latencyMs: 24,
        },
      ),
      edgeStep(albToEntra, '', 1500, follow, 0.7, { event: '200 id_token', latencyMs: 21 }),
      edgeStep(albToRouter, 'The request enters a Checkout API pod.', 1600, follow, 0.9, {
        event: 'POST /checkout',
        latencyMs: 1,
      }),
      edgeStep(
        routerToSaga,
        'The handler starts the checkout saga. It prices the cart and charges the card first.',
        2000,
        follow,
        1.1,
        {
          event: 'handler',
        },
      ),
      edgeStep(sagaToOrders, 'Then the saga creates the order.', 1500, follow, 1.1, { event: 'CreateOrder' }),
      edgeStep(ordersCall, '', 1400, follow, 1, { event: 'CreateOrder', latencyMs: 2 }),
      edgeStep(grpcToService, '', 1100, follow, 1.1, { event: 'create()' }),
      edgeStep(serviceToRepository, '', 1200, follow, 1.1, { event: 'save()' }),
      edgeStep(repositoryToWriter, 'The order and its outbox row commit in one transaction.', 1800, follow, 1, {
        event: 'INSERT orders, outbox',
        latencyMs: 4,
      }),
      nodeStep(writer, 'The API answers 201 Created. Events and analytics continue in the other flows.', 2400, fit, 1, {
        event: '201 Created',
        latencyMs: 655,
      }),
    ],
    { token: { label: 'order 4821', icon: '', shape: 'chip' } },
  )
  b.flow(
    'Card payment',
    [
      nodeStep(saga, 'The saga asks Payments to authorize the card.', 1600, fit, 1.1, { event: 'Authorize' }),
      edgeStep(sagaToPayments, '', 1200, follow, 1.1, { event: 'Authorize' }),
      edgeStep(paymentsCall, '', 1400, follow, 1, { event: 'Authorize', latencyMs: 2 }),
      edgeStep(grpcToAuthorize, '', 1100, follow, 1.1, { event: 'authorize()' }),
      edgeStep(authorizeToRisk, '', 1100, follow, 1.1, { event: 'score()' }),
      edgeStep(riskToFraud, 'Payments asks the fraud model on Google Cloud for a score.', 2000, follow, 0.8, {
        event: 'POST :predict',
        latencyMs: 38,
      }),
      edgeStep(fraudToFeatures, 'The model reads the shopper features.', 1500, follow, 1, {
        event: 'FetchFeatureValues',
        latencyMs: 9,
      }),
      edgeStep(fraudToFeatures, '', 1100, follow, 1, { event: '41 features', latencyMs: 4 }),
      edgeStep(riskToFraud, 'The score is low, so the payment continues.', 1800, follow, 0.8, {
        event: 'score 0.03',
        latencyMs: 35,
      }),
      edgeStep(authorizeToRisk, '', 1000, follow, 1.1, { event: 'allow' }),
      edgeStep(authorizeToStripe, '', 1100, follow, 1.1, { event: 'charge()' }),
      edgeStep(stripeCall, 'Stripe charges the card.', 1800, follow, 0.9, {
        event: 'POST /v1/payment_intents',
        latencyMs: 310,
      }),
      edgeStep(stripeCall, '', 1500, follow, 0.9, { event: '200 succeeded', latencyMs: 190 }),
      nodeStep(stripeAdapter, 'The charge succeeds, and the ledger records it next.', 2200, fit, 1.1, {
        event: 'captured',
      }),
    ],
    { token: { label: 'card ••42', icon: '', shape: 'chip' } },
  )
  b.flow(
    'Invoice to ERP',
    [
      nodeStep(relay, 'The outbox relay wakes up every 500 ms.', 1300, fit, 1.2, { event: 'tick' }),
      edgeStep(relayToWriter, 'It reads new outbox rows from the Aurora writer.', 1500, follow, 1, {
        event: 'SELECT … SKIP LOCKED',
        latencyMs: 3,
      }),
      edgeStep(relayToWriter, '', 1000, follow, 1, { event: '1 row', latencyMs: 1 }),
      edgeStep(relayToQueue, '', 1100, follow, 1, { event: 'SendMessage', latencyMs: 6 }),
      edgeStep(queueToInvoices, 'The invoice sync function receives the event.', 1300, follow, 1, {
        event: 'ReceiveMessage',
        latencyMs: 20,
      }),
      edgeStep(invoicesToErp, 'It posts the invoice to SAP over the site-to-site VPN.', 1700, follow, 0.7, {
        event: 'POST /A_BillingDocument',
        latencyMs: 640,
      }),
      edgeStep(erpToOracle, '', 1100, follow, 1, { event: 'INSERT VBRK', latencyMs: 12 }),
      nodeStep(oracle, 'Finance sees the invoice in SAP.', 1600, fit, 1, { event: 'committed' }),
    ],
    { token: { label: 'invoice', icon: '', shape: 'chip' } },
  )
  b.flow(
    'Analytics and training',
    [
      nodeStep(writer, 'Aurora writes the new order to its log.', 1300, fit, 1.1, { event: 'WAL insert' }),
      edgeStep(writerToDatastream, 'Datastream copies the change to Google Cloud.', 2200, follow, 0.45, {
        event: 'CDC insert',
        latencyMs: 450,
      }),
      edgeStep(datastreamToBigquery, 'BigQuery merges it into the sales table.', 1500, follow, 0.8, {
        event: 'MERGE sales',
        latencyMs: 900,
      }),
      edgeStep(
        bigqueryToPipeline,
        'Each night a pipeline trains a new fraud model on the sales data.',
        1700,
        follow,
        1,
        {
          event: 'train v42',
        },
      ),
      edgeStep(pipelineToFraud, 'The model goes live when its AUC is above 0.92.', 1600, follow, 1, {
        event: 'deploy v42',
      }),
      nodeStep(fraud, 'The next checkout uses the new model.', 1600, fit, 1, { event: 'serving v42' }),
    ],
    { token: { label: 'sales row', icon: '', shape: 'chip' } },
  )

  return b.build('Multi-cloud commerce platform')
}

function collaborativeEditor(): Diagram {
  const b = new DiagramBuilder()
  const web = b.group(
    0,
    240,
    496,
    688,
    boundary('general.app', 'Web client', 'React 19, Yjs 13', undefined, 'logo:react'),
  )
  const platform = b.group(912, 240, 1440, 1184, boundary('general.system', 'Docs', 'production'))
  const api = b.group(32, 48, 752, 528, boundary('general.app', 'API', 'Go 1.23, 6 pods', platform, 'logo:go'))
  const sync = b.group(
    32,
    624,
    752,
    368,
    boundary('general.app', 'Sync server', 'Rust, yrs 0.21, 8 pods', platform, 'logo:rust'),
  )
  const workers = b.group(1136, 176, 272, 832, boundary('general.app', 'Workers', 'Go 1.23', platform, 'logo:go'))

  const view = b.card(
    32,
    48,
    { icon: 'pen-line', title: 'Editor view', lines: ['ProseMirror view', 'input rules, paste', 'renders blocks'] },
    176,
    web,
  )
  const undo = b.card(
    288,
    48,
    { icon: 'undo-2', title: 'Undo manager', lines: ['Y.UndoManager', 'local changes only', 'groups {500} ms'] },
    176,
    web,
  )
  const doc = b.card(
    32,
    208,
    { icon: 'file-text', title: 'Document model', lines: ['Y.Doc per page', 'CRDT, merges offline', 'state vector'] },
    176,
    web,
  )
  const presence = b.card(
    288,
    208,
    { icon: 'users', title: 'Presence', lines: ['cursors, selections', 'renews every {15} s', 'never stored'] },
    176,
    web,
  )
  const localStore = b.card(
    32,
    368,
    { icon: 'hard-drive', form: 'datastore', title: 'Local store', lines: ['IndexedDB', 'every update first'] },
    176,
    web,
  )
  const provider = b.card(
    288,
    368,
    {
      icon: 'refresh-cw',
      title: 'Sync provider',
      lines: ['WebSocket client', 'sync steps 1 and 2', 'backoff to {30} s'],
    },
    176,
    web,
  )
  const panel = b.card(
    32,
    528,
    { icon: 'message-square', title: 'Comment panel', lines: ['threads on ranges', '@mention picker'] },
    176,
    web,
  )
  const apiClient = b.card(
    288,
    528,
    { icon: 'plug', title: 'API client', lines: ['fetch, JSON', 'refreshes sync JWT', 'retries GET only'] },
    176,
    web,
  )
  const peer = b.card(
    144,
    1024,
    { icon: 'monitor', form: 'client', title: 'Another editor', lines: ['same page', 'Safari 18, macOS'] },
    208,
  )
  const gateway = b.card(
    608,
    592,
    { icon: 'logo:envoyproxy', title: 'Gateway', lines: ['TLS, HTTP/2', 'WebSocket upgrade', 'routes by page id'] },
    208,
  )
  const idp = b.card(
    1216,
    48,
    { icon: 'logo:okta', form: 'external', title: 'Okta', lines: ['OIDC sign-in', 'SCIM user sync'] },
    208,
  )
  const email = b.card(
    2448,
    768,
    { icon: 'logo:resend', form: 'external', title: 'Resend', lines: ['email API', 'mention emails'] },
    208,
  )

  const router = b.card(
    32,
    48,
    { icon: 'route', title: 'HTTP router', badge: ':8443', lines: ['chi v5, JSON', '/v1/pages', '/v1/comments'] },
    176,
    api,
  )
  const auth = b.card(
    288,
    48,
    { icon: 'key-round', title: 'Auth middleware', lines: ['session cookie', 'mints sync JWT', 'JWT lives {15} min'] },
    176,
    api,
  )
  const permissions = b.card(
    544,
    48,
    { icon: 'lock', title: 'Permissions', lines: ['page ACL', 'role per member', 'cached {30} s'] },
    176,
    api,
  )
  const pages = b.card(
    32,
    208,
    { icon: 'files', title: 'Pages service', lines: ['page tree', 'create and move', 'version history'] },
    176,
    api,
  )
  const comments = b.card(
    288,
    208,
    { icon: 'message-square', title: 'Comments service', lines: ['threads on ranges', 'parses @mentions'] },
    176,
    api,
  )
  const search = b.card(
    544,
    208,
    { icon: 'search', title: 'Search query', lines: ['OpenSearch query', 'filters by ACL', 'p95 {80} ms'] },
    176,
    api,
  )
  const data = b.card(
    32,
    368,
    {
      icon: 'database',
      title: 'Data access',
      lines: ['sqlc queries, pgx v5', 'one transaction per request'],
      meter: 0.35,
      meterText: 'pool 14/40',
    },
    688,
    api,
  )

  const socket = b.card(
    32,
    48,
    { icon: 'server', title: 'WebSocket server', lines: ['axum, tokio, :8080', 'one task per socket'] },
    176,
    sync,
  )
  const session = b.card(
    288,
    48,
    { icon: 'shield-check', title: 'Session check', lines: ['verifies the JWT', 'page role in claims'] },
    176,
    sync,
  )
  const limiter = b.card(
    544,
    48,
    { icon: 'gauge', title: 'Rate limiter', lines: ['{60} updates/s', 'per socket', 'drops presence first'] },
    176,
    sync,
  )
  const fanout = b.card(
    32,
    208,
    { icon: 'radio-tower', title: 'Broadcaster', lines: ['fan-out to peers', 'relays presence', 'batches {16} ms'] },
    176,
    sync,
  )
  const merge = b.card(
    288,
    208,
    {
      icon: 'git-merge',
      title: 'Merge engine',
      lines: ['yrs Doc in memory', 'applies updates', 'diffs state vectors'],
    },
    176,
    sync,
  )
  const rooms = b.card(
    544,
    208,
    {
      icon: 'door-open',
      title: 'Room manager',
      lines: ['one room per page', 'loads snapshot + log', 'evicts after {10} min'],
    },
    176,
    sync,
  )

  const opensearch = b.card(
    832,
    224,
    { icon: 'logo:opensearch', form: 'datastore', title: 'OpenSearch', lines: ['index per space', 'titles and text'] },
    208,
    platform,
  )
  const postgres = b.card(
    832,
    384,
    {
      icon: 'logo:postgresql',
      form: 'datastore',
      title: 'Postgres',
      lines: ['PostgreSQL 16', 'pages, ACL, comments', 'outbox table'],
    },
    208,
    platform,
  )
  const pageEvents = b.card(
    832,
    544,
    { icon: 'logo:apachekafka', form: 'queue', title: 'page-events', lines: ['Kafka topic', 'mentions, replies'] },
    208,
    platform,
  )
  const redis = b.card(
    832,
    704,
    { icon: 'logo:redis', form: 'datastore', title: 'Redis', lines: ['room registry', 'page to pod lease'] },
    208,
    platform,
  )
  const storage = b.card(
    832,
    864,
    { icon: 'aws:s3', form: 'datastore', title: 'Object storage', lines: ['S3', 'snapshots, thumbnails'] },
    208,
    platform,
  )
  const updates = b.card(
    832,
    1040,
    { icon: 'logo:apachekafka', form: 'queue', title: 'doc-updates', lines: ['Kafka topic', 'kept {7} days'] },
    208,
    platform,
  )

  const indexer = b.card(
    32,
    48,
    { icon: 'file-search', title: 'Search indexer', lines: ['text from Y.Doc', 'waits {10} s idle', 'bulk index'] },
    208,
    workers,
  )
  const relay = b.card(
    32,
    208,
    { icon: 'send', title: 'Outbox relay', lines: ['polls every {250} ms', 'SKIP LOCKED batch'] },
    208,
    workers,
  )
  const notifier = b.card(
    32,
    368,
    { icon: 'bell', title: 'Notifier', lines: ['in-app if online', 'email if not', 'digest after {15} min'] },
    208,
    workers,
  )
  const compactor = b.card(
    32,
    528,
    {
      icon: 'archive',
      title: 'Snapshot compactor',
      lines: ['merges the update log', 'every {500} updates', 'writes a snapshot'],
    },
    208,
    workers,
  )
  const renderer = b.card(
    32,
    688,
    { icon: 'image', title: 'Renderer', lines: ['headless Chromium', 'page thumbnails', 'PDF export'] },
    208,
    workers,
  )

  const still = { enabled: false, direction: 'forward', style: 'dots', density: 1, speed: 80, size: 1.5 } as const
  const edge = { traffic: still, markerEnd: 'arrow', path: 'smooth' } as const
  const crossing = { ...edge, stroke: 'dashed' } as const
  const local = { ...edge, width: 0.75 } as const

  const viewToDoc = b.edge(view, doc, local, ['bottom', 'top'])
  b.edge(undo, doc, { ...local, label: 'tracks' }, ['left', 'right'])
  b.edge(view, presence, { ...local, label: 'cursor' }, ['right', 'left'])
  const docToLocal = b.edge(doc, localStore, local, ['bottom', 'top'])
  const docToProvider = b.edge(doc, provider, local, ['right', 'left'])
  b.edge(presence, provider, local, ['bottom', 'top'])
  const panelToClient = b.edge(panel, apiClient, local, ['right', 'left'])

  const providerToGateway = b.edge(provider, gateway, { ...crossing, label: 'WSS' }, ['right', 'left'])
  const clientToGateway = b.edge(apiClient, gateway, { ...crossing, label: 'HTTPS' }, ['right', 'left'])
  const peerToGateway = b.edge(peer, gateway, { ...crossing, label: 'WSS' }, ['right', 'bottom'])
  const gatewayToRouter = b.edge(gateway, router, { ...edge, label: 'HTTP/2' }, ['right', 'left'])
  const gatewayToSocket = b.edge(gateway, socket, { ...edge, label: 'WebSocket' }, ['right', 'left'])

  const routerToAuth = b.edge(router, auth, local, ['right', 'left'])
  const authToPermissions = b.edge(auth, permissions, local, ['right', 'left'])
  b.edge(auth, idp, { ...crossing, label: 'OIDC' }, ['top', 'bottom'])
  b.edge(permissions, pages, local, ['bottom', 'top'])
  const permissionsToComments = b.edge(permissions, comments, local, ['bottom', 'top'])
  b.edge(permissions, search, local, ['bottom', 'top'])
  b.edge(pages, data, local, ['bottom', 'top'])
  const commentsToData = b.edge(comments, data, local, ['bottom', 'top'])
  const dataToPostgres = b.edge(data, postgres, { ...edge, label: 'SQL' }, ['right', 'left'])
  b.edge(search, opensearch, { ...edge, label: 'query' }, ['right', 'left'])

  const socketToSession = b.edge(socket, session, local, ['right', 'left'])
  const sessionToLimiter = b.edge(session, limiter, local, ['right', 'left'])
  const limiterToRooms = b.edge(limiter, rooms, local, ['bottom', 'top'])
  const roomsToMerge = b.edge(rooms, merge, local, ['left', 'right'])
  const mergeToFanout = b.edge(merge, fanout, local, ['left', 'right'])
  const fanoutToSocket = b.edge(fanout, socket, local, ['top', 'bottom'])
  const roomsToRedis = b.edge(rooms, redis, { ...edge, label: 'lease' }, ['right', 'left'])
  const roomsToStorage = b.edge(rooms, storage, { ...edge, label: 'snapshot' }, ['right', 'left'])
  const roomsToUpdates = b.edge(rooms, updates, { ...edge, label: 'replay' }, ['right', 'left'])
  const mergeToUpdates = b.edge(merge, updates, { ...edge, label: 'append' }, ['bottom', 'left'])

  b.edge(indexer, opensearch, { ...edge, label: 'bulk index' }, ['left', 'right'])
  b.edge(updates, indexer, { ...edge, label: 'consume' }, ['right', 'left'])
  const relayToPostgres = b.edge(relay, postgres, { ...edge, label: 'poll outbox' }, ['left', 'right'])
  const relayToEvents = b.edge(relay, pageEvents, { ...edge, label: 'publish' }, ['left', 'right'])
  const eventsToNotifier = b.edge(pageEvents, notifier, { ...edge, label: 'consume' }, ['right', 'left'])
  const notifierToEmail = b.edge(notifier, email, { ...crossing, label: 'HTTPS' }, ['right', 'left'])
  b.edge(updates, compactor, { ...edge, label: 'consume' }, ['right', 'left'])
  b.edge(compactor, storage, { ...edge, label: 'write' }, ['left', 'right'])
  b.edge(renderer, storage, { ...edge, label: 'thumbnails' }, ['left', 'right'])

  b.text(0, 0, { text: 'Collaborative editor', size: 'xl' })
  b.text(0, 48, {
    text: 'Inside a real-time document editor: the browser app, the sync server, the API and the workers behind them.',
    size: 'sm',
    tone: 'muted',
  })
  b.text(0, 80, {
    text: 'Thin lines are calls inside one process. Dashed lines cross the internet.',
    size: 'sm',
    tone: 'muted',
  })

  const fit = 'fit' as const
  const follow = 'follow' as const
  const inside = 1.2
  const across = 0.75
  b.flow(
    'Two people edit a page',
    [
      nodeStep(view, 'The writer types a word.', 1300, fit, 1, { event: 'insert "ready"' }),
      edgeStep(viewToDoc, 'The view turns the keystrokes into a CRDT insert.', 1300, follow, inside, {
        event: 'Y.Text.insert',
      }),
      edgeStep(docToLocal, 'The update goes to IndexedDB first.', 1200, follow, inside, {
        event: 'put update',
        latencyMs: 2,
      }),
      edgeStep(docToLocal, '', 600, follow, inside, { event: 'stored' }),
      edgeStep(docToProvider, '', 900, follow, inside, { event: 'update 41 B' }),
      edgeStep(providerToGateway, 'The sync provider sends it over the open WebSocket.', 1400, follow, across, {
        event: 'WS binary frame',
        latencyMs: 18,
      }),
      edgeStep(gatewayToSocket, 'The gateway sends every socket of this page to the same pod.', 1500, follow, across, {
        event: 'route page 8f2c',
        latencyMs: 1,
      }),
      edgeStep(socketToSession, '', 700, follow, inside, { event: 'JWT valid' }),
      edgeStep(sessionToLimiter, '', 700, follow, inside, { event: '12 updates/s' }),
      edgeStep(limiterToRooms, 'The room for this page is already open in memory.', 1300, follow, inside, {
        event: 'room 8f2c',
      }),
      edgeStep(roomsToMerge, 'The merge engine applies the update to the server copy.', 1300, follow, inside, {
        event: 'apply_update',
        latencyMs: 1,
      }),
      edgeStep(mergeToUpdates, 'It appends the update to the doc-updates log.', 1400, follow, 0.9, {
        event: 'produce doc-updates',
        latencyMs: 4,
      }),
      edgeStep(mergeToUpdates, '', 700, follow, 0.9, { event: 'acked', latencyMs: 3 }),
      edgeStep(mergeToFanout, 'The broadcaster sends it to the other editor of the page.', 1300, follow, inside, {
        event: 'fan out to 1 peer',
      }),
      edgeStep(fanoutToSocket, '', 700, follow, inside, { event: 'send' }),
      edgeStep(gatewayToSocket, '', 900, follow, across, { event: 'WS binary frame', latencyMs: 1 }),
      edgeStep(peerToGateway, '', 1300, follow, across, { event: 'WS binary frame', latencyMs: 21 }),
      nodeStep(peer, 'The other editor sees the word 50 ms after the keystroke.', 2000, fit, 1, {
        event: 'render',
        latencyMs: 50,
      }),
    ],
    { token: { label: 'update 41 B', icon: '', shape: 'chip' } },
  )
  b.flow(
    'Mention in a comment',
    [
      nodeStep(panel, 'The writer mentions @sam in a comment.', 1400, fit, 1, { event: 'submit comment' }),
      edgeStep(panelToClient, '', 800, follow, inside, { event: 'createComment()' }),
      edgeStep(clientToGateway, '', 1300, follow, across, { event: 'POST /v1/comments', latencyMs: 19 }),
      edgeStep(
        gatewayToRouter,
        'The gateway sends HTTP requests to the API and WebSocket traffic to the sync server.',
        1800,
        follow,
        across,
        { event: 'POST /v1/comments', latencyMs: 1 },
      ),
      edgeStep(routerToAuth, '', 700, follow, inside, { event: 'session cookie' }),
      edgeStep(
        authToPermissions,
        'Permissions checks that the writer may comment on this page.',
        1500,
        follow,
        inside,
        {
          event: 'role editor',
        },
      ),
      edgeStep(permissionsToComments, '', 800, follow, inside, { event: 'create()' }),
      edgeStep(commentsToData, '', 700, follow, inside, { event: 'insert()' }),
      edgeStep(dataToPostgres, 'The comment and an outbox row commit in one transaction.', 1600, follow, 1, {
        event: 'INSERT comments, outbox',
        latencyMs: 3,
      }),
      nodeStep(postgres, 'The API answers 201 Created. The email goes out in the background.', 1900, fit, 1, {
        event: '201 Created',
        latencyMs: 31,
      }),
      edgeStep(relayToPostgres, 'The outbox relay picks up the new row.', 1400, follow, 1, {
        event: 'SELECT … SKIP LOCKED',
        latencyMs: 2,
      }),
      edgeStep(relayToEvents, '', 1100, follow, 1, { event: 'produce comment.mentioned', latencyMs: 5 }),
      edgeStep(eventsToNotifier, '', 1200, follow, 1, { event: 'consume', latencyMs: 40 }),
      nodeStep(notifier, 'Sam is not online, so the notifier sends an email.', 1600, follow, inside, {
        event: 'sam offline',
      }),
      edgeStep(notifierToEmail, '', 1300, follow, 0.9, { event: 'POST /emails', latencyMs: 180 }),
      nodeStep(email, 'Resend accepts the email for delivery.', 1800, fit, 1, { event: '200 OK' }),
    ],
    { token: { label: 'comment', icon: '', shape: 'chip' } },
  )
  b.flow(
    'Back online',
    [
      nodeStep(localStore, 'The writer edited offline. 37 updates wait in IndexedDB.', 1600, fit, 1, {
        event: '37 pending updates',
      }),
      edgeStep(docToLocal, '', 800, follow, inside, { event: 'load pending' }),
      edgeStep(docToProvider, 'The network is back, and the provider reconnects.', 1400, follow, inside, {
        event: 'reconnect',
      }),
      edgeStep(providerToGateway, '', 1200, follow, across, { event: 'GET /sync, upgrade', latencyMs: 60 }),
      edgeStep(gatewayToSocket, '', 1000, follow, across, { event: '101 Switching Protocols', latencyMs: 2 }),
      edgeStep(socketToSession, '', 700, follow, inside, { event: 'JWT valid' }),
      edgeStep(sessionToLimiter, '', 700, follow, inside, { event: 'allowed' }),
      edgeStep(limiterToRooms, 'Nobody has the page open, so the room manager loads it.', 1400, follow, inside, {
        event: 'open room 8f2c',
      }),
      edgeStep(roomsToRedis, 'A lease in Redis makes this pod the only owner of the room.', 1500, follow, 1, {
        event: 'SET room:8f2c NX EX 30',
        latencyMs: 1,
      }),
      edgeStep(roomsToStorage, 'It loads the latest snapshot from object storage.', 1400, follow, 1, {
        event: 'GET snapshot v311',
        latencyMs: 24,
      }),
      edgeStep(roomsToUpdates, 'Then it replays the updates written after that snapshot.', 1500, follow, 1, {
        event: 'replay 212 updates',
        latencyMs: 9,
      }),
      edgeStep(roomsToMerge, '', 800, follow, inside, { event: 'load doc' }),
      nodeStep(merge, 'Both sides swap state vectors and send only what the other is missing.', 2000, follow, inside, {
        event: 'sync steps 1 and 2',
      }),
      edgeStep(mergeToFanout, '', 700, follow, inside, { event: '9 missing updates' }),
      edgeStep(fanoutToSocket, '', 600, follow, inside, { event: 'send' }),
      edgeStep(gatewayToSocket, '', 900, follow, across, { event: 'WS binary frame', latencyMs: 1 }),
      edgeStep(providerToGateway, '', 1200, follow, across, { event: 'WS binary frame', latencyMs: 30 }),
      edgeStep(docToProvider, 'The CRDT merges both sets of edits without a conflict.', 1500, follow, inside, {
        event: 'apply 9 updates',
      }),
      nodeStep(view, 'The page shows the edits from both sides.', 1800, fit, 1, { event: 'render' }),
    ],
    { token: { label: '37 updates', icon: '', shape: 'chip' } },
  )

  return b.build('Collaborative editor')
}

export const TEMPLATES: Template[] = [
  {
    id: 'multi-cloud',
    name: 'Multi-cloud platform',
    description:
      'AWS runs the shop, Azure signs shoppers in, Google Cloud scores fraud and an on-premises ERP receives invoices. Four flows to play.',
    build: multiCloud,
  },
  {
    id: 'collaborative-editor',
    name: 'Collaborative editor',
    description:
      'The inside of a real-time document editor: a CRDT in the browser, a sync server, an API and workers. Three flows follow an edit, a mention and an offline session.',
    build: collaborativeEditor,
  },
  {
    id: 'order-system',
    name: 'Order system',
    description: 'Follow one checkout from the browser to the confirmation email, with a Stripe retry on the way.',
    build: orderSystem,
  },
  {
    id: 'event-pipeline',
    name: 'Event pipeline',
    description: 'Events stream from two apps through Kafka and Flink into BigQuery, with alerts to PagerDuty.',
    build: eventPipeline,
  },
  {
    id: 'checkout-flow',
    name: 'Checkout flow',
    description: "A shopper's path from a search ad to a placed order, with a sign-in branch.",
    build: checkoutFlow,
  },
]
