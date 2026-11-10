"""Self-contained mobile-readable HTML report (no external assets or scripts)."""

from html import escape

from .recovery import RecoveryReport


def render_recovery_dashboard(report: RecoveryReport) -> str:
    data = report.timeline
    width, height = 900, 310
    left, right, top, bottom = 48, 18, 28, 42
    plot_width, plot_height = width - left - right, height - top - bottom
    maximum = max(1.1, max(max(p["baseline_mae"], p["adaptive_mae"]) for p in data) * 1.12)

    def x(step):
        return left + (step / max(1, len(data) - 1)) * plot_width

    def y(value):
        return top + (1 - value / maximum) * plot_height

    def series(key):
        return " ".join(f"{x(p['step']):.1f},{y(p[key]):.1f}" for p in data)

    markers = []
    for step, label, color in (
        (report.shift_step, "RULE SHIFT", "#eaa36b"),
        (report.detection_step, "DETECTED", "#ffd166"),
        (report.promotion_step, "PROMOTED", "#65dfb5"),
    ):
        if step is None:
            continue
        pos = x(step)
        markers.append(
            f'<line x1="{pos:.1f}" y1="{top}" x2="{pos:.1f}" y2="{top+plot_height}" '
            f'stroke="{color}" stroke-dasharray="5 6" opacity=".8"/>'
            f'<text x="{min(pos+5,width-105):.1f}" y="{top-10}" font-size="10" fill="{color}">{label}</text>'
        )

    grid = []
    for ratio in (0, 0.25, 0.5, 0.75, 1):
        val = maximum * ratio
        pos = y(val)
        grid.append(
            f'<line x1="{left}" y1="{pos:.1f}" x2="{left+plot_width}" y2="{pos:.1f}" '
            f'stroke="#263447"/>'
            f'<text x="{left-8}" y="{pos+4:.1f}" text-anchor="end" fill="#8d9aad" '
            f'font-size="11">{val:.1f}</text>'
        )
    name = report.learned_rule or "No validated new hypothesis"
    label = "×".join("x" + ch for ch in name.split("_")[-1]) if report.learned_rule else "—"
    detection = str(report.detection_delay) if report.detection_delay is not None else "—"
    recovery = str(report.recovery_steps) if report.recovery_steps is not None else "Not reached"
    svg = "".join(grid + markers)
    svg += f'<polyline points="{series("baseline_mae")}" fill="none" stroke="#ff857e" stroke-width="2.6"/>'
    svg += f'<polyline points="{series("adaptive_mae")}" fill="none" stroke="#65dfb5" stroke-width="2.7"/>'
    svg += (f'<text x="{width/2}" y="{height-8}" fill="#92a1b4" font-size="12" '
            'text-anchor="middle">Observation step</text>')
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AION Genesis · Causal Recovery Observatory</title>
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#090f18;color:#eaf2fa;
font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}}
.wrap{{max-width:1090px;margin:auto;padding:28px 18px 60px}}.top{{display:flex;align-items:center;justify-content:space-between;
gap:12px;flex-wrap:wrap}}.eyebrow{{font-size:11px;color:#78d0ec;letter-spacing:.17em;font-weight:800}}
.pill{{border:1px solid #315049;color:#a1e9cb;background:#143028;padding:7px 12px;border-radius:999px;font-size:11px}}
h1{{font-size:clamp(28px,6vw,48px);line-height:1.03;letter-spacing:-.05em;margin:20px 0 10px}}
.intro{{max-width:680px;color:#9baabd;line-height:1.65;font-size:14px;margin-bottom:28px}}
.cards{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}}
.card,.panel{{background:linear-gradient(145deg,#152233,#0e1723);border:1px solid #263549;border-radius:17px}}
.card{{padding:17px}}.card span{{display:block;color:#95a5b8;font-size:11px;margin-bottom:12px}}
.card strong{{font-size:clamp(21px,3vw,32px);letter-spacing:-.035em}}.card small{{display:block;color:#8ca1b5;margin-top:9px}}
.panel{{margin-top:16px;padding:18px}}.panel h2{{font-size:15px;margin:1px 0 6px}}.sub{{color:#8ea2b7;font-size:12px}}
.chart{{width:100%;display:block;margin-top:18px}}.legend{{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:#a2b2c6}}
.swatch{{display:inline-block;width:12px;height:3px;vertical-align:middle;margin-right:6px;border-radius:9px}}
.insights{{display:grid;grid-template-columns:1fr 1fr;gap:15px}}.label{{color:#78d0ec;font-size:10px;letter-spacing:.1em;font-weight:800}}
.insights p{{line-height:1.6;color:#a3b4c6;font-size:13px;margin-bottom:0}}.foot{{color:#788b9e;font-size:11px;line-height:1.7;margin-top:22px}}
@media(max-width:740px){{.cards{{grid-template-columns:1fr 1fr}}.insights{{grid-template-columns:1fr}}.card{{padding:14px}}.panel{{padding:14px}}}}
</style></head><body><main class="wrap">
<div class="top"><div class="eyebrow">AION GENESIS / RESEARCH OBSERVATORY</div><div class="pill">V0.2 · SYNTHETIC EXPERIMENT</div></div>
<h1>Learning to recover.</h1><p class="intro">An environment changes its causal rules while the learner is running.
See how two learners respond to the same observations and whether the proposed new model survives independent validation.</p>
<section class="cards">
<div class="card"><span>DRIFT DETECTION</span><strong>{escape(detection)}</strong><small>observations after shift</small></div>
<div class="card"><span>RECOVERY TIME</span><strong>{escape(recovery)}</strong><small>steps to sustained low error</small></div>
<div class="card"><span>FIXED LEARNER ERROR</span><strong style="color:#ff938b">{report.baseline_final_mae:.3f}</strong><small>final MAE · lower is better</small></div>
<div class="card"><span>ADAPTIVE LEARNER ERROR</span><strong style="color:#65dfb5">{report.adaptive_final_mae:.3f}</strong><small>final MAE · lower is better</small></div>
</section>
<section class="panel"><h2>Prediction error over time</h2><p class="sub">Independent evaluator checks all 16 possible interventions. These data are not supplied to either learner.</p>
<svg class="chart" viewBox="0 0 {width} {height}" role="img" aria-label="Line chart of baseline versus adaptive mean absolute prediction error">{svg}</svg>
<div class="legend"><div><span class="swatch" style="background:#ff857e"></span>Fixed pairwise learner</div>
<div><span class="swatch" style="background:#65dfb5"></span>Adaptive causal learner</div></div></section>
<div class="insights"><section class="panel"><div class="label">RECOVERED HYPOTHESIS</div><h2>{escape(label)}</h2>
<p>The adaptive learner evaluated competing causal representations, selected a validated interaction, and refitted its model on post-shift evidence.</p></section>
<section class="panel"><div class="label">RESEARCH INTERPRETATION</div><h2>Specialization has a limit</h2>
<p>We demonstrated recovery from a rule outside the original learner's hypothesis class. The richer model family was programmed in advance, so this is not yet open-ended algorithm discovery.</p></section></div>
<p class="foot">Seed {report.seed}; {len(data)} observation steps; calibration 16 interventions; 16 post-alert training observations; 16 separate validation observations. Synthetic noise standard deviation 0.05. This page is a saved experiment snapshot, not a continuously running live feed.</p>
</main></body></html>"""


def render_transfer_dashboard(report: dict) -> str:
    """Static visual summary, with source/target provenance and controls."""
    warm = report["memory_guided"]
    cold = report["cold_general_search"]
    neg = report["negative_control"]
    policy = escape(report["learned_principle"]["policy"].replace("_", " "))
    source = report["source_evidence"]["source_seed_range"]
    target = report["target_seed_range"]
    warm_width = warm["median_interventions"] / max(cold["median_interventions"], 1) * 100
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AION Genesis · Transferable Learning Observatory</title>
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#0a101b;color:#eaf1fb;
font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}}
main{{max-width:950px;margin:auto;padding:30px 18px 65px}}.eyebrow{{font-size:11px;letter-spacing:.16em;color:#70d8d8;font-weight:800}}
h1{{font-size:clamp(32px,7vw,52px);letter-spacing:-.05em;line-height:1.06;margin:15px 0}}
.intro{{max-width:710px;color:#9aaac0;line-height:1.65;font-size:14px}}.panel{{background:linear-gradient(140deg,#152436,#101825);
border:1px solid #2a3a4f;border-radius:18px;padding:21px;margin-top:15px}}.kpis{{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-top:25px}}
.kpi span{{color:#90a2b6;font-size:11px}}.kpi strong{{display:block;font-size:clamp(26px,5vw,39px);margin:8px 0;letter-spacing:-.05em}}
.kpi small{{color:#8396ab}}h2{{font-size:17px;margin:0 0 17px}}.bars{{display:grid;gap:11px}}.barlabel{{display:flex;justify-content:space-between;
gap:12px;font-size:13px;color:#b8c7d7}}.rail{{height:13px;background:#1c2c3a;border-radius:999px;overflow:hidden;margin-top:7px}}
.fill{{height:100%;border-radius:999px}}.flow{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}}
.tile{{border:1px solid #324459;border-radius:13px;padding:16px;background:#111e2e}}.tile .n{{color:#63d6c0;font-weight:800;font-size:10px;letter-spacing:.1em}}
.tile h3{{font-size:16px;margin:9px 0}}.tile p{{color:#94a9be;font-size:12px;line-height:1.6;margin:0}}
.warning{{color:#f4c78d;font-size:13px;line-height:1.7}}footer{{color:#71869c;font-size:12px;line-height:1.7;margin-top:22px}}
@media(max-width:700px){{.kpis,.flow{{grid-template-columns:1fr}}.kpis{{gap:8px}}.kpi{{padding:15px}}}}
</style></head><body><main>
<div class="eyebrow">AION GENESIS / META-LEARNING EXPERIMENT / V0.3</div>
<h1>One principle.<br>New worlds.</h1>
<p class="intro">The system selects an experiment policy on known three-variable causal problems, stores the validated policy,
then evaluates it unchanged on unfamiliar four-variable causal problems.</p>
<section class="kpis"><div class="panel kpi"><span>MEMORY-GUIDED SUCCESS</span><strong style="color:#64e0b8">{warm['success_rate']*100:.0f}%</strong>
<small>{target[1]-target[0]+1} held-out worlds</small></div>
<div class="panel kpi"><span>MEDIAN PROBES · MEMORY</span><strong>{warm['median_interventions']:.0f}</strong><small>interventions</small></div>
<div class="panel kpi"><span>MEDIAN PROBES · COLD</span><strong>{cold['median_interventions']:.0f}</strong><small>interventions</small></div></section>
<section class="panel"><h2>Interventions needed for validated recovery</h2><div class="bars">
<div><div class="barlabel"><span>Cold general search</span><strong>{cold['median_interventions']:.0f}</strong></div>
<div class="rail"><div class="fill" style="width:100%;background:#ef8d85"></div></div></div>
<div><div class="barlabel"><span>Recalled principle</span><strong>{warm['median_interventions']:.0f}</strong></div>
<div class="rail"><div class="fill" style="width:{warm_width:.2f}%;background:#64dcb6"></div></div></div></div>
<p class="intro">Final prediction MAE: memory {warm['mean_final_mae']:.3f}, cold {cold['mean_final_mae']:.3f}.
Both methods can represent the unknown rule; only experimental efficiency differs.</p></section>
<section class="panel"><h2>How one learning policy transfers</h2><div class="flow">
<div class="tile"><div class="n">SOURCE / LEARN</div><h3>Three-variable worlds</h3><p>Compare two candidate experiment policies on seed range {source[0]}–{source[1]}.</p></div>
<div class="tile"><div class="n">MEMORY / FREEZE</div><h3>{policy}</h3><p>Preserve the validated strategy with source provenance and checksum.</p></div>
<div class="tile"><div class="n">TARGET / TEST</div><h3>Four-variable worlds</h3><p>Use the frozen policy on unseen seeds {target[0]}–{target[1]}; do not learn from target scores.</p></div>
</div></section>
<section class="panel"><h2>Negative-control research gate</h2><p class="warning">On {neg['worlds']} XOR-rule worlds,
the stored conjunction principle correctly withheld promotion in {neg['correct_abstention_rate']*100:.0f}% of tests.
The system did not solve XOR; it rejected an unsupported explanation.</p></section>
<footer>Controlled four-bit causal research world. This is not an LLM-trained skill, autonomous algorithm invention, or a general intelligence benchmark.
The source learns which of two human-designed policies to retain. This page is a saved experiment result.</footer>
</main></body></html>"""


def render_tradeflow_world_dashboard(report: dict) -> str:
    """Self-contained phone-friendly research snapshot of simulated businesses."""
    results = report["results"]
    cohort = report["cohort"]
    drift = report["shift_detection"]
    order = ("cost_first", "static_risk_rule", "adaptive_risk", "drift_aware_risk")
    names = {"cost_first": "Cost-first", "static_risk_rule": "Fixed risk rule",
             "adaptive_risk": "Adaptive statistics", "drift_aware_risk": "Drift-aware learner"}
    maximum = max(results[name]["mean_net_contribution"] for name in order)
    bars = ""
    for name in order:
        row = results[name]
        pct = row["mean_net_contribution"] / maximum * 100
        color = "#5de5b8" if name == "drift_aware_risk" else "#8ab2e3"
        bars += (f'<div class="item"><div class="labels"><strong>{escape(names[name])}</strong>'
                 f'<span>{row["mean_net_contribution"] / 100:,.0f} credits</span></div>'
                 f'<div class="track"><div class="fill" style="width:{pct:.2f}%;background:{color}"></div></div>'
                 f'<div class="sub">On-time {row["mean_ontime_rate"]*100:.1f}% · '
                 f'Post-shift contribution {row["mean_after_shift_contribution"] / 100:,.0f} credits</div></div>')
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AION · TradeFlow World V1</title>
<style>:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#090f19;color:#e7f2fc;
font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}}
main{{max-width:960px;margin:auto;padding:30px 18px 60px}}.eyebrow{{color:#73dcd1;font-size:11px;letter-spacing:.16em;font-weight:800}}
h1{{font-size:clamp(29px,6vw,50px);letter-spacing:-.05em;margin:19px 0 10px}}
.intro{{font-size:14px;line-height:1.7;color:#9eb0c4;max-width:700px}}.cards{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:27px 0 15px}}
.card,.panel{{border:1px solid #294052;background:linear-gradient(140deg,#142434,#101826);border-radius:17px;padding:19px}}
.card span{{display:block;color:#90a5b8;font-size:11px}}.card strong{{font-size:30px;letter-spacing:-.04em;display:block;margin:11px 0 6px}}
.card small{{color:#9bb0c1}}.panel{{margin-top:14px}}h2{{font-size:16px;margin:0 0 18px}}.item{{margin-bottom:23px}}
.labels{{display:flex;justify-content:space-between;gap:12px;font-size:13px;margin-bottom:8px}}
.labels span{{color:#cad8e6}}.track{{background:#213349;height:12px;border-radius:999px;overflow:hidden}}
.fill{{height:100%;border-radius:999px}}.sub{{font-size:12px;color:#879db3;margin-top:7px}}
.explain{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}p{{line-height:1.65;color:#a4b5c7;font-size:13px}}
.warn{{border-left:3px solid #d3a363;padding-left:13px}}footer{{font-size:11px;color:#778da3;line-height:1.6;margin-top:22px}}
@media(max-width:720px){{.cards{{grid-template-columns:1fr 1fr}}.explain{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">AION GENESIS / TRADEFLOW WORLD / SYNTHETIC LABORATORY</div>
<h1>A business that can change.</h1>
<p class="intro">Four decision strategies face matched fictional electrical-contractor jobs. Supplier reliability changes partway through.
The agent observes procurement and crew delays, then updates its estimates without knowing the simulator's hidden parameters.</p>
<section class="cards"><div class="card"><span>SIMULATED COMPANIES</span><strong>{cohort['companies']}</strong><small>independent seeds</small></div>
<div class="card"><span>JOBS PER COMPANY</span><strong>{cohort['jobs_per_company']}</strong><small>fixed test protocol</small></div>
<div class="card"><span>SUPPLIER RULE CHANGE</span><strong>#{cohort['hidden_shift_after_job']}</strong><small>job index, hidden from policies</small></div></section>
<section class="panel"><h2>Mean net contribution per company</h2><div class="sub">Hypothetical credits, not real revenue or prices. Higher is better.</div>
<div style="margin-top:22px">{bars}</div></section>
<div class="explain"><section class="panel"><h2>Did the drift monitor work?</h2>
<p><strong>{drift['drift_detection_rate_after_change']*100:.0f}%</strong> of shifts detected after the change;
<strong>{drift['false_alarms_in_unchanged_worlds']}</strong> false alarms in {drift['unchanged_control_companies']} unchanged controls.</p>
<p>The monitor accumulates evidence of a supplier reliability change before revising its estimates.</p></section>
<section class="panel"><h2>What is still unproven?</h2><p class="warn">This is not Qwen executing TradeFlow operations.
The decision policies are programmed baselines and the data are fully fictional.
We still need a live model adapter, more realistic workflows, adversarial cases and independent transfer tests.</p></section></div>
<footer>All actions occur inside an isolated Python simulator. No TradeFlow production connection, real customer data,
invoices, purchases, crew assignments or external side effects.</footer>
</main></body></html>"""


def render_model_dashboard(report: dict) -> str:
    """Static, mobile-readable report of an explicit fixture or real endpoint run."""
    evaluated = report["model_policy"]
    baselines = report["baselines"]
    mode = report["inference_kind"]
    is_fixture = mode == "DETERMINISTIC_FIXTURE_NOT_AN_LLM"
    title = "Wiring fixture only — NO model inference" if is_fixture else "Configured chat endpoint trial"
    rows = [(report["model"], evaluated["mean_net_contribution_cents"],
             evaluated["mean_ontime_rate"], True)]
    control = report.get("no_memory_control")
    if control is not None:
        rows.append((report["model"] + " · memory disabled",
                     control["mean_net_contribution_cents"], control["mean_ontime_rate"], False))
    rows.extend((name.replace("_", " "), x["mean_net_contribution_cents"],
                 x["mean_ontime_rate"], False) for name, x in baselines.items())
    ceiling = max(1, max(x[1] for x in rows))
    bars = "".join(
        f'<div class="row"><div class="label"><strong>{escape(name)}</strong>'
        f'<span>{margin/100:,.0f} fictional credits · {ontime*100:.1f}% on time</span></div>'
        f'<div class="rail"><div class="bar" style="width:{max(0,margin)/ceiling*100:.1f}%;'
        f'background:{"#60e6be" if model else "#799fc8"}"></div></div></div>'
        for name, margin, ontime, model in rows
    )
    timeline = "".join(
        f'<tr><td>{x["job_index"]+1}</td><td>{escape(x["supplier"])}</td>'
        f'<td>{"yes" if x["reserve_crew"] else "no"}</td>'
        f'<td>{"late" if x["late"] else "on time"}</td>'
        f'<td>{escape(x["hypothesis"])}</td></tr>'
        for x in report["first_episode_trace"]
    )
    control_note = (
        '<p>A paired no-memory control was run on the same jobs. ' 
        'Its observations were withheld from subsequent prompts. ' 
        'A single trial does not establish a transferable benefit.</p>'
        if control is not None else
        '<p>No memory ablation was run. Use --ablate-memory to check whether recalled '
        'experiences improve decisions, accounting for twice the inference calls.</p>'
    )
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>AION Genesis · Model Laboratory</title>
<style>:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;color:#eaf5ff;background:#090f18;
font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}}main{{max-width:920px;margin:auto;padding:28px 16px 68px}}
.eyebrow{{font-size:11px;letter-spacing:.13em;font-weight:800;color:#65d7d0}}h1{{letter-spacing:-.05em;font-size:clamp(31px,6vw,49px);line-height:1.07;margin:17px 0}}
.intro,p{{font-size:13px;line-height:1.7;color:#9dafc1}}.alert{{border:1px solid #966947;background:#322519;color:#ffd79c;padding:14px 16px;
border-radius:14px;margin:20px 0;font-size:13px}}.panel,.stat{{background:linear-gradient(130deg,#172636,#101a27);border:1px solid #2b4050;
border-radius:16px;padding:19px}}.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}}
.stat span{{font-size:11px;color:#99b0c4}}.stat strong{{display:block;font-size:30px;margin-top:8px}}.panel{{margin-top:14px}}
h2{{font-size:16px;margin:0 0 14px}}.row{{margin:20px 0}}.label{{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;
font-size:12px}}.label span{{color:#91a8bf}}.rail{{margin-top:8px;height:11px;border-radius:12px;overflow:hidden;background:#253749}}
.bar{{height:100%;border-radius:12px}}table{{border-collapse:collapse;width:100%;font-size:11px}}td,th{{padding:12px 8px;text-align:left;border-bottom:1px solid #263949}}
th{{color:#96aabe}}td:last-child{{color:#b6c8da;max-width:220px;line-height:1.5}}.scroll{{overflow-x:auto}}
footer{{color:#8a9bac;font-size:11px;line-height:1.7;margin-top:20px}}@media(max-width:700px){{.stats{{grid-template-columns:1fr 1fr}}.stat{{padding:13px}}}}
</style></head><body><main><div class="eyebrow">AION GENESIS / MODEL RESEARCH GATE / V0.5</div>
<h1>A model must earn its place.</h1><p class="intro">The exact same seeded, fictional contractor jobs and random shocks are used for
all strategies. A model can see its own prior outcomes, but never the hidden simulation rules.</p>
<div class="alert"><strong>{escape(title)}</strong><div>Experimental mode: {escape(mode)}.
No real TradeFlow records or operations. This report does not establish model learning.</div></div>
<section class="stats"><div class="stat"><span>COMPANIES</span><strong>{report['cohort']['companies']}</strong></div>
<div class="stat"><span>MODEL CALLS</span><strong>{report['cohort']['inference_calls']}</strong></div>
<div class="stat"><span>JOBS PER COMPANY</span><strong>{report['cohort']['jobs_per_company']}</strong></div></section>
<section class="panel"><h2>Paired benchmark: simulated contributions</h2><p>Hypothetical credits only; higher is better.</p>{bars}</section>
<section class="panel"><h2>Memory ablation</h2>{control_note}</section>
<section class="panel"><h2>Prediction calibration</h2>
<p>Material-delay Brier score: <strong>{evaluated['material_brier_lower_is_better']:.3f}</strong>;
crew-delay Brier score: <strong>{evaluated['crew_brier_lower_is_better']:.3f}</strong>. Lower is better.
These scores measure probabilistic accuracy, not causal understanding.</p></section>
<section class="panel"><h2>First company: hypothesis trace</h2><div class="scroll"><table><thead>
<tr><th>Job</th><th>Supplier</th><th>Reserve</th><th>Outcome</th><th>Model statement</th></tr></thead><tbody>{timeline}</tbody></table></div></section>
<footer>Operational memory consists of bounded recent experiences and aggregate counts. No model weights are trained.
The fixture ignores evidence and validates code wiring only. Live comparisons require independently verified endpoints and more held-out companies.</footer>
</main></body></html>"""


def render_tournament_dashboard(report: dict) -> str:
    """Read-only, offline tournament scoreboard; never invent missing results."""
    from html import escape as e
    plan = report["plan"]
    mode = plan["mode"]
    warning = ("SCRIPTED FIXTURES: no language-model inference or learning measured"
               if mode == "fixture" else
               "LIVE ENDPOINT MODE: model identity and learning remain unverified")
    status = e(report["status"].replace("_", " "))
    rows = []
    for entry in report["candidate_results"]:
        pilot, holdout = entry.get("pilot"), entry.get("holdout")
        def outcome(data):
            return (f'{data["model_policy"]["mean_net_contribution_cents"]/100:,.0f} credits'
                    if data is not None else "Not completed")
        control = holdout.get("no_memory_control") if holdout else None
        memory = (f'{sum(control["paired_contribution_deltas_cents"])/len(control["paired_contribution_deltas_cents"])/100:+,.0f}'
                  if control else "Not tested")
        rows.append(f'<tr><td><strong>{e(entry["id"])}</strong><small>{e(entry["status"])}</small></td>'
                    f'<td>{outcome(pilot)}</td><td>{outcome(holdout)}</td><td>{memory}</td></tr>')
    failures = "".join(f'<li>{e(x.get("candidate", "configuration"))}: '
                       f'{e(x["stage"])} · {e(x["error_type"])}</li>'
                       for x in report["failures"])
    if not rows:
        rows = ['<tr><td colspan="4">No candidate was evaluated.</td></tr>']
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AION Genesis v0.6 · Model Tournament Observatory</title><style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#0a111d;color:#e7f1fe;
font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}}main{{max-width:1000px;margin:auto;padding:29px 18px 68px}}
.eyebrow{{font-size:11px;color:#71d8d2;letter-spacing:.15em;font-weight:800}}h1{{font-size:clamp(30px,7vw,49px);
line-height:1.06;letter-spacing:-.055em;margin:16px 0}}p,.sub{{color:#9aaec2;font-size:13px;line-height:1.65}}
.notice{{padding:14px 16px;border:1px solid #ab7749;color:#ffddb0;background:#2f241a;border-radius:15px;
font-size:12px;line-height:1.5;margin:20px 0}}.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}}
.metric,.panel{{background:linear-gradient(145deg,#142336,#101925);border:1px solid #284154;border-radius:15px;padding:18px}}
.metric span{{color:#8ea8bd;display:block;font-size:10px}}.metric strong{{font-size:26px;display:block;margin-top:9px}}
.panel{{margin-top:14px}}h2{{margin:0 0 12px;font-size:16px}}table{{border-collapse:collapse;width:100%;min-width:600px}}
td,th{{padding:14px 10px;border-bottom:1px solid #273d50;text-align:left;font-size:12px}}th{{color:#a0b5c8}}
td small{{display:block;margin-top:6px;color:#7f9bad}}.scroll{{overflow-x:auto}}ul{{color:#ecc6a3;font-size:12px;line-height:1.9}}
.fine{{font-size:11px;color:#7d91a8;line-height:1.7;margin-top:22px}}
@media(max-width:620px){{.metrics{{grid-template-columns:1fr 1fr}}.metric{{padding:13px}}}}
</style></head><body><main><div class="eyebrow">AION GENESIS / RESEARCH LAB / V0.6</div>
<h1>The model tournament.</h1><p>Matched fictional contractor companies. Separate pilot and held-out seeds.
Each model makes predictions before seeing outcomes; memory-on and no-memory policies can be compared.
No live business actions, automated promotions, or customer data.</p>
<div class="notice">{e(warning)}<div style="margin-top:6px">Experiment status: <strong>{status}</strong></div></div>
<section class="metrics"><div class="metric"><span>CANDIDATES</span><strong>{len(plan['candidate_ids'])}</strong></div>
<div class="metric"><span>ATTEMPTED CALLS</span><strong>{report['attempted_calls']}</strong></div>
<div class="metric"><span>CALL CAP</span><strong>{plan['max_total_calls']}</strong></div></section>
<section class="panel"><h2>Matched comparison · simulated contribution</h2><p class="sub">No winner is promoted.
Only fully completed runs may produce a paired comparison. Money is fictional credits.</p>
<div class="scroll"><table><thead><tr><th>Candidate</th><th>Pilot</th><th>Holdout</th><th>Holdout memory benefit (credits)</th>
</tr></thead><tbody>{''.join(rows)}</tbody></table></div></section>
<section class="panel"><h2>Controls</h2><p>Memory ablation: {"enabled" if plan['memory_ablation'] else "disabled"}.
Pilot starts at seed {plan['pilot_start_seed']}; holdout at {plan['holdout_start_seed']}.
The trial uses {plan['jobs']} jobs per company and an undisclosed-to-agent supplier change.</p>
<p>The experiment plan is identified by SHA-256: <code>{e(report['protocol_sha256'][:16])}…</code>.</p></section>
<section class="panel"><h2>Failures and incomplete evidence</h2>{'<ul>'+failures+'</ul>' if failures else
'<p>No failures were recorded in this run. That does not establish model quality.</p>'}</section>
<p class="fine">A static research snapshot, not a running service. Paired scores cannot establish general intelligence,
and observed memory effects are not proof of transferable causal understanding. A tiny holdout has low statistical power.</p>
</main></body></html>"""
