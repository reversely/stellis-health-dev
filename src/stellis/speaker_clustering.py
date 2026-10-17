"""Speaker groups from per-passage TitaNet embeddings (ADR 0053).

Spectral clustering with the speaker count chosen from the Laplacian eigengap,
pruning the affinity matrix at the ratio that gives the clearest gap (NME-SC,
Park et al., 2019). It replaces the pyannote fast-clustering IDs on passages,
which split a few real voices into dozens of groups.
"""

from __future__ import annotations

import numpy as np

MIN_PASSAGES = 3
MAX_SPEAKERS = 8
PRUNE_RATIOS = (0.1, 0.15, 0.2, 0.25, 0.3)
UNCERTAIN_MARGIN = 0.10


def _prune(similarity: np.ndarray, keep: int) -> np.ndarray:
    """Keep each row's strongest affinities, then symmetrize."""
    pruned = np.zeros_like(similarity)
    columns = np.argsort(-similarity, axis=1)[:, :keep]
    rows = np.arange(len(similarity))[:, None]
    pruned[rows, columns] = similarity[rows, columns]
    return np.maximum((pruned + pruned.T) / 2, 0)


def _laplacian_eigs(affinity: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    degree = 1 / np.sqrt(np.maximum(affinity.sum(axis=1), 1e-9))
    laplacian = np.eye(len(affinity)) - degree[:, None] * affinity * degree[None]
    return np.linalg.eigh(laplacian)


def _kmeans(points: np.ndarray, count: int, seed: int = 0, restarts: int = 10) -> np.ndarray:
    """Deterministic k-means++ with restarts; numpy only."""
    rng = np.random.default_rng(seed)
    best, best_cost = np.zeros(len(points), dtype=int), np.inf
    for _ in range(restarts):
        centers = [points[rng.integers(len(points))]]
        for _ in range(1, count):
            distance = np.min(((points[:, None] - np.array(centers)[None]) ** 2).sum(-1), axis=1)
            total = distance.sum()
            centers.append(points[rng.choice(len(points), p=distance / total)] if total > 0
                           else points[rng.integers(len(points))])
        center = np.array(centers)
        for _ in range(100):
            labels = np.argmin(((points[:, None] - center[None]) ** 2).sum(-1), axis=1)
            moved = np.array([points[labels == j].mean(0) if np.any(labels == j) else center[j]
                              for j in range(count)])
            if np.allclose(moved, center):
                break
            center = moved
        cost = float(((points - center[labels]) ** 2).sum())
        if cost < best_cost:
            best, best_cost = labels, cost
    return best


def cluster(vectors: np.ndarray) -> np.ndarray:
    """Group unit-length embeddings; the number of groups is estimated, never given."""
    count = len(vectors)
    if count < MIN_PASSAGES:
        return np.zeros(count, dtype=int)
    similarity = vectors @ vectors.T
    np.fill_diagonal(similarity, 1.0)
    top = min(MAX_SPEAKERS, count - 1)
    best: tuple[float, int, np.ndarray] | None = None
    for ratio in PRUNE_RATIOS:
        keep = max(2, int(ratio * count))
        values, vectors_ = _laplacian_eigs(_prune(similarity, keep))
        gaps = np.diff(values[: top + 1])
        speakers = int(np.argmax(gaps)) + 1
        clarity = gaps[speakers - 1] / max(float(values[top]), 1e-9)
        rank = keep / max(clarity, 1e-9)
        if best is None or rank < best[0]:
            best = (rank, speakers, vectors_)
    _, speakers, eigenvectors = best
    if speakers == 1:
        return np.zeros(count, dtype=int)
    spectral = eigenvectors[:, :speakers]
    spectral = spectral / np.maximum(np.linalg.norm(spectral, axis=1, keepdims=True), 1e-9)
    return _kmeans(spectral, speakers)


def assign(segments: list[dict[str, object]], vectors: np.ndarray, valid: np.ndarray) -> bool:
    """Set each passage's speaker group in place; False leaves segments untouched."""
    embedded = np.flatnonzero(valid)
    if len(embedded) < MIN_PASSAGES:
        return False
    labels = cluster(vectors[embedded])
    groups = int(labels.max()) + 1
    centroids = np.stack([vectors[embedded][labels == group].mean(axis=0) for group in range(groups)])
    centroids /= np.maximum(np.linalg.norm(centroids, axis=1, keepdims=True), 1e-9)
    similarity = vectors[embedded] @ centroids.T
    own = similarity[np.arange(len(embedded)), labels]
    other = np.where(np.eye(groups, dtype=bool)[labels], -np.inf, similarity).max(axis=1) if groups > 1 else own - 1
    # Number groups by first appearance so "Speaker 1" speaks first.
    order = {group: rank for rank, group in enumerate(dict.fromkeys(labels.tolist()))}
    by_index = {int(index): (order[int(label)], float(margin))
                for index, label, margin in zip(embedded, labels, own - other)}
    middles = np.array([(int(segments[i]["start_ms"]) + int(segments[i]["end_ms"])) / 2 for i in embedded])
    for index, segment in enumerate(segments):
        if index in by_index:
            group, margin = by_index[index]
            segment.update(speaker_cluster_id=f"speaker-{group + 1}", speaker_match_source="passage_cluster",
                           speaker_uncertain=margin < UNCERTAIN_MARGIN, speaker_margin=round(margin, 3))
        else:
            middle = (int(segment["start_ms"]) + int(segment["end_ms"])) / 2
            nearest = int(embedded[int(np.argmin(np.abs(middles - middle)))])
            segment.update(speaker_cluster_id=f"speaker-{by_index[nearest][0] + 1}",
                           speaker_match_source="nearest_passage", speaker_uncertain=True)
    return True
