---
title: "Day 040 — Multi-Head, Residual & Layernorm by Hand"
date: 2026-08-10
description: "Stacked 4-head attention + residual + layernorm forward/backward in NumPy — same mask, new choreography, grads checked at 1e-4."
tags: ["daily-log", "Transformers", "attention", "NumPy"]
slug: day-040-multi-head-residual
---

## The shape — yesterday's edge

Day 039 left me with single-head `softmax(QKᵀ/√dₖ)V` and its Jacobian. Today the choreography is stacking it.

```
MultiHead(Q,K,V) = Concat(head₁,…,headₕ) W_O
headᵢ = Attention(QW_Qᵢ, KW_Kᵢ, VW_Vᵢ)
```

Then: `x + MultiHead(LN(x))` — residual + layernorm, no framework.

## Forward — 4 heads, one mask

```python
def layernorm(x, eps=1e-5):
    m = x.mean(axis=-1, keepdims=True)
    v = x.var(axis=-1, keepdims=True)
    return (x - m) / np.sqrt(v + eps)  # gamma=1, beta=0 for now

h = 4
xn = layernorm(x)  # (T, d)
heads = []
for i in range(h):
    Q = xn @ Wq[i]  # (T, d_h)
    K = xn @ Wk[i]
    V = xn @ Wv[i]
    scores = (Q @ K.T) / np.sqrt(d_h) + mask
    w = softmax(scores, axis=-1)
    heads.append(w @ V)
out = np.concatenate(heads, axis=-1) @ Wo  # (T, d)
y = x + out  # residual
```

`mask` is the same causal `0 / -inf` from Day 039 — trust the mask.

## Backward — where it bit

Layernorm backward is the new trap: `dx = (1/√v) * (dy - mean(dy) - x_hat*mean(dy*x_hat))`. I derived it twice. Second time I stopped copying and wrote the `mean` terms out — `T=3, d=4` numeric grad at `1e-4` passed after fixing a missing `1/h` scale on the `Wo` grad.

Residual helps: `dx_total = dy + dx_ln_path`. Without it the 4-head grad vanishes.

## Reflection

Four heads don't learn four things — they learn four ways to look. Layernorm doesn't normalize — it lets the residual speak. Tomorrow: feed-forward + full block, still by hand.

Day 040. Committed.
