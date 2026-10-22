# Canonical Domain Model

## Product domain

- Product
- CatalogNumber
- Lot

Rules:

- Product is canonical. Its identity is the catalog stem plus IVD/RUO
  (ADR-0012); pack size is an attribute of the catalog number, never identity.
- There is no level above `Product`. An Academy course references the products
  it covers, which is a table rather than a hierarchy — see ADR-0012.
- Product 1:N CatalogNumber.
- CatalogNumber belongs to exactly one Product.
- Lot belongs to one CatalogNumber.
- Current e-IFU applicability is Product-level.

## Document/e-IFU domain

- Document
- DocumentVersion
- DocumentFile
- DocumentFileReplacement
- DocumentApplicability
- LotDocumentOverride
- EIFUAccessRecord

## Academy domain

- Course
- CourseVersion
- Module
- Lesson
- ContentBlock
- Assessment
- Question
- AssessmentAttempt
- ActivityAttempt
- Assignment
- Enrollment / LearningProgress as needed
- Certificate

## Organization and identity

- User
- Organization
- OrganizationMembership
- OrganizationRelationship
- Role / Permission representation

Do not create separate InternalUser, CustomerUser, or DistributorUser entities.

## Audit

- AuditEvent

Audit may contain structured before/after metadata, correlation/request identifier, actor, action, entity reference, and reason where required.

## Avoid duplicate concepts

Do not introduce models such as `EIFUProduct`, `AcademyProduct`, `LatestIFU`, `CurrentDocument`, or parallel copies of canonical entities unless the architecture is explicitly revised.

Field-level definitions, types and constraints for every entity above are in `data-model-fields.md`. Add a field there before implementing it.
