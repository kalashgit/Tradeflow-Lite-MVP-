"""Genesis observatory: one standalone, phone-readable research report.

Same machinery as the earlier dashboards in ``aion_genesis.dashboard``: a single
dark HTML file with inline SVG and no scripts or external assets. Every number
comes from the result that the validator recomputes from the ledger.
"""

from html import escape as e

from .ledger import events

# Categorical series colours (fixed order, validated for the dark surface) and
# reserved status colours, which always travel with an icon and a word.
SERIES = {"aion_v1_memory": "#3987e5", "aion_v12_contextual": "#41c5bb",
          "aion_v12_hybrid": "#80b6ed",
          "aion_v123_relevant": "#8bde91",
          "v09_strategist": "#d95926",
          "fixed_rule": "#199e70", "no_action": "#c98500"}
STATUS = {"PASS": ("#0ca30c", "✓"), "FAIL": ("#d03b3b", "✕"),
          "INCONCLUSIVE": ("#fab219", "?"), "BLOCKED": ("#ec835a", "■")}
NAMES = {"aion_v1_memory": "AION v1 · memory on",
         "aion_v12_contextual": "AION v1.2 · contextual memory",
         "aion_v12_hybrid": "AION v1.2 · hierarchical memory",
         "aion_v123_relevant": "AION v1.2.3 · relevant recall",
         "v09_strategist": "v0.9 strategist",
         "fixed_rule": "Fixed rule", "no_action": "No action"}
SURFACE, INK, MUTED, GRID = "#0a111d", "#e7f1fe", "#9aaec2", "#263a4d"

_CSS = """
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0a111d;color:#e7f1fe;
font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:1000px;margin:auto;padding:26px 16px 72px}
.eyebrow{font-size:11px;color:#71d8d2;letter-spacing:.15em;font-weight:800}
h1{font-size:clamp(28px,7vw,46px);line-height:1.06;letter-spacing:-.05em;margin:14px 0 10px}
h2{margin:0 0 6px;font-size:17px}h3{margin:18px 0 6px;font-size:13px;color:#c6d6e6}
p,li{color:#9aaec2;font-size:13px;line-height:1.65}p{margin:6px 0}
.notice{padding:13px 15px;border:1px solid #ab7749;color:#ffddb0;background:#2f241a;
border-radius:14px;font-size:12px;line-height:1.55;margin:16px 0}
.verdict{display:flex;gap:14px;align-items:center;border-radius:16px;padding:16px 18px;
margin:14px 0;border:1px solid #284154;background:linear-gradient(145deg,#142336,#101925)}
.badge{display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:12px;
letter-spacing:.06em;border:1px solid currentColor;border-radius:999px;padding:4px 10px;
white-space:nowrap}.verdict .badge{font-size:17px;padding:9px 16px}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
.card,.panel{background:linear-gradient(145deg,#142336,#101925);border:1px solid #284154;
border-radius:15px;padding:16px}.card span{color:#8ea8bd;display:block;font-size:10px;
letter-spacing:.09em;font-weight:800}.card>strong{font-size:24px;display:block;margin:9px 0 4px;
letter-spacing:-.03em}.card small{color:#9aaec2;font-size:11.5px;line-height:1.5;display:block}
.panel{margin-top:14px}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}
td,th{padding:9px 8px;border-bottom:1px solid #273d50;text-align:left;font-size:12px;
vertical-align:top}th{color:#a0b5c8;font-weight:600;white-space:nowrap}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
svg{display:block;width:100%;height:auto;margin-top:10px}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#c6d6e6;margin-top:8px}
.key{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;
margin-right:6px}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
gap:12px}.mini{border:1px solid #223548;border-radius:12px;padding:10px 12px}
.mini b{font-size:12px}details{border-top:1px solid #273d50;padding:9px 0}
summary{cursor:pointer;font-size:12.5px;color:#c6d6e6}code{font-size:11px;color:#b9cce0;
overflow-wrap:anywhere}.check{border-top:1px solid #273d50;
padding:11px 0 4px}.check strong{font-size:13px;margin-left:6px}.fine{font-size:11px;color:#7d91a8;line-height:1.7;margin-top:20px}
.muted{color:#7d91a8}.wide svg{min-width:620px}@media(max-width:680px){.cards{grid-template-columns:1fr}
.verdict{flex-direction:column;align-items:flex-start}}
"""


def _badge(label: str) -> str:
    colour, icon = STATUS.get(label, (MUTED, "·"))
    return f'<span class="badge" style="color:{colour}">{icon} {e(label)}</span>'


def _num(value, digits: int = 2, signed: bool = False) -> str:
    if value is None:
        return "—"
    return f"{value:+,.{digits}f}" if signed else f"{value:,.{digits}f}"


def _rate(record) -> str:
    if not isinstance(record, dict) or record.get("rate") is None:
        return "not measured"
    return f'{record["rate"] * 100:.1f}% ({record["numerator"]}/{record["denominator"]})'


def _interval(interval, digits: int = 2, scale: float = 1.0) -> str:
    if not interval:
        return "—"
    return f"[{interval[0] * scale:+,.{digits}f}, {interval[1] * scale:+,.{digits}f}]"


def _pretty(name: str) -> str:
    return name.replace("_", " ")


def _bar(x: float, y: float, width: float, height: float, colour: str, tip: str) -> str:
    """Horizontal bar: square at the baseline, rounded only at the data end."""
    r = min(4.0, height / 2, max(width, 0.01))
    w = max(width, r)
    return (f'<path d="M{x:.1f},{y:.1f}h{w - r:.1f}a{r},{r} 0 0 1 {r},{r}v{height - 2 * r:.1f}'
            f'a{r},{r} 0 0 1 -{r},{r}h-{w - r:.1f}z" fill="{colour}"><title>{e(tip)}</title></path>')


def _harm_chart(scorecard: dict, candidate: str, baseline: str) -> str:
    families = scorecard["families_with_per_decision_counterfactuals"]
    rows = [(family, variant) for family in families for variant in ("nominal", "shifted")]
    if not rows:
        return "<p>No world in this run defines a per-decision counterfactual.</p>"
    left, plot, row_h, top = 196, 330, 44, 26
    height = top + row_h * len(rows) + 8
    parts = []
    for tick in (0, 25, 50, 75, 100):
        x = left + plot * tick / 100
        parts.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{height - 6}" '
                     f'stroke="{GRID}"/><text x="{x:.1f}" y="{top - 11}" font-size="10" '
                     f'fill="{MUTED}" text-anchor="middle">{tick}%</text>')
    for index, (family, variant) in enumerate(rows):
        y = top + index * row_h
        quality = scorecard["decision_quality"][family][variant]
        parts.append(f'<text x="0" y="{y + 12}" font-size="11.5" fill="{INK}">'
                     f'{e(_pretty(family))}</text><text x="0" y="{y + 26}" font-size="10.5" '
                     f'fill="{MUTED}">{variant}</text>')
        for offset, policy in ((2, candidate), (17, baseline)):
            harm = quality[policy]["harmful_choice"]
            rate = harm.get("rate") or 0.0
            label = _rate(harm)
            parts.append(_bar(left, y + offset, plot * rate, 11, SERIES[policy],
                              f"{NAMES[policy]} · {_pretty(family)} · {variant}: {label}"))
            parts.append(f'<text x="{left + plot * rate + 7:.1f}" y="{y + offset + 9.5}" '
                         f'font-size="10.5" fill="{INK}">{label}</text>')
    return (f'<svg viewBox="0 0 700 {height}" role="img" aria-label="Share of decisions '
            f'realized worse than no action, by world family and variant">{"".join(parts)}</svg>'
            f'<div class="legend"><span><i class="key" style="background:{SERIES[candidate]}">'
            f'</i>{e(NAMES[candidate])}</span><span><i class="key" style="background:'
            f'{SERIES[baseline]}"></i>{e(NAMES[baseline])}</span></div>')


def _forest(comparisons: dict, families: list[str], candidate="aion_v1_memory") -> str:
    rows = []
    for family in families:
        for variant in ("nominal", "shifted"):
            delta = comparisons[family][variant]["paired_mean_episode_utility_delta"]
            if delta.get("value") is not None and delta.get("ci95"):
                rows.append((family, variant, delta["value"], delta["ci95"], delta["n"]))
    if not rows:
        return "<p>Not enough paired episodes for an interval.</p>"
    low = min(0.0, min(r[3][0] for r in rows))
    high = max(0.0, max(r[3][1] for r in rows))
    pad = (high - low) * 0.06 or 1.0
    low, high = low - pad, high + pad
    left, plot, row_h, top = 196, 300, 34, 26
    height = top + row_h * len(rows) + 10

    def x(value: float) -> float:
        return left + plot * (value - low) / (high - low)

    parts = [f'<line x1="{x(0):.1f}" y1="{top - 8}" x2="{x(0):.1f}" y2="{height - 8}" '
             f'stroke="{MUTED}" stroke-dasharray="3 4"/><text x="{x(0):.1f}" y="{top - 12}" '
             f'font-size="10" fill="{MUTED}" text-anchor="middle">0 = same as baseline</text>']
    for index, (family, variant, value, interval, count) in enumerate(rows):
        y = top + index * row_h + 12
        tip = (f"{_pretty(family)} · {variant}: Δ {value:+.2f}, 95% CI "
               f"{_interval(interval)}, n={count} paired episodes")
        parts.append(
            f'<text x="0" y="{y - 2}" font-size="11.5" fill="{INK}">{e(_pretty(family))}</text>'
            f'<text x="0" y="{y + 11}" font-size="10.5" fill="{MUTED}">{variant}</text>'
            f'<g><title>{e(tip)}</title><line x1="{x(interval[0]):.1f}" y1="{y}" '
            f'x2="{x(interval[1]):.1f}" y2="{y}" stroke="{SERIES[candidate]}" '
            f'stroke-width="2"/><circle cx="{x(value):.1f}" cy="{y}" r="5" '
            f'fill="{SERIES[candidate]}" stroke="{SURFACE}" stroke-width="2"/></g>'
            f'<text x="{left + plot + 10}" y="{y + 4}" font-size="10.5" fill="{INK}">'
            f'{value:+.2f} {_interval(interval)}</text>')
    return (f'<svg viewBox="0 0 700 {height}" role="img" aria-label="Paired mean episode '
            f'utility difference, candidate minus baseline, with 95% intervals">'
            f'{"".join(parts)}</svg>')


def _curve(points: list[dict], title: str, candidate="aion_v1_memory") -> str:
    if not points:
        return ""
    values = [p["mean_utility_delta"] for p in points]
    low, high = min(0.0, min(values)), max(0.0, max(values))
    span = (high - low) or 1.0
    low, high = low - span * 0.15, high + span * 0.15
    width, height, left, right, top, bottom = 300, 150, 40, 44, 12, 26

    def px(index: int) -> float:
        return left + (width - left - right) * index / max(1, len(points) - 1)

    def py(value: float) -> float:
        return top + (height - top - bottom) * (1 - (value - low) / (high - low))

    line = " ".join(f"{px(i):.1f},{py(v):.1f}" for i, v in enumerate(values))
    colour = SERIES[candidate]
    marks = "".join(
        f'<circle cx="{px(i):.1f}" cy="{py(v):.1f}" r="4" fill="{colour}" stroke="{SURFACE}" '
        f'stroke-width="2"><title>Decision {p["step"] + 1}: Δ {v:+.2f} utility, '
        f'n={p["n"]}</title></circle>' for i, (p, v) in enumerate(zip(points, values)))
    ticks = "".join(
        f'<text x="{px(i):.1f}" y="{height - 8}" font-size="9.5" fill="{MUTED}" '
        f'text-anchor="middle">{p["step"] + 1}</text>' for i, p in enumerate(points))
    return (
        f'<div class="mini"><b>{e(title)}</b><svg viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="{e(title)}: memory on minus memory off, by decision number">'
        f'<line x1="{left}" y1="{py(0):.1f}" x2="{width - right}" y2="{py(0):.1f}" '
        f'stroke="{MUTED}" stroke-dasharray="3 4"/><text x="{left - 6}" y="{py(0) + 3:.1f}" '
        f'font-size="9.5" fill="{MUTED}" text-anchor="end">0</text>'
        f'<text x="{left - 6}" y="{py(max(values)) + 3:.1f}" font-size="9.5" fill="{MUTED}" '
        f'text-anchor="end">{max(values):+.1f}</text>'
        f'<polyline points="{line}" fill="none" stroke="{colour}" stroke-width="2"/>{marks}'
        f'<text x="{px(len(values) - 1) + 8:.1f}" y="{py(values[-1]) + 3:.1f}" font-size="10.5" '
        f'fill="{INK}">{values[-1]:+.2f}</text>{ticks}</svg></div>')


def _gate_table(gate: dict) -> str:
    rows = "".join(
        f'<div class="check"><div>{_badge(c["status"])} <strong>{e(_pretty(c["name"]))}'
        f'</strong></div><p>{e(c["detail"])}</p><p><span class="muted">Observed:</span> '
        f'{e(_summary(c["observed"]))}<br><span class="muted">Threshold:</span> '
        f'{e(str(c["threshold"]))}</p></div>' for c in gate["checks"])
    role = "decisive" if gate["decisive"] else "selection signal only"
    return (f'<h3>{e(gate["partition"])} partition · {role} · gate verdict '
            f'{_badge(gate["verdict"])}</h3>{rows}')


def _summary(observed) -> str:
    if isinstance(observed, dict) and "relative_reduction" in observed:
        return (f'candidate {_rate(observed["candidate"])}, baseline '
                f'{_rate(observed["baseline"])}; relative reduction '
                f'{_num((observed["relative_reduction"] or 0) * 100, 1)}%; rate Δ 95% CI '
                f'{_interval(observed["rate_delta_ci95"], 1, 100)} pts')
    if isinstance(observed, dict):
        def value(number):
            if number is None:
                return "not measured"
            if isinstance(number, bool):
                return str(number)
            if isinstance(number, (int, float)):
                return _num(number, 2)
            return str(number)

        return "; ".join(
            f"{_pretty(k)}: " + (
                ", ".join(f"{a} {value(b)}" for a, b in v.items()
                          if not isinstance(b, list))
                + (f' {_interval(v["ci95"])}' if isinstance(v.get("ci95"), list) else "")
                if isinstance(v, dict) else value(v))
            for k, v in observed.items()) or "—"
    return str(observed)


def _quality_table(scorecard: dict, config: dict) -> str:
    body = []
    for family in config["families"]:
        for variant in ("nominal", "shifted"):
            for policy in config["policies"]:
                m = scorecard["decision_quality"][family][variant][policy]
                regret = m["mean_episode_regret_to_hindsight_oracle"]["value"]
                body.append(
                    f'<tr><td>{e(_pretty(family))}<div class="muted">{variant}</div></td>'
                    f'<td><i class="key" style="background:{SERIES[policy]}"></i>'
                    f'{e(NAMES[policy])}</td>'
                    f'<td class="n">{_num(m["mean_episode_utility"]["value"])}</td>'
                    f'<td class="n">{_rate(m["harmful_choice"])}</td>'
                    f'<td class="n">{_rate(m["episode_worse_than_no_action"])}</td>'
                    f'<td class="n">{_num(regret)}</td>'
                    f'<td class="n">{_num(m["worst_decile_mean_delta_vs_no_action"])}</td>'
                    f'<td class="n">{m["abstentions"]["numerator"]}/'
                    f'{m["abstentions"]["denominator"]}</td>'
                    f'<td class="n">{m["safety_failures"]}</td></tr>')
    return ('<div class="scroll"><table><thead><tr><th>World</th><th>Policy</th>'
            '<th class="n">Mean episode utility</th><th class="n">Decisions worse than '
            'no action</th><th class="n">Episodes worse than no action</th>'
            '<th class="n">Regret to hindsight oracle</th><th class="n">Worst-decile Δ '
            'vs no action</th><th class="n">Abstained</th><th class="n">Safety failures</th>'
            f'</tr></thead><tbody>{"".join(body)}</tbody></table></div>')


def _replay(records: list[dict], partition: str, config: dict) -> str:
    candidate, baseline = config["candidate"], config["baseline"]
    episodes, decisions = {}, {}
    for event in events(records):
        if event.get("partition") != partition:
            continue
        key = (event["family"], event["variant"], event["seed"], event["policy"])
        if event["type"] == "episode":
            episodes[key] = event
        elif event["type"] == "decision":
            decisions.setdefault(key, []).append(event)
    gaps = sorted(
        (episodes[k]["episode_value"] - episodes[(*k[:3], baseline)]["episode_value"], k)
        for k in episodes if k[3] == candidate and (*k[:3], baseline) in episodes)
    chosen = gaps[:4] + gaps[-3:] if len(gaps) > 7 else gaps
    blocks = []
    for gap, (family, variant, seed, _) in chosen:
        lines = []
        for mine, theirs in zip(decisions[(family, variant, seed, candidate)],
                                decisions[(family, variant, seed, baseline)]):
            lines.append(
                f'<tr><td class="n">{mine["step"] + 1}</td><td>{e(mine["applied"])}'
                f'<div class="muted">{e(mine["route"])} · memory v'
                f'{mine["memory_version"] or 0}</div></td>'
                f'<td class="n">{_num(mine["predicted_value"])}</td>'
                f'<td class="n">{_num(mine["realized_value"])}</td>'
                f'<td>{e(theirs["applied"])}</td>'
                f'<td class="n">{_num(theirs["realized_value"])}</td>'
                f'<td class="n">{_num(mine["no_action_value"])}</td>'
                f'<td class="n">{_num(mine["oracle_value"])}</td>'
                f'<td>{e(", ".join(mine["failure_classes"]) or "—")}</td></tr>')
        blocks.append(
            f'<details><summary>{e(_pretty(family))} · {variant} · seed {seed} · candidate '
            f'minus baseline {gap:+.2f}</summary><div class="scroll"><table><thead><tr>'
            f'<th class="n">#</th><th>Candidate applied</th><th class="n">Predicted</th>'
            f'<th class="n">Realized</th><th>Baseline applied</th><th class="n">Realized</th>'
            f'<th class="n">No action</th><th class="n">Oracle</th><th>Flags</th></tr>'
            f'</thead><tbody>{"".join(lines)}</tbody></table></div></details>')
    return "".join(blocks) or "<p>No paired episodes recorded.</p>"


def _failures(result: dict) -> str:
    classes = sorted({name for counts in result["run"]["failure_classes"].values()
                      for name in counts})
    if not classes:
        return "<p>No failure of any class was recorded.</p>"
    head = "".join(f'<th class="n">{e(_pretty(name))}</th>' for name in classes)
    body = "".join(
        f'<tr><td><i class="key" style="background:{SERIES.get(policy, MUTED)}"></i>'
        f'{e(NAMES.get(policy, policy))}</td>'
        + "".join(f'<td class="n">{result["run"]["failure_classes"].get(policy, {}).get(c, 0)}'
                  f'</td>' for c in classes) + "</tr>"
        for policy in result["config"]["policies"])
    return (f'<div class="scroll"><table><thead><tr><th>Policy</th>{head}</tr></thead>'
            f'<tbody>{body}</tbody></table></div>')


def render_observatory(result: dict, records: list[dict], history: list[dict] = ()) -> str:
    config, run = result["config"], result["run"]
    candidate, baseline = config["candidate"], config["baseline"]
    partition = "holdout" if "holdout" in result["partitions"] else list(
        result["partitions"])[-1]
    scorecard = result["partitions"][partition]["scorecard"]
    versus = scorecard["comparisons"]["candidate_vs_baseline"]
    harm = versus["pooled"]["shifted"]["harmful_choice_rate_delta"]
    learning = scorecard["learning_gain"]
    speed, throughput = result["speed_economics"], result["research_throughput"]
    verdict = result["verdict"]
    colour, icon = STATUS[verdict]
    gains = [(family, learning["paired"][family]["shifted"][
        "paired_mean_episode_utility_delta"]) for family in config["families"]]
    clear = [f for f, d in gains if d.get("ci95") and d["ci95"][0] > 0]
    worse = [f for f, d in gains if d.get("ci95") and d["ci95"][1] < 0]
    reduction = harm.get("relative_reduction")
    curves = "".join(
        _curve(learning["by_step"][family]["shifted"], _pretty(family) + " · shifted", candidate)
        for family in config["families"])
    latency = "".join(
        f'<tr><td><i class="key" style="background:{SERIES.get(policy, MUTED)}"></i>'
        f'{e(NAMES.get(policy, policy))}</td><td class="n">{_num(v["p50"], 3)}</td>'
        f'<td class="n">{_num(v["p95"], 3)}</td><td class="n">{v["n"]:,}</td></tr>'
        for policy, v in speed["decision_latency_ms"].items())
    unmeasured = "".join(
        f'<li><strong>{e(_pretty(name))}:</strong> {e(item["reason"])}</li>'
        for name, item in {**result["not_measured"], **{
            k: v for k, v in throughput.items() if isinstance(v, dict)}}.items())
    trend = "".join(
        f'<tr><td>{e(h["started_at_utc"])}</td><td><code>{e(h["source_commit"][:10])}</code>'
        f'</td><td>{e(", ".join(h["partitions"]))}</td><td>{_badge(h["verdict"])}</td>'
        f'<td class="n">{_num((h["headline"]["candidate_harm"] or 0) * 100, 1)}%</td>'
        f'<td class="n">{_num((h["headline"]["baseline_harm"] or 0) * 100, 1)}%</td>'
        f'<td><code>{e(h["logical_digest"][:12])}</code></td></tr>' for h in history[-12:])
    gates = "".join(_gate_table(result["partitions"][p]["gate"])
                    for p in sorted(result["partitions"], key=lambda p: p != partition))
    limits = "".join(f"<li>{e(text)}</li>" for text in result["limitations"])
    partitions = " ".join(result["partitions"])
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AION Genesis · Lab Observatory</title><style>{_CSS}</style></head><body><main>
<div class="eyebrow">AION GENESIS / EXPERIMENTAL CONTROL PLANE / {e(result["lab_version"])}</div>
<h1>Did the candidate earn promotion?</h1>
<p>Run <code>{e(run["run_id"])}</code> · source <code>{e(run["source_commit"][:12])}</code>
{"(uncommitted changes)" if result["source"]["dirty"] else ""} · started {e(result["started_at_utc"])}
· partitions: {e(partitions)}. {len(config["policies"])} policies face identical seeded worlds and shocks;
an independent referee holds every hidden outcome.</p>
<div class="notice"><strong>SYNTHETIC SIMULATION ONLY.</strong> {result["labels"]["model_inference_calls"]}
language-model calls. No real business data, no external action, no live learning and no
real-world improvement is shown by this report. Utility units and costs are invented.</div>
<section class="verdict" data-verdict="{verdict}"><span class="badge" style="color:{colour}">{icon} {verdict}</span>
<div><strong>{e(NAMES[candidate])} vs {e(NAMES[baseline])}</strong>
<p>Basis: {e(result["verdict_basis"])}. A PASS would only make the candidate eligible for a
human promotion review; nothing is ever promoted automatically.</p></div></section>
<section class="cards">
<div class="card"><span>DECISION QUALITY · {e(partition.upper())}</span>
<strong>{_num((harm.get("first", {}).get("rate") or 0) * 100, 1)}% vs {_num((harm.get("second", {}).get("rate") or 0) * 100, 1)}%</strong>
<small>Decisions realized worse than no action in shifted worlds: candidate {_rate(harm.get("first"))}
vs baseline {_rate(harm.get("second"))}. Relative reduction
{"not measured" if reduction is None else _num(reduction * 100, 1) + "%"}; target
{config["promotion_gate"]["min_relative_harm_reduction_shifted"] * 100:.0f}%.</small></div>
<div class="card"><span>LEARNING GAIN · MEMORY ON VS OFF</span>
<strong>{len(clear)} of {len(gains)} families</strong>
<small>Shifted worlds where memory-on beat its memory-off twin with a 95% interval above
zero: {e(", ".join(_pretty(f) for f in clear) or "none")}. Clearly worse:
{e(", ".join(_pretty(f) for f in worse) or "none")}. Outcome memory only; no model weights change.</small></div>
<div class="card"><span>VALIDATED RESEARCH THROUGHPUT</span>
<strong>{throughput["candidates_eligible_for_human_review"]} of {throughput["candidates_evaluated"]} eligible</strong>
<small>{speed["decisions"]:,} graded decisions in {_num(speed["wall_seconds"], 1)} s on one CPU.
Human review hours, accepted improvements and any speed-up multiplier are
<strong>not measured</strong>: this run is the first baseline.</small></div></section>

<section class="panel"><h2>Promotion gate</h2><p>Thresholds were fixed in the hashed config
before the run. The candidate cannot read or change them.</p>{gates}</section>

<section class="panel"><h2>Decisions realized worse than no action</h2>
<p>{e(partition)} partition. Lower is better. Counts are shown beside each bar. In the
resource-allocation world, preventive spend that turned out unnecessary counts as worse than
no action, so read that row together with mean utility below.</p>
<div class="scroll wide">{_harm_chart(scorecard, candidate, baseline)}</div></section>

<section class="panel"><h2>Paired utility difference: candidate minus baseline</h2>
<p>Mean difference in total episode utility on identical worlds, with 95% intervals.
Right of the dashed line favours the candidate. Units are invented and differ by world.</p>
<div class="scroll wide">{_forest(versus, config["families"], candidate)}</div></section>

<section class="panel"><h2>Learning gain by decision number</h2>
<p>Memory on minus memory off, mean utility per decision, shifted worlds. Both start with an
empty memory, so decision 1 is always zero. Each panel has its own scale.</p>
<div class="grid2">{curves}</div></section>

<section class="panel"><h2>Scorecard table</h2><p>{e(partition)} partition, every policy.
Each rate shows numerator/denominator.</p>{_quality_table(scorecard, config)}</section>

<section class="panel"><h2>Failure explorer</h2><p>All partitions in this run.
“Harmful choice” is the realized-worse-than-no-action count; the others are safety or
abstention classes.</p>{_failures(result)}
<h3>Per-episode replay · {e(partition)} · largest candidate losses, then largest wins</h3>
{_replay(records, partition, config)}</section>

<section class="panel"><h2>Speed and cost</h2>
<p>In-process Python decision latency on small option sets. This is not model or network
latency. Model calls: {speed["model_calls"]}. Tokens and monetary spend: not measured
(no model was called). Hardware: {e(speed["hardware"])}.</p>
<div class="scroll"><table><thead><tr><th>Policy</th><th class="n">p50 ms</th>
<th class="n">p95 ms</th><th class="n">Decisions</th></tr></thead><tbody>{latency}</tbody></table></div></section>

<section class="panel"><h2>Not measured</h2><ul>{unmeasured}</ul></section>

<section class="panel"><h2>Run history in this lab folder</h2><div class="scroll"><table><thead>
<tr><th>Started (UTC)</th><th>Commit</th><th>Partitions</th><th>Verdict</th>
<th class="n">Candidate harm</th><th class="n">Baseline harm</th><th>Digest</th></tr></thead>
<tbody>{trend or '<tr><td colspan="7">No earlier runs.</td></tr>'}</tbody></table></div></section>

<section class="panel"><h2>Limits of this evidence</h2><ul>{limits}</ul></section>

<section class="panel"><h2>Reproduce and verify</h2>
<p><code>cd research/aion-v06 &amp;&amp; python -m aion_genesis.lab run --out /tmp/genesis-lab</code></p>
<p><code>python -m aion_genesis.lab validate --out /tmp/genesis-lab --reproduce</code></p>
<p>Logical digest <code>{e(result["logical_digest"])}</code></p>
<p>Config <code>{e(run["artifact_hashes"]["config"][:24])}…</code> · judging protocol
<code>{e(run["artifact_hashes"]["protocol"][:24])}…</code> · ledger head
<code>{e(run["artifact_hashes"]["ledger_head"][:24])}…</code></p></section>
<p class="fine">A static research snapshot, not a running service and not the TradeFlow
product. Grader {e(run["grader_version"])} · candidate {e(run["candidate_version"])} ·
baseline {e(run["baseline_version"])}.</p>
</main></body></html>"""
