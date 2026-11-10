# UX methodology source catalog

This catalog anchors the visual audit rubric in established usability, accessibility, cognitive-load, information-foraging, and human-AI interaction sources. The framework is a heuristic review method; it is not a validated psychometric measure or a substitute for user research.

## Core sources

| ID | Source | What it supports | Citation / link |
|---|---|---|---|
| S1 | Nielsen, “10 Usability Heuristics for User Interface Design” | Visibility of system status, match to real-world language, user control, consistency, error prevention, recognition rather than recall, flexibility/efficiency, minimalist design, error recovery, and help. | https://www.nngroup.com/articles/ten-usability-heuristics/ |
| S2 | ISO 9241-110:2020, *Ergonomics of human-system interaction — Part 110: Interaction principles* | Self-descriptiveness, conformity with user expectations, suitability for the task, controllability, use error robustness, user engagement, and learnability. Use the licensed standard for formal interpretation. | https://www.iso.org/standard/75258.html |
| S3 | W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* (W3C Recommendation, 2023) | Testable accessibility criteria, including text alternatives, contrast, use of color, keyboard access, focus, labels/instructions, error identification/suggestions, and error prevention. | https://www.w3.org/TR/WCAG22/ |
| S4 | W3C, *Making Content Usable for People with Cognitive and Learning Disabilities* (2018) | Guidance for clear content, familiar design, consistent navigation, task support, and reducing avoidable memory burden. It is informative guidance, not a WCAG conformance standard. | https://www.w3.org/TR/coga-usable/ |
| S5 | Sweller, J. “Cognitive load during problem solving: Effects on learning.” *Cognitive Science* 12(2), 257–285 (1988). | Foundational cognitive-load theory; supports reducing avoidable processing demands and avoiding unnecessary instruction burden. It does not provide a screenshot-based measurement of mental load. | https://doi.org/10.1207/s15516709cog1202_4 |
| S6 | Pirolli, P. & Card, S. “Information Foraging.” *Psychological Review* 106(4), 643–675 (1999). | Information scent and users’ choices about where to look next; informs whether labels and headings predict useful destinations. | https://doi.org/10.1037/0033-295X.106.4.643 |
| S7 | Norman, D. A. *The Design of Everyday Things: Revised and Expanded Edition* (2013). | Affordances, signifiers, mapping, feedback, and conceptual models. A visible signifier may suggest an action but cannot establish that the action works. | https://www.basicbooks.com/titles/don-norman/the-design-of-everyday-things/9780465050659/ |
| S8 | Amershi, S. et al. “Guidelines for Human-AI Interaction.” *Proceedings of CHI 2019* (2019). | Human-AI interaction guidance across initial interaction, during interaction, errors, and over-time behavior; particularly expectation-setting, communicating uncertainty, feedback/control, and correction. | https://doi.org/10.1145/3290605.3300233 |
| S9 | NIST, *Artificial Intelligence Risk Management Framework (AI RMF 1.0)* (2023). | Governance and risk context for trustworthy AI systems. It is a system-level risk framework, not a screen-level usability checklist. | https://doi.org/10.6028/NIST.AI.100-1 |

## How to apply these sources

- Use S1 and S2 to organize interaction-quality questions; do not imply that checklist coverage alone demonstrates usability.
- Use S3 for conformance claims only when the implementation and relevant states can be tested. A screenshot review can identify candidates, not certify WCAG conformance.
- Use S4 and S5 to motivate plain language, visible task support, and reduced avoidable memory burden. Do not infer disability, attention, literacy, or cognitive capacity from a persona label or a visual artifact.
- Use S6 for information scent: assess whether visible cues let a person predict what a link, heading, or action will provide.
- Use S7 to distinguish perceived affordance/signifier from actual behavior.
- Use S8 for AI-specific interface expectations and user control. Use S9 for broader risk framing, not for scoring a page.

## Persona language and inclusion

Use task conditions such as “low-context, interrupted first use” and “experienced, efficiency-seeking.” They describe circumstances and preferences, not fixed identities. Avoid insulting or diagnostic labels (including “dumbass,” “stupid,” “lazy,” “low intelligence,” or assumptions of disability). Do not claim that a screenshot proves that a person is confused. Describe the interface evidence and the task consequence instead, then validate with representative users. Design for flexible expertise and accessible use across contexts.
