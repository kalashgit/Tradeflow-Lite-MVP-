"""Evidence-driven learning loop with bounded working context and independent scoring."""
from dataclasses import asdict, dataclass
from .core import MechanismError, validate, violations, choose_intervention
from .memory import WorkingMemory, ReviewJournal

@dataclass
class Trial:
    world: str
    split: str
    experiments: int
    valid_proposals: int
    consistent_proposals: int
    final_accuracy: float
    model_calls: int
    prompt_tokens: int
    completion_tokens: int
    retrieved_hypotheses: int
    working_size: int
    review_patterns: int
    long_term_memory_written: bool
    trace: list

class Scientist:
    def __init__(self, proposer, working_limit=8, reviewer=None, casebook=None):
        self.proposer = proposer
        self.working_limit = working_limit
        self.reviewer = reviewer if reviewer is not None else ReviewJournal()
        self.casebook = casebook

    def investigate(self, world, max_experiments=8):
        if type(max_experiments) is not int or not 1 <= max_experiments <= 2**len(world.variables):
            raise ValueError("invalid experiment budget")
        working = WorkingMemory(self.working_limit)
        all_evidence, candidate_pool, trace = [], [], []
        current = None
        valid = consistent = 0
        before_calls = self.proposer.calls
        before_prompt = getattr(self.proposer, 'prompt_tokens', 0)
        before_completion = getattr(self.proposer, 'completion_tokens', 0)
        retrieved_count = 0
        for i in range(max_experiments):
            if hasattr(self.proposer, "choose_intervention"):
                # Efficient bit-vector information-gain planning; observations only.
                state = self.proposer.choose_intervention(world.variables, all_evidence)
            else:
                planning_candidates = candidate_pool[-6:]
                if hasattr(self.proposer, "candidates"):
                    planning_candidates = self.proposer.candidates(world.variables, all_evidence)
                state = choose_intervention(world.variables, all_evidence, planning_candidates)
            if state is None:
                break
            measured = world.intervene(state)
            all_evidence.append(measured)
            working.push(measured)
            analogies = self.casebook.retrieve(world.variables, all_evidence, world_id=world.world_id, limit=3) if self.casebook is not None else []
            retrieved_count += len(analogies)
            # Neither the model nor the reviewer can access the hidden program.
            # The reviewer only supplies observed counterexamples.
            proposal = self.proposer.propose(
                variables=world.variables,
                recent=([dict(entry) for entry in all_evidence]
                        if getattr(self.proposer, "use_full_history", False)
                        else working.snapshot()),
                feedback=self.reviewer.counterexamples(limit=3, world_id=world.world_id),
                previous=current,
                analogies=analogies,
            )
            try:
                parsed = validate(proposal, world.variables) if proposal is not None else None
            except (MechanismError, TypeError, RecursionError):
                parsed = None
            wrong = len(violations(parsed, all_evidence, world.variables)) if parsed is not None else len(all_evidence)
            old_wrong = len(violations(current, all_evidence, world.variables)) if current is not None else len(all_evidence) + 1
            accepted = parsed is not None and (current is None or wrong <= old_wrong)
            if parsed is not None:
                valid += 1
                candidate_pool.append(parsed)
                if accepted:
                    # Evidence-based local repair: reject a plausible-looking update if
                    # it explains FEWER of the actual observations than the prior rule.
                    current = parsed
                if wrong == 0:
                    consistent += 1
            self.reviewer.add(world.world_id, world.variables, parsed, measured, wrong)
            trace.append({
                "step": i + 1,
                "observation": measured,
                "valid": parsed is not None,
                "contradictions": wrong,
                "candidate": parsed,
                "accepted": accepted,
                "current": current,
            })
        return Trial(
            world=world.world_id, split=world.split,
            experiments=len(all_evidence), valid_proposals=valid,
            consistent_proposals=consistent, final_accuracy=world.accuracy(current),
            model_calls=self.proposer.calls - before_calls,
            prompt_tokens=getattr(self.proposer, 'prompt_tokens', 0) - before_prompt,
            completion_tokens=getattr(self.proposer, 'completion_tokens', 0) - before_completion,
            retrieved_hypotheses=retrieved_count,
            working_size=len(working), review_patterns=len(self.reviewer.recurring()),
            long_term_memory_written=False, trace=trace,
        )
