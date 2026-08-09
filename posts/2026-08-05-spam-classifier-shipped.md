---
title: "Spam Classifier Shipped — 5,572 Messages, Zero Mock"
date: 2026-08-05
description: "Shipped a live Naive Bayes bench that tokenises, scores, and stamps P(spam|message) in your browser via Pyodide — nothing mocked."
tags: ["article", "Naive Bayes", "NLP", "Pyodide", "ship"]
slug: spam-classifier-shipped
---

## Ship, don't demo

`spam_classifier` is now a **live bench**, not a screenshot. Type a message → see tokens split, scored red/green, weak signals filtered, then a `SPAM / HAM` stamp with `P(spam|message)`.

- **Data**: `5,572` rows, `data.csv` fetched in-browser
- **Engine**: Naive Bayes + Laplace `k=1`, trained via **Pyodide** (Python in WASM)
- **UX**: bench paper sheets, running verdict, gauge, weak-signal filter

Try it: [/projects/spam_classifier.html](/projects/spam_classifier.html)

## What I learned

Shipping in the browser surface uncovered what a notebook hides:

- Tokenisation is a design choice, not a step
- Thresholds are product, not math — `0.5` is a starting line, not an answer
- If you can't show `P(spam|message)` with real numbers, you didn't teach it

## Lab note

Every shipped artifact here gets a bench. This one proves the loop: derive → build → let the user touch it.

— Hariom · Lab Notebook No.01
