---
title: "Day 039 — Attention by Hand"
date: 2026-08-08
description: "Derived scaled dot-product attention forward/backward in NumPy — QKᵀ, causal mask, softmax, and the gradient through it."
tags: ["daily-log", "Transformers", "attention", "NumPy"]
slug: day-039-attention-by-hand
---

## The shape

Scaled dot-product attention, no framework:

```
Attention(Q,K,V) = softmax(QKᵀ / √dₖ) V
```

With a causal mask: `scores = QKᵀ / √dₖ + mask` where `mask = 0` allowed, `-inf` blocked.

## Forward

```python
scores = (Q @ K.T) / np.sqrt(d_k) + mask  # (T, T)
weights = softmax(scores, axis=-1)           # (T, T)
out = weights @ V                            # (T, d_k)
```

## Backward — where it burned

`softmax` Jacobian is the trap:

```
dL/dscores = weights * (dL/dweights - sum(dL/dweights * weights))
```

Then:

```
dQ = dScores @ K / √dₖ
dK = dScores.T @ Q / √dₖ
dV = weights.T @ dScores_V
```

Numeric check on `T=3, d=4` at `1e-4` — passed after fixing a missing `/ √dₖ` on `dK`.

## Reflection

CNNs taught me to trust the grid. Attention taught me to trust the mask. Tomorrow: multi-head + residual + layernorm — same paper, new choreography.

Day 039. Committed.
