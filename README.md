# ⚡ BiteSpeed Backend Task: Identity Reconciliation

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

> **BiteSpeed Software Engineering Assignment** > **Built with a Builder-Breaker Mindset: Secure, Optimized, and Scalable.**

An advanced, production-ready microservice engineered to continually consolidate scattered customer contact information (emails and phone numbers) into unified Identity Clusters. This ensures that users, like "Doc Brown" at FluxKart, receive a seamless and personalized experience regardless of how many different contact methods they use.

---

## ✅ Task Submission Checklist
- [x] **1. Publish to GitHub:** Repository is public and strictly documented.
- [x] **2. Insightful Commits:** Development history is tracked with atomic, descriptive commits.
- [x] **3. Expose Endpoint:** The `/identify` route is fully operational.
- [x] **4. Host Online:** Successfully deployed via Render using a PostgreSQL database.
- [x] **5. JSON Payload:** The API strictly consumes and validates `application/json` payloads.

---

## 🌐 Live Deployment Endpoint

The service is fully deployed and ready for testing. 

**`POST`** `https://identity-reconciliation-7614.onrender.com/identify`

> **Note:** Please ensure you are sending raw JSON bodies (`application/json`) in your requests. Form-data is strictly rejected for security and consistency.

---

## 🧠 The Architecture & Graph-Merging Logic

To link various orders made with different, overlapping contact information, this service essentially builds and evaluates **Connected Components** in a Graph network. Each user interaction acts as a node, and overlapping `email` or `phoneNumber` values form the edges connecting these nodes.

The core algorithm performs these operations dynamically in an ACID-compliant transaction:
1. **The New Identity:** A completely unseen email and phone pair creates a fresh absolute root (a `primary` contact).
2. **The Exact Match:** If the payload introduces no new distinct nodes to the cluster, the system simply traverses the existing subgraph and returns the consolidated identity payload.
3. **The Extension:** If a payload matches an existing identity but introduces either a new email or phone number, the graph is extended. A `secondary` node is attached directly to the absolute root to keep tree depth flat for `O(1)` traverse time.
4. **The Merger (Graph Consolidation): [CRITICAL]** When a payload bridges two *previously separate* identity clusters (e.g., matching Primary A's email and Primary B's phone), the algorithm identifies the oldest node chronologically as the true absolute root. It then repoints Primary B (and all of Primary B's existing secondary nodes) directly to Primary A in a simultaneous database transaction. This ensures referential integrity and optimized lookup efficiency for future queries.

---

## 🔒 Security Focus

As an engineer with a strong Application Security background (Meta Security Engineering Intern Finalist), I prioritize defensively written code. The system does not just perform identity operations; it actively mitigates standard OWASP vulnerabilities:
- **Injection Attacks Mitigation (SQLi):** Direct usage of Prisma ORM prevents arbitrary payload execution and SQL injection attacks entirely.
- **Payload & Input Validation:** Strict schema validation via `Zod` blocks malformed requests, enforces rigorous data typing, and sanitizes input payloads (e.g., whitespace trimming).
- **DDoS Protection:** Express instances enforce payload limit caps (`10kb`) to prevent memory exhaustion from overwhelmingly large JSON bodies.
- **HTTP Header Hardening:** Integration with `Helmet` systematically protects Express responses from standard XSS vulnerabilities and clickjacking by setting strict HTTP headers.
- **Race Condition Prevention:** The critical Graph Merger logic is wrapped in a single `$transaction` block, natively avoiding TOCTOU (Time-of-Check to Time-of-Use) concurrency vulnerabilities during multi-node repointing.
- **Information Disclosure:** The system utilizes robust error boundaries that trap failures and return graceful `HTTP 500`s without leaking valuable stack traces to potential adversaries.

---

## 📖 API Documentation

### `POST /identify`
Analyzes the incoming contact payload, links it to existing identities if a match is found, or creates a new identity cluster.

**Request Body**
```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}

```
**Example Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

---

