# 05 — Reinforcement learning and learning from business outcomes

**Primary reference:** Richard S. Sutton & Andrew G. Barto, *Reinforcement Learning: An Introduction*, 2nd edition (2018). [Author-hosted book page](http://incompleteideas.net/book/the-book-2nd.html) and [MIT Press edition](https://mitpress.ublish.com/book/reinforcement-learning-an-introduction-2). Original explanation, Genesis application and exercises below.

## 1. What RL solves

Supervised learning maps labeled examples to targets. Reinforcement learning optimizes behavior through **sequential interaction**: an action changes what the agent experiences next. Rewards may be delayed and choices face uncertainty.

For Genesis, recommendations affect subsequent schedules, costs, supplier relationships and future options. This resembles an RL problem, **but resemblance does not mean we should directly train an autonomous business policy**. Start with offline analysis and constrained experiments.

The core Markov decision process (MDP) is `(S, A, P, R, γ)`:
- `S`: set of states;
- `A`: actions;
- `P(s'|s,a)`: transition probabilities;
- `R(s,a,s')`: rewards;
- `γ`: discount factor, generally `0 ≤ γ < 1` for infinite horizon formulation.

A policy `π(a|s)` is a rule or distribution for selecting actions. The **return** `G_t = Σ_{k=0}∞ γ^k R_{t+k+1}`. Maximizing reward is only meaningful if the reward captures genuine owner objectives and hard safety constraints.

## 2. Contextual bandits before full RL

A **contextual bandit** sees context, selects an action and receives reward, without optimizing long sequential state transitions in the full MDP sense. This is a practical lower-complexity starting point for comparing alternative recommendation styles or administrative nudges.

Example: when an invoice becomes overdue, choose among three **approved** draft reminder approaches. Measure confirmed responses while preserving human approval and not testing risky customer communications without consent.

**Exploration versus exploitation:** try uncertain alternatives versus use the currently best estimate. Explore only within explicitly safe actions and with controls. Be especially cautious with small business sample sizes and customer-specific effects.

## 3. Value functions and Bellman equations

`V^π(s)`: expected discounted return starting in state s following policy π.

`Q^π(s,a)`: expected discounted return from taking a in s and then following π.

Bellman expectation for values:

`V^π(s) = Σ_a π(a|s) Σ_{s',r} p(s',r|s,a) [r + γ V^π(s')]`.

Bellman optimality for action values:

`Q*(s,a) = E[R_{t+1} + γ max_{a'} Q*(S_{t+1},a') | S_t=s,A_t=a]`.

Interpretation: a decision can be suboptimal today but valuable due to future options. Conversely, a quick administrative shortcut may save minutes now and create extra rework later.

## 4. Temporal-difference learning

TD(0) updates a state-value estimate from the observed reward and next estimate:

`V(S_t) ← V(S_t) + α[R_{t+1} + γV(S_{t+1}) - V(S_t)]`.

The bracketed quantity is the **TD error**: surprise relative to what was predicted. Larger error can suggest the current value estimate is poorly calibrated, the world changed, or data is noisy.

Q-learning, for tabular finite MDPs:

`Q(S_t,A_t) ← Q(S_t,A_t) + α[R_{t+1}+γmax_a Q(S_{t+1},a) - Q(S_t,A_t)]`.

Do not deploy tabular Q-learning on live contractor actions based on a few anecdotal examples. Most operational states are huge, partially observed and nonstationary.

## 5. Monte Carlo versus bootstrapping

**Monte Carlo:** estimate returns using completed observed episodes; conceptually straightforward but can have high variance and delayed feedback.

**Temporal difference:** bootstrap from current estimates before episodes finish; lower waiting cost but can propagate biased estimates.

Business outcomes often take weeks. Track censoring: a job hasn't yet completed, so no honest final outcome is available. Do not label every open case a failure or success.

## 6. Reward design and Goodhart's law

A naive reward `+1 for task completed` encourages the agent to finish superficial or harmful tasks. A reward `+1 for every invoice reminder sent` encourages spam.

Better objective hierarchy:
1. Hard constraints: privacy, access scope, financial controls, customer consent, human approval.
2. Safety and correctness gates: no unsupported factual assertions or unverified tool outcomes.
3. Business outcome objective: observed improvement in real workflow performance.
4. Resource objective: cost/latency/compute efficiency subject to above.

You may use a weighted reward **inside** a safe feasible region. Keep safety constraints explicit; do not assign them merely a finite penalty and hope optimization behaves.

## 7. Offline policy evaluation and confounding

Logged business cases are observational, not randomized experiments. Historical decisions may reflect operator judgment or hidden circumstances. A policy may appear better because it was used on easier jobs.

For a contextual bandit with logged behavior policy `b(a|s)`, importance sampling estimates a target policy's value using weights `π(a|s)/b(a|s)`, assuming support overlap and known, reliable propensities. High variance and propensity errors can ruin estimates.

**Practical approach:** initially compare exact simulated scenarios with known outcomes, then shadow-mode recommendations alongside existing workflows, then carefully controlled opt-in experiments. Document ethics, customer impact and stop rules.

## 8. Partial observability

Real businesses are POMDP-like. Supplier reliability, crew fatigue and customer sentiment are not fully known. The right state for policy learning is often a *belief* over hidden variables and a collection of evidence.

A memory mechanism can help form a belief state, but outdated or incorrect memories can make decisions worse. When uncertainty is high, information gathering can be the most valuable action.

**Value of information:** ask whether requesting a fresh ETA changes the decision enough to justify the delay. The mere ability to issue a recommendation is not a reason to skip verification.

## 9. Safe outcome-learning pipeline for Genesis

Proposed sequence:
1. Log a problem representation and a pre-decision evidence snapshot.
2. Record admissible alternatives and reason for chosen option.
3. Record who approved and what actually executed.
4. Capture immediate verified effect, then delayed business outcome.
5. Mark outcome completeness and confounders.
6. Evaluate if the new policy would differ from baseline on held-out historical cases.
7. Human-review improvements before enabling changed behavior.

**Do not call this online RL** until there is an explicit policy, reward, updates grounded in observed returns, and evidence that the improvement is causal or appropriately evaluated.

## 10. An educational toy experiment

Simulate a supplier with two shipping actions:
- standard: cost 0, 20% chance of two-day delay;
- expedited: cost 35, 5% chance of delay;
- each day of delay costs 100 in this toy setup.

Expected simplified costs:
- standard: `0 + 0.2*2*100 = 40`;
- expedited: `35 + 0.05*2*100 = 45`.

The simple one-step expected-cost choice is **standard**, under these invented assumptions. Now vary loss severity, probability and available alternatives. Notice how quickly the optimal decision changes, and why using arbitrary "intelligence" scores is insufficient.

Build a simulator with 1,000 seeded episodes; compare fixed-standard, fixed-expedited and a learned policy using a separate evaluation seed. Print confidence intervals, constraint violations and worst-case outcomes—not just average reward.

## 11. Failure modes to understand

- **Reward hacking:** proxy improvement that harms the real business.
- **Distribution shift:** past vendor behavior no longer predicts current service.
- **Selection bias:** observing only the choices a human previously made.
- **Delayed reward:** premature labeling of outcomes.
- **Nonstationarity:** crews, prices, processes and businesses change.
- **Exploration harm:** experimenting on customers without suitable authority.
- **Off-policy error:** assuming unobserved alternative outcomes are known.

## 12. Study checkpoint

Be able to derive the Bellman equation at a conceptual level, explain return and discounting, distinguish TD from Monte Carlo, justify why a contextual bandit is simpler than a full agent policy, and design a controlled safe business experiment.

**Build target:** a shadow-mode policy comparison with evidence snapshots and simulated outcomes. Policy changes enter production only after risk review, held-out testing and demonstrated benefit.
