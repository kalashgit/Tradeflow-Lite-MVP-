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
    working_size: int
    review_patterns: int
    long_term_memory_written: bool
    trace: list

class Scientist:
    def __init__(self, proposer, working_limit=8, reviewer=None):
        self.proposer = proposer
        self.working_limit = working_limit
        self.reviewer = reviewer if reviewer is not None else ReviewJournal()

    def investigate(self, world, max_experiments=8):
        if type(max_experiments) is not int or not 1 <= max_experiments <= 2**len(world.variables):
            raise ValueError("invalid experiment budget")
        working = WorkingMemory(self.working_limit)
        all_evidence, candidate_pool, trace = [], [], []
        current = None
        valid = consistent = 0
        before_calls = self.proposer.calls
        for i in range(max_experiments):
            state = choose_intervention(world.variables, all_evidence, candidate_pool[-6:])
            if state is None:
                break
            measured = world.intervene(state)
            all_evidence.append(measured)
            working.push(measured)
            # Neither the model nor the reviewer can access the hidden program.
            # The reviewer only supplies observed counterexamples.
            proposal = self.proposer.propose(
                variables=world.variables,
                recent=working.snapshot(),
                feedback=self.reviewer.counterexamples(limit=3),
                previous=current,
            )
            try:
                parsed = validate(proposal, world.variables) if proposal is not None else None
            except (MechanismError, TypeError, RecursionError):
                parsed = None
            if parsed is not None:
                valid += 1
                candidate_pool.append(parsed)
                current = parsed
            wrong = len(violations(parsed, all_evidence, world.variables)) if parsed is not None else len(all_evidence)
            if parsed is not None and wrong == 0:
                consistent += 1
            self.reviewer.add(world.world_id, world.variables, parsed, measured, wrong)
            trace.append({
                "step": i + 1,
                "observation": measured,
                "valid": parsed is not None,
                "contradictions": wrong,
                "candidate": parsed,
            })
        return Trial(
            world=world.world_id, split=world.split,
            experiments=len(all_evidence), valid_proposals=valid,
            consistent_proposals=consistent, final_accuracy=world.accuracy(current),
            model_calls=self.proposer.calls - before_calls,
            working_size=len(working), review_patterns=len(self.reviewer.recurring()),
            long_term_memory_written=False, trace=trace,
        )
