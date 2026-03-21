# Challenge Accepted – A Cloudflare-Native Gamified Coding Challenge Platform

## 1. Abstract

Engineering teams and academic institutes frequently run programming challenges, weekly problem-solving sessions, and internal hackathons. However, traditional workflows rely on ad-hoc tools such as shared drives, spreadsheets, email threads, and generic forms. These approaches lack integrated authentication, automated grading pipelines, gamification, reward management, and proper moderation, resulting in low engagement and high manual overhead for faculty or organizers.

Challenge Accepted is a fully serverless, Cloudflare-native web application that addresses these issues by providing a complete platform for weekly coding and problem-solving challenges. The system offers OTP-based authentication, challenge creation and scheduling, text and file submissions, grading with automatic points allocation, reward tiers, leaderboard and streak tracking, threaded comments with moderation and reporting, and an AI-assisted challenge auto-generation workflow. It is implemented as a Cloudflare Worker backed by Cloudflare D1 (SQLite) for relational data, KV for session storage, R2 for file storage, and cron triggers for periodic AI posting. The frontend is built using static HTML, CSS, and vanilla JavaScript served directly from the edge. This document presents the detailed architecture, data model, API design, and implementation details suitable for final-year B.Tech evaluation and industry-grade architectural review.

---

## 2. Problem Statement

### Real-World Problem

Educational institutions and organizations increasingly rely on coding challenges to build problem-solving skills, assess students, and maintain continuous learning. Typical pain points include:

- Manual challenge distribution via PDFs or Google Docs.
- Submissions collected through email or generic forms, without structured storage.
- Grading performed in spreadsheets, with little traceability or feedback management.
- No integrated system for points, rewards, or leaderboards to sustain long-term motivation.
- Weak moderation in discussion forums, leading to spam, off-topic content, or harassment.

These fragmented workflows hinder scalability and make it difficult to track participation, progress, and outcomes across multiple cohorts and weeks.

### Existing System Limitations

Existing competitive programming platforms are often:

- Over-generalized, not tailored to a specific course, institution, or internal culture.
- Heavyweight, requiring significant setup, on-prem infrastructure, or complex DevOps.
- Limited in customization for weekly challenge workflows, reward schemes, and moderation rules.
- Centralized in a single region, causing latency problems for geographically distributed students.

Traditional LMS platforms also lack rich gamification and flexible reward flows (e.g., pass a reward to a peer, bonus points from admins, detailed comment moderation).

### Motivation

The motivation behind Challenge Accepted is to design a **lightweight, globally available, gamified challenge platform** that:

- Requires minimal infrastructure and operational overhead.
- Provides a secure and simple login flow using OTP instead of passwords.
- Leverages edge computing for low latency and high availability.
- Encourages continuous participation through points, streaks, and tangible rewards.
- Enables faculty or admins to manage challenges, grading, rewards, and moderation from a unified interface.
- Demonstrates modern serverless architectural patterns suitable for academic and industry audiences.

---

## 3. Objectives

The primary objectives of Challenge Accepted are:

- To design and implement a **secure OTP-based authentication system** with session management and role-based access control.
- To provide **challenge management** features including creation, editing, deletion, expiration, reopening, and scheduled publishing.
- To support **submission workflows** with text and file attachments, with at most one submission per user per challenge.
- To implement an **evaluation and grading pipeline** that assigns points according to grades and triggers notifications.
- To build a **rewards and bonus points system** with configurable reward tiers, claims, and administrative fulfillment.
- To maintain a **leaderboard and streak tracker** that aggregates points and daily activity for gamification.
- To support **threaded comments** with reactions, reporting, and moderation (hide/unhide, pin, profanity and spam control).
- To integrate an **AI-based auto-posting job** that generates and publishes new challenges on a schedule.
- To deploy the complete application on **Cloudflare’s edge platform** (Workers, D1, KV, R2, Cron) with minimal DevOps overhead.
- To document the architecture and implementation in a way that is suitable for final-year project assessment and professional review.

---

## 4. Scope of the Project

### Included Scope

- Web-based platform for weekly coding/problem-solving challenges.
- OTP-based login using email and one-time passwords.
- Admin and regular user roles with differentiated capabilities.
- Management of challenges: creation, editing, scheduling, expiration, reopening.
- User submissions: text plus file attachments (PDF or other supported formats).
- Grading, points, and bonus points administration.
- Reward tiers, claims, passing rewards to other users, and admin fulfillment.
- Leaderboard and streak calculations based on submission history.
- Threaded comments on challenges, reactions, pinning, reporting, and moderation.
- AI-assisted automatic posting of challenges using external LLM APIs.
- Deployment and hosting entirely on Cloudflare (Workers, D1, KV, R2).

### Excluded Scope

- Native Android or iOS applications.
- Integration with external competitive programming judges or code execution sandboxes.
- Complex plagiarism detection using external similarity APIs (only heuristic text comparison is included).
- Single Sign-On (SSO) using OAuth, SAML, or institutional identity providers.
- Advanced analytics dashboards and reporting (e.g., cohort performance graphs).
- Fully automated CI/CD pipelines and multi-region sharded databases.

### Target Users

- **Students/Participants**: Individuals solving weekly challenges, earning points, and claiming rewards.
- **Faculty/Admins/Organizers**: Responsible for configuring challenges, grading submissions, monitoring comments, awarding bonus points, and fulfilling rewards.
- **Evaluators** (optional subset of admins): May be given access to answer PDFs and grading tools.

---

## 5. Technology Stack

| Layer       | Technology                                   | Reason                                                                                 |
|------------|-----------------------------------------------|----------------------------------------------------------------------------------------|
| Frontend   | Static HTML5, CSS3, Vanilla JavaScript        | Simple, dependency-light UI served from edge; easy to host via Workers Assets.         |
| Backend    | Cloudflare Workers (JavaScript/ES Modules)    | Serverless, globally distributed compute with low operational overhead.                |
| Database   | Cloudflare D1 (SQLite-based)                  | Managed relational store, SQL support, foreign keys and indexing, tightly integrated.  |
| Authentication | OTP via email + KV-backed sessions       | Passwordless login; secure HttpOnly cookies; no JWT complexity; easy revocation.       |
| Session Store | Cloudflare KV                               | Durable key-value store for session objects with TTL; globally replicated.             |
| File Storage | Cloudflare R2                                | Cost-effective object storage for challenge PDFs, answer PDFs, and submission files.   |
| Deployment | Cloudflare Wrangler CLI                        | Unified tooling for local dev, database management, and production deployment.         |
| Cloud/Hosting | Cloudflare Edge Network                    | Edge execution of Workers and global asset distribution, minimizing latency.           |
| DevOps Tools | npm, Wrangler, Cloudflare Dashboard         | Basic package management and deployment; no custom servers or Kubernetes required.     |

---

## 6. System Architecture (High Level)

### Architecture Description

Challenge Accepted follows a **serverless edge architecture** where all compute runs inside a single Cloudflare Worker. The Worker uses:

- Cloudflare D1 as the relational database for users, challenges, submissions, rewards, and comments.
- Cloudflare KV as the session store, mapping session IDs to user information and expiry timestamps.
- Cloudflare R2 as object storage for challenge PDFs, answer PDFs, and submission files.
- A cron trigger for running scheduled jobs, in particular the AI auto-posting of new challenges.
- The Assets binding to serve static frontend files (HTML, CSS, JS) from the `public/` directory.

The backend is organized into a central router that inspects HTTP method and path and dispatches to domain-specific handlers. Handlers perform authentication, authorization, validation, business logic, and persistence via D1 and R2.

### Component Breakdown

Main logical components:

- **Client (Browser)**  
	Renders pages (login, dashboard, admin views) and interacts with the API using JavaScript via a central API helper.

- **Cloudflare Worker**  
	- Entry point src/index.js for routing `/api/*` to the router and serving static assets.
	- Router in src/router.js that maps HTTP methods and paths to handlers.
	- Handlers in src/handlers grouped by domain: auth, user, challenges, submissions, comments, rewards, admin.
	- Middleware in src/middleware for authentication and role checks.
	- Utility modules in src/utils for email sending, cryptography, PDF generation, comment moderation, streak computation, and standardized responses.
	- Scheduled job in src/jobs/autoPostChallenge.js for AI challenge posting.
	- External service integration (Anthropic/OpenAI via src/services/claudeChallenge.js) for AI-generated challenges.

- **Cloudflare D1 Database**  
	Holds normalized tables defined in db.sql for users, challenges, submissions, rewards, user_rewards, bonus_points, comments, reactions, and reports.

- **Cloudflare KV Namespace**  
	Stores sessions keyed by random session IDs with JSON values containing user ID, role, and expiry.

- **Cloudflare R2 Bucket**  
	Stores binary files referenced by keys in the database: challenge PDFs, answer PDFs, and submission files.

- **Email API (External)**  
	An HTTP endpoint (e.g., Vercel function) used by email utilities to send OTPs and notifications.

### Request Flow Explanation

Example: **challenge listing and submission**:

1. User logs in via OTP. The Worker validates the OTP, creates a session record in KV, and sets a secure cookie.
2. From dashboard.html, JavaScript calls `GET /api/challenges` with cookies attached.
3. The Worker’s router resolves to the `listChallenges` handler which:
	 - Reads session from KV (auth middleware).
	 - Queries D1 for active or scheduled challenges respecting the user’s role.
	 - Returns normalized JSON list of challenges.
4. The client renders cards for each challenge.
5. When the user submits a solution:
	 - `POST /api/challenges/:id/submit` is invoked with multipart form data (text and file).
	 - Handler validates deadline, file size, and MIME type.
	 - File is uploaded to R2; metadata and solution text are stored/updated in D1.
6. Later, an admin calls `PATCH /api/submissions/:id/grade`:
	 - Updates submission grade, points, and evaluated_at.
	 - Recomputes user total points and checks for new reward unlocks.
	 - Sends notification email with grade and feedback.

Similar flows exist for comments (with nested retrieval and moderation) and rewards (claiming and fulfillment).

### Scalability Considerations

- **Horizontal scalability** is provided by Cloudflare Workers, which run on the edge nodes of Cloudflare’s global network. Each HTTP request may be served by a different instance, but stateless handlers and KV-backed sessions make this transparent.
- **Database scaling** relies on D1’s managed SQLite engine. For the target usage (single course/institute scale), this is sufficient. Read-heavy workloads can be optimized via indexing and selective queries.
- **File storage** is offloaded to R2, which scales essentially without per-instance constraints.
- The architecture introduces no central custom server, load balancer, or application container that would become a bottleneck.

### Security Considerations

- All sensitive state (sessions) resides on the server side in KV, never in browser-readable storage.
- OTP codes are hashed before storage and given limited validity.
- SQL access is always through parameterized queries, preventing SQL injection.
- All file uploads are stored in a separate object store and referenced only by keys, minimizing risk of arbitrary file execution.
- Role checks prevent non-admins from accessing administrative functions; comments and submissions enforce per-user visibility constraints.

### ASCII Architecture Diagram

```text
										 +-------------------------+
										 |       User Browser     |
										 |  (HTML/CSS/JS, fetch)  |
										 +-----------+------------+
																 |
																 | HTTPS (GET/POST/...)
																 v
										+-----------------------------+
										|      Cloudflare Worker      |
										|  [src/index.js + router]    |
										+----+-----------+------------+
												 |           |
							static     |           |  /api/*
						assets       |           v
												 |   +------------------+
												 |   |  Handlers Layer  |
												 |   | (auth, user,     |
												 |   |  challenges,     |
												 |   |  submissions,    |
												 |   |  comments,       |
												 |   |  rewards, admin) |
												 |   +--------+---------+
												 |            |
												 |            |
				 +---------------+----+  +---+------------------+
				 | Middleware (auth, |  |  Utilities (email,   |
				 | rbac)             |  |  crypto, pdf,        |
				 +-------------------+  |  moderation, streak) |
																+----------+-----------+
																					 |
								 +-------------------------+---------------------------+
								 |                         |                           |
								 v                         v                           v
				+----------------+       +------------------+        +------------------+
				| Cloudflare D1  |       | Cloudflare KV    |        |  Cloudflare R2   |
				|  (Relational   |       |  (Sessions)      |        | (PDFs, files)    |
				+----------------+       +------------------+        +------------------+

															 ^
															 |
											 Cron Trigger (*/30)
															 |
															 v
										 +----------------------+
										 |  autoPostChallenge   |
										 | (AI challenge job)   |
										 +----------+-----------+
																|
																v
											External LLM & Email APIs
```

---

## 7. Detailed Technical Architecture

### 7.1 Frontend Architecture

#### Folder Structure

The frontend is organized under the `public/` directory:

- public/index.html – Login page for OTP-based authentication.
- public/dashboard.html – Main user dashboard showing challenges, submissions, comments, leaderboard, and rewards.
- public/admin.html – Admin user management interface.
- public/admin-challenges.html – Admin challenge management interface.
- public/admin-rewards.html – Reward tier and claim management.
- public/challenges.html – Dedicated view for a single challenge and its submissions.

Assets:

- public/assets/css/style.css – Shared styling for all pages.
- public/assets/js/api.js – API client wrapper around `fetch`.
- public/assets/js/login.js – Login and OTP UI behavior.
- public/assets/js/dashboard.js – Core dashboard logic (challenge list, comments, submissions, rewards, leaderboard).
- public/assets/js/admin.js – Admin user management logic.
- public/assets/js/challenges.js – Challenge detail and grading logic.
- public/assets/js/admin-challenges.js – Challenge CRUD operations for admins.
- public/assets/js/admin-rewards.js – Reward tier and claim management.

#### State Management

The application does not use a front-end framework; instead, each page maintains in-memory state structures such as:

- Current user profile (id, name, role, total points, streaks).
- Active list of challenges with derived flags (isExpired, isScheduled, isPublished).
- Current challenge being viewed, including its submissions and comments.
- Reward tiers and user reward status.
- Leaderboard entries and ranking.

State is updated through functions that:

1. Call the API client exposed by `api.js`.
2. Parse JSON responses.
3. Patch the in-memory objects and re-render selected DOM sections (e.g., challenge list, comments section, leaderboard table).

This approach simplifies reasoning (no virtual DOM) and aligns well with the limited scope of the project.

#### API Communication

All network interactions go through public/assets/js/api.js:

- The module wraps `fetch` and ensures `credentials: "include"` is set so that the session cookie is always sent with API requests.
- Functions are grouped by domain, for example:
	- `requestOtp(email, name)`
	- `verifyOtp(email, otp)`
	- `getChallenges()`, `postChallenge(formData)`, `editChallenge(id, formData)`
	- `submitSolution(challengeId, formData)`
	- `getComments(challengeId)`, `postComment(challengeId, body)`, `reportComment(commentId, reason)`
	- `listRewards()`, `claimReward(id)`, `passReward(id, targetEmail)`
	- `adminListUsers()`, `adminAdjustPoints(userId, delta)`

Each function encodes parameters as JSON or multipart/form-data, and decodes the JSON payload into easily consumable structures for the UI.

#### UI Design Approach

The UI is built around classic HTML:

- The dashboard uses a two-column layout:
	- Left or top panel for profile, stats, and leaderboard.
	- Main content area for challenge cards, comments, and submission modals.
- Admin pages provide tabular views for users, rewards, and challenges with inline actions (buttons or icons).
- Modals (implemented as divs toggled by CSS classes) are used for:
	- Posting and editing challenges.
	- Submitting solutions.
	- Viewing submissions in detail.
	- Managing reward claims.
	- Reviewing reported comments.
- CSS employs a mix of layout rules (flexbox, grid), typography, spacing, and basic color tokens inspired by modern dashboards.
- Role-based UI:
	- Admin-only buttons (e.g., “Post Challenge”, “View Reports”, “Adjust Points”) are only displayed when the logged-in user’s role is `admin`.
	- Error and success messages are rendered in toast-like banners or inline labels.

### 7.2 Backend Architecture

#### Layered View

Although implemented within the constraints of a Workers environment, the backend follows a conceptual layered architecture:

1. **Entry Layer**  
	 - src/index.js handles:
		 - CORS preflight (OPTIONS) responses.
		 - Delegation of `/api/*` paths to the router.
		 - Serving static assets via the `ASSETS` binding.
		 - Scheduled events via the `scheduled` handler.

2. **Routing Layer**  
	 - src/router.js inspects the HTTP method and path and dispatches to specific handler functions.
	 - Routes are grouped logically:
		 - `/api/auth/*` → authentication handlers.
		 - `/api/user/*`, `/api/leaderboard` → user and leaderboard handlers.
		 - `/api/challenges/*` → challenge and submission handlers.
		 - `/api/comments/*` and `/api/admin/comments/*` → comment and moderation handlers.
		 - `/api/rewards/*` and `/api/admin/rewards/*` → rewards and claim handlers.
		 - `/api/admin/users/*` → admin user management.
		 - `/api/admin/challenges/auto-post` → AI auto-posting trigger.

3. **Middleware Layer**

	 - src/middleware/auth.js:
		 - Extracts session ID from cookies.
		 - Loads session JSON from KV.
		 - Verifies expiry.
		 - Attaches `session.user` to the request context.
	 - src/middleware/rbac.js:
		 - Ensures that the authenticated user has `role === "admin"` for admin routes.
		 - Returns structured 403 responses when access is denied.

4. **Handler Layer**

	 Handlers in src/handlers encapsulate business logic. Examples:

	 - src/handlers/auth/requestOtp.js and src/handlers/auth/verifyOtp.js for OTP lifecycle.
	 - src/handlers/challenges/postChallenge.js for challenge creation, uploading PDFs, and validation.
	 - src/handlers/submissions/submit.js for handling multipart submissions and storing files in R2.
	 - src/handlers/submissions/gradeSubmission.js for grading, points allocation, and notification.
	 - src/handlers/rewards in general for reward listing, claiming, passing, and admin approval.
	 - src/handlers/comments for threaded commenting, reactions, reports, and hide/unhide operations.
	 - src/handlers/user/leaderboard.js for computing total points and streaks.

	 Handlers typically:

	 - Validate HTTP method and content type.
	 - Use auth middleware to obtain the current user.
	 - Perform domain validations (deadlines, uniqueness, file constraints).
	 - Interact with D1 via parameterized SQL queries.
	 - Interact with R2 for file upload/download.
	 - Return responses via a shared response utility.

5. **Utilities / Service Layer**

 	 - src/utils/crypto.js – OTP generation, hashing, and session ID creation.
	 - src/utils/email.js – HTML email templates and HTTP client for external email API.
	 - src/utils/pdf.js – PDF generation for AI-generated challenge descriptions.
	 - src/utils/commentModeration.js – Profanity detection and basic anti-spam rules.
	 - src/utils/streaks.js – Streak computation from a list of submission dates.
	 - src/utils/response.js – JSON response helper, enforcing consistent structure and headers.
	 - src/services/claudeChallenge.js – Claude/OpenAI challenge generator service that builds prompts, calls external LLMs using configured model and API keys, validates the JSON schema of responses, and normalizes them into internal challenge DTOs.

	 These modules act as “services” in a classic layered architecture, abstracting cross-cutting concerns from handlers.

6. **Job Layer**

	 - src/jobs/autoPostChallenge.js coordinates the scheduled AI auto-posting of challenges. It:
		 - Checks feature flags in environment variables.
		 - Ensures debouncing so challenges are not posted too frequently.
		 - Invokes the LLM service to generate a new challenge.
		 - Persists the generated challenge in D1 and its PDF in R2.
		 - Optionally sends notification emails to users.

#### DTO Usage

While not using explicit DTO classes, the system constructs and returns **shape-stable JSON objects**:

- For challenges: `id`, `title`, `description`, `last_date`, `publish_at`, `is_expired`, `is_published`, etc.
- For submissions: `id`, `user`, `challenge`, `grade`, `points`, `submitted_at`, `file` metadata.
- For rewards: fields combining both reward tier and user-specific status.

These effectively play the role of DTOs, ensuring that client code receives consistent structures even if internal database schemas evolve.

#### Validation

Validation is done inside handlers with contributions from utility modules:

- Request schema validation: presence of mandatory fields, correct data formats (dates, email).
- Business rule validation: deadlines not passed, challenge not expired when submitting, reward not already claimed, one submission per challenge per user.
- File validation: size limits, MIME type checking.
- Comment validation: character limits and profanity detection.

### 7.3 Database Architecture

#### Database Type

The project uses **Cloudflare D1**, a managed SQLite-based database offered by Cloudflare. D1 offers:

- Standard SQL with support for foreign keys.
- Automatic replication and backups.
- Tight integration with Workers, enabling low-latency database calls from the edge.

#### Design Approach

The schema is **highly normalized**, with each concern represented as a dedicated table:

- Users and OTPs for authentication.
- Challenges and submissions for core functionality.
- Rewards, user_rewards, and bonus_points for gamification.
- challenge_comments, comment_reactions, and comment_reports for community features.

This design:

- Ensures referential integrity.
- Allows efficient queries with indexes on filter columns.
- Simplifies reasoning about data flows.

#### Indexing Strategy

Key indices include:

- idx_users_email on `users(email)` for fast lookups during login and session resolution.
- idx_otps_email on `otps(email, used)` for validating OTPs efficiently.
- idx_challenges_last_date on `challenges(last_date)` for filtering active vs expired challenges.
- idx_challenges_publish_at on `challenges(publish_at)` for scheduled publish filtering.
- idx_comments_challenge_created on `challenge_comments(challenge_id, created_at DESC)` for fast retrieval of comments per challenge.
- idx_comments_parent on `challenge_comments(parent_id)` for nested replies.
- idx_comment_reactions_comment on `comment_reactions(comment_id)` for reaction aggregation.
- idx_comment_reports_comment / idx_comment_reports_reported_by for admin report reviews.

These indices are chosen based on actual query patterns and improve performance under typical workloads.

#### Relationships

- users ↔ submissions: one-to-many via `submissions.user_id`.
- challenges ↔ submissions: one-to-many via `submissions.challenge_id`.
- users ↔ challenge_comments: one-to-many via `challenge_comments.user_id`.
- challenges ↔ challenge_comments: one-to-many via `challenge_comments.challenge_id`.
- challenge_comments ↔ challenge_comments: self-referential via `parent_id` for threads.
- users ↔ user_rewards ↔ rewards: many-to-many relationship via the join table.
- users ↔ bonus_points: one-to-many for manually awarded points.
- challenge_comments ↔ comment_reactions and comment_reports: one-to-many for reactions and reports.

---

## 8. Data Modeling

Below is an overview of the main entities, their fields, and constraints based on db.sql.

### Users Table

| Column     | Type    | Description                                  |
|-----------|---------|----------------------------------------------|
| id        | INTEGER | Primary key, auto-increment.                 |
| name      | TEXT    | Full name of the user.                       |
| email     | TEXT    | Unique email address, used for login.       |
| role      | TEXT    | `user` or `admin`.                           |
| last_login| TEXT    | Timestamp of last successful login.          |
| created_at| TEXT    | Timestamp of account creation.               |

- **PK**: `id`  
- **Unique**: `email`

### OTPs Table

| Column     | Type    | Description                                      |
|-----------|---------|--------------------------------------------------|
| id        | INTEGER | Primary key, auto-increment.                     |
| email     | TEXT    | Email for which OTP was generated.              |
| otp_hash  | TEXT    | SHA-256 hash of the OTP code.                   |
| created_at| TEXT    | Timestamp of generation.                         |
| used      | INTEGER | Flag (0/1) indicating if OTP has been used.     |

- **PK**: `id`  
- **Index**: `(email, used)` for validation queries.

### Challenges Table

| Column            | Type    | Description                                                     |
|------------------|---------|-----------------------------------------------------------------|
| id               | INTEGER | Primary key, auto-increment.                                    |
| title            | TEXT    | Challenge title.                                                 |
| description      | TEXT    | Brief summary/instructions.                                     |
| last_date        | TEXT    | Deadline date for submissions (`YYYY-MM-DD`).                   |
| pdf_key          | TEXT    | R2 key of challenge statement PDF.                              |
| pdf_name         | TEXT    | Original filename of challenge PDF.                             |
| posted_by        | INTEGER | FK → users.id, admin who posted challenge.                     |
| created_at       | TEXT    | Timestamp when challenge was created.                           |
| answer_description | TEXT  | Explanation or model answer summary.                            |
| answer_key       | TEXT    | R2 key for answer PDF.                                          |
| answer_name      | TEXT    | Original filename for answer PDF.                               |
| publish_at       | TEXT    | Optional datetime when challenge becomes visible to students.   |

- **PK**: `id`  
- **FK**: `posted_by → users(id)`  
- **Index**: `last_date`, `publish_at`

### Submissions Table

| Column       | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|
| id          | INTEGER | Primary key, auto-increment.                                    |
| challenge_id| INTEGER | FK → challenges.id.                                             |
| user_id     | INTEGER | FK → users.id.                                                  |
| solution_text| TEXT   | Free-form text answer submitted by user.                        |
| file_key    | TEXT    | Optional R2 key for attached solution file.                     |
| file_name   | TEXT    | Original filename of attached file.                             |
| file_type   | TEXT    | MIME type of attached file.                                     |
| submitted_at| TEXT    | Timestamp of first submission.                                  |
| updated_at  | TEXT    | Timestamp of last modification.                                 |
| grade       | TEXT    | Enum: `wrong`, `partial`, `almost`, `correct`.                  |
| remark      | TEXT    | Evaluator comments.                                             |
| points      | INTEGER | Points awarded for this submission.                             |
| evaluated_at| TEXT    | Timestamp of grading.                                           |

- **PK**: `id`  
- **FKs**: `challenge_id → challenges(id)`, `user_id → users(id)`  
- **Unique**: `(challenge_id, user_id)` – at most one submission per user per challenge.

### Rewards Table

| Column          | Type    | Description                                    |
|----------------|---------|------------------------------------------------|
| id             | INTEGER | Primary key, auto-increment.                   |
| title          | TEXT    | Reward name (e.g., “Blue Lays Big Pack”).      |
| description    | TEXT    | Reward details.                                |
| icon           | TEXT    | Emoji or symbol representing reward.           |
| points_required| INTEGER | Threshold of total points to unlock reward.    |
| active         | INTEGER | Flag (0/1) indicating if reward is active.     |

- **PK**: `id`  
- **Unique**: `points_required` to maintain distinct tiers.

### User_Rewards Table

| Column          | Type    | Description                                                   |
|----------------|---------|---------------------------------------------------------------|
| id             | INTEGER | Primary key, auto-increment.                                  |
| user_id        | INTEGER | FK → users.id.                                                |
| reward_id      | INTEGER | FK → rewards.id.                                              |
| status         | TEXT    | `unlocked`, `claimed`, `passed`, `fulfilled`, `rejected`.     |
| unlocked_at    | TEXT    | Timestamp when reward tier was unlocked.                      |
| claimed_at     | TEXT    | Timestamp when user claimed reward.                           |
| fulfilled_at   | TEXT    | Timestamp when admin fulfilled reward.                        |
| points_consumed| INTEGER | Points consumed when fulfilling reward (if applicable).       |

- **PK**: `id`  
- **FKs**: `user_id → users(id)`, `reward_id → rewards(id)`  
- **Unique**: `(user_id, reward_id)` – only one record per user per tier.

### Bonus_Points Table

| Column     | Type    | Description                                           |
|-----------|---------|-------------------------------------------------------|
| id        | INTEGER | Primary key, auto-increment.                          |
| user_id   | INTEGER | FK → users.id.                                        |
| points    | INTEGER | Number of extra points granted.                       |
| reason    | TEXT    | Justification for awarding bonus (e.g., behavior).   |
| granted_by| INTEGER | FK → users.id, admin granting bonus.                  |
| granted_at| TEXT    | Timestamp of grant.                                   |

- **PK**: `id`  
- **FKs**: `user_id → users(id)`, `granted_by → users(id)`

### Challenge_Comments Table

| Column       | Type    | Description                                             |
|-------------|---------|---------------------------------------------------------|
| id          | INTEGER | Primary key, auto-increment.                            |
| challenge_id| INTEGER | FK → challenges.id.                                     |
| user_id     | INTEGER | FK → users.id.                                          |
| parent_id   | INTEGER | FK → challenge_comments.id (for threaded replies).      |
| content     | TEXT    | Comment text.                                           |
| created_at  | TEXT    | Timestamp of creation.                                  |
| updated_at  | TEXT    | Timestamp of last edit.                                 |
| is_pinned   | INTEGER | Flag (0/1) indicating if comment is pinned.            |
| is_hidden   | INTEGER | Flag (0/1) indicating if comment is hidden.            |
| hidden_reason| TEXT   | Optional reason provided by admin for hiding.          |
| hidden_by   | INTEGER | FK → users.id, admin who hid comment.                  |
| hidden_at   | TEXT    | Timestamp when comment was hidden.                     |

- **PK**: `id`  
- **FKs**: `challenge_id → challenges(id)`, `user_id → users(id)`, `parent_id → challenge_comments(id)`, `hidden_by → users(id)`  
- **Index**: `(challenge_id, created_at DESC)`, `(parent_id)`

### Comment_Reactions Table

| Column     | Type    | Description                                     |
|-----------|---------|-------------------------------------------------|
| comment_id| INTEGER | FK → challenge_comments.id.                     |
| user_id   | INTEGER | FK → users.id.                                  |
| reaction  | TEXT    | `like` or `dislike`.                            |
| created_at| TEXT    | Timestamp when reaction was added.              |

- **PK**: Composite `(comment_id, user_id)`  
- **FKs**: `comment_id → challenge_comments(id)`, `user_id → users(id)`  
- **Index**: `(comment_id)`

### Comment_Reports Table

| Column      | Type    | Description                                        |
|------------|---------|----------------------------------------------------|
| id         | INTEGER | Primary key, auto-increment.                       |
| comment_id | INTEGER | FK → challenge_comments.id.                        |
| reported_by| INTEGER | FK → users.id.                                     |
| reason     | TEXT    | Optional description of why comment is reported.   |
| created_at | TEXT    | Timestamp of report.                               |

- **PK**: `id`  
- **FKs**: `comment_id → challenge_comments(id)`, `reported_by → users(id)`  
- **Unique**: `(comment_id, reported_by)` – user can report a comment only once.  
- **Index**: `(comment_id)`, `(reported_by)`.

---

## 9. Feature-wise Design and Implementation

Below, each major feature is broken down by purpose, workflow, APIs, data, logic, frontend implementation, sequence, and security.

### 9.1 OTP Authentication & Session Management

#### Purpose

Provide passwordless, email-based login with minimal friction and strong security. Avoid password storage and password reset flows.

#### Workflow

1. User accesses index page and provides email and name.
2. Browser calls `POST /api/auth/request-otp`.
3. Worker generates a random numeric OTP, hashes it, stores it in `otps` with timestamp and `used=0`.
4. An email with the OTP is sent using an external email API.
5. User enters OTP, and browser calls `POST /api/auth/verify-otp`.
6. Worker verifies OTP by comparing hashes and timestamps.
7. If valid, user record is created or updated, and a session object is stored in KV with expiry.
8. A `Set-Cookie` header sets an HttpOnly, Secure session cookie.
9. Subsequent API calls automatically include the cookie; auth middleware resolves sessions.

#### API Endpoints

- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/logout`

#### Database Changes

- Insert records into `otps` on each request.
- Mark `used=1` upon successful verification.
- Upsert user in `users` for new email addresses.

#### Backend Logic

- Use src/utils/crypto.js to generate OTP and hash.
- Use src/utils/email.js to render HTML template and call the email API.
- Sessions stored in KV contain JSON: `{ userId, name, email, role, expiresAt }`.

#### Frontend Implementation

- public/assets/js/login.js manages two-step form:
	- First step to request OTP.
	- Second step to submit OTP.
- Feedback (e.g., “OTP sent”, “Invalid OTP”) is rendered via inline messages.

#### Sequence Flow

```text
User → Browser → /api/auth/request-otp → Worker → D1:INSERT otps → Email API
User → Browser (OTP) → /api/auth/verify-otp → Worker → D1:SELECT otps → KV:PUT session → Set-Cookie → Browser
```

#### Security Considerations

- OTP codes hashed in database, so compromise of D1 does not reveal codes.
- OTP expiry enforces short validity; repeated attempts can be rate-limited.
- Sessions stored server-side; stolen cookies cannot be read by JavaScript (HttpOnly).
- Admin privileges are tied to `users.role` and verified on each admin route.

---

### 9.2 Challenge Management (CRUD & Scheduling)

#### Purpose

Allow admins to create, edit, delete, and schedule challenges, including attaching statement and answer PDFs.

#### Workflow

1. Admin opens admin challenge page and fills form.
2. Browser submits multipart form to `POST /api/challenges`.
3. Worker:
	 - Validates required fields.
	 - Uploads challenge PDF to R2.
	 - Inserts row into `challenges` with R2 key and metadata.
4. Challenges can be edited via `PATCH /api/challenges/:id`:
	 - Optionally updating metadata and replacing PDFs.
5. Admin may expire or reopen challenges.
6. Scheduled challenges with `publish_at` in the future are visible to admins but hidden from regular users.

#### API Endpoints

- `POST /api/challenges`
- `PATCH /api/challenges/:id`
- `DELETE /api/challenges/:id`
- `POST /api/challenges/:id/expire`
- `POST /api/challenges/:id/reopen`
- `GET /api/challenges`
- `GET /api/challenges/:id/download`
- `GET /api/challenges/:id/answer` (admin only)

#### Database Changes

- Insert into `challenges` when creating.
- Update fields (including `publish_at`) and PDF metadata when editing.
- Soft interpretation of expiration via `last_date` and status flags.
- Deleting a challenge cascades to submissions and comments (depending on foreign key constraints and delete behavior).

#### Backend Logic

- Validation includes date parsing, ensuring `last_date` is in the future for active challenges.
- R2 operations to put/get objects based on keys.
- Access control ensures only admins can create or edit challenges.
- `listChallenges` handler:
	- For regular users: only challenges whose `publish_at` is past and not explicitly expired.
	- For admins: includes upcoming scheduled challenges.

#### Frontend Implementation

- public/admin-challenges.html and public/assets/js/admin-challenges.js:
	- Provide tables and modals for challenge creation and editing.
	- Show scheduled vs active vs expired states.
- Dashboard shows only active/published challenges to users.

#### Sequence Flow

```text
Admin → Browser → POST /api/challenges
			→ Worker → auth+requireAdmin → R2:PUT pdf → D1:INSERT challenges → JSON response
User  → Browser → GET /api/challenges
			→ Worker → auth → D1:SELECT (publish_at <= now, last_date >= today) → JSON list
```

#### Security Considerations

- File uploads restricted to configured size and MIME types.
- Only admins can create, edit, or delete challenges.
- Answer PDF access limited to admins/evaluators.

---

### 9.3 Submissions & Grading

#### Purpose

Enable participants to submit solutions and enable admins to evaluate them, award points, and send feedback.

#### Workflow

1. User selects a challenge and opens its submission modal.
2. Browser calls `POST /api/challenges/:id/submit` with solution text and optional file.
3. Handler:
	 - Validates that the user is authenticated.
	 - Validates deadline and that challenge is not expired.
	 - Stores file in R2 and upserts into `submissions`.
4. Admin opens submissions list via `GET /api/challenges/:id/submissions`.
5. For each submission, admin selects grade and enters remark.
6. Browser calls `PATCH /api/submissions/:id/grade`.
7. Handler:
	 - Updates submission grade, points, and evaluated_at.
	 - Recomputes user total points and checks for new reward unlocks.
	 - Sends notification email with grade and feedback.

#### API Endpoints

- `POST /api/challenges/:id/submit`
- `GET /api/challenges/:id/my-submission`
- `DELETE /api/challenges/:id/my-submission`
- `GET /api/challenges/:id/submissions`
- `GET /api/submissions/:id/file`
- `PATCH /api/submissions/:id/grade`

#### Database Changes

- Upsert into `submissions` keyed by `(challenge_id, user_id)`.
- Update `points` and `grade` upon grading.
- Trigger logic in handlers to insert or update `user_rewards` and `bonus_points` if necessary.

#### Backend Logic

- Grading policy maps to points, e.g., `wrong=0`, `partial=5`, `almost=15`, `correct=20`.
- Rewards unlock when cumulative points cross reward tier thresholds.
- Files stored in R2, keyed by user and challenge for uniqueness.

#### Frontend Implementation

- public/assets/js/challenges.js and public/assets/js/dashboard.js provide:
	- Submission forms and file pickers.
	- Lists of submissions with filters.
	- Grading UI for admins with dropdowns and remark fields.

#### Sequence Flow

```text
User → Browser (form) → POST /api/challenges/:id/submit
		 → Worker → auth → validate deadline → R2:PUT file → D1:INSERT/UPDATE submissions → response

Admin → Browser → GET /api/challenges/:id/submissions
			→ Worker → requireAdmin → D1:SELECT submissions JOIN users → JSON

Admin → Browser → PATCH /api/submissions/:id/grade
			→ Worker → requireAdmin → D1:UPDATE submissions → update points & rewards → Email API
```

#### Security Considerations

- Only owners can delete their own submissions.
- Only admins can access list of all submissions and grade them.
- File uploads sanitized and stored outside of executable context.

---

#### Plagiarism Detection and Similarity Analysis

Plagiarism detection in **Challenge Accepted** is implemented as an **admin-only similarity analysis** that runs whenever an administrator views the submissions for a particular challenge. The goal is not to make a binary “plagiarized / not plagiarized” decision, but to provide rich evidence and ranked similarity scores so that human evaluators can make informed judgments.

At a high level, for each challenge the system:

1. Fetches all submissions and their `solution_text` fields.
2. Preprocesses each text into a normalized representation.
3. Computes multiple similarity signals between every pair of submissions.
4. Aggregates those signals into a single composite score between 0 and 1.
5. Converts that score into a percentage, assigns a qualitative risk level (`low`, `medium`, `high`), and surfaces the **most suspicious match** for each submission along with explanatory details.

##### Text Normalization

The function `normalizeText()` converts raw solution text into a canonical form:

- Lowercases the entire string.
- Collapses all whitespace into single spaces.
- Trims leading and trailing spaces.

The function `wordList()` further processes this normalized text by:

- Removing non-alphanumeric characters (except spaces).
- Splitting on whitespace into tokens.
- Filtering out very short tokens (length ≤ 2), which tend to be stop words or noise.

From this, the algorithm derives multiple intermediate structures for each submission:

- `words`: ordered array of tokens.
- `uniqueWords`: set of distinct tokens.
- `word3Grams`: set of all contiguous 3-word phrases.
- `char5Grams`: frequency map of all contiguous 5-character sequences (after whitespace normalization).

##### Pairwise Similarity Metrics

For each pair of submissions \(A\) and \(B\) for the same challenge, the system computes:

1. **Unique-word Jaccard similarity**  
	Let \(U_A\) and \(U_B\) be the sets of unique tokens in A and B.  
	The Jaccard index is:

	$$ J(U_A, U_B) = \frac{|U_A \cap U_B|}{|U_A \cup U_B|} $$

	This captures vocabulary overlap regardless of exact phrase ordering.

2. **3-gram phrase Jaccard similarity**  
	Using `wordNGrams(words, 3)`, the algorithm forms sets of 3-word sequences (e.g., “binary search tree”). The same Jaccard formula is applied to these sets. This heavily rewards submissions that reuse entire short phrases, which is a stronger plagiarism signal than sharing isolated words.

3. **Character 5-gram cosine similarity**  
	Using `charNGramFreq(text, 5)`, each submission is represented as a sparse vector of 5-character n‑gram frequencies. Cosine similarity is then computed:

	$$ \text{cosine}(A,B) = \frac{\sum_i a_i b_i}{\sqrt{\sum_i a_i^2} \cdot \sqrt{\sum_i b_i^2}} $$

	This metric is sensitive to shared low-level structure (e.g., identical variable naming and punctuation patterns) even if spacing varies.

4. **Longest common contiguous word run**  
	`longestCommonContiguousRun(wordsA, wordsB)` computes the maximum length of any contiguous matching word sequence between A and B using a dynamic programming approach. This value is then normalized to a 0–1 score by dividing by 12 and capping at 1, so that very long identical passages contribute strongly but do not dominate all other signals.

5. **Overlap phrases (evidence snippets)**  
	`topOverlapPhrases(a3, b3)` extracts up to three explicit 3-word phrases that appear in both submissions. These are not directly part of the numerical score, but they are returned as human-readable evidence in the plagiarism details.

##### Composite Score and Risk Level

For each pair, the helper `compositeSimilarity(a, b)` combines the metrics into a single score:

- `uniqueWordJaccard` is weighted 0.30.
- `phrase3GramJaccard` is weighted 0.35.
- `char5GramCosine` is weighted 0.20.
- Normalized longest run length is weighted 0.15.

This yields a final similarity score in \([0,1]\), which is later converted to a percentage. The mapping from percentage to qualitative **risk level** is implemented by `scoreToRisk(percent)`:

- `high` if percentage ≥ 75.
- `medium` if 50 ≤ percentage < 75.
- `low` if percentage < 50.

Additionally, the algorithm enforces a **minimum text length** threshold: submissions with fewer than 18 tokens are considered too short for robust analysis. For such cases, plagiarism fields are left null to avoid misleading signals.

##### Per‑Submission Aggregation

The function `buildPlagiarismStats(submissions)` computes, for each submission, the **single most suspicious counterpart**:

- Iterates over all other submissions in the same challenge.
- Tracks the pair with the highest composite similarity score.
- Stores, for that source submission:
  - `plagiarism_percent`: rounded percentage for the best match (or `null` if below length threshold).
  - `plagiarism_with`: name of the user whose submission is the closest match.
  - `plagiarism_details`: object containing:
	 - `risk_level` (`low`/`medium`/`high`).
	 - `compared_word_count` (token count of the source submission).
	 - Individual component scores (`unique_word_jaccard`, `phrase_overlap_3gram`, `char_pattern_similarity`).
	 - `longest_common_run_words` (length of the longest contiguous run).
	 - `overlap_phrases` (sample common 3-word phrases).

These stats are attached to each submission returned by `handleListSubmissions()` as:

- `plagiarism_percent`
- `plagiarism_with`
- `plagiarism_details`

##### Frontend Visualization

On the admin submissions view (dashboard admin modal), the UI:

- Displays the **overall similarity percentage** and the **name of the closest matching user** per submission.
- Highlights the **risk level** using color-coded badges (e.g., green for low, amber for medium, red for high).
- Shows a breakdown panel with:
  - Word count and component metric percentages.
  - Longest common run length.
  - A short list of overlapping phrases as concrete evidence.

This view is strictly available to admins and is designed as a **decision-support tool**. It flags potentially suspicious similarities while still requiring human judgment, acknowledging that:

- High similarity can arise from very constrained problem statements or standard algorithm templates.
- Low similarity does not guarantee originality but indicates no strong evidence of copying.

##### Algorithm Pseudo-code

For a single challenge, the plagiarism routine can be summarized as:

1. **Collect submissions**  
	`S = list of submissions with non-empty solution_text`  
	For each `s ∈ S`:
	- `s.norm = normalizeText(s.solution_text)`
	- `s.words = wordList(s.norm)`
	- if `len(s.words) < 18`: mark `s` as too short and skip similarity scoring.
	- `s.unique = set(s.words)`
	- `s.word3 = wordNGrams(s.words, 3)`
	- `s.char5 = charNGramFreq(s.norm, 5)`

2. **Compute pairwise scores**  
	For each ordered pair `(i, j)` with `i ≠ j` and both not too short:
	- `uw = jaccard(s[i].unique, s[j].unique)`
	- `p3 = jaccard(s[i].word3, s[j].word3)`
	- `c5 = cosine(s[i].char5, s[j].char5)`
	- `run = longestCommonContiguousRun(s[i].words, s[j].words)`
	- `runNorm = min(run / 12, 1)`
	- `score = 0.30*uw + 0.35*p3 + 0.20*c5 + 0.15*runNorm`
	- `percent = round(score * 100)`
	- `risk = scoreToRisk(percent)`
	- `phrases = topOverlapPhrases(s[i].word3, s[j].word3)`

3. **Keep best match per submission**  
	For each `i`:
	- Find `j` that maximizes `score(i, j)`.
	- If no valid `j`, set plagiarism fields to null.
	- Otherwise attach to submission `i`:
	  - `plagiarism_percent = percent(i, j)`
	  - `plagiarism_with = user_name(j)`
	  - `plagiarism_details = { risk_level, compared_word_count, uw, p3, c5, run, phrases }`.

4. **Return to frontend**  
	Embed these plagiarism fields into the JSON payload for `GET /api/challenges/:id/submissions` so the admin UI can render badges, percentages, and evidence snippets.

---

### 9.4 Rewards & Gamification

#### Purpose

Encourage consistent participation through reward tiers and point-based incentives.

#### Workflow

1. Points are accumulated from graded submissions and bonus_points records.
2. On each grading or bonus assignment, the system recomputes total points per user.
3. When a user crosses a reward tier threshold, a row in `user_rewards` is created or updated with `status="unlocked"`.
4. On dashboard, user sees unlocked rewards and can click “Claim”.
5. Claim adds metadata to `user_rewards` and optionally generates admin work.
6. Admin views pending claims in admin rewards interface and marks them as “fulfilled” or “rejected”.
7. Optionally, user can “pass” a reward to another user by email.

#### API Endpoints

- `GET /api/rewards`
- `POST /api/rewards/:id/claim`
- `POST /api/rewards/:id/pass`
- `GET /api/admin/rewards/tiers`
- `PATCH /api/admin/rewards/tiers/:id`
- `GET /api/admin/rewards/claims`
- `PATCH /api/admin/rewards/claims/:id/fulfill`
- `PATCH /api/admin/rewards/claims/:id/reject`

#### Database Changes

- `user_rewards` rows created/updated with status transitions.
- `bonus_points` inserted for admin-granted incentives.
- Reward tiers seeded in db.sql with default prizes.

#### Backend Logic

- Total points = sum(submission points) + sum(bonus_points.points) − sum(user_rewards.points_consumed).
- On unlocking new tiers, the system ensures uniqueness per user and reward.

#### Frontend Implementation

- Dashboard shows:
	- Current points.
	- Available rewards, locked/unlocked states, and next threshold.
- public/admin-rewards.html and public/assets/js/admin-rewards.js provide:
	- A list of reward tiers with configurable points_required and active flags.
	- A table of claims with actions: fulfill, reject.

#### Sequence Flow

```text
Admin → grade submission → Worker → recompute total points → D1:INSERT/UPDATE user_rewards
User  → dashboard → GET /api/rewards
			→ Worker → auth → D1:JOIN rewards,user_rewards → JSON
User  → claim reward → POST /api/rewards/:id/claim → Worker → D1:UPDATE user_rewards.status
Admin → view claims → GET /api/admin/rewards/claims → Worker → requireAdmin → D1:SELECT
Admin → fulfill → PATCH /api/admin/rewards/claims/:id/fulfill → D1:UPDATE → Email user
```

#### Security Considerations

- Only admins can adjust tiers and fulfill/reject claims.
- Passing rewards validates target user existence or invites them to sign up.

---

### 9.5 Leaderboard & Streaks

#### Purpose

Provide a ranking system and streak indicators to motivate regular participation.

#### Workflow

1. Total points and submission dates are derived from `submissions` and `bonus_points`.
2. src/handlers/user/leaderboard.js aggregates:
	 - Total earned points.
	 - Current streak and best streak using src/utils/streaks.js.
3. Leaderboard endpoints return sorted lists of users, excluding admins.
4. Dashboard displays top N users and the current user’s relative position.

#### API Endpoints

- `GET /api/leaderboard`

#### Database Changes

- Read-only in normal usage, based on `users`, `submissions`, and `bonus_points`.

#### Backend Logic

- Streak computation:
	- Normalizes submission timestamps to dates.
	- Sorts them and counts consecutive days.
	- Maintains current streak and best streak.

#### Frontend Implementation

- public/assets/js/dashboard.js renders:
	- A card listing top users with rank, initials, and points.
	- User’s current and longest streaks.

#### Sequence Flow

```text
User → Browser → GET /api/leaderboard
		 → Worker → auth → D1:aggregate points & dates → streaks.js → JSON
		 → Browser → render leaderboard cards
```

#### Security Considerations

- Admins excluded from leaderboard to avoid bias.
- Only aggregated, non-sensitive stats are exposed.

---

### 9.6 Comments & Moderation

#### Purpose

Provide threaded challenge discussions with anti-abuse mechanisms.

#### Workflow

1. User loads challenge; browser calls `GET /api/challenges/:id/comments`.
2. Worker returns nested comments with reactions and hidden states.
3. Posting a comment:
	 - Browser calls `POST /api/challenges/:id/comments`.
	 - Worker validates cooldown interval and profanity via src/utils/commentModeration.js.
	 - Inserts into `challenge_comments`.
4. Reactions (like/dislike) are updated via `POST /api/comments/:id/reaction`.
5. Reporting:
	 - Any user can report another user’s comment once using `POST /api/comments/:id/report`.
	 - Worker inserts into `comment_reports`.
6. Admin hides/unhides a comment via `PATCH /api/comments/:id/hide`.
7. Admin lists and clears reports via `/api/admin/comments/reports` and `/api/admin/comments/:id/reports`.

#### API Endpoints

- `GET /api/challenges/:id/comments`
- `POST /api/challenges/:id/comments`
- `PATCH /api/comments/:id`
- `DELETE /api/comments/:id`
- `POST /api/comments/:id/reaction`
- `PATCH /api/comments/:id/pin`
- `POST /api/comments/:id/report`
- `PATCH /api/comments/:id/hide`
- `GET /api/admin/comments/reports`
- `DELETE /api/admin/comments/:id/reports`

#### Database Changes

- Inserts into `challenge_comments`, `comment_reactions`, and `comment_reports`.
- Updates `is_pinned`, `is_hidden`, and `hidden_reason`.
- Cascading deletes for comments and reactions upon deleting a user or challenge.

#### Backend Logic

- Cooldown enforcement using latest comment timestamps per user.
- Profanity detection by word list and regex patterns.
- Aggregation of reports for admin (count, last reported time, reasons).
- Comments hidden from non-admins, but visible (with additional metadata) to admins.

#### Frontend Implementation

- public/assets/js/dashboard.js handles:
	- Rendering nested comments and replies.
	- Reporting and hide/unhide actions.
	- Showing placeholders for hidden comments (“This comment has been hidden by admin”).

#### Sequence Flow

```text
User → GET /api/challenges/:id/comments → render comments
User → POST /api/challenges/:id/comments → Worker → moderation checks → D1:INSERT
User → POST /api/comments/:id/report → Worker → D1:INSERT comment_reports
Admin → GET /api/admin/comments/reports → Worker → requireAdmin → D1:GROUP BY comment_id
Admin → PATCH /api/comments/:id/hide → D1:UPDATE challenge_comments
```

#### Security Considerations

- Only admins can hide/unhide comments and clear reports.
- Users cannot report or react to their own comments (depending on policy).
- Strong filtering to prevent abusive content and UI to surface reasons to admins.

---

### 9.7 AI Challenge Auto-Posting

#### Purpose

Automate generation and posting of new challenges to ensure a continuous supply of weekly tasks.

#### Workflow

1. Cron trigger executes every 30 minutes.
2. src/jobs/autoPostChallenge.js:
	 - Checks environment variable `AI_AUTO_POST_ENABLED`.
	 - Ensures that no auto challenge has been posted in the last N minutes to avoid flooding.
	 - Fetches configuration like `AI_CHALLENGE_TOPIC` and `CLAUDE_MODEL`.
3. Worker calls src/services/claudeChallenge.js to:
	 - Build an LLM prompt specifying difficulty, structure, and constraints.
	 - Parse returned JSON with `title`, `description`, `problem_statement`, `answer_description`, and `deadline_days`.
4. Worker:
	 - Generates a PDF using src/utils/pdf.js.
	 - Uploads PDF to R2.
	 - Inserts a new challenge in D1, often as published immediately or scheduled.
	 - Optionally notifies users via email.

#### API Endpoints

- `POST /api/admin/challenges/auto-post` (manual trigger, admin only).
- Cron-triggered internal handler via the Worker’s `scheduled` event.

#### Database Changes

- Inserts into `challenges` with AI-generated content.

#### Backend Logic

- Debounce logic to avoid oversupplying challenges.
- Error handling when LLM or email service is unavailable.

#### Frontend Implementation

- Admin dashboards expose a “Auto Post Now” button that calls the manual endpoint, primarily for demo or testing.

#### Security Considerations

- Manual trigger accessible only by admins.
- Rate limiting to avoid expensive or unintended repeated LLM calls.

---

## 10. API Design

The table below summarizes key public and admin APIs. Request/response bodies are described at a high level.

| Method | Endpoint                                   | Description                                   | Request (Body/Params)                                                                 | Response (Body)                                                 |
|--------|---------------------------------------------|-----------------------------------------------|----------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| POST   | `/api/auth/request-otp`                    | Request OTP for login                          | JSON: `{ "email", "name" }`                                                           | `{ message }`                                                    |
| POST   | `/api/auth/verify-otp`                     | Verify OTP and create session                  | JSON: `{ "email", "otp" }`                                                            | `{ user: { id, name, email, role } }` (Set-Cookie header)       |
| POST   | `/api/auth/logout`                         | Logout and clear session                       | none                                                                                   | `{ message }`                                                    |
| GET    | `/api/user/me`                             | Get profile of logged-in user                  | Cookie                                                                                | `{ id, name, email, role, points, streaks }`                    |
| GET    | `/api/leaderboard`                         | Get leaderboard                                | Cookie                                                                                | Array of user stats                                             |
| POST   | `/api/challenges`                          | Create challenge (admin)                       | Multipart: `title, description, last_date, pdf, answer_pdf?, publish_at?`             | Challenge object                                                 |
| GET    | `/api/challenges`                          | List challenges                                | Query params: filters (optional)                                                      | Array of challenges                                              |
| PATCH  | `/api/challenges/:id`                      | Edit challenge (admin)                         | Multipart or JSON for updates                                                         | Updated challenge                                                |
| DELETE | `/api/challenges/:id`                      | Delete challenge (admin)                       | Path param: `id`                                                                      | `{ message }`                                                    |
| POST   | `/api/challenges/:id/expire`               | Mark challenge as expired (admin)              | Path param: `id`                                                                      | `{ message }`                                                    |
| POST   | `/api/challenges/:id/reopen`               | Reopen expired challenge (admin)               | Path param: `id`                                                                      | `{ message }`                                                    |
| GET    | `/api/challenges/:id/download`             | Download challenge PDF                         | Path param: `id`                                                                      | Binary stream (PDF)                                             |
| GET    | `/api/challenges/:id/answer`               | Download answer PDF (admin)                    | Path param: `id`                                                                      | Binary stream (PDF)                                             |
| POST   | `/api/challenges/:id/submit`               | Submit solution                                | Multipart: `solution_text, file?`                                                     | Submission object                                               |
| GET    | `/api/challenges/:id/my-submission`        | Get my submission for a challenge              | Path param: `id`                                                                      | Submission object or null                                       |
| DELETE | `/api/challenges/:id/my-submission`        | Delete my submission                           | Path param: `id`                                                                      | `{ message }`                                                    |
| GET    | `/api/challenges/:id/submissions`          | List all submissions (admin)                   | Path param: `id`                                                                      | Array of submissions                                             |
| GET    | `/api/submissions/:id/file`                | Download submission file                       | Path param: `id`                                                                      | Binary stream                                                   |
| PATCH  | `/api/submissions/:id/grade`               | Grade submission (admin)                       | JSON: `{ grade, remark }`                                                             | Updated submission                                               |
| GET    | `/api/challenges/:id/comments`             | List comments for a challenge                  | Path param: `id`                                                                      | Nested comment structure                                        |
| POST   | `/api/challenges/:id/comments`             | Post comment                                   | JSON: `{ content, parent_id? }`                                                       | Comment object                                                  |
| PATCH  | `/api/comments/:id`                        | Edit comment                                   | Path param: `id`, JSON: `{ content }`                                                | Updated comment                                                  |
| DELETE | `/api/comments/:id`                        | Delete comment                                 | Path param: `id`                                                                      | `{ message }`                                                    |
| POST   | `/api/comments/:id/reaction`               | React to comment                               | JSON: `{ reaction: "like" | "dislike" }`                                            | Aggregated reaction counts                                      |
| PATCH  | `/api/comments/:id/pin`                    | Pin/unpin comment (admin)                      | JSON: `{ is_pinned }`                                                                 | Updated comment                                                  |
| POST   | `/api/comments/:id/report`                 | Report comment                                 | JSON: `{ reason? }`                                                                   | `{ message }`                                                    |
| PATCH  | `/api/comments/:id/hide`                   | Hide/unhide comment (admin)                    | JSON: `{ is_hidden, reason? }`                                                        | Updated comment                                                  |
| GET    | `/api/admin/comments/reports`              | List reported comments (admin)                 | none                                                                                   | Aggregated report summaries                                     |
| DELETE | `/api/admin/comments/:id/reports`          | Clear reports for a comment (admin)            | Path param: comment id                                                                | `{ message }`                                                    |
| GET    | `/api/rewards`                             | List rewards and my unlock status              | Cookie                                                                                | Array of reward + status objects                                |
| POST   | `/api/rewards/:id/claim`                   | Claim reward                                   | Path param: reward id                                                                 | Updated user_reward record                                      |
| POST   | `/api/rewards/:id/pass`                    | Pass reward                                    | JSON: `{ target_email }`                                                              | Updated user_reward / transfer result                           |
| GET    | `/api/admin/rewards/tiers`                 | List reward tiers (admin)                      | none                                                                                   | Array of reward tiers                                           |
| PATCH  | `/api/admin/rewards/tiers/:id`             | Update reward tier (admin)                     | JSON: `{ title?, description?, points_required?, active? }`                           | Updated reward tier                                             |
| GET    | `/api/admin/rewards/claims`                | List pending reward claims (admin)             | none                                                                                   | Array of claims                                                 |
| PATCH  | `/api/admin/rewards/claims/:id/fulfill`    | Fulfill reward claim (admin)                   | JSON: `{ note? }`                                                                     | Updated claim                                                   |
| PATCH  | `/api/admin/rewards/claims/:id/reject`     | Reject reward claim (admin)                    | JSON: `{ reason? }`                                                                   | Updated claim                                                   |
| GET    | `/api/admin/users`                         | List users with stats (admin)                  | none                                                                                   | Array of user stats                                             |
| PATCH  | `/api/admin/users/:id/points`              | Adjust bonus points (admin)                    | JSON: `{ delta, reason }`                                                             | Updated user stats                                              |
| DELETE | `/api/admin/users/:id`                     | Delete user (admin)                            | Path param: user id                                                                   | `{ message }`                                                    |
| POST   | `/api/admin/challenges/auto-post`          | Manually trigger AI auto-post (admin)          | JSON: optional overrides (e.g., difficulty)                                           | AI-generated challenge object                                   |

---

## 11. Authentication & Authorization

The template references “JWT flow”; in this system, **KV-backed sessions and HttpOnly cookies are used instead of JWTs**. The security guarantees are equivalent or stronger for this use case because tokens are never exposed to client-side scripts.

### Session Flow (JWT-Equivalent)

1. **Authentication**  
	 - User requests an OTP, receives it via email, and submits it to the server.
	 - Server verifies OTP against hashed entry in D1.

2. **Session Creation**  
	 - Server generates a random session ID.
	 - Stores `{ userId, name, email, role, expiresAt }` in KV with TTL.
	 - Sends a `Set-Cookie` header with the session ID, flagged as HttpOnly, Secure, and SameSite=Strict.

3. **Session Usage**  
	 - Each subsequent request includes the cookie.
	 - auth middleware loads and validates session from KV.

4. **Session Termination**  
	 - On logout, KV entry is deleted, and cookie is invalidated.
	 - Expired sessions are naturally dropped by TTL and by validation checks.

### Token Refresh

Current behavior uses **fixed-lifetime sessions**; an enhancement could extend TTL on activity. The design supports this by updating `expiresAt` and resetting KV TTL during authenticated requests.

### Security Design

- **No Credentials in Local Storage**: Tokens are never accessible to JavaScript, eliminating a common XSS attack vector seen with JWT in localStorage.
- **Short-Lived OTPs**: OTPs are valid for a short time window and single use.
- **Role-Based Authorization**: RBAC is enforced by `requireAdmin` middleware and by checks in handlers.
- **Least Privilege**: Endpoints are scoped carefully; for example, only admin routes expose user lists or submission grading.

---

## 12. Deployment Architecture

### Local Setup

- Developers install Node.js and npm.
- `npm install` installs Wrangler as a dev dependency plus required modules.
- `npm run dev` runs `wrangler dev`, which:
	- Spins up a local Worker instance.
	- Provides an emulated D1 instance and KV namespace.
	- Serves static files from the `public/` directory at a local URL.

Database initialization options for local development:

- `npm run db:init` executes schema.sql against the local D1 database.
- For the full schema used in production, developers can execute db.sql via `npx wrangler d1 execute auth-db --file=./db.sql`.

### Production Setup

- Production deployment is handled via `npm run deploy` which runs `wrangler deploy`.
- wrangler.toml defines:
	- Worker main script (`src/index.js`).
	- D1 binding to `auth-db`.
	- KV binding for `SESSIONS`.
	- R2 bucket binding for `challenge-pdfs`.
	- Cron trigger for the auto-posting job.

The Cloudflare dashboard is used to:

- Configure custom domain mappings (e.g., `weekly-architecture.example.com`).
- View D1 tables, KV keys, and R2 objects.
- Monitor cron execution logs and Worker performance.

### Docker Usage

The current solution does not require Docker in production because Cloudflare Workers execute directly on the edge. However, Docker could be introduced in future for:

- Local reproducible dev environments (e.g., encapsulating Wrangler and Node).
- CI pipelines that run tests and `wrangler deploy` within isolated containers.

### Reverse Proxy and Domain Routing

Cloudflare itself acts as the reverse proxy:

- HTTPS termination is done at Cloudflare’s edge.
- Routes under `/` serve static HTML and assets.
- Routes under `/api/*` are dispatched to the Worker’s API router.
- CORS is configured to support cross-origin dev setups when needed.

---

## 13. Scalability Design

### Horizontal Scaling

- Workers scale horizontally by design, as Cloudflare automatically provisions as many instances as required across its network.
- Because session state is stored in KV and business state in D1/R2, Worker instances remain stateless.

### Database Scaling

- D1 is suited for the project scale (course-level or departmental usage).
- Indexes ensure that reads for active challenges, submissions, comments, and rewards remain efficient.
- Heavy analytics workloads can be offloaded to periodic export jobs if needed.

### Caching

- Cloudflare edge caching can be applied to:
	- Static assets (HTML, CSS, JS) with long TTL.
	- Possibly to leaderboard or challenge listings if they are not rapidly changing.
- KV can be used for lightweight caching of computed stats (e.g., leaderboard snapshots) if performance demands increase.

---

## 14. Performance Considerations

### Lazy Loading

- Submissions and comments are loaded **on demand**:
	- The dashboard initially retrieves only challenge lists and essential profile data.
	- Full submission and comments lists are fetched when user opens specific modals or sections.

### Query Optimization

- All high-traffic queries use indexes (e.g., challenges by `publish_at` and `last_date`, comments by `challenge_id`).
- Aggregate queries (for leaderboard and streaks) are carefully written to minimize joins and compute heavy operations only when needed.

### API Optimization

- APIs return only relevant fields, reducing payload size. For example:
	- Leaderboard responses omit sensitive information such as email.
- Use of HTTP/2 multiplexing over Cloudflare’s network minimizes latency and overhead for multiple concurrent requests.

---

## 15. Security Design

### Input Validation

- All endpoints validate inputs for:
	- Scalar fields: length, type, allowed characters.
	- Enum fields: grade, reaction, status.
	- Dates and timestamps: valid ISO or YYYY-MM-DD formats.
- Malformed requests receive structured error responses.

### SQL Injection Prevention

- D1 queries use parameterized statements:
	- No string concatenation of user input into SQL.
- Constraints (unique, foreign keys) further prevent inconsistent data injection.

### XSS Protection

- Comments and user-supplied content are HTML-escaped before insertion into the DOM.
- Scripts rely on textContent instead of innerHTML where possible.
- HttpOnly cookies prevent stealing session identifiers via injected scripts.

### Authentication Security

- OTP codes have strict time windows and single-use flags.
- High-value operations (e.g., grading, reward fulfillment, user deletion) require admin role.
- Sessions stored server-side; revocation is immediate once KV entries are deleted.

---

## 16. Future Enhancements

Potential enhancements include:

- Integrating a sandboxed code execution engine to auto-grade programming questions.
- Adding deeper plagiarism detection using external services and diff visualizations.
- Implementing sophisticated analytics dashboards for administrators (engagement, difficulty, cohort performance).
- Introducing SSO integration with institutional identity providers.
- Implementing full CI/CD via GitHub Actions and Wrangler, including automated testing and linting.
- Extending the frontend to a SPA using React or Vue for more complex interactions.
- Providing a mobile-optimized PWA and push notifications.
- Allowing configurable rubrics and multi-evaluator workflows for grading.

---

## 17. Conclusion

Challenge Accepted demonstrates a complete, production-grade architecture for a weekly coding challenge platform fully hosted on Cloudflare’s serverless stack. It solves practical problems of challenge distribution, structured submissions, grading, gamification, and moderation with minimal infrastructure overhead. The design makes informed use of modern cloud-native components—Workers, D1, KV, R2, and Cron—to build an end-to-end system that is highly available, secure, and scalable for institutional use.

From an academic perspective, this project showcases:

- Application of software engineering best practices: layered architecture, normalized data modeling, input validation, security hardening, and modular code organization.
- Effective use of serverless paradigms and edge computing to minimize operational complexity.
- Integration of AI services to automate content generation within well-defined boundaries.

From an industry standpoint, the system is ready to be extended into a full-fledged challenge platform for organizations seeking a customizable, cloud-native solution for continuous learning and assessment.
