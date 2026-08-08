# Deep-tech eval — raw transcripts

Full, unedited output from all three conditions, run 2026-08-08 in the same
session, same underlying model. This is the primary source data behind the
tables in [`EVALS.md`](../EVALS.md) — every score and every claim there
should be traceable back to a passage in this file. Nothing here has been
cleaned up or rephrased from what the agents actually returned.

**Setup:** 5 problems spanning physics, applied math, quantitative biology,
ML, and statistics — chosen because none had been tested in this project
before (no reuse of earlier, already-known-good CS scenarios) and because
they're realistic "what approach should we take" planning tasks, not
trivia. Three conditions ran on the same 5 problems, independently, with no
visibility into each other's output:

- **Situation A (cold):** no tools, no web access — answers purely from the
  model's own reasoning.
- **Situation B (web + arXiv, undisciplined):** normal WebSearch/WebFetch
  access, used at the agent's own judgment — no isolation or convergence
  procedure, just a capable agent that can look things up.
- **Situation C (NeuroArxiv):** followed `skills/neuroarxiv/SKILL.md`
  exactly — pre-flight gate, categorize, real arXiv fetch, isolated reads,
  score/cluster, converge to one path.

Situation C's isolated reads used a budget-constrained sequential-in-context
mode rather than true parallel Agent-per-paper spawns, disclosed by the
agent itself — see its methodology note at the end of its transcript below.

A sample of Situation B's self-reported citations (`2403.05391`,
`2606.24467`, `2407.16376`, `2306.04886`) was independently verified
against the real arXiv API before any scoring — all four were real and
matched the reported titles exactly.

---

## Situation A — cold

### Problem 1: Idle-period decoherence in superconducting qubits
**Approach:** Apply dynamical decoupling (DD) pulse sequences (e.g., CPMG, XY4/XY8, or Uhrig UDD) during idle windows to refocus low-frequency dephasing noise (T2*/1f flux and charge noise) without adding gate error budget. Combine with pulse-sequence-aware compiler scheduling that inserts DD automatically whenever a qubit is idle in the circuit, and tune sequence spacing to the qubit's actual noise spectrum (measured via noise spectroscopy) rather than a generic recipe. Where idle time is unavoidable due to circuit structure, consider echoed/virtual-Z gate compilation to shrink idle windows in the first place.
**First step:** Characterize the noise spectrum per qubit (Ramsey/spin-echo decay, 1/f noise fit) to know what frequency band the DD sequence needs to suppress.
**Risk:** DD pulses themselves have gate error and can constructively interfere with residual ZZ crosstalk between neighboring qubits — badly chosen timing can make things worse, not better.
**Watch out for:** Applying a single global DD sequence uniformly across the chip without per-qubit calibration; also DD pulses can pump energy into the qubit and heat the environment or trigger TLS defect activation, so don't over-apply on long idle windows.

### Problem 2: Sparse 3D FEM linear solve, memory-limited
**Approach:** Use a matrix-free (or partially matrix-free) Krylov solver — Conjugate Gradient for SPD systems, GMRES/BiCGStab otherwise — preconditioned with geometric or algebraic multigrid (GMG/AMG), avoiding a direct sparse factorization (which blows up memory in 3D due to fill-in). If a direct solve is required for robustness, use a nested-dissection ordering to minimize fill, possibly with a multifrontal solver that spills to disk, but default to iterative+multigrid given the memory constraint.
**First step:** Assemble (or keep matrix-free) the stiffness matrix and try CG with a simple preconditioner (Jacobi/ILU(0)) as a baseline, then swap in AMG (e.g., via PETSc/hypre BoomerAMG or trilinos) once the baseline convergence rate is known.
**Risk:** Direct solvers (sparse LU/Cholesky) have fill-in that grows superlinearly in 3D — this is the classic memory blow-up trap, so committing to a direct method under a tight memory budget is the highest-risk mistake.
**Watch out for:** Ill-conditioned systems (e.g., high aspect-ratio elements, nearly incompressible materials) can make plain CG/AMG converge poorly — check condition number sensitivity, and don't assume off-the-shelf AMG settings work for anisotropic/heterogeneous coefficient problems without tuning smoothers.

### Problem 3: Protein-ligand binding affinity, few thousand labels
**Approach:** Don't train a large end-to-end 3D model from scratch on a few thousand points — use transfer learning: start from a pretrained structural/molecular representation (e.g., a pretrained equivariant GNN or protein-ligand interaction model) and fine-tune, or use it as a frozen featurizer feeding a simpler regressor (gradient boosting/shallow MLP) on top. Favor physics-informed features (contact maps, interaction fingerprints, docking-score-like terms) blended with learned embeddings to reduce the effective hypothesis space, and use cross-validation splits that respect scaffold/cluster splits (not random) to get an honest estimate of generalization.
**First step:** Establish a strong classical baseline first (e.g., gradient-boosted trees on physics-based descriptors/docking features) to know what "good" looks like before investing in a deep model.
**Risk:** Data leakage from similar protein-ligand complexes appearing in both train/test (via close homologs or ligand analogs) is the single most common way these models look great in-house and fail out-of-distribution — this is the load-bearing risk.
**Watch out for:** Random splitting instead of scaffold/cluster or temporal splitting; overfitting a large equivariant/3D model on too few examples; ignoring that binding affinity assays themselves are noisy (different assay types are not directly comparable) which puts a ceiling on achievable accuracy regardless of model quality.

### Problem 4: KV-cache compression without losing needle-in-haystack accuracy
**Approach:** Avoid uniform/naive eviction (e.g., simple sliding window or uniform quantization) since needle-in-haystack failures usually come from evicting exactly the "surprising" token that held the needle. Prefer importance-aware compression: attention-score-based token eviction that keeps a running "always keep" set of high-attention tokens (e.g., H2O-style heavy-hitter retention) or a hybrid of local window + global heavy hitters, combined with low-bit KV quantization (e.g., 4-bit) for the tokens you do keep. Test any scheme specifically against long-context needle benchmarks, not just perplexity, since perplexity is not sensitive enough to catch localized retrieval failures.
**First step:** Benchmark the baseline model's needle-in-haystack accuracy uncompressed to get a reference, then apply one compression method at a time (quantization first, since it's lowest-risk) and re-measure needle accuracy at each step.
**Risk:** Most eviction heuristics are validated on aggregate perplexity/throughput metrics, which can look fine while silently destroying retrieval of rare/low-frequency tokens — the load-bearing risk is that your evaluation metric doesn't actually catch the failure mode you care about.
**Watch out for:** Applying eviction policies uniformly across all attention heads/layers — retrieval-critical heads are often a small subset, and compressing them as aggressively as others is a common cause of needle accuracy collapse; also watch for compression schemes that assume recency = importance (sliding window alone), which is exactly wrong for needle tasks where the needle can be anywhere.

### Problem 5: Real-time regime change detection, low false-positive tolerance
**Approach:** Use a sequential change-point detection method with an explicit false-alarm-rate control, such as CUSUM or a Bayesian online change-point detection (BOCPD) framework, rather than a fixed-window statistical test — these give you a tunable threshold directly tied to average-run-length-to-false-alarm, which is what you need to dial in low false positives. Layer this on top of a model of the "normal" regime dynamics (e.g., a rolling GARCH/state-space model for the process) so the detector is measuring deviation from a well-calibrated null, not raw values.
**First step:** Define the acceptable false-positive rate quantitatively (e.g., target average run length between false alarms) and back out the corresponding detection threshold analytically or via backtesting on historical stable-regime data.
**Risk:** The core tension is that low false-positive tolerance directly trades against detection latency — pushing FP rate down will delay true regime-change detection, and this tradeoff curve is the thing that determines whether the system is actually useful in practice.
**Watch out for:** Tuning thresholds on in-sample data and then being surprised by drift in the "normal" baseline itself (the null model needs to adapt or be periodically refit); also avoid stacking multiple independent naive detectors and OR-ing their alarms, which multiplies the false-positive rate instead of controlling it.

---

## Situation B — general web + arXiv access, undisciplined

### Problem 1: Idle-period decoherence in superconducting qubits
**Approach:** Insert dynamical decoupling (DD) pulse sequences (e.g., XY4, CPMG, or empirically-tuned/adaptive variants) into idle windows on qubits that are waiting for other parts of the circuit to finish. DD sequences average out low-frequency dephasing noise and suppress ZZ crosstalk from neighboring active qubits, effectively extending coherence during idle time without adding new hardware. Combine with circuit-level scheduling (compress idle windows, reorder gates to minimize idle time) and calibrate the DD sequence per-qubit since fixed sequences can underperform on real hardware.
**First step:** Profile the circuit to identify idle windows per qubit, then benchmark a standard sequence (XY4/CPMG) against an empirically-learned DD sequence on the actual device to see which best suppresses that hardware's dominant noise/crosstalk channels.
**Risk:** DD sequences tuned for one noise environment can fail or even worsen fidelity under drift or crosstalk from simultaneously-executing gates on neighboring qubits — sequences need periodic recalibration and validation against the specific device's noise spectrum, not just a textbook default.
**Sources used:** Searched web for recent (2024–2025) work on DD for superconducting processors. Relevant: Multi-qubit Dynamical Decoupling for Enhanced Crosstalk Suppression (arXiv 2403.05391), Empirical learning of dynamical decoupling on quantum processors (arXiv 2403.02294), Syncopated Dynamical Decoupling for Suppressing Crosstalk (arXiv 2403.07836), Measurement-based Dynamical Decoupling for Fidelity Preservation on Large-scale Quantum Processors (arXiv 2511.13532).

### Problem 2: Memory-limited sparse solver for 3D FEM systems
**Approach:** Use a matrix-free (or partially assembled) geometric or algebraic multigrid (AMG) method as either the solver or a preconditioner for a Krylov method (CG for SPD systems, GMRES otherwise) — this combination scales near-optimally (O(N)) and avoids the memory blowup of direct sparse factorization (fill-in) that plagues 3D problems. If matrix assembly itself is the memory bottleneck, go fully matrix-free (element-by-element operator application) so you never store the global sparse matrix, only geometry/coefficients.
**First step:** Assess conditioning and matrix structure (SPD vs. not) and try an off-the-shelf AMG-preconditioned CG/GMRES solver (e.g., PETSc/Hypre BoomerAMG, Trilinos ML) on a representative mesh to measure memory footprint and convergence before committing to a matrix-free rewrite.
**Risk:** AMG setup cost and effectiveness is sensitive to problem type — it can degrade badly on anisotropic, highly heterogeneous, or non-elliptic (e.g., convection-dominated) problems, in which case you may need specialized smoothers or fall back to a memory-cheaper but slower Krylov+ILU approach; don't assume AMG "just works" without testing on your actual mesh/PDE.
**Sources used:** Searched web for multigrid vs. Krylov trade-offs on 3D FEM. Relevant: A Fast and Memory Efficient Sparse Solver with Applications to Finite-Element Matrices (arXiv 1410.2697), Subdomain Deflation Combined with Local AMG (arXiv 1710.03940), Reducing Complexity in Parallel Algebraic Multigrid Preconditioners (SIAM).

### Problem 3: Protein-ligand binding affinity from structure, few thousand labels
**Approach:** Don't train from scratch on your small labeled set — use a structure-aware model pretrained on large auxiliary data (docked complexes, bioassay data, or synthetic structures) and fine-tune/transfer to your labeled examples; geometric deep learning (SE(3)-equivariant GNNs) architectures pretrained this way generalize much better than models trained on PDBbind-scale data alone (PDBbind itself has under 20K labeled complexes, similar order to your dataset). Consider multi-task pretraining on relative rankings within bioassays rather than only absolute affinity regression, since ranking signal is more robust with limited data.
**First step:** Identify and download a suitable pretrained structure-based affinity/scoring model (e.g., an MBP-style or Boltz-2-style checkpoint) and fine-tune it on your few-thousand-example set, holding out a scaffold-split validation set to check for genuine generalization vs. memorization.
**Risk:** Data leakage / poor generalization from scaffold or protein-family overlap between train and test splits is the classic failure mode in this field — random splits will overstate performance; you need scaffold- or cluster-based splitting to get a trustworthy estimate of real-world performance.
**Sources used:** Searched web for 2025 structure-based binding affinity approaches. Relevant: Multi-task Bioassay Pre-training (arXiv 2306.04886), GatorAffinity: synthetic structural data (bioRxiv), A generalizable deep learning framework for structure-based protein-ligand affinity ranking (PNAS), Accurate and Generalizable Protein-Ligand Binding Affinity Prediction With Geometric Deep Learning (PMC).

### Problem 4: KV-cache compression without losing needle-in-haystack accuracy
**Approach:** Use a semantic/importance-aware eviction or clustering scheme rather than naive recency- or magnitude-based pruning — methods that identify "retrieval heads" or preserve semantically coherent chunks (not isolated tokens) retain needle-in-haystack accuracy far better under aggressive compression. Pyramidal/layer-adaptive budget allocation (more cache retained in early layers, less in later ones) combined with a small residual/latent-memory readout to compensate for evicted tokens is currently the strongest pattern for keeping retrieval accuracy near full-cache baselines.
**First step:** Benchmark your model on RULER and needle-in-haystack at your target context length with full KV cache to get a baseline, then integrate a semantic-retrieval-guided or chunk-based compression method (rather than a simple top-k attention-score eviction) and re-measure at your target compression ratio.
**Risk:** Compression methods tuned/benchmarked on one model family or one needle position/depth often don't transfer — accuracy can degrade sharply at specific needle depths or with multiple needles even when average benchmark scores look fine, so evaluate across needle depth and multi-needle variants, not just aggregate accuracy.
**Sources used:** Searched web for recent KV-cache compression research. Relevant: PyramidKV (arXiv 2406.02069), CompressKV: Semantic-Retrieval-Guided KV-Cache Compression (arXiv 2606.24467), ChunkKV: Semantic-Preserving KV Cache Compression (arXiv 2502.00299), DynamicKV: Task-Aware Adaptive KV Cache Compression (arXiv 2412.14838), IndexMem: Learned KV-Cache Eviction with Latent Memory (arXiv 2605.25475).

### Problem 5: Real-time regime-change detection, low false-positive tolerance
**Approach:** Use a Bayesian online change-point detection (BOCPD) framework with a time-varying/adaptive underlying model rather than a fixed-threshold statistical test — BOCPD gives a calibrated posterior over "time since last regime change," letting you set a high-confidence threshold to directly control false-positive rate, and it naturally handles non-stationarity when paired with a state-space model (e.g., time-varying autoregressive parameters) instead of assuming i.i.d. or stationary segments. Layer a confirmation/hysteresis rule on top (require the posterior to stay above threshold for a short persistence window) to further suppress transient false alarms, trading a small amount of detection latency for precision.
**First step:** Implement BOCPD with a time-varying-parameter autoregressive observation model on historical data, back-test detection latency vs. false-positive rate across known historical regime changes, and tune the persistence/confirmation window to hit your false-positive budget.
**Risk:** Most published methods report false-positive rates on curated benchmarks; in live deployment, non-stationarity in the "normal" regime itself (not just at change points) is the main driver of false alarms — naive stationary-process methods will over-trigger right after any legitimate change, so the state-space/adaptive-parameter choice is load-bearing, not optional.
**Sources used:** Searched web for regime-change/change-point detection methods for non-stationary series. Relevant: Bayesian Autoregressive Online Change-Point Detection with Time-Varying Parameters (arXiv 2407.16376), A Robust Topological Framework for Detecting Regime Changes (arXiv 2410.20443), A Survey of Methods for Time Series Change Point Detection (WSU EECS).

---

## Situation C — NeuroArxiv skill

### Methodology used
- **Cap:** 2 categories × 2 papers per category (4 papers) per problem, instead of the skill's default 3-5×4.
- **Phase 2 isolation:** sequential-but-isolated reads in-context, not parallel Agent spawns — with 5 problems × 4 papers, 20 parallel Task spawns was judged disproportionate. Each read looked only at that one paper's title/abstract, never referencing sibling papers.
- All papers came from real WebFetch calls to `https://export.arxiv.org/api/query`. 11 total fetches (one retry on Problem 3 per the skill's "if fewer than 2 results, drop terms" rule).

### Problem 1: Idle-period decoherence in superconducting qubits
**Pre-flight:** proceed — open mechanism (DD vs. other mitigation), real cost of building it wrong.
**Categories searched:** quant-ph, cond-mat.supr-con — both outside the curated list (no physics categories exist there); selected from general arXiv-taxonomy knowledge, not verified against any lookup tool.
**Papers found:** 0911.3202 "Combining dynamical decoupling with fault-tolerant quantum computation" (Ng/Lidar/Preskill); 2108.04530 "Suppression of crosstalk in superconducting qubits using dynamical decoupling" (Tripathi et al., IBM hardware); quant-ph/0212088 "Engineering Progressive Decoherence... Charge Qubit"; cond-mat/0604191 "Relaxation and decoherence in a resonantly driven qubit".
**THE PATH:** Insert dynamical-decoupling pulse sequences (XY4-type) into idle windows, tuned so pulse rate exceeds the system-bath/ZZ-crosstalk coupling strength; use concatenated-sequence theory for calibration bounds. First step: characterize per-pair ZZ/crosstalk spectrum, then benchmark candidate DD sequences via randomized benchmarking on idle windows. Load-bearing risk: DD effectiveness is sharply sensitive to drive-frequency vs. bath-coupling ratio — a poor match can fail to suppress or worsen crosstalk (2108.04530's own finding). Avoid: assuming one sequence transfers across qubit pairs without recalibration; trusting idealized noise-model bounds (0911.3202) without hardware validation.
**Alternates considered:** Theoretical decoherence-characterization cluster (quant-ph/0212088, cond-mat/0604191) — informative physics, no concrete mitigation step, loses on practicality.

### Problem 2: Sparse linear solve from 3D FEM, limited memory
**Pre-flight:** proceed — open solver-architecture choice, expensive to redo at scale.
**Categories searched:** math.NA — outside the curated list (curated table has only math.OC; real numerical-analysis category is math.NA), plus cs.DC (curated).
**Papers found:** 2606.03141 "Owner-selected bubble transforms and coefficient-robust Schwarz preconditioners..." (carries a withdrawal notice — proof needs revision); 1003.2475 "Auxiliary space preconditioners for linear elasticity..."; 2604.23979 "SDSL-Solver: Scalable Distributed Sparse Linear Solvers..."; 2012.00217 "Enhancing Scalability of a Matrix-Free Eigensolver for Many-Body Localization".
**THE PATH:** Matrix-free Krylov iteration (CG/GMRES applying the stiffness operator via element matvecs, never assembling/factorizing the global matrix) with a lightweight diagonal/block-Jacobi preconditioner, plus block-partitioned distributed scaling if it exceeds one node. First step: implement matrix-free operator application, validate convergence with a plain diagonal preconditioner before adding communication tuning. Load-bearing risk: matrix-free shifts the bottleneck from memory to computation-communication imbalance (2012.00217) — needs deliberate scheduling or the memory win is erased by wall-clock cost. Avoid: leaning on the vertex-patch Schwarz robustness claim as-is (2606.03141's own withdrawal notice flags its central proof); assuming IPM-benchmarked speedups (2604.23979) transfer untested to FEM conditioning.
**Alternates considered:** Domain-decomposition/Schwarz preconditioning cluster (2606.03141, 1003.2475) — stronger theoretical guarantees, heavier to implement, and the lead paper's proof is currently under revision.

### Problem 3: Protein-ligand binding affinity, few-shot, structure-only
**Pre-flight:** proceed — open architecture choice under a real data constraint.
**Categories searched:** q-bio.BM — outside the curated list (no bio categories present), plus cs.LG (curated; first cs.LG query with "few-shot" returned only 1 result, retried per skill rule by dropping terms).
**Papers found:** 2509.11046 "Hybrid Quantum Neural Networks for... Binding Affinity Prediction"; 2606.14217 "Curvature-Informed Potential Energy Surface for... Binding Affinity Prediction" (CPES); 2512.00708 "Towards Precision Protein-Ligand Affinity Prediction Benchmark... DAVIS Dataset"; 2209.13014 "Predicting Protein-Ligand Binding Affinity via Joint Global-Local Interaction Modeling" (GLI).
**THE PATH:** Structure-based GNN with explicit short-range/long-range interaction separation (GLI-style) augmented with physics-derived, non-learned descriptors (curvature/PES-Hessian features, CPES-style); anchor the backbone near a docking-based scoring function rather than pure end-to-end learned docking-free prediction, since 2512.00708 showed docking-based backbones generalize far better under scarce/shifted labels, reserving fine-tuning for a small top-up on the true target set. First step: implement the global-local split on a standard 3D-graph encoder, validate few-shot on a public benchmark (DAVIS) before touching the in-house dataset. Load-bearing risk: Hessian/PES descriptor computation adds real per-example preprocessing cost — verify it scales to dataset size before committing the pipeline. Avoid: a purely docking-free, purely learned model fine-tuned only on the target set (shown to overfit and fail on distribution shift); assuming NISQ/quantum architectures without existing quantum infra.
**Alternates considered:** Hybrid quantum NN cluster (2509.11046) — fewer parameters in principle, but requires quantum-hardware/simulation infra and offers no low-data-generalization evidence.

### Problem 4: KV-cache compression without losing needle-in-a-haystack accuracy
**Pre-flight:** proceed — open compression-architecture choice, core to inference cost.
**Categories searched:** cs.CL, cs.LG — both within the curated list, no gap.
**Papers found:** 2503.10714 "ZSMerge: Zero-Shot KV Cache Compression..."; 2605.26678 "NestedKV: Nested Memory Routing..."; 2603.20616 "Beyond Token Eviction: Mixed-Dimension Budget Allocation..." (MixedDimKV); 2605.06997 "Echo: KV-Cache-Free Associative Recall with Spectral Koopman Operators".
**THE PATH:** Compress in place via fine-grained, non-binary budget allocation — per-token dimension reduction (not full eviction) combined with head-level importance and multi-time-scale scoring, merging reduced/evicted info into a residual rather than discarding. First step: implement per-token dimension-reduction with head-level importance as the base compressor, validate directly against needle-in-a-haystack at your target context length. Load-bearing risk: MixedDimKV's strongest evidence (100% NIAH accuracy at 0.26% cache) is reported at one context length (50K) — must be re-validated at production length and under multi-needle retrieval. Avoid: binary token eviction as baseline (shown to be a coarse special case that underperforms); trusting a bare compression ratio (e.g., 20:1) without an explicit retrieval-accuracy number; switching to a KV-cache-free architecture (Echo) unless retraining is feasible — pure SSMs alone collapse near chance without the added spectral operator.
**Alternates considered:** KV-cache-free architecture-replacement cluster (Echo/SKA) — true constant-memory scaling, but requires an architecture swap and likely retraining.

### Problem 5: Near-real-time regime-change detection, low false-positive tolerance
**Pre-flight:** proceed — open detector-architecture choice with a hard secondary constraint (false positives).
**Categories searched:** stat.ML, eess.SP — both within the curated list, no gap.
**Papers found:** 2308.07012 "Greedy online change point detection" (GOCPD); 2010.01388 "Online Neural Networks for Change-Point Detection"; 2008.09524 "Change Point Detection... using Autoencoders with a Time-Invariant Representation"; 2111.00047 "Robust and efficient change point detection using... soft-Rank Energy GoF test".
**THE PATH:** Fast streaming base detector (likelihood-ratio/two-segment test with logarithmic search, or a linear-complexity online-learning detector) feeding an explicit false-alarm-suppression layer — matched-filter-plus-change-point-score postprocessing, or an entropy-regularized (soft) distributional statistic in place of a raw one. First step: implement the fast base detector, measure its raw false-alarm rate, then add the suppression layer as a separately-tunable stage. Load-bearing risk: neither false-alarm-reduction paper states an absolute residual false-positive rate, only relative improvement — must be re-measured against your actual tolerance. Avoid: a raw/unregularized distributional statistic (plain rank-energy) as the trigger — explicitly shown oversensitive to small shifts; trusting a fast detector's bare threshold to hit a strict false-positive bar unaided.
**Alternates considered:** Fast/low-latency-only cluster (GOCPD, Online NN CPD) — better speed/complexity guarantees, but neither reports false-alarm control, the harder constraint here.

### Methodology note (from the agent)
Total real HTTP fetches: 11 WebFetch calls against `export.arxiv.org/api/query` (2/2/3/2/2 across problems 1-5). Isolation mode: sequential-but-isolated reads in-context, not parallel Agent spawns. Physics/bio category gap: real and consequential — the curated table (`src/categories.ts`) has no slot for `quant-ph`, `cond-mat.supr-con`, or `q-bio.BM`, and is also missing `math.NA` despite it being a mainstream engineering category, not a niche one. All three off-list category guesses returned valid, on-topic results in this run, but there is currently no fallback if a guess is wrong — it would fail silently into an empty/irrelevant result set with no self-correction signal.
