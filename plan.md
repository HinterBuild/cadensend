AI Newsletter Series Platform — Production Product and Engineering Plan

Document status: Implementation blueprintPrepared: 10 August 2026Delivery order: MVP first, then numbered product updates

1. Product definition

Build a platform where a user provides:

A topic or learning path

A target outcome

Audience or learner level

Duration in days, weeks or months

Delivery cadence and timezone

Content, source and visual preferences

The platform creates a coherent multi-email plan, lets the user edit it, generates each issue, adds grounded citations and visuals, and sends it on the scheduled date.

The first product promise is deliberately narrow:

Turn one learning goal into a structured email series and deliver every approved issue reliably and only once.

This is not initially a general email-marketing suite, CRM, autonomous research system or bulk-email provider.

2. Hard architectural decisions

Go is the control plane. It owns users, workspaces, series, issue state, schedules, approval, delivery, usage and audit records.

Python is the AI plane. FastAPI and LangGraph own planning, research, retrieval, writing, critique and visual specifications.

PostgreSQL is the business source of truth. LangGraph checkpoints and Qdrant are not authoritative business state.

Qdrant is the open-source vector database. It stores rebuildable vector indexes and searchable payloads for RAG.

Object storage is the source-file store. Raw uploads, normalized documents and visual artifacts live in S3-compatible storage.

The complete plan is generated upfront; issues are generated just in time. Default lead time is 24–48 hours before sending.

The LLM never generates executable email HTML. It returns validated content blocks rendered by deterministic templates.

Scheduling and sending are deterministic jobs, not agents. LangGraph only runs inside bounded generation jobs.

Every external side effect is idempotent. Worker restarts and provider retries cannot create duplicate sends.

Start with PostgreSQL-backed jobs. Add a broker or workflow platform only when measured scale or workflow complexity justifies it.

3. Product scope by release

Release

Outcome

Primary user

MVP

Create, edit, generate and reliably send a personal learning series

Individual learner/creator

Update 1

High-quality grounded content and mature RAG

Serious creators and technical educators

Update 2

Opt-in audiences and creator publishing

Newsletter creators

Update 3

Adaptive and segmented learning

Learning businesses and communities

Update 4

Teams, governance and enterprise controls

Companies and training teams

Update 5

Platform APIs, integrations and measured scale

Partners and larger customers

No update starts until the previous release's acceptance criteria and operational gates are met.

4. MVP scope

4.1 Included

Authentication and one workspace per user

Create Series wizard

AI-generated curriculum/series plan

Plan timeline and list editor

One manual approval workflow

Just-in-time issue generation

User-provided URL and document sources

Qdrant-backed dense retrieval with mandatory tenant filters

Claim-linked citations

Structured email editor

Mermaid or D2 diagram generation

Responsive email and plain-text rendering

Test email

Durable schedule creation

One email-provider adapter

Pause, resume and retry

Delivery events and failure visibility

Basic model/token/usage tracking

Traces, metrics, logs and operational alerts

Export and deletion workflow

4.2 Explicitly excluded

Arbitrary subscriber-list uploads

Marketing automation and CRM features

Per-recipient LLM generation

A/B testing

Team collaboration

Billing automation

Multiple email providers in production

Multi-region deployment

Kubernetes unless the deployment environment already requires it

Hybrid dense/sparse retrieval and reranking; these belong to Update 1 after a baseline exists

Unrestricted autonomous browsing

4.3 MVP acceptance criteria

A user can:

Sign in and create a series brief.

Generate a valid, coherent plan asynchronously.

Edit, reorder and lock plan items.

Attach an approved URL or supported document.

See ingestion status and source errors.

Generate one grounded issue with citations.

Generate and render one valid technical diagram.

Regenerate one selected section without replacing the entire issue.

Preview HTML and plain-text email.

Send a test email.

Approve and activate a series.

Receive exactly one issue at the configured time.

Pause and resume future generation/delivery.

See useful generation and delivery failures.

Export or delete their data.

The system can:

Recover scheduled work after a worker restart.

Prevent duplicate delivery under concurrent workers.

Reject cross-workspace reads and retrieval.

Rebuild Qdrant from PostgreSQL and object storage.

Trace a request across API, worker, AI graph, retrieval, rendering and delivery.

Measure generation quality, latency and cost.

5. User experience

5.1 Create Series wizard

Collect:

Topic and scope

Topic

Included and excluded concepts

Optional source URLs/files

Outcome

Goal

Audience level

Prerequisites

Timeline

Start date

Duration

Cadence

Send days/time

IANA timezone

Content

Language

Target length

Tone

Examples/exercises

Citation requirement

Visuals

Diagram

Chart

Infographic

Brand colors

Delivery

Verified recipient

Manual approval

5.2 Plan Studio

Timeline and module views

Reorder issues

Edit title, objective and outline

Move dates

Insert/delete issues

Lock approved issues

Regenerate one module

Validate prerequisites and schedule conflicts

Display estimated generation usage

5.3 Source Library

Upload file or submit URL

Display source owner, type, freshness and status

Show parsing/chunking/indexing failures

Preview normalized text

Reindex after parser or embedding-model upgrades

Remove a source and verify vector deletion

Restrict a source to one series or make it workspace-wide

5.4 Issue Studio

Subject and preheader

Structured content blocks

Source/citation side panel

Retrieved-context inspection for debugging

Diagram preview

Desktop/mobile/plain-text preview

Section-level rewrite/regeneration

Version history

Approval and test-send actions

5.5 Run Center

Show:

Planned

Ingesting sources

Generating

Awaiting review

Scheduled

Sending

Sent

Failed

Paused

Every failure includes a stable error code, human-readable explanation, attempt count and safe retry action.

6. Production architecture

flowchart TD
    WEB["Next.js frontend"] --> API["Go control API"]
    API --> PG[("PostgreSQL<br/>business state + outbox")]
    API --> OBJ["S3-compatible storage<br/>sources + assets"]
    PG --> WORK["Go scheduler/delivery workers"]
    WORK --> AI["Python AI workers<br/>FastAPI + LangGraph"]
    AI --> QD[("Qdrant<br/>rebuildable RAG index")]
    AI --> OBJ
    WORK --> ESP["Email provider"]
    ESP --> API

6.1 Service boundaries

Component

Owns

Must not own

Frontend

Forms, editors, previews, monitoring

Schedule truth or direct provider credentials

Go API

Auth, tenancy, business state, contracts

Long model calls or editorial reasoning

Go workers

Job claiming, scheduling, rendering, sending, retries

Topic planning and content judgment

Python AI workers

Parsing, embeddings, retrieval, LangGraph generation

Users, subscriptions, schedules or billing state

PostgreSQL

Canonical metadata, state, outbox, audit

Large original files and vector indexes

Object storage

Original and normalized files, generated assets

Authoritative status transitions

Qdrant

Dense/sparse vectors and retrieval payloads

Original documents or canonical source metadata

Email provider

Message submission and provider events

Final internal delivery state

6.2 Deployment units for MVP

web

control-api

control-worker

ai-api

ai-worker

PostgreSQL

Qdrant

S3-compatible storage

ai-api and ai-worker share one codebase but run as different processes. Do not create separate microservices for parsing, chunking, embedding and retrieval in the MVP.

7. Open-source vector database decision: Qdrant

Qdrant is selected because it is Apache-2.0 licensed, self-hostable and supports vectors with JSON payloads, metadata filtering and dense/sparse/hybrid retrieval. Its official documentation recommends payload-based partitioning instead of creating one collection per user.

7.1 Why a separate vector database is acceptable

A separate service adds deployment, security, backup and monitoring work. For a tiny prototype, PostgreSQL with a vector extension would be simpler. Qdrant is justified here only because RAG is a first-class platform capability expected to grow into hybrid retrieval, reranking, multi-vector content and larger corpora.

7.2 Source-of-truth rule

Qdrant contains derived data. The canonical chain is:

PostgreSQL source metadata
        +
Object storage original/normalized content
        -> parsing/chunking/embedding
        -> Qdrant index

If Qdrant is lost, the product must reindex. Losing Qdrant must not lose user source files, consent records, plans, issues or audit history.

7.3 Collection strategy

MVP:

One collection per embedding schema/model version, not per workspace or source.

Example: newsletter_chunks_dense_v1.

Partition by workspace_id and optionally series_id using mandatory payload filters.

Create payload indexes before large ingestion.

Use cosine similarity when required by the selected embedding model.

Do not create thousands of collections. Qdrant documents collection-per-user/document as an antipattern because each collection adds resource overhead.

7.4 Qdrant point model

{
  "id": "deterministic-uuid",
  "vector": [0.012, -0.184, 0.091],
  "payload": {
    "workspace_id": "ws_01J...",
    "series_id": "ser_01J...",
    "source_id": "src_01J...",
    "source_version_id": "sv_01J...",
    "chunk_id": "chk_01J...",
    "chunk_index": 12,
    "title": "Kubernetes Services",
    "section_path": ["Networking", "Services"],
    "language": "en",
    "source_type": "pdf",
    "published_at": "2026-06-01T00:00:00Z",
    "content_hash": "sha256:...",
    "embedding_version": "dense-v1",
    "visibility": "series",
    "active": true
  }
}

The point ID is deterministically derived from:

source_version_id + chunker_version + chunk_index + embedding_version

This makes reprocessing idempotent.

7.5 Mandatory filters

Every query must include:

workspace_id == authenticated workspace
AND active == true
AND visibility rules allow the requesting series

Optional filters:

series_id

source_id

language

source_type

freshness range

user-selected source allowlist

Do not trust the LangGraph node to remember tenant filtering. A retrieval repository/service must inject mandatory filters and reject unscoped queries.

7.6 Security configuration

Self-hosted Qdrant is not secure by default. Production requires:

Private network binding

API-key authentication

TLS or encrypted service-mesh traffic

Separate read-only/query and ingestion credentials where supported

No public dashboard exposure

Request timeouts and bounded result sizes

Audit/operation logging

Secret rotation

8. RAG ingestion pipeline

flowchart TD
    S["Source submitted"] --> F["Fetch or upload"]
    F --> P["Parse and normalize"]
    P --> C["Structure-aware chunking"]
    C --> E["Generate embeddings"]
    E --> U["Upsert Qdrant points"]
    U --> V["Verify count/checksums"]
    V --> R["Source ready"]

8.1 Supported MVP inputs

PDF with extractable text

Markdown

Plain text

HTML webpage from an approved URL

OCR, video/audio transcription, spreadsheets and complex scanned PDFs move to Update 1 unless required by real beta users.

8.2 Ingestion states

pending -> fetching -> parsing -> chunking -> embedding -> indexing -> ready
          \-> failed  \-> failed  \-> failed    \-> failed    \-> failed

8.3 Parsing rules

Preserve document title and heading hierarchy.

Remove navigation, repeated headers/footers and boilerplate.

Keep code blocks and tables intact when possible.

Record page/section anchors for citations.

Normalize whitespace without changing meaning.

Reject encrypted, oversized or unsupported files.

Treat all source content as untrusted input.

8.4 Chunking baseline

Start with structure-aware chunks:

Target: 350–500 tokens

Overlap: 50–80 tokens only across continuous prose

Do not split headings from their first paragraph.

Avoid splitting code blocks, lists and tables mid-structure.

Store surrounding heading path as metadata.

Create a stable chunk checksum.

These are starting values, not permanent truth. Tune against a retrieval evaluation set.

8.5 Embedding policy

Select one open embedding model for the MVP.

Pin the exact model revision and tokenizer.

Record model, dimensionality and normalization behavior.

Do not mix embeddings from incompatible models in one named-vector field.

Reindex through a new collection/version rather than mutating vectors invisibly.

Keep embedding execution behind an interface so local and hosted providers can be tested.

8.6 Idempotency and concurrency

Source content hash prevents duplicate ingestion.

A unique database constraint covers (source_version_id, pipeline_version).

One source version can have only one active ingestion run per pipeline version.

Qdrant upsert uses deterministic point IDs.

Verification compares expected and indexed chunk counts.

A partially failed run is safe to resume.

8.7 Deletion

Deletion is a workflow, not a single API call:

Mark source inactive in PostgreSQL.

Prevent it from retrieval immediately.

Delete Qdrant points by source_version_id filter.

Verify zero active points remain.

Apply object-retention policy.

Record an audit event.

If Qdrant deletion fails, retry from an outbox job. The PostgreSQL inactive flag still blocks retrieval.

9. RAG retrieval pipeline

9.1 MVP retrieval

Issue objective + outline + user instruction
-> create retrieval query
-> apply workspace/series/source filters
-> dense search top 20
-> deduplicate and diversify by source
-> select 6–10 chunks within token budget
-> fetch canonical chunk text
-> generate with chunk IDs
-> validate claim citations

9.2 Context selection rules

Do not send every retrieved chunk to the writer.

Limit near-duplicate chunks from the same section.

Prefer source diversity when scores are comparable.

Apply freshness only when the topic requires it.

Preserve source identifiers in every context block.

Reject results below an evaluated score threshold.

Never cite a chunk that was not provided to the writer.

9.3 Citation contract

Generated factual claims use structured references:

{
  "text": "A Kubernetes Service provides a stable network endpoint.",
  "citations": [
    {
      "source_id": "src_01J...",
      "chunk_id": "chk_01J...",
      "locator": "Networking > Services, page 14"
    }
  ]
}

The renderer converts these identifiers into endnotes or inline links. The model does not invent final citation URLs.

9.4 Retrieval failure behavior

If sources are optional and Qdrant is unavailable, generation may continue in clearly marked non-grounded mode only if the user policy allows it.

If citations or selected sources are required, generation fails safely and retries.

Never silently replace failed retrieval with model memory.

Record the query, filters, result IDs, scores and latency for debugging, with sensitive text redacted.

9.5 Update 1 retrieval improvements

After a dense baseline and evaluation set exist:

Add Qdrant sparse vectors/BM25.

Run dense and sparse retrieval in parallel.

Fuse with Reciprocal Rank Fusion as the safe initial default.

Retrieve 20–40 candidates.

Rerank the top candidates using an evaluated reranker.

Return 6–10 grounded chunks.

Do not add hybrid retrieval because it sounds advanced. Add it only when it improves Recall@K, NDCG/MRR and citation quality on the product's evaluation set.

10. LangGraph workflows

10.1 Plan generation

flowchart TD
    B["Normalize brief"] --> P["Create curriculum"]
    P --> C["Check coverage and prerequisites"]
    C --> Q{"Valid?"}
    Q -->|Revise once| P
    Q -->|Pass| O["Return typed plan"]

10.2 Issue generation

flowchart TD
    I["Load immutable issue input"] --> R{"RAG required?"}
    R -->|Yes| G["Retrieve grounded context"]
    R -->|No| W["Write structured issue"]
    G --> W
    W --> V["Create visual specification"]
    V --> E["Editorial critique"]
    E --> Q{"Quality gate"}
    Q -->|Revise| W
    Q -->|Pass| F["Return typed issue"]

10.3 Agent/node responsibilities

Node

Input

Output

Brief normalizer

User brief

Validated SeriesBrief

Curriculum planner

Brief

SeriesPlan modules/issues

Query builder

Issue objective and source policy

Retrieval query and filters

Retriever

Query and enforced tenant scope

Ranked RetrievedChunk[]

Writer

Issue contract and grounded context

Content-block AST

Visual planner

Issue content

Typed visual specification

Editor

Draft, audience and style policy

Critique/revision instructions

Quality gate

Final draft and sources

Pass or typed failure

10.4 Graph limits

Maximum revision loops: 2

Maximum tool calls per issue: configurable and bounded

Per-model-call timeout

Overall issue-generation deadline

One approved fallback-model attempt

Typed error when limits are exhausted

LangGraph state is persisted only for job resumption and diagnostics. Product state remains in PostgreSQL.

11. Visual generation

MVP supports deterministic technical visuals:

Mermaid for flows and architecture

D2 as an alternative diagram DSL

Server-side SVG rendering

PNG conversion for email compatibility

Immutable asset storage

Required alt text

The AI returns a VisualSpec; a renderer produces the asset. Dense text-heavy diagrams must not be generated through a raster image model.

Update 1 adds:

Chart specifications using Vega-Lite

Branded infographic templates

Excalidraw-style whiteboards

Visual linting and collision checks

Visual quality evaluation set

12. Data model

Every tenant-owned table includes workspace_id, timestamps and appropriate tenant indexes.

12.1 Core entities

Table

Key fields

users

id, email, timezone, status

workspaces

id, plan, status

workspace_members

workspace_id, user_id, role

series

id, topic, goal, level, timezone, status, approval_mode

series_versions

series_id, version, brief_json, prompt_version

issues

id, series_id, sequence_no, objective, scheduled_at, status, locked

issue_versions

issue_id, version, content_json, subject, preheader, checksum

generation_runs

id, target, status, model, tokens, cost, prompt_version, error_code

assets

id, issue_id, type, object_key, mime_type, checksum, alt_text

schedules

id, issue_id, job_type, run_at, status, attempts, claimed_at

deliveries

id, issue_id, recipient_id, provider_id, idempotency_key, status

provider_events

provider, external_event_id, type, payload_json, received_at

outbox_events

aggregate, event_type, payload_json, available_at, published_at

audit_logs

actor_id, action, target, metadata_json

12.2 RAG entities

Table

Key fields

sources

id, workspace_id, scope, type, status, current_version_id

source_versions

id, source_id, content_hash, object_key, parser_version, status

source_chunks

id, source_version_id, index, text, token_count, heading_path, checksum

ingestion_runs

id, source_version_id, pipeline_version, status, counts, error_code

embedding_indexes

id, name, model, revision, dimension, collection, status

retrieval_runs

id, generation_run_id, query, filter_json, latency_ms, result_ids

citations

issue_version_id, block_id, source_id, chunk_id, locator

12.3 Constraints and indexes

Unique (series_id, sequence_no).

Unique (issue_id, version).

Unique (issue_id, recipient_id, issue_version) for delivery.

Unique deliveries.idempotency_key.

Unique (provider, external_event_id).

Unique (source_version_id, chunk_index, chunker_version).

Unique (source_version_id, pipeline_version) for ingestion.

Index schedules(status, run_at).

Index sources(workspace_id, status).

Index source_chunks(source_version_id, chunk_index).

Optimistic version column on mutable plans/issues.

13. API plan

Use /v1, JSON, generated OpenAPI clients, ULID/UUID identifiers and application/problem+json errors. AI work returns 202 Accepted with an operation ID.

13.1 Series and issues

POST   /v1/series
GET    /v1/series/{series_id}
PATCH  /v1/series/{series_id}
POST   /v1/series/{series_id}/plan
GET    /v1/series/{series_id}/issues
PATCH  /v1/issues/{issue_id}
POST   /v1/issues/{issue_id}/generate
POST   /v1/issues/{issue_id}/approve
POST   /v1/issues/{issue_id}/test-send
POST   /v1/series/{series_id}/activate
POST   /v1/series/{series_id}/pause
POST   /v1/series/{series_id}/resume
GET    /v1/operations/{operation_id}

13.2 Sources and RAG

POST   /v1/sources/uploads
POST   /v1/sources/urls
GET    /v1/sources
GET    /v1/sources/{source_id}
GET    /v1/sources/{source_id}/preview
POST   /v1/sources/{source_id}/reindex
DELETE /v1/sources/{source_id}
POST   /v1/series/{series_id}/retrieval-preview

retrieval-preview is authenticated, rate-limited and only returns sources visible to the requesting workspace.

13.3 Webhooks

POST /v1/webhooks/email/{provider}

Verify the raw-body signature before applying JSON events. Store the external event ID before executing state transitions.

13.4 Problem response

{
  "type": "https://docs.example/problems/source-ingestion-failed",
  "title": "Source ingestion failed",
  "status": 422,
  "code": "SOURCE_TEXT_NOT_EXTRACTABLE",
  "detail": "The PDF does not contain extractable text.",
  "trace_id": "7f3c..."
}

14. Scheduling and delivery

14.1 State machines

Series:
draft -> planning -> planned -> active -> paused -> completed
                  \-> failed

Issue:
planned -> generating -> review -> scheduled -> sending -> sent
                      \-> failed                 \-> failed

Delivery:
pending -> submitted -> delivered
                    \-> deferred -> submitted
                    \-> bounced
                    \-> complained
                    \-> failed

14.2 Scheduler

Every 15–30 seconds:

Claim a bounded due-job batch with FOR UPDATE SKIP LOCKED.

Commit the claim quickly.

Process outside the database transaction.

Heartbeat long jobs.

Retry transient failures with exponential backoff and jitter.

Move terminal failures to an operator-visible state.

Never keep a database transaction open during model, Qdrant, storage or email-provider calls.

14.3 Delivery idempotency

workspace_id + issue_id + recipient_id + issue_version

Create the delivery record before provider submission. The unique key returns the original attempt instead of sending again.

14.4 Time edge cases

Store UTC instant plus original IANA timezone.

Preserve local intent across daylight-saving changes.

Editing cadence changes only future, unlocked issues.

Profile-timezone changes do not silently move existing schedules.

Define month-end behavior explicitly.

Pending approval blocks delivery and triggers reminders.

Missed sends require a configured grace policy; never improvise.

15. Email rendering and provider integration

Canonical content is a versioned content-block AST.

Templates render deterministic HTML.

Generate a plain-text alternative.

Inline critical CSS.

Sanitize links and user content.

Maintain accessible headings and image alt text.

Snapshot-test representative email clients.

Verify sender identity before real delivery.

Process accepted, delivered, deferred, bounced and complaint events.

Suppress recipients after terminal bounce, complaint or unsubscribe.

The MVP sends to the user's verified address. Audience sending begins only in Update 2 after suppression, consent and abuse controls are hardened.

16. Security and privacy

16.1 Required controls

Verified magic link or OAuth

Short-lived sessions and safe refresh-token rotation

Workspace-role authorization

Tenant scope in every repository query

Cross-tenant retrieval tests

KMS-backed encryption for provider secrets

Private Qdrant network, API key and TLS

Signed email webhooks and replay protection

URL ingestion SSRF controls

File size/type limits and malware policy

Generated HTML/diagram sanitization

Model and generation rate limits

Per-workspace cost budgets

Prompt/source redaction in logs

Data export, deletion and retention jobs

Immutable consent/suppression records when audiences are introduced

16.2 Source prompt-injection boundary

Retrieved content is data, never instruction. The system prompt must state this, but a prompt alone is insufficient.

Enforce:

Retrieval tools return content and metadata only.

Source text cannot add tools or change system policy.

The writer has no arbitrary network or code-execution tool.

Tool inputs are allowlisted and schema-validated.

Secrets are never included in the graph state.

16.3 Abuse controls

Limit test sends.

Verify recipients.

Prevent rapid workspace creation and generation abuse.

Block unsupported file sizes and URL fan-out.

Apply provider and model budgets.

Add content moderation appropriate to provider policy.

17. Reliability, backup and recovery

17.1 Initial objectives

SLI

MVP objective

API availability

99.5% monthly

Scheduler claim lag

p95 under 60 seconds

Approved email submission lag

p95 under 2 minutes

Dense retrieval latency

p95 under 300 ms inside the private network

Plan-generation success

at least 98%, excluding invalid requests/provider outage

Issue generation before deadline

at least 99% with retry/fallback

Duplicate deliveries

0 tolerated

RPO

15 minutes

RTO

4 hours

These are engineering objectives, not external promises, until measured in production.

17.2 Backup priorities

PostgreSQL point-in-time recovery

Object-storage versioning/retention

Configuration and secret recovery

Qdrant snapshot for faster recovery

Full Qdrant reindex path from canonical data

Test both snapshot restoration and complete reindexing. A snapshot is not sufficient if the ingestion pipeline itself is broken.

17.3 Qdrant deployment evolution

MVP:

Single secured node

Persistent volume

Resource limits

Scheduled snapshots

Tested reindex command

Later, only when uptime/data volume requires it:

Replicated cluster

Shard strategy based on measured tenant size

Rolling upgrade procedure

Capacity and recall testing

18. Observability

18.1 Structured log context

trace_id

workspace_id

series_id

issue_id

source_id

ingestion_run_id

retrieval_run_id

generation_run_id

delivery_id

provider

model

attempt

duration_ms

error_code

18.2 Core metrics

scheduler_lag_seconds
jobs_claimed_total
jobs_failed_total
generation_duration_seconds
generation_tokens_total
generation_cost_total
generation_schema_failures_total
source_ingestion_duration_seconds
source_ingestion_failures_total
qdrant_query_duration_seconds
qdrant_query_failures_total
retrieval_results_total
retrieval_empty_total
citation_validation_failures_total
visual_render_failures_total
delivery_submission_duration_seconds
delivery_duplicates_prevented_total
delivery_bounces_total
webhook_signature_failures_total

18.3 Trace path

HTTP request
-> Go application service
-> outbox/job
-> AI worker/LangGraph
-> embedding/Qdrant query
-> visual renderer
-> email provider

Do not put full private source chunks into traces. Store identifiers, hashes, scores and redacted previews.

19. Testing and AI evaluation

19.1 Unit tests

Schedule/timezone calculations

State transitions

Idempotency keys

Tenant-filter injection

Source URL validation

Chunking boundaries

Deterministic point IDs

Content-block schema

Citation schema

Retry classification

Model capability routing

19.2 Integration tests

PostgreSQL concurrency and outbox

Object-storage uploads

Qdrant ingestion, filtering and deletion

Reindex from canonical sources

AI schema contracts

Diagram rendering

Email provider sandbox

Signed and duplicated webhooks

19.3 End-to-end scenario

Create a series.

Upload a source.

Ingest and verify its chunks.

Generate/edit the plan.

Generate an issue with scoped retrieval.

Validate citations against retrieved chunks.

Approve the issue.

Advance test time.

Submit exactly one delivery.

Replay provider events.

Verify final state and audit trail.

19.4 Failure tests

Kill worker during ingestion.

Kill worker after provider acceptance but before database update.

Run multiple workers against the same job.

Make Qdrant unavailable.

Partially index a source.

Return invalid model JSON.

Timeout retrieval or generation.

Replay/out-of-order webhooks.

Delete a source during generation.

Attempt retrieval using another workspace ID.

Reindex during active queries.

19.5 Retrieval evaluation set

Create at least 100 representative questions with human-labeled relevant chunks across:

Technical documentation

Long PDFs

Multiple conflicting sources

Exact keyword queries

Conceptual queries

Current and evergreen material

Different audience levels

Measure:

Recall@5/10/20

MRR

NDCG@10

Empty-result rate

Source diversity

Citation precision

Citation coverage

Faithfulness to cited chunks

Retrieval p50/p95 latency

19.6 Generation evaluation set

Evaluate:

Plan coherence

Topic duplication

Prerequisite ordering

Factuality

Citation support

Audience-level fit

Style adherence

Diagram render success

Schema validity

Cost and latency

No prompt, model, chunker or embedding version is promoted without regression results.

20. Repository structure

newsletter-platform/
├── apps/
│   └── web/
├── services/
│   ├── control-api/
│   ├── control-worker/
│   └── ai-engine/
│       ├── api/
│       ├── workers/
│       ├── graphs/
│       ├── rag/
│       │   ├── ingestion/
│       │   ├── chunking/
│       │   ├── embeddings/
│       │   ├── retrieval/
│       │   └── evaluation/
│       └── visuals/
├── packages/
│   ├── contracts/
│   ├── email-templates/
│   └── visual-specs/
├── db/
│   ├── migrations/
│   └── seeds/
├── infra/
│   ├── docker/
│   └── terraform/
├── observability/
├── docs/
│   ├── adr/
│   └── runbooks/
└── .github/workflows/

Use one versioned schema source for Go, Python and TypeScript contracts where practical. CI must detect breaking schema changes.

21. Local development and deployment

Local environment

Docker Compose runs:

PostgreSQL

Qdrant

MinIO

Mail sandbox

Go API/worker

Python API/worker

Frontend

Tests replace external models with deterministic fixtures. Developers should not require paid API access to run the core suite.

Environments

local

test

staging

production

Staging uses isolated storage, database, vector index, secrets and email-provider credentials.

Initial production deployment

Managed PostgreSQL

Managed object storage

Secured self-hosted Qdrant

Containerized application services

Managed secrets/KMS

Hosted email provider

Automated backups and point-in-time recovery

Do not adopt Kubernetes merely because the product has multiple containers. Start on a managed container runtime unless existing infrastructure already makes Kubernetes cheaper operationally.

22. CI/CD

Pull requests

Format and lint Go, Python and TypeScript.

Unit tests.

Contract compatibility tests.

Migration checks.

Dependency/container scanning.

PostgreSQL/Qdrant integration tests.

Build immutable images.

Run a bounded AI/retrieval evaluation subset.

Release pipeline

Publish versioned images.

Apply backward-compatible migrations.

Deploy staging.

Run smoke, RAG and end-to-end tests.

Require production approval.

Deploy API before consumers when needed.

Run production smoke checks.

Observe SLOs and rollback critical regressions.

Feature flags protect:

Automatic sending

New model/prompt versions

New embedding collections

Hybrid retrieval

Rerankers

New visual renderers

Audience delivery

23. Cost controls

Per-workspace daily/monthly model budgets

Pre-generation cost estimate

Cheaper model for classification/schema repair

Stronger model only for planning/synthesis/review

Source parsing and embedding cached by content hash

Section-level regeneration

Bounded graph loops and tool calls

Token/cost recording per generation

Maximum source and context sizes

Batch embeddings

Local open embedding model for predictable indexing cost

Qdrant storage and memory dashboards

Self-hosted software is not free to operate. Include compute, storage, backups, monitoring and engineering time in unit economics.

24. Zero-to-one MVP execution plan

Assumption: one experienced full-stack/backend engineer with part-time product/design support. A reliable MVP is approximately 9–10 weeks. A UI demo can be built faster, but it will not prove scheduling, retrieval quality or duplicate-send safety.

Week 1 — Product contracts and architecture

Deliver:

Confirm personal-learning MVP.

Finalize SeriesBrief, SeriesPlan, IssueContent, VisualSpec and Citation schemas.

Define state machines and error codes.

Write architecture decisions for Qdrant, jobs, model gateway and rendering.

Create wireframes.

Define SLOs and evaluation datasets.

Exit:

Service ownership is explicit.

Examples validate against schemas.

No unresolved decision changes the primary data model.

Week 2 — Foundation

Deliver:

Monorepo and CI.

Authentication/workspace skeleton.

PostgreSQL migrations/repositories.

Go API/worker skeleton.

Python API/worker skeleton.

PostgreSQL, Qdrant and MinIO local environment.

OpenTelemetry baseline.

Exit:

User creates/reads a draft series.

All services pass health and contract tests.

Qdrant is private and authenticated outside local development.

Week 3 — Plan generation

Deliver:

Create Series wizard.

Curriculum LangGraph.

Structured output and one repair attempt.

Asynchronous operations.

Plan Studio.

Optimistic versioning/locking.

Exit:

Ten golden topics generate coherent valid plans.

Invalid schedules return actionable errors.

Locked edits survive partial regeneration.

Week 4 — MVP RAG

Deliver:

URL/file source endpoints.

PDF/HTML/Markdown/text parsing.

Structure-aware chunking.

Open embedding-model integration.

Qdrant collection/payload indexes.

Scoped dense retrieval.

Source deletion/reindex jobs.

Retrieval test/evaluation baseline.

Exit:

Cross-workspace retrieval is impossible in tests.

Reingestion is idempotent.

Qdrant can be rebuilt from canonical sources.

At least 80% Recall@10 on the initial labeled set, then tune the target using real beta data.

Week 5 — Grounded issue generation

Deliver:

Issue-generation graph.

Query builder and retrieval node.

Content-block AST.

Structured citations.

Citation validator.

Section-level regeneration.

Version history and source panel.

Exit:

Every rendered citation maps to a retrieved chunk.

Required-source generation fails safely when retrieval is unavailable.

Model/prompt/retrieval metadata is traceable.

Week 6 — Visual and email rendering

Deliver:

Mermaid/D2 VisualSpec.

Safe renderer and SVG-to-PNG conversion.

Immutable object-storage assets.

HTML and plain-text templates.

Desktop/mobile preview.

Test send.

Exit:

Unsafe diagrams are rejected.

Visuals are reproducible.

Representative email-client snapshots pass.

Week 7 — Scheduling and delivery

Deliver:

Durable PostgreSQL jobs.

Just-in-time generation jobs.

Delivery idempotency.

Email-provider adapter.

Signed webhook handling.

Pause/resume.

Approval reminders.

Exit:

Multiple workers cannot duplicate a delivery.

Worker restart does not lose work.

Duplicate/out-of-order provider events do not corrupt state.

Week 8 — Security and operations

Deliver:

Rate and cost limits.

Tenant-isolation suite.

SSRF/file/prompt-injection controls.

Backup/restore and Qdrant reindex runbooks.

Dashboards and alerts.

Data export/deletion.

Load/failure tests.

Exit:

Critical recovery scenarios pass in staging.

Alerts identify an owner and action.

Qdrant is not publicly reachable.

Weeks 9–10 — Closed beta

Deliver:

10–25 invited users.

Retrieval and generation evaluation expansion.

Cost/latency monitoring.

Delivery monitoring.

UX corrections.

Operational documentation.

Launch gates:

No unresolved duplicate-send defect.

Retrieval tenant isolation passes continuously.

Required citations are grounded.

Scheduling/generation objectives hold for two weeks.

Restore and reindex have been demonstrated.

Unit economics are understood.

25. Update 1 — RAG and content-quality upgrade

Objective

Improve retrieval and factual quality using measured evidence, not additional uncontrolled agents.

Features

Dense + sparse vectors in Qdrant

RRF fusion

Optional reranker

Source freshness policies

Source conflict detection

Claim/citation coverage scoring

OCR for scanned PDFs

Table-aware parsing

Chart and infographic rendering

Brand kits

Reusable series templates

Prompt/model/embedding comparison dashboard for internal use

Engineering changes

New versioned Qdrant collection containing dense and sparse vectors.

Dual-write/reindex migration rather than in-place silent mutation.

Retrieval evaluation grows to at least 300 labeled queries.

Background source freshness jobs.

Citation-support validator at block/claim level.

Visual evaluation suite.

Release gates

Hybrid path beats dense baseline on Recall@10 and NDCG@10.

Citation precision does not regress.

p95 retrieval remains inside the defined budget.

Reindex and rollback are tested.

OCR/parser failures are visible and recoverable.

26. Update 2 — Creator publishing

Objective

Support small opt-in audiences without becoming a general marketing automation platform.

Features

Audience records

Confirmed opt-in

Import validation and consent confirmation

Embedded subscribe forms

Suppression lists

Unsubscribe workflow

Sender verification

Delivery, click and bounce analytics

Public issue archive

Basic explicit-field segments

Workspace usage plans and billing

Engineering changes

recipients, subscriptions, consent_events and suppression tables.

Per-workspace send-rate and volume limits.

Provider reputation alerts.

Audience-delivery fan-out jobs with idempotent per-recipient records.

Abuse review for high-volume workspaces.

Release gates

Unsubscribe and suppression tests pass under retries.

Complaints and hard bounces block future sends.

Delivery fan-out cannot duplicate messages.

Consent evidence is exportable.

Volume ramp and incident process are documented.

27. Update 3 — Adaptive and segmented learning

Objective

Improve learning outcomes without immediately paying for unique content per person.

Features

Reader-selected level and goal

Segment-level issue variants

Quizzes/exercises

Progress signals

Branching learning paths

Catch-up/digest mode

Multilingual generation with review

Recommendations based on completed modules

Engineering changes

Versioned audience/learner profiles.

Variant and branch graph in the series plan.

Progress-event ingestion.

Variant-level generation cache.

Evaluation by segment and language.

Release gates

Segment variants improve completion/click or explicit learning metrics.

Cost per active learner remains within budget.

Branch changes never resend completed issues.

Language quality meets human review thresholds.

Per-recipient LLM generation remains excluded until segment-level personalization demonstrates measurable value.

28. Update 4 — Teams and enterprise controls

Features

Owner/editor/reviewer/viewer roles

Approval chains

Shared templates and brand governance

SSO/SAML and SCIM

Audit export

Configurable retention

Private model endpoints

Workspace-level model policies

Data residency options where infrastructure supports them

Engineering changes

Formal policy service/authorization layer.

Immutable audit event export.

Enterprise secret and key rotation.

Tenant-level encryption and retention configuration.

Disaster-recovery exercises with documented evidence.

Release gates

Authorization matrix has automated coverage.

Enterprise audit/retention paths are verified.

SSO account lifecycle handles deprovisioning safely.

Support and incident commitments are operationally achievable.

29. Update 5 — Platform and scale

Features

Public API and outbound webhooks

LMS/CMS integrations

Slack/Teams delivery

Template/visual marketplace

Larger corpora and advanced multi-vector retrieval

Usage-based partner plans

Regional deployments if required

Scale changes only when measured

Add RabbitMQ/NATS/Kafka only when PostgreSQL jobs no longer meet throughput or isolation requirements.

Add Temporal only when cross-service recovery/compensation becomes materially difficult.

Move Qdrant to a replicated cluster based on corpus size, availability and recovery evidence.

Add read replicas/caches after query profiling.

Add Kubernetes only when deployment count, autoscaling or organizational operations justify it.

Release gates

Capacity model exists for API, jobs, Qdrant, model calls and sending.

Load tests cover expected peak plus headroom.

Backpressure and tenant quotas protect shared infrastructure.

Multi-region consistency and failure semantics are documented before rollout.

30. Priority backlog

P0 — MVP

Finalize schemas and state machines.

Create monorepo, CI and local stack.

Build auth and tenant-safe repositories.

Build series brief and plan generation.

Build Plan Studio.

Build source upload/URL ingestion.

Add canonical source storage.

Add Qdrant collection and mandatory tenant filtering.

Add dense retrieval and evaluation baseline.

Build grounded issue generation and citations.

Build visual renderer.

Build email rendering and test sends.

Build durable scheduling and idempotent delivery.

Add provider webhooks.

Add observability, budgets and alerts.

Add export/deletion and recovery tests.

P1 — Update 1

Hybrid dense/sparse retrieval.

Reranking.

Citation coverage scoring.

OCR and better parsers.

Source freshness.

Charts, infographics and brand kits.

Reusable templates.

P2 — Update 2

Confirmed opt-in audiences.

Suppression and unsubscribe.

Audience fan-out.

Creator analytics.

Public archives.

Billing/usage plans.

P3 — Updates 3–5

Segment-level personalization.

Branching learning paths.

Teams and enterprise controls.

Public API/integrations.

Measured infrastructure scaling.

31. Risks and mitigations

Risk

Impact

Mitigation

Separate vector database over-engineers the MVP

Operational delay

One secured Qdrant node; derived-data rule; tested reindex

Cross-tenant retrieval

Severe privacy breach

Mandatory repository filter, payload index and adversarial tests

Poor chunks hurt retrieval

Hallucinated/irrelevant content

Structure-aware chunking and labeled retrieval evals

Embedding-model change breaks index

Inconsistent retrieval

Versioned collections and controlled reindex migration

Hallucinated citations

Trust failure

Structured chunk IDs and citation validation

Stale content

Incorrect newsletters

Just-in-time generation and source freshness policy

Duplicate delivery

Severe user trust failure

Unique delivery keys and crash-window tests

Prompt injection from sources

Tool/data abuse

Untrusted-content boundary and allowlisted tools

Model cost grows unpredictably

Bad unit economics

Budgets, caching, bounded loops and section regeneration

Email reputation damage

Provider suspension

Verified recipients first; consent/suppression before audience sends

Too many services/workflow tools

Slow engineering and hard operations

Keep workflow ownership split between Go jobs and bounded LangGraph runs

32. Immediate first milestone

Build one thin vertical slice before expanding the UI:

Create a three-issue brief
-> upload one source
-> parse/chunk/embed/index in Qdrant
-> retrieve scoped chunks
-> generate the first issue with citations
-> render one diagram
-> send one test email
-> record the provider event

The milestone passes only if:

Another workspace cannot retrieve the source.

Re-running ingestion does not duplicate points.

Every citation maps to retrieved evidence.

Re-running delivery does not send twice.

The trace shows the complete path.

Qdrant can be cleared and rebuilt from canonical data.

This vertical slice is the correct zero-to-one proof. Adding more agents or infrastructure before it works is distraction, not progress.

33. Technical references

Qdrant open-source repository and Apache-2.0 license

Qdrant collections and payload-based multitenancy

Qdrant filtering and payload indexes

Qdrant dense and sparse hybrid search

Qdrant security for self-hosted deployments

Qdrant distributed deployment and shard transfer

