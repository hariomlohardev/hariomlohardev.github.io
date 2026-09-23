# Month 3 — PyTorch, CNNs & RNNs
### The Full Detailed Version — Week → Day → Everything (Revised, Karpathy + Retention + Breathing Room)

---

## Before you start

**Goal of this month:** stop hand-rolling every operation in raw NumPy (Months 1–2) and start using PyTorch properly — while still understanding exactly what it's doing under the hood, because you already built the from-scratch version of most of it yourself. By the end of this month you'll have trained real CNNs and RNN/LSTM/GRU models on real data, read three of the field's foundational papers, hand-derived a full backward pass without autograd, and built a research-grade ResNet you'll reuse as a teacher model in Month 7.

**Compute needed:** free Google Colab (T4 GPU, ~12hr sessions) or Kaggle Notebooks (free P100/T4, 30 GPU-hrs/week). Week 1 Day 3 sets this up properly — do it early, don't wait until you're blocked.

**What changed in the first revision:** harder, open-ended mini-research-style practice questions throughout; three real papers added (AlexNet, ResNet, the 1997 LSTM paper); the ResNet day rebuilt to the paper's actual CIFAR-10 recipe, since Month 7 reuses this exact checkpoint as a teacher model; the tiny-slice overfit check, budgeted experiments, and predict-before-you-test all became standing rules; a lightweight research-report write-up format.

**What changed in the second pass (Karpathy + memory-science):** four debugging standing rules from Andrej Karpathy's training recipe (loss-at-init, input-independence, batch-independence, visualize-before-the-net); a new Backprop Ninja day (hand-derive and hand-code a full backward pass, no autograd); activation/gradient histograms; "become one with the data" wherever a new dataset appears; a daily Recall Warm-Up for spaced retrieval practice; an explain-it-out-loud habit.

**What changed in this third pass (breathing room):**
- **Three breather days added** — right after Backprop Ninja (Week 1), right after ResNet (Week 2), and right after the LSTM paper (Week 3) — placed at the three points this month is genuinely hardest, back to back, rather than spaced mechanically. Each is explicitly *either* full rest *or* no-guilt catch-up, your call on the day itself. The month grows from 25 to 28 days.
- **A day label is a unit of content, not a calendar deadline.** If a day runs long, it's completely fine to split it across two real days. There's no prize for compressing six exhausting hours into three, and doing so actively works against the retention this whole document is built around — sleep and rest are part of how memory consolidation actually happens, not time taken away from it.

**Compute needed:** none beyond what's listed above.

**Quick-reference: difficulty & time budget**

| Week | Day | Topic | Difficulty /5 | Est. time |
|---|---|---|---|---|
| 1 | 1 | Tensors & Autograd | 3 | ~4h |
| 1 | 2 | `nn.Module` / `Dataset` / `DataLoader` | 2 | ~4h |
| 1 | 3 | Free GPU Setup + Checkpointing | 2 | ~4.5h |
| 1 | 4 | Dropout & BatchNorm + activation/gradient histograms | 3 | ~4.6h |
| 1 | 5 | Backprop Ninja: manual backward pass | 5 | ~6h |
| 1 | 6 | **Breather: Rest or Catch-Up** | — | — |
| 1 | 7 | Deep NN + TensorBoard + full checklist | 2 | ~4.5h |
| 1 | 8 | MNIST Mini Project + "become one with the data" | 2 | ~3.7h |
| 2 | 1 | Convolution Math (from scratch) | 3 | ~4.6h |
| 2 | 2 | CNN in PyTorch | 2 | ~3.75h |
| 2 | 3 | Train CNN on CIFAR-10 + "become one with the data" | 3 | ~5.5h |
| 2 | 4 | AlexNet-lite + read the paper | 4 | ~5h |
| 2 | 5 | VGG-style block | 3 | ~4.3h |
| 2 | 6 | ResNet (paper recipe) + read the paper + save checkpoint | 4 | ~7h (budgeted) |
| 2 | 7 | **Breather: Rest or Catch-Up** | — | — |
| 3 | 1 | RNN Cell & BPTT | 4 | ~4.6h |
| 3 | 2 | Vanishing Gradient, Demonstrated (copy task) | 4 | ~4.3h |
| 3 | 3 | LSTM Cell + read the 1997 paper | 5 | ~6.5h |
| 3 | 4 | **Breather: Rest or Catch-Up** | — | — |
| 3 | 5 | GRU Cell | 4 | ~4h |
| 3 | 6 | Char-Level Text Generator + "become one with the data" | 3 | ~4.7h |
| 3 | 7 | Review + Push to GitHub | 2 | ~3h |
| 4 | 1 | Tune the LSTM (budgeted search) | 3 | ~5h (budgeted) |
| 4 | 2 | Sample & Evaluate | 2 | ~3.5h |
| 4 | 3 | Research-Report Write-Up (Part 1) | 3 | ~4h |
| 4 | 4 | Write-Up (Part 2) + Publish | 2 | ~3h |
| 4 | 5 | Clean Up Repos + Archive ResNet Checkpoint | 2 | ~3.25h |
| 4 | 6 | Rest | — | — |

**Rules for every day:**
- **Start with the Recall Warm-Up**, before watching anything or opening your notebook. Answer from memory, then check against your own old notes or code.
- **A breather day means what it says.** If you're resting, actually rest — don't quietly keep working. If you're catching up, go slower than you think you need to. Don't skip a breather to "save time" — they're placed exactly where burnout risk is highest this month, on purpose.
- Where a day says "from scratch," no `torch.nn.Conv2d`/`nn.RNN`/`nn.LSTM` shortcuts. Where a day says "in PyTorch," use the real `nn` modules.
- Checkpoint your models regularly. Free GPU sessions can disconnect without warning.
- **Before any "real" training run, overfit a tiny slice of the data — 5 to 10 examples — until loss goes to near-zero.**
- **Verify your loss at initialization.** For a balanced `K`-class classifier, it should be close to `-log(1/K)`.
- **Confirm the model is actually using its input** — it should do measurably worse on zeroed-out input than real input.
- **Check batch independence** — one example's gradient shouldn't leak into another's (BatchNorm is the one expected, intentional exception).
- **Actually look at the exact tensor that gets fed into the model**, not what you assume it looks like.
- **Any open-ended experiment gets a fixed budget before you start.**
- **Before a head-to-head comparison, predict the winner and why, on paper, first.**
- **Explain the core idea of what you just built, out loud, in under 60 seconds, no notes, before moving on.**
- Watch the suggested video **before** coding. On days marked "read the paper," the paper is the primary source.

---

## WEEK 1 — PyTorch Fundamentals

**Week goal:** learn the actual tool you'll use for the rest of this roadmap — tensors, autograd, the `nn.Module`/`Dataset`/`DataLoader` pattern, free GPU usage, the two standard regularizers, a hand-derived backward pass with no safety net, and the full debugging-checklist habit — by building one real, monitored training run, with a real breather built in after the hardest day.

---

### Day 1 — PyTorch Tensors & Autograd

**Recall warm-up (before anything else):** from memory — what's the chain rule for a 3-function composition (Month 1)? And in one sentence, what does your Month 1 autograd engine actually do when you call `.backward()`?

**Why this matters:** PyTorch's autograd is the same idea as the engine you hand-built in Month 1 — a dynamic computational graph with automatic backward passes — just industrial-strength.

**Watch first (search YouTube):**
- "PyTorch tensors and autograd tutorial for beginners"
- "freeCodeCamp PyTorch full course" (skip to the tensors/autograd section)

**Math — work through by hand:**
- Pick a small multi-step expression, e.g. `z = (x*y + x**2).sum()` for a couple of scalar `x, y`.
- Derive `∂z/∂x` and `∂z/∂y` by hand using the chain rule.

**Code today:**
- `pip install torch`, create tensors with `requires_grad=True`, run the expression above, call `.backward()`, and read `.grad`.
- Run the exact same expression through your Month 1 autograd engine and confirm the gradients match PyTorch's, and match your hand derivation.
- Explore what happens when you call `.backward()` twice on the same graph without `retain_graph=True`.

**Practice questions:**
1. What does `requires_grad=True` actually cause PyTorch to start tracking, and why does a leaf tensor need this flag explicitly while an intermediate tensor doesn't?
2. **Mini research problem:** build a graph where the *same* tensor is used twice in two different branches that both feed into the final output. Before running anything, predict on paper whether PyTorch will sum the gradient contributions from both branches or only keep the last one computed. Then verify in code. What would go wrong in a naive implementation, and what mechanism protects PyTorch from that bug?
3. Try computing a second derivative using `create_graph=True`. What has to change about how the graph is built, and where might this matter later (optimization algorithms that use curvature, or meta-learning)?
4. Code check: build a deeper expression (4–5 operations, with a repeated-use tensor) and confirm your Month 1 engine, PyTorch, and your hand derivation all agree.

**Done when:** all three methods produce matching gradients, including on a repeated-use-tensor case, and you can explain gradient accumulation at a shared node without looking it up.

---

### Day 2 — `nn.Module`, `Dataset`, `DataLoader`

**Recall warm-up:** from memory — why does a larger sample reduce variance in a sample mean (Month 2's CLT)? And what did Day 1's repeated-tensor gradient check actually verify?

**Why this matters:** this is the skeleton every PyTorch project you write for the rest of this roadmap will use — Month 4 and Month 5 both reuse this exact pattern by name.

**Watch first (search YouTube):**
- "PyTorch nn.Module custom Dataset DataLoader tutorial"

**Math — work through by hand:**
- Why does a larger batch size give a *lower-variance* estimate of the true gradient? (Your Month 2 CLT, applied directly.)

**Code today:**
- Subclass `nn.Module` for a small 2-layer network; implement `__init__` and `forward`.
- Subclass `Dataset` to wrap a small array of data, implementing `__len__` and `__getitem__`.
- Wrap it in a `DataLoader` with batching and `shuffle=True`.
- Write one complete training loop skeleton on dummy regression data.
- **Batch-independence check:** construct a batch of several examples, make the loss depend on only the `i`-th example, call `.backward()`, and confirm the gradient with respect to every *other* example's input is exactly zero.

**Practice questions:**
1. What does calling `model(x)` actually trigger, given that you only defined `forward`, not `__call__`?
2. **Mini research problem:** design a small experiment that demonstrates *specifically* what breaks if you never shuffle your data across epochs — pick a dataset ordering where the failure would be visible, train with and without shuffling, and report what you actually observe.
3. Using your Month 2 CLT intuition: derive the actual factor by which doubling the batch size reduces gradient-estimate variance, then argue why "bigger batch is always better" is still false.
4. Code check: verify your batch-independence check above — did any "other example" gradient come out non-zero?

**Done when:** your dummy training loop runs end to end, your batch-independence check passes cleanly, and you have a real demonstration of what unshuffled data breaks.

---

### Day 3 — Free GPU Setup (Colab/Kaggle) + Benchmarking

**Recall warm-up:** from memory — state what the batch-independence check verifies, and why it matters. And from Month 1: what does the Adam optimizer do differently from plain gradient descent, in one sentence?

**Why this matters:** from here on, almost every remaining month needs a GPU.

**Watch first (search YouTube):**
- "Google Colab free GPU tutorial for PyTorch"
- "Kaggle notebooks free GPU setup tutorial"

**Code today:**
- Open a Colab notebook, switch to a free GPU, confirm `torch.cuda.is_available()`.
- Write a `get_device()` utility used in every script for the rest of the roadmap.
- Benchmark identical matrix multiplications on CPU vs. GPU at a few sizes, timing each. Plot size vs. speedup.
- Set up Kaggle Notebooks too, as a backup.

**Practice questions:**
1. **Predict before you test:** at what matrix size do you predict the GPU stops being slower than the CPU? Write a number down first, then check.
2. What's the practical Colab free-tier session limit, and why does that mean you need to checkpoint runs rather than assume one script runs start to finish?
3. What does `.to('cuda')` actually do, and what has to happen if you then combine that tensor with one still on the CPU?
4. Code check: save a model mid-training, restart the runtime, reload, and confirm training resumes with no discontinuity in the loss curve.

**Done when:** your speedup plot shows the GPU winning at large sizes, your prediction is on record beforehand, and checkpoint save/resume works.

---

### Day 4 — Dropout & BatchNorm, With Activation & Gradient Histograms

**Recall warm-up:** from memory — what's the practical Colab session limit, and why does it force a checkpointing habit? And from Month 2: what's the bias-variance tradeoff, in one sentence?

**Why this matters:** overfitting is the single biggest practical problem you'll fight for the rest of this roadmap. Today also introduces a genuinely central Karpathy technique: *looking at* the actual distribution of activations and gradients layer by layer.

**Watch first (search YouTube):**
- "StatQuest dropout neural networks clearly explained"
- "StatQuest batch normalization clearly explained"
- "Karpathy makemore activations gradients batchnorm"

**Math — work through by hand:**
- Dropout: work out why the `1/(1-p)` scaling keeps the *expected* magnitude of a layer's output consistent between training and test time.
- BatchNorm: reason through why it needs to track *running* averages of mean/variance during training.

**Code today:**
- Build two versions of a small network on a real tabular dataset: one with `nn.Dropout` + `nn.BatchNorm1d`, one without. Train both identically.
- **Activation/gradient histograms:** build a deeper (4–5 layer) plain MLP with `tanh` activations and no normalization. After a forward pass, plot a histogram of the activation values at each layer. Then run a backward pass and plot a histogram of the gradient values at each layer. Now add BatchNorm to the same architecture and plot both sets of histograms again.
- Look for the specific failure patterns: activations piling up near `-1`/`+1` (saturated `tanh`) and gradients that shrink or balloon layer by layer.

**Practice questions:**
1. What would go wrong at test time if you forgot the `1/(1-p)` scaling in inverted dropout — with numbers, not just "it would be wrong."
2. **Mini research problem:** BatchNorm's per-batch statistics break down at batch size 1. Run inference with batch size 1 using `model.train()` mode by mistake instead of `model.eval()`. What actually happens to your predictions, and why does this exact bug show up surprisingly often in real deployed models?
3. In your activation histograms: at which layer (if any) does saturation become visible without BatchNorm, and does adding BatchNorm visibly fix it? Describe what you actually see.
4. Code check: try dropout `p=0.8` — what happens to training loss, and does it match what you'd predict?

**Done when:** your Dropout+BatchNorm comparison shows a smaller train/val gap, and your histograms show a real, visible difference with vs. without BatchNorm.

---

### Day 5 — Backprop Ninja: The Manual Backward Pass, No Autograd

**Recall warm-up:** from memory — describe what a saturated `tanh` activation looks like in a histogram, and why it's a problem. And from Month 1: write the chain rule for a 2-function composition.

**Why this matters:** modeled directly on Karpathy's "Becoming a Backprop Ninja" lecture — arguably the single most distinctive exercise in his entire teaching philosophy. You've relied on `.backward()` since Day 1. Today you prove, by hand, that you actually know what it's doing — on the exact architecture you just built histograms for yesterday. **Tomorrow is a breather day — pace yourself accordingly today rather than trying to cram recovery time out of today too.**

**Watch first (search YouTube):**
- "Karpathy becoming a backprop ninja makemore part 4"

**Math — work through by hand, in this exact order:**
- Take a small 2-layer MLP with BatchNorm and a softmax cross-entropy loss on top — the same shape of network from yesterday's histogram work, kept small.
- Starting from the loss, derive the gradient with respect to every intermediate quantity, working backward one operation at a time: the softmax cross-entropy loss, the second linear layer, the activation function, the BatchNorm layer (the hardest one — work out `∂loss/∂x` for BatchNorm's normalization step explicitly), the first linear layer, and finally the input embedding.
- At each step, write the gradient formula on paper *before* writing any code for it.

**Code today:**
- Implement the full forward pass normally (regular PyTorch tensor ops, `requires_grad` on, as ground truth).
- Implement the *backward* pass entirely by hand — one line of code per gradient you derived — **without calling `.backward()` anywhere**.
- Compare every hand-computed gradient against PyTorch autograd's `.grad` values, tensor by tensor.

**Practice questions:**
1. Which single step's derivation took you the longest to get right, and why?
2. **Mini research problem:** deliberately get the BatchNorm backward derivation wrong in a specific way (e.g. forget that the mean and variance themselves depend on every example in the batch). Run it, watch which gradient-matching check fails, and use that failure to relocate and fix the actual error in your derivation.
3. What would you now say to someone who claims "autograd means I don't need to understand backprop"? Be specific about what you know now that you didn't before.
4. Code check: confirm every intermediate gradient — not just the final input gradient — matches autograd's.

**Done when:** every hand-derived gradient matches PyTorch autograd's, tensor by tensor, and you can explain — out loud, from memory — why BatchNorm's backward pass is more involved than a plain elementwise operation's. Then stop for the day.

---

### Day 6 — Breather: Rest or Catch-Up

**Why this matters:** Backprop Ninja was the hardest single day so far — genuinely dense, hours of careful derivation. Rest isn't wasted time here. Sleep and downtime are when your brain actually consolidates what you just learned, which matters more after a day like yesterday than almost any other point this month.

**Two honest options today, your call:**
- **If yesterday went fine and on schedule:** take today off completely. No coursework. Go do something else entirely.
- **If yesterday ran long, or the backward-pass derivation still doesn't feel solid:** use today to finish it properly, at a slower pace, with no pressure — that's exactly what this day is for.

**Recall warm-up:** none today. That's the point.

**Practice questions:** none.

**Done when:** either you rested, or Backprop Ninja is genuinely solid now. Both are a correct use of today.

---

### Day 7 — Build a Deep Neural Net (TensorBoard) + the Full Debugging Checklist

**Recall warm-up:** from memory — why is BatchNorm's backward pass harder to derive than a plain linear layer's? And from Month 2: what does cross-entropy loss actually measure?

**Why this matters:** today you combine everything so far into one real, monitored training run — and you run the *entire* debugging checklist on it for the first time, not just the tiny-slice check.

**Watch first (search YouTube):**
- "PyTorch TensorBoard tutorial logging training"

**Code today:**
- Build a deeper (3–4 layer) fully-connected network on a real tabular dataset, using Day 2's `Dataset`/`DataLoader`, Day 3's `get_device()`, and Day 4's Dropout/BatchNorm.
- Run the full checklist, in order, before trusting anything: verify loss at initialization is close to `-log(1/K)`; confirm the model does worse on zeroed-out input than real input; overfit a tiny 5–10 example slice to near-zero loss; actually look at (print/plot) a real batch's tensor right before it enters the model.
- Integrate TensorBoard logging — loss and accuracy per epoch, train and validation.
- Train long enough to see a clear trend.

**Practice questions:**
1. Name three concrete signs in a TensorBoard curve of overfitting, and one sign of underfitting.
2. **Mini research problem:** deliberately introduce a bug the checklist would catch (freeze a layer, or shuffle labels independently of inputs) — confirm which specific checklist item catches it, and which ones don't.
3. If train loss keeps dropping while validation loss rises, name two fixes from this week's material and explain what each is doing mechanistically.

**Done when:** TensorBoard shows a complete, readable run, you've run the full checklist and can say which items you'd have skipped without it, and you can narrate the training story from the curves alone.

---

### Day 8 — Mini Project: MNIST Digit Classifier, Start to Finish

**Recall warm-up:** from memory — list all four checklist items from Day 7, in order. And from Month 2: what's the difference between precision and recall?

**Why this matters:** your first fully complete PyTorch project this month, and your first real "become one with the data" step.

**Watch first (search YouTube):** none — build day.

**Code today:**
- **Become one with the data, first:** before writing any model code, look at 20–30 raw MNIST examples directly (plot them). Check the class balance. Note anything that surprises you. Write down what you'd guess a human's error rate would be on this dataset.
- Load MNIST, build your own `nn.Module` network with Dropout/BatchNorm.
- Run the checklist (loss at init, input-independence, tiny-slice overfit) before the full run.
- Train, evaluate final test accuracy, save the trained weights.

**Practice questions:** none today — just build, report your final test accuracy against your own human-error-rate guess, and move on.

**Done when:** you have a saved, working MNIST classifier, a real test accuracy number, and a written note comparing it to your pre-training human-level guess.

---

## WEEK 2 — Convolutions & CNNs

**Week goal:** understand what a convolution actually computes, then build up through the real architectural milestones — a simple CNN, AlexNet, VGG, and a research-faithful ResNet — training all of them on free-GPU-sized data, with a real breather after the week's hardest day. The ResNet you finish this week is not disposable: Month 7 reuses it directly as a teacher model.

---

### Day 1 — Convolution Math

**Recall warm-up:** from memory — what did you find when you looked at raw MNIST examples, and how did your model's accuracy compare to your human-error guess? And from Month 1: what's the vanishing-gradient intuition, in one sentence?

**Why this matters:** understanding the actual operation, by hand, is what lets you debug a CNN later instead of just staring at a loss curve that won't move.

**Watch first (search YouTube):**
- "3Blue1Brown but what is a convolution"
- "StatQuest convolutional neural networks clearly explained"

**Math — work through by hand:**
- Define 2D convolution: sliding a kernel over an image, elementwise-multiply-and-sum at each position.
- Derive the output size formula: `out = floor((in + 2·padding − kernel) / stride) + 1`.
- Work a tiny example by hand: a 4×4 image, 2×2 kernel, stride 1, no padding.

**Code today:**
- Implement 2D convolution from scratch using raw nested loops in NumPy — no `torch`.
- Apply an edge-detection kernel and a blur kernel to a real grayscale image, visualize before/after.
- Verify your output size matches your formula.

**Practice questions:**
1. Derive the output size formula yourself from the sliding-window logic.
2. **Mini research problem:** design a kernel by hand that detects diagonal edges specifically, as opposed to standard horizontal/vertical Sobel kernels. Explain your reasoning for each value, test it, and report whether it behaves as predicted.
3. What's the practical difference between stride 1 and stride 2, and at what point does increasing stride lose information a later layer can't recover?
4. Code check: rerun with `stride=2` and confirm output dimensions match your formula.

**Done when:** your hand-rolled convolution produces a visibly correct result, your custom kernel does what you designed it to, and your output size matches your formula on at least two configurations.

---

### Day 2 — CNN in PyTorch

**Recall warm-up:** from memory — derive the output-size formula for a convolution from yesterday. And from Month 2: what's the maximum likelihood estimation idea, in one sentence?

**Why this matters:** translate yesterday's from-scratch understanding into the real, fast, GPU-friendly implementation you'll actually use.

**Watch first (search YouTube):**
- "PyTorch CNN tutorial Conv2d MaxPool2d"

**Math — work through by hand:**
- Explain max pooling vs. average pooling, and why pooling introduces translation invariance.

**Code today:**
- Build a small CNN class using real `nn.Conv2d` + `nn.MaxPool2d` + `nn.Linear`.
- Run the checklist, then run it on MNIST — it should match or beat Week 1 Day 8's fully-connected network, likely with fewer parameters.

**Practice questions:**
1. Why does a CNN typically need far fewer parameters than a fully-connected network for the same image size? Show the actual parameter-count math.
2. **Predict before you test:** predict whether max or average pooling gives better test accuracy here, and why. Then swap and check.
3. What information does max pooling discard, and construct a specific example image where that discarded information would matter.
4. Code check: print total parameter counts for both networks and compare directly.

**Done when:** your CNN matches or beats your earlier network's accuracy with fewer parameters, and your pooling prediction is on record before you saw the result.

---

### Day 3 — Train a CNN on CIFAR-10 (free Colab GPU)

**Recall warm-up:** from memory — why does pooling introduce translation invariance? And from Month 1: what does the learning rate control, mechanically, in gradient descent?

**Why this matters:** your first real "modern-scale" training run this month — color images, a genuinely harder task, and actual free-GPU usage under session-time pressure.

**Watch first (search YouTube):**
- "PyTorch CIFAR-10 CNN training tutorial data augmentation"

**Math — work through by hand:**
- Reason through data augmentation as a form of regularization — connect it back to Week 1 Day 4's overfitting fight.

**Code today:**
- **Become one with the data, first:** look at 20–30 raw CIFAR-10 images across different classes before writing model code. Note which classes look visually similar to each other and which look distinct.
- Load CIFAR-10, apply random crop + horizontal flip to training data only.
- Run the checklist, then train on free Colab GPU, checkpointing periodically. Report test accuracy.

**Practice questions:**
1. Why does random horizontal flip make sense for CIFAR-10, but might hurt a digit-recognition task? Is there a CIFAR-10 class where flip could cause a similar problem?
2. If your Colab session disconnects mid-training, what does your checkpoint need to store to resume cleanly?
3. **Mini research problem:** train with and without augmentation for the *same fixed budget* (15 epochs each, decided beforehand). Predict which has the larger train/validation gap first. Then check whether the classes you predicted would be confused, from your data-inspection step, actually are the ones your trained model confuses most.

**Done when:** you have a checkpoint, a real test accuracy, a prediction-vs-actual comparison for augmentation, and a check of your pre-training "which classes look similar" guess against your model's actual confusion matrix.

---

### Day 4 — Read & Replicate AlexNet (small scale)

**Recall warm-up:** from memory — which CIFAR-10 classes did you predict would be confused, and were you right? And from Month 1: what problem does the Adam optimizer solve that plain SGD doesn't?

**Why this matters:** AlexNet (2012) is the paper that arguably restarted the deep learning era. Read the actual paper today — but don't chase its exact hyperparameters at CIFAR's scale.

**Watch first (search YouTube):**
- "AlexNet architecture explained paper walkthrough"

**Read today:**
- Read the actual AlexNet paper (Krizhevsky, Sutskever, Hinton, 2012), sections 1–4. Note in your own words: why ReLU mattered, why dropout mattered, what "local response normalization" was trying to do.

**Math — work through by hand:**
- Reason through why ReLU was a meaningful upgrade over sigmoid/tanh — connect to Month 1's vanishing-gradient discussion.

**Code today:**
- Implement an AlexNet-lite scaled for CIFAR-10-sized images — capture the ideas, not the original's exact 224×224-tuned specs.
- Run the checklist, then train, checkpoint, report accuracy.

**Practice questions:**
1. **Mini research problem:** implement Local Response Normalization, add it to your AlexNet-lite, compare accuracy with and without it. Explain why LRN fell out of favor even though it seemed reasonable in 2012.
2. Which architectural decisions from the paper are scale-independent ideas versus scale-specific tuning? List at least two of each.
3. Code check: compare parameter count and accuracy against Day 2/3's simpler CNN — is more depth automatically better here?

**Done when:** you can explain why ReLU and dropout mattered in 2012 without notes, you've read the actual paper, and you have a real accuracy number with a documented LRN ablation.

---

### Day 5 — VGG: Small Kernels, Stacked Deep

**Recall warm-up:** from memory — why did LRN fall out of favor? And from Month 2: state the formula for conditional probability.

**Why this matters:** VGG's core insight — stack small kernels instead of using large ones — is a genuinely elegant parameter-efficiency argument you can verify with real numbers.

**Watch first (search YouTube):**
- "VGG architecture explained paper walkthrough"

**Math — work through by hand:**
- Derive why two stacked 3×3 convolutions have the *same* receptive field as one 5×5, with fewer parameters and an extra nonlinearity.

**Code today:**
- Implement a small VGG-style block, train on CIFAR-10, compare against Day 4's AlexNet-lite on accuracy, parameters, and training time.

**Practice questions:**
1. Show the parameter-count math for two stacked 3×3s vs. one 5×5, then extend it: three 3×3s vs. one 7×7.
2. **Predict before you test:** predict whether VGG-style beats, matches, or loses to AlexNet-lite, and by how much. Then check.
3. What could a single 5×5 conv never represent that two stacked 3×3-plus-ReLU layers can?

**Done when:** you can explain, with real numbers, why stacking small kernels is more efficient, and your prediction is on record before the comparison.

---

### Day 6 — ResNet: The Real CIFAR-10 Architecture, Read the Paper, Save the Checkpoint

**Recall warm-up:** from memory — what does the extra nonlinearity between stacked 3×3 convs buy you? And from Month 1: what causes gradients to vanish in a deep plain network, mechanically?

**Why this matters:** this solves a real problem you can demonstrate yourself — plain networks get *harder* to train as they get deeper, and skip connections fix it. **The model you train today is not disposable — Month 7 reuses this exact trained ResNet as a teacher model.** This is also one of the two heaviest days this month — tomorrow is a breather, so there's real slack if it runs long.

**Fixed budget for today:** one specific known-good architecture, at most 3 training attempts to hit the target.

**Watch first (search YouTube):**
- "StatQuest ResNet clearly explained"
- "ResNet skip connections explained"

**Read today:**
- Read the ResNet paper (He et al., 2015), Section 4.2 — the CIFAR-10 experiments specifically.

**Math — work through by hand:**
- Derive `d(F(x) + x)/dx` for a residual block, and show why the `+1` term protects gradient flow regardless of how small `dF/dx` becomes.

**Code today:**
- Build the actual CIFAR-10 ResNet from the paper's Section 4.2: three stages of 16/32/64 filters, `6n+2` layers (`n=3`, ResNet-20).
- Use step-decay LR scheduling (previews Month 5).
- Run the checklist, then train with standard augmentation.
- **Target: ~90%+ test accuracy** — a real bar. If short after 3 budgeted attempts, debug systematically rather than just re-running.
- **Save the final checkpoint somewhere durable.** You need this exact file again in Month 7.

**Practice questions:**
1. Derive `d(F(x)+x)/dx` and identify the term guaranteeing gradient flow even if `dF/dx → 0`.
2. **Mini research problem:** take Day 5's VGG-style net and increase depth until training visibly degrades — plot where a deeper plain network starts doing *worse*. Build a ResNet of that same depth and confirm it trains more stably.
3. Compute ResNet-20's parameter count by hand and compare to Day 5's VGG-style net at similar depth.
4. Code check: confirm your saved checkpoint reloads correctly and reproduces the same accuracy.

**Done when:** you have a real ResNet-20 checkpoint near the paper's accuracy, saved durably, verified to reload, plus your own reproduction of "plain degrades with depth, ResNet doesn't." If you're not there yet, that's what tomorrow is for.

---

### Day 7 — Breather: Rest or Catch-Up

**Why this matters:** the ResNet day is budgeted at up to 3 training attempts plus a real paper read — a lot to fit even with the budget, and one of the two days this month most likely to have genuinely run over.

**Two honest options today, your call:**
- **If ResNet hit its accuracy target on schedule:** take today off completely.
- **If it didn't quite get there, or you're still debugging:** use today to finish it properly. There's no penalty for needing a second day on the hardest architectural day of the month — the checkpoint needs to actually be good, since Month 7 depends on it.

**Recall warm-up:** none today.

**Practice questions:** none.

**Done when:** either you rested, or your ResNet checkpoint is actually solid. Both are correct.

---

## WEEK 3 — RNNs & Sequence Models

**Week goal:** understand sequence modeling from the ground up — plain RNNs, why they fail on long sequences, and the two fixes (LSTM, GRU) that dominated before Transformers, which you'll meet in Month 4. This week has three hard days in a row up front, so the breather sits right in the middle of them, not at the end.

---

### Day 1 — RNN Cell & Backpropagation Through Time

**Recall warm-up:** from memory — state the ResNet residual-block gradient argument in one sentence. And from Backprop Ninja: why is BatchNorm's backward pass harder to derive than a plain linear layer's?

**Why this matters:** this is Month 1's backpropagation, applied across a time dimension instead of a layer dimension.

**Watch first (search YouTube):**
- "StatQuest recurrent neural networks clearly explained"

**Math — work through by hand:**
- Write the RNN recurrence: `h_t = tanh(W_hh · h_{t-1} + W_xh · x_t + b)`.
- Derive `∂h_t/∂h_{t-1}`.

**Code today:**
- Implement a vanilla RNN cell from scratch, unroll manually over a short sequence.
- Run the checklist, then run a backward pass and inspect gradients at each time step.

**Practice questions:**
1. Derive `∂h_t/∂h_{t-1}` from the recurrence.
2. Why does repeatedly multiplying this term across time steps cause vanishing/exploding gradients — connect to Month 1's chain rule.
3. **Mini research problem:** `tanh`'s derivative is bounded [0,1], exactly 1 only at `h=0`. Compute it by hand at `h=0,1,2`, and use that to explain why initialization matters so much for RNNs specifically.
4. Code check: print gradient magnitude at each time step on a 20-step sequence — do you see it shrinking toward earlier steps? By roughly what factor per step?

**Done when:** your RNN cell runs forward and backward correctly, you can see gradients shrinking at earlier steps, and you can explain the tanh-derivative/initialization connection.

---

### Day 2 — The Vanishing Gradient, Demonstrated (The Copy Task)

**Recall warm-up:** from memory — at what `h` values is `tanh`'s derivative largest and smallest? And from Month 2: what's the law of large numbers, in one sentence?

**Why this matters:** yesterday you derived *why* this happens. Today you make it undeniable on the standard copy task from the literature.

**Watch first (search YouTube):**
- "vanishing gradient problem RNN explained"

**Code today:**
- Implement the **copy task**: a short sequence of random tokens, a long gap of blanks, a "go" signal, then reproduce the original sequence exactly. Make gap length a parameter (start ~20 steps).
- Run the checklist, then train Day 1's RNN — confirm it fails at 20 steps. Plot gradient magnitude per time step.

**Practice questions:**
1. Why does the gradient plot shrinking toward earlier steps directly explain the copy-task failure — trace the causal chain.
2. **Mini research problem:** run the copy task at several gap lengths (5, 10, 15, 20, 30) with a fixed budget at each, and plot success rate vs. gap length. Predict the shape first, then compare.

**Done when:** you have a plotted vanishing-gradient curve and a success-vs-gap-length curve with your prediction recorded beforehand.

---

### Day 3 — LSTM Cell (and the Paper That Invented It)

**Recall warm-up:** from memory — at roughly what gap length did your RNN's success rate collapse yesterday? And from Month 1: what's the difference between a local minimum and a saddle point?

**Why this matters:** this is the fix for exactly the failure you just demonstrated — and it's from the densest, oldest paper in this month. **Tomorrow is a breather** — this is the third hard day in a row, so don't feel obligated to squeeze extra polish out of today.

**Watch first (search YouTube):**
- "StatQuest long short-term memory LSTM clearly explained"

**Read today:**
- Read the original LSTM paper (Hochreiter & Schmidhuber, 1997). Dense and old-notation — that's normal. Focus on the "constant error carousel" idea.

**Math — work through by hand:**
- Write all four LSTM gates and the cell-state update `C_t = f_t * C_{t-1} + i_t * C̃_t`.
- Reason through why this *additive* update avoids the vanishing-gradient problem.

**Code today:**
- Implement an LSTM cell fully from scratch. Run the checklist, then test on the same copy task, at the gap length that broke your RNN.

**Practice questions:**
1. Derive why the gradient path through the cell state avoids the repeated-multiplication problem.
2. What does the forget gate control? Construct a scenario where you'd want it near 1 for many steps.
3. **Mini research problem:** map the paper's "constant error carousel" language onto the modern gate equations you implemented — where do they agree, and where has the modern formulation (with a separate forget gate — the original 1997 version didn't have one) improved on the original?
4. Code check: plot cell-state gradient magnitude across time on the same gap length that broke your RNN — compare directly against Day 2's plot.

**Done when:** your LSTM solves the copy task at the gap length that broke your RNN, and you can explain how the 1997 paper differs from the modern formulation. Then stop — the breather is next, on purpose.

---

### Day 4 — Breather: Rest or Catch-Up

**Why this matters:** three genuinely hard days in a row — the RNN, the copy task, then the LSTM paper and derivation — is a lot without a pause. This is also the week Month 4 leans on most directly, so it's worth being actually solid here, not just technically done.

**Two honest options today, your call:**
- **If the week's on schedule and it feels solid:** take today off completely.
- **If it doesn't feel solid yet, or you're behind:** use today to catch up, at a slower pace than you think you need.

**Recall warm-up:** none today.

**Practice questions:** none.

**Done when:** either you rested, or the last three days feel genuinely solid. Both are correct.

---

### Day 5 — GRU Cell

**Recall warm-up:** from memory — what does the forget gate control? And from Month 2: what's the difference between a PMF and a PDF?

**Why this matters:** a simpler, faster alternative to LSTM that's still widely used.

**Watch first (search YouTube):**
- "GRU gated recurrent unit explained"

**Math — work through by hand:**
- Write GRU's reset and update gate equations; compare structurally to LSTM.

**Code today:**
- Implement a GRU cell from scratch. Run the checklist, then run on the same copy task, compare speed and performance against Day 3's LSTM.

**Practice questions:**
1. Count total weight matrices in GRU vs. LSTM — connect to speed/memory with real numbers.
2. **Predict before you test:** at the gap length that broke your RNN, predict GRU vs. LSTM on accuracy and speed. Then check.
3. When might LSTM's separate cell state be worth the extra parameters?

**Done when:** you have a direct numeric comparison (params, speed, accuracy) with your prediction recorded first.

---

### Day 6 — Char-Level Text Generator

**Recall warm-up:** from memory — how many weight matrices does GRU have vs. LSTM? And from Month 1: what does a learning-rate schedule try to fix?

**Why this matters:** your first genuinely fun output this month — a model that writes something, trained entirely by you.

**Watch first (search YouTube):**
- "PyTorch LSTM character level text generation tutorial"

**Math — work through by hand:**
- Connect this to Month 2: next-character prediction is classification over your character vocabulary, trained with the same cross-entropy loss.

**Code today:**
- **Become one with the data, first:** read a real page of Tiny Shakespeare before touching any code. Note the character vocabulary size, typical line structure, capitalization patterns.
- Run the checklist, then train your Day 3 LSTM (or `nn.LSTM`) on Tiny Shakespeare.
- Implement basic sampling (greedy is fine today; proper sampling comes in Month 5).

**Practice questions:**
1. Why is character-level modeling simpler to set up than word-level?
2. **Mini research problem:** sample at a couple of temperatures, catalog specific named failure modes (repetition loops, invented words, lost quotation tracking) — and check them against the structural patterns you noted in your data-inspection step.

**Done when:** your model generates structurally Shakespeare-like text, and you have a written catalog of at least 3 named failure modes, checked against your own pre-training notes on the data.

---

### Day 7 — Review + Push Notebooks to GitHub

**Recall warm-up:** from memory — name the three failure modes you catalogued yesterday. And from Month 1: state the definition of a partial derivative in one sentence.

**Why this matters:** consolidate a genuinely dense week before the capstone.

**Code today:**
- Clean up all Week 3 notebooks/scripts. Push to GitHub.

**Practice questions:**
1. From memory, write the RNN, LSTM, and GRU update equations side by side. Check against your notes and mark any gaps honestly.
2. Also from memory: sketch the copy-task success-vs-gap-length curve, and the LSTM/GRU comparison numbers.

**Done when:** you can write all three equation sets from memory with no more than minor errors, and roughly reconstruct your own week's key numbers unaided.

---

## WEEK 4 — Month 3 Capstone

**Week goal:** stop training in isolation — tune your best model under an explicit budget, evaluate it honestly, and turn the month's two big threads into a real research-report write-up. This format is your template through Month 8. This week is naturally lighter than Weeks 1–3, so it doesn't need an extra breather — it already tapers down into the existing rest day.

---

### Day 1 — Tune the LSTM (Budgeted Search)

**Recall warm-up:** from memory — write the LSTM cell-state update equation. And from Month 2: what's overfitting, defined precisely, not just "does badly on new data"?

**Why this matters:** the gap between "it runs" and "it's actually good" is almost always in tuning — but tuning is also the classic way to lose a day to "just one more run."

**Fixed budget:** exactly 5 configurations, 20–25 minutes each.

**Code today:**
- Write down 5 configurations in advance. Run all 5 within budget on Week 3 Day 6's generator. Log settings and results as you go.

**Practice questions:**
1. Before checking your log: which of your 5 planned changes did you *expect* to matter most, going in? Compare to what actually happened.
2. **Mini research problem:** of your 5 results, what hypothetical 6th config would you try next, and why, from the pattern in your first 5 — even though you won't run it.

**Done when:** you have a logged table of exactly 5 configurations, a clearly better model, and you stopped at 5.

---

### Day 2 — Sample & Evaluate

**Recall warm-up:** from memory — which of your 5 tuning configs won, and by what margin? And from Month 1: what's the difference between a convex and non-convex loss surface?

**Code today:**
- Generate samples at a few temperatures. Read through carefully, write honest failure-mode notes.

**Practice questions:**
1. What tradeoff do you observe between low- and high-temperature sampling? Give a specific example pair from your own model.

**Done when:** you have a written, honest list of specific failure modes.

---

### Day 3 — Research-Report Write-Up (Part 1)

**Recall warm-up:** from memory — name two specific failure modes from yesterday's sampling. And from Month 2: what's the difference between a Type I and Type II error?

**Why this matters:** upgrading from "casual blog post" to Abstract/Setup/Results/Failure-Analysis/Limitations — your standard template from here through Month 8.

**Code today:**
- Draft: TL;DR, Setup, Results (a real table from your own numbers), Failure-mode analysis, What I'd try next.
- Use your own Week 2/3 experiments as concrete evidence for the CNN-vs-RNN inductive-bias argument, not textbook definitions.

**Practice questions:**
1. What's one experiment from this month that concretely demonstrates the CNN-vs-RNN inductive bias difference? Make the argument with your own numbers.

---

### Day 4 — Write-Up (Part 2) + Publish

**Recall warm-up:** from memory — what does "inductive bias" mean, in your own words? And from Month 1: what's a Jacobian, in one sentence?

**Code today:**
- Finish and publish the report somewhere free.

**Done when:** the post is public, follows the structure, and includes at least one real table or plot from your own runs.

---

### Day 5 — Clean Up Both Repos + Archive the ResNet Checkpoint

**Recall warm-up:** from memory — where, exactly, is your ResNet-20 checkpoint saved, and have you verified it reloads? And from Month 2: what's Bayes' theorem?

**Code today:**
- README, `requirements.txt`, consistent structure for both repos. Cross-link with your write-up.
- **Confirm your Week 2 Day 6 ResNet-20 checkpoint is saved somewhere durable and reloadable.** Note the exact location. This is a dependency for Month 7, not optional cleanup.

**Done when:** both repos are public, clean, cross-linked, and you can state exactly where your ResNet checkpoint lives and confirm it reloads.

---

### Day 6 — Rest

**Recall warm-up:** none today — actually rest.

**Done when:** both repos are public, clean, cross-linked, and you've taken today mostly off.

---

## Month 3 — What You'll Have Built by the End

- A verified match between your Month 1 autograd engine and PyTorch's real autograd, including a shared-tensor case
- A clean, reusable `nn.Module` / `Dataset` / `DataLoader` pipeline, reused by name in Month 4 and Month 5
- A working free-GPU setup with checkpoint/resume
- **A full backward pass, hand-derived and hand-coded through a 2-layer MLP with BatchNorm, with no autograd at all** — verified tensor-by-tensor against PyTorch's real gradients
- Activation/gradient histograms you can actually read, not just describe abstractly
- A five-check debugging habit (tiny-slice overfit, loss-at-init, input-independence, batch-independence, visualize-before-the-net) running by default on every training script from here on
- A hand-built 2D convolution, plus real trained CNNs: a simple CNN, AlexNet-lite, a VGG-style net, and a research-faithful **ResNet-20 hitting ~90%+ on CIFAR-10** — saved for reuse as a teacher model in Month 7
- Three papers actually read: AlexNet (2012), ResNet (2015), and the original LSTM paper (1997)
- A hand-built RNN that demonstrably fails the standard copy task, plus LSTM and GRU cells that demonstrably succeed on it
- A trained, tuned char-level Shakespeare text generator, tuned under an explicit 5-config budget
- One published, research-report-formatted CNN-vs-RNN comparison
- A daily habit of starting from retrieval, not re-reading, and of explaining what you built out loud before moving on
- **Three real breather days, placed exactly where the month is hardest, actually used as rest or catch-up rather than skipped**

This month is where you stopped simulating deep learning in raw NumPy and started actually training real, GPU-scale models — while keeping the from-scratch understanding, down to the gradient level, that makes debugging them possible later. You also picked up a genuinely rigorous debugging checklist, a retention habit, and — just as importantly — a pace that's actually sustainable for the seven months still ahead of you.
