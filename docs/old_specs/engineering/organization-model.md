# Organization Model

## Organization types

- INTERNAL
- DEPARTMENT
- CUSTOMER
- DISTRIBUTOR

## Identity

Use one User identity model. Do not create separate user tables by organization type.

Use OrganizationMembership plus roles/permissions so one person can be a Learner and Content Author, for example.

## Relationships

Use an explicit OrganizationRelationship model rather than assuming a permanent simple parent tree.

Initial relationship use case:

- Distributor `DISTRIBUTES_TO` Customer

A distributor may later be permitted to manage training for its customers, but this must be an explicit permission/scoped relationship. It never grants rights to author/approve/publish Bioeksen content implicitly.

## The shape, as it now stands

**Bioeksen Ar-Ge Teknolojileri A.Ş.** is the `INTERNAL` organization. It owns
the training content — `Course.owningOrganization` must be `INTERNAL`, held by
the `course_owner_is_a_company` trigger as well as by the service.

**Departments** are `DEPARTMENT` organizations with a `parent_organization_id`.
They are a *part of* the company, not a company:

- Only a department has a parent, and a department must have one
  (`organization_only_a_department_has_a_parent`).
- A department's parent is `INTERNAL` — never another department
  (`organization_department_parent_is_a_company`, a trigger, because the rule
  is about the parent's row and a CHECK may only read its own). This is what
  keeps the hierarchy one level deep, and therefore keeps
  `organizationsInScope` a bounded query rather than a recursive one on the
  authorization path.
- A department may not own a course. Bioeksen owns the content; a department is
  where somebody works.

**Customers** are attached to a `DISTRIBUTOR` through an active
`DISTRIBUTES_TO`, and **a customer with no distributor is Bioeksen's own**.

That absence is the representation, and it is deliberate. Bioeksen is refused as
the supplying side of a relationship (`ORGANIZATION_RELATIONSHIP_INVALID`),
because a customer could otherwise be both implicitly and explicitly Bioeksen's:
one fact with two representations that can disagree, where ending the explicit
one would change nothing. Attaching a distributor is the whole of moving a
customer out of Bioeksen's hands, and ending it is the whole of moving them
back.

Nothing in the database stops two distributors from being active for one
customer. The screens present one and offer to move a customer between them —
`SupplierPanel` ends the old grant before making the new one, so a failure
between the two leaves the customer with Bioeksen, which is a real state,
rather than with two distributors seeing them, which is not. The
`supplied_by` field of an organization row is an **array** for the same reason:
a response that showed the first would be a response that conceals a visibility
grant.

### Where people are managed

**The directory is for whoever holds `organization.users.view` everywhere.**
Everyone else reaches people through the organization they are in, as a section
of that organization's page.

`permissions` in the session is scope-blind — it says a code is held, not where
— so a manager of one customer and a Platform Administrator looked identical to
the interface, and both were offered a directory. For the manager that
"directory" was their one customer, presented under a name that promised
everybody. `platform_permissions` is the subset from a grant with no
organization, and it is what tells the two apart.

It is **not a permission boundary and must not be read as one**. `GET /users`
narrows by `usersInScope` whichever screen asks, so the same person sees the
same people either way. What changes is whether the screen claims to be a
directory.

### What a scoped grant reaches

From the organization it was granted at, and only downward:

1. that organization;
2. its departments, if it is the company — being part of something is not the
   same as being supplied by it, and a department cannot be detached;
3. the customers it supplies, through an active `DISTRIBUTES_TO`;
4. every customer no distributor supplies, if the grant is at an `INTERNAL`
   organization — those customers are Bioeksen's, by the absence above.

Never upward. A manager of one department is not a manager of the company that
holds it, and not a manager of its sibling departments.

The allow-list in `permission-matrix.md` gives `DEPARTMENT` the same two roles
as every other type, deliberately. A department is inside Bioeksen and the
instinct is to trust it further; a content role granted from anywhere
organization-scoped is exactly the escalation that allow-list exists to prevent.
