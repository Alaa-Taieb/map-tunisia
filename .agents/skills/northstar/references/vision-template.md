# Writing vision.md

Write the vision for the _user_ to approve: short enough to read in two minutes (about 400–900 words), concrete,
no implementation detail. Use these sections:

1. **Purpose** — one paragraph: what the product is and why it exists.
2. **Target audience** — who it is for.
3. **Problems it solves** — the main user problems.
4. **Core functionality** — the handful of capabilities that define the product.
5. **Differentiators** — what makes it distinct.
6. **Principles** — how it should feel/behave when trade-offs appear.
7. **Constraints** — platforms, budget, technology, legal, timeline that are fixed.
8. **Explicitly excluded** — what it will _not_ do (prevents scope creep).
9. **Definition of long-term success** — how the user will know it worked.

Put the _detailed_ material (functional/non-functional requirements, architecture, data model, interfaces,
acceptance criteria, known limitations) in `specification.md` and as structured requirements, not in the vision.
Mark anything you assumed rather than were told as an assumption, and ask the user only about decisions that
genuinely change the product.
