# ASIL v2.5 — preregistered synthetic experiment

Synthetic simulation only. Zero model calls, no real business action, no protected holdout. A met criterion is not a promotion.

**Status: PRESPECIFIED_CRITERIA_NOT_ALL_MET**

## validation (60 cases)

| Policy | Paid jobs | Denied | Total cash change | Worst case cash | Planning ops | Fast / deep decisions |
|---|---:|---:|---:|---:|---:|---:|
| adaptive | 171/180 | 3 | +33200 | -276 | 106038 | 464 / 249 |
| fast_only | 88/180 | 0 | +2738 | -1151 | 0 | 309 / — |
| deep_only | 168/180 | 0 | +33641 | -279 | 203949 | — / 695 |
| memory_off | 168/180 | 0 | +33587 | -279 | 209692 | — / 696 |
| planner_only | 126/180 | 1 | +18483 | -521 | — | — / — |
| runtime_memory_off | 126/180 | 1 | +18483 | -521 | — | — / — |
| runtime_memory_on | 88/180 | 2 | +13252 | -415 | — | — / — |
| deadline_first | 118/180 | 0 | +15903 | -674 | — | — / — |
| cash_first | 132/180 | 0 | +21204 | -550 | — | — / — |
| risk_averse | 144/180 | 3 | +26999 | -368 | — | — / — |
| no_action | 0/180 | 0 | +0 | +0 | — | — / — |

## novel (30 cases)

| Policy | Paid jobs | Denied | Total cash change | Worst case cash | Planning ops | Fast / deep decisions |
|---|---:|---:|---:|---:|---:|---:|
| adaptive | 68/90 | 13 | +8065 | -494 | 51741 | 220 / 153 |
| deep_only | 70/90 | 0 | +12806 | +112 | 76536 | — / 358 |
| memory_off | 70/90 | 0 | +12806 | +112 | 85587 | — / 358 |
| runtime_memory_off | 52/90 | 4 | +3250 | -731 | — | — / — |
| deadline_first | 51/90 | 2 | +3137 | -859 | — | — / — |
| cash_first | 49/90 | 6 | +1117 | -1100 | — | — / — |
| risk_averse | 66/90 | 8 | +9671 | -541 | — | — / — |

## false_familiarity_twins (30 cases)

| Policy | Paid jobs | Denied | Total cash change | Worst case cash | Planning ops | Fast / deep decisions |
|---|---:|---:|---:|---:|---:|---:|
| adaptive | 85/90 | 0 | +15400 | -21 | 76877 | 224 / 215 |
| deep_only | 78/90 | 0 | +13632 | -241 | 144216 | — / 410 |
| memory_off | 74/90 | 0 | +12606 | -388 | 202348 | — / 392 |
| runtime_memory_off | 37/90 | 0 | +1165 | -592 | — | — / — |
| deadline_first | 28/90 | 0 | -4004 | -1156 | — | — / — |
| cash_first | 44/90 | 0 | +3362 | -1157 | — | — / — |
| risk_averse | 51/90 | 0 | +7350 | -395 | — | — / — |

## Prespecified criteria

| Criterion | Status |
|---|---|
| decision_quality_vs_strongest_baseline | MET |
| experience_does_not_hurt | MET |
| experience_improves_decisions | NOT_MET |
| deep_reasoning_used_selectively | MET |
| safety | MET |
| false_familiarity | MET |
| fast_path_calibration | MET |
| retention_on_familiar_cases | MET |
| transfer_to_novel_cases | NOT_MET |

## Memory negative controls (adaptive)

| Memory | Paid jobs | Denied | Cash change | Planning ops | False familiarity |
|---|---:|---:|---:|---:|---:|
| clean | 85/90 | 1 | +16913 | 60021 | 3/223 |
| misleading | 85/90 | 1 | +16913 | 60021 | 3/223 |
| stale | 85/90 | 0 | +17368 | 101112 | 0/0 |

## Retention

First exposure 173/180 paid with 103090 planning operations; repeat 173/180 with 93286.

