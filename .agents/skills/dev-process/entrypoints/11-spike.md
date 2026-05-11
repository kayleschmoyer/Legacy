# Entrypoint 11: Spike (Research / POC)

**Trigger**: a question that cannot be answered without writing some exploratory code. "How hard would it be to…?" "Does library X actually work for our case?" "What does the performance ceiling look like?"

**Default risk tier**: Low (the spike output is research, not production code).

**Required artifacts**: [RFC](../artifacts/rfc.md) — the RFC IS the deliverable.

## Path notes

A spike is **timeboxed**. The output is an RFC that recommends what to do next, not production code. Code written during a spike is **discarded by default** — if it survives, it should be re-written cleanly through the appropriate entrypoint (usually 05-new-feature).

### Phase 1: Frame

- State the question being investigated. One question per spike. "What does the answer look like?" should be paragraph-length.
- Define the **timebox**: most spikes are 1–3 days. If the question genuinely needs longer, decompose into multiple narrower spikes.
- Define **success criteria**: what does answering the question look like? (Often "we now know whether to do X or Y.")

### Phase 2: Design

- Skip the RFC at the start — the RFC is the _output_ of the spike, not the input.
- Sketch the experiments you will run before running them. List them in the ticket so the spike stays scoped.

### Phase 3: Implement (exploratory)

- Code lives in a `spike/<topic>` branch or directly in `scratch/<topic>/`.
- No tests required — the goal is learning, not coverage.
- Commits can be messy — they will be discarded.
- **Stop at the timebox**. Even with the answer half-found, stop and write up what you learned. A spike that runs over twice is a sign the question was wrong.

### Phase 4: Verify

- Verify your conclusions, not your code. If the spike's answer is "library X handles 10K req/s," confirm that with at least two independent measurements.

### Phase 5: Document

- **Write the RFC** with the recommendation. See [RFC artifact](../artifacts/rfc.md).
- The RFC's `Proposal` section names what to do next (usually "implement via entrypoint 05" or "this is not viable").
- The RFC's `Appendix` may include benchmarks, code snippets, or links to the spike branch.
- The spike branch itself: leave it for reference, do not merge it.

### Phase 6: Handoff

- The "PR" for a spike is the RFC PR, not the spike code.
- Spike code is **never merged to main**.
- Follow-up tickets created based on the RFC's recommendation.

## Anti-patterns

- ❌ Spike code merged to main. Spikes produce _learning_; the implementation comes later through the appropriate entrypoint.
- ❌ Spike with no timebox. "I'll know when I'm done" produces month-long spikes.
- ❌ Spike with multiple questions. Multiple questions = multiple spikes.
- ❌ Skipping the RFC writeup because "I'll just remember." You won't, and neither will anyone else.
- ❌ Spike with production-quality tests and CI. That's a feature, not a spike — switch entrypoints.

## Related skills

- [RFC artifact](../artifacts/rfc.md)
- [planning](../../planning/SKILL.md)
