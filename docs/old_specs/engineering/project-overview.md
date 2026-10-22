# Bioeksen Portal - Project Overview

## 1. Executive Summary

Bioeksen Portal is a corporate product information and learning platform for Bioeksen. It combines two primary product-facing capabilities under one portal:

1. **e-IFU** - controlled access to applicable Instructions for Use.
2. **Academy** - authenticated, version-controlled training, assessment, simulation, and certification.

The platform is product-centric. e-IFU and Academy share a canonical Product Master rather than maintaining separate product identities.

The initial implementation is a modular monolith using TypeScript/NestJS, React/TypeScript, PostgreSQL, Redis where justified, and S3-compatible object storage. The repository is a monorepo (ADR-0015).

## 2. Business Purpose

The portal is intended to:

- provide users with the correct IFU for the Bioeksen product and LOT in their possession;
- preserve historical IFU traceability;
- collect controlled access analytics for e-IFU;
- provide customer, distributor, and internal training;
- support interactive learning beyond static PDF/video courses;
- track learning progress, assessments, required training, deadlines, and certificates;
- support corporate governance, auditability, and controlled content changes;
- provide a foundation for future product support capabilities without redesigning product identity.

## 3. Platform Identity

Product name: **Bioeksen Portal**.

Primary visible areas:

- **e-IFU**
- **Academy**

The portal may later grow to support additional product-support capabilities, but current engineering must not turn it into a generic CMS or generic LMS.

## 4. Core Architecture Principles

- Modular monolith, not microservices by default.
- Monorepo.
- Product is the canonical identity shared across modules.
- Server-side business rules are authoritative.
- Controlled/published content must remain traceable.
- Historical states must be reproducible where the business process requires them.
- Administrative configuration must be declarative data, not executable code.
- Turkish and English user experience; English engineering language.
- Data residency target is Turkey.

## 5. e-IFU Overview

e-IFU is accessible without a registered account.

A user supplies:

- Catalog Number;
- LOT Number;
- email;
- applicable legal/privacy acknowledgement;
- first name and last name may later be required by policy.

Example business identifiers:

- Catalog Number: `BS-GHPV-L-100`
- LOT Number: `B2603091224GHPVV`

Bioeksen LOT rule: after the initial `B`, the next six digits currently encode manufacturing date in `YYMMDD` format. Therefore `260309` means **2026-03-09**.

The LOT string remains the immutable business identifier. The parsed date is stored separately as `manufacturing_date`.

The resolver identifies the Product through Catalog Number and determines the applicable IFU version based primarily on LOT manufacturing date and IFU effective periods. A specific authorized LOT override may supersede normal resolution and must be audited.

All language files available for the resolved IFU version are presented. For example, Turkish, English, and German files may all be available for download.

Historical/superseded IFUs remain retrievable for historical LOTs.

## 6. e-IFU Published File Correction

IFUs are approved in Bioeksen's existing quality system before portal upload. The portal is not the primary quality-approval system for IFU content.

If an already published IFU file was uploaded incorrectly, an authorized user may replace the file while preserving:

- the same business document version where appropriate;
- previous file reference/hash;
- replacement file reference/hash;
- actor;
- timestamp;
- reason;
- audit history.

The old published file must not disappear from traceability simply because users no longer see it.

## 7. Academy Overview

Academy requires authentication. Initial accounts are created by authorized administrators; there is no public self-registration requirement.

Academy supports:

- internal Bioeksen training;
- customer training;
- distributor training;
- organization-based and user-specific assignments;
- required/optional training;
- optional deadlines;
- assessments;
- interactive activities;
- certificates;
- recertification;
- analytics.

## 8. Organization Model

Organization types:

- `INTERNAL`
- `CUSTOMER`
- `DISTRIBUTOR`

A user has one identity and may hold memberships/roles rather than being represented by separate user tables.

Distributor-to-Customer relationships are supported in the domain model. Distributor management rights are explicitly permissioned and do not imply rights to create, edit, approve, or publish Bioeksen-owned training content.

## 9. Academy Roles and Permissions

Initial conceptual roles include:

- Learner
- Organization Manager
- Content Author
- Reviewer
- Quality Approver
- Administrator

Roles may be composed; a Bioeksen employee can be both Learner and Content Author, for example.

Permissions are authoritative. Role labels are convenient bundles, not the sole authorization model.

An author cannot approve their own CourseVersion.

## 10. Course Lifecycle

Typical lifecycle:

`DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED -> SUPERSEDED`

Review, approval, and publication are distinct actions.

Published content is not edited in place as ordinary authoring. A new version is created.

Certificates and historical completions remain linked to the exact CourseVersion completed.

When a new version is published, the course may apply one of these policies:

- `NO_ACTION`
- `ASSIGN_NEW_VERSION`
- `REQUIRE_RECERTIFICATION`

## 11. Assignments and Completion

Assignments may target:

- an individual user;
- an organization.

Assignments may be:

- `OPTIONAL`
- `REQUIRED`

A deadline is optional even for required training.

Completion conditions are configurable and may combine lesson completion, activity completion, and assessment thresholds.

Assessment behavior may include maximum attempts, passing score, question/answer randomization, answer visibility, retry delay, and remediation rules such as repeating a lesson/module/course section after failure.

## 12. Certificates

Certificates are optional per course.

Certificates may have:

- unique public verification ID/QR;
- issue date;
- optional expiry date;
- unlimited validity;
- status such as VALID, EXPIRED, or REVOKED;
- revocation reason and actor;
- CourseVersion linkage.

Users can view their certificates under a My Certificates area.

Revoked certificates are retained, not deleted.

## 13. Training Studio

Training Studio is a React-based authoring/backoffice experience.

Content authors can:

- create courses/modules/lessons;
- order content by drag-and-drop with accessible alternatives where needed;
- enter Turkish and English localized content;
- add configured content blocks;
- preview learner experience;
- save drafts;
- submit to a selected reviewer;
- respond to course-level and block-level review comments.

Reviewers can comment and complete review. Approvers approve. Publication remains a separate authorized action.

## 14. Interactive Learning

The learning system is block-based and extensible.

Initial/primary block categories include text, image, video, IFU reference, quiz, drag-and-drop, hotspot, branching scenario, interactive video, PCR curve interpretation, plate setup, pipetting simulation, and image-state/2D device simulation.

Three.js/3D simulation is planned as a second-stage capability and is intentionally limited to reusable standard interactions such as opening/closing a PCR instrument, inspecting internal components, and inserting/removing permitted objects.

## 15. Product and Catalog Model

A Product may have multiple Catalog Numbers, typically because of pack size or commercial configuration.

Example:

`BS-GHPV-L-100`

Catalog Number identity does not vary by country and one Catalog Number points to one Product.

The current IFU applicability design is product-level because Catalog Numbers for the same Product use the same IFU.

Catalog Numbers support manual creation and CSV/XLSX bulk import.

## 16. LOT Model and Import

LOTs are imported, potentially daily, by CSV/XLSX.

A LOT belongs to a Catalog Number and therefore one Product.

Normal IFU resolution does not store a direct manual LOT-to-IFU relation. It derives the version from Product + manufacturing date, except for explicit authorized override.

Duplicate imports must never silently overwrite safety-critical data. Identical duplicates may be skipped with warning; conflicting duplicates require explicit review/correction.

## 17. Localization

Portal user interface supports Turkish and English.

Engineering language is English.

Static UI strings use translation keys. Academy-authored content is stored as localized business content. e-IFU files are language-specific controlled files, and all available languages for the resolved version may be presented.

## 18. Privacy and Data Residency

e-IFU access records may contain email, optional name/surname, IP address, Catalog Number, LOT Number, resolved document/version, language/file action, timestamp, and technical request context as approved.

e-IFU access identifiers are retained ten years, then anonymised, and are erased earlier on request (ADR-0018, ADR-0016). ADR-0018 is accepted for implementation; its legal review is pending. See `privacy-data-residency.md`.

Marketing/update consent is out of scope. Legal/privacy acknowledgement text will be supplied by Bioeksen's legal function.

Production data must be hosted on server infrastructure in Turkey, and project architecture must not intentionally transfer data abroad without explicit approval.

## 19. Audit and Analytics

Audit covers controlled business changes. Examples: IFU replacement, LOT override, course approval/publication, role changes, and certificate revocation.

Audit retention is currently indefinite.

Analytics covers usage/behavior. Academy analytics include completion, scores, duration, question-level success, organization training status, and simulation errors. e-IFU analytics include searches, successful/failed resolution, language, view/download activity, and product/CAT trends.

Raw identifiable e-IFU access data is restricted; aggregated management reporting should be preferred for routine analytics.

## 20. Administration Surfaces

- Direct database access: low-level administration, troubleshooting and emergency operations. There is no generated admin interface, deliberately -- a screen that can edit any row can edit a published document version, and controlled content has a lifecycle rather than an edit button.
- React Backoffice: normal business administration, e-IFU management, Academy management, Training Studio, organizations, assignments, reports, analytics, and audit viewing.

## 21. High-Level Technology Stack

- TypeScript
- NestJS
- Prisma
- React
- PostgreSQL
- Redis
- S3-compatible object storage
- Docker
- Nginx
- Three.js / React Three Fiber where 3D is justified

## 22. Explicit Non-Goals

Initial scope does not require:

- microservices;
- public Academy self-registration;
- heavy 3D content for most courses;
- a generic arbitrary-script course builder;
- country-specific Catalog Number identity;
- a generalized document-management portal beyond IFU, although the model should remain extensible.
