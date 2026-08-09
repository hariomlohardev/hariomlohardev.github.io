---
title: "Day 032 — CNN from Scratch, No Autograd"
date: 2026-08-01
description: "Built 2D convolution forward + backward in pure NumPy — im2col, stride, padding, and the gradient that makes it learn."
tags: ["daily-log", "CNN", "NumPy", "backprop"]
slug: day-032-cnn-from-scratch
---

## What I built

2D `conv2d` forward + backward in NumPy. No `torch.nn`, no autograd — paper, then code.

- `im2col` + `col2im` for the forward pass
- Stride & padding handled as index math, not magic
- Backward: `dW`, `db`, `dX` derived by hand

```python
# forward — stride 1, padding 1
cols = im2col(x_padded, KH, KW, stride=1)   # (KH*KW*C, H*W)
w_col = W.reshape(-1, 1)                    # (KH*KW*C, 1)
out = (w_col.T @ cols).reshape(N, H, W)
```

## Why it hurt (and why it mattered)

Getting `dX` right means flipping the kernel and handling the padded border — the same bug that hides for 30 lines then explodes on a `4×4` toy. Fixed by brute-forcing a numeric gradient check on a `2×2` input:

```python
assert np.allclose(grad_analytic, grad_numeric, atol=1e-5)
```

It passed at `1:47 AM`. The log did too.

## Next

- Depthwise + pointwise conv
- `max_pool` backward (the mask trick)
- Then attention — same discipline, new shape.

Commit: `AGI_Research` — Day 032. Open notebook.
