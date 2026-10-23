"""Local suggestions and NLM medicine names for reviewable intake answers."""

from functools import lru_cache
import json
from pathlib import Path

from stellis import health_catalogue

ATTRIBUTION = ("This product uses publicly available data from the U.S. National Library of Medicine (NLM), "
               "National Institutes of Health, Department of Health and Human Services; NLM is not responsible "
               "for the product and does not endorse or recommend this or any other product.")
GOALS = (
    ("pregnancy", "Pregnancy", "Navigate pregnancy"),
    ("movement", "Movement", "Move more often"),
    ("sleep", "Sleep", "Sleep better"),
    ("nutrition", "Nutrition", "Build eating habits that work for me"),
    ("stress", "Stress", "Manage stress"),
    ("medicines", "Medicines", "Keep track of my medicines"),
    ("appointments", "Appointments", "Prepare for appointments"),
    ("symptoms", "Symptoms", "Keep track of symptoms"),
)


@lru_cache(maxsize=1)
def medicines():
    data = json.loads(Path(__file__).with_name("medicine_terms.json").read_text())
    return [(identifier, name, name.casefold()) for identifier, name in data["terms"]]


def search(category: str, query: str):
    """Search reference names without sending the person's query to a provider."""
    words = query.casefold().split()
    if category == "goals":
        candidates = [{"id": key, "label": name, "detail": text,
                       "answer": "I'd like help to " + text[0].lower() + text[1:] + "."}
                      for key, name, text in GOALS]
    elif category == "health":
        candidates = [{"id": t["template_id"], "label": t["display_name"],
                       "detail": t["description"], "answer": "I'd like to discuss " + t["display_name"] + "."}
                      for t in health_catalogue.configuration()["templates"]]
    elif category == "medicines":
        if not words:
            return {"items": [], "total": 0, "attribution": ATTRIBUTION}
        matched = [(identifier, name) for identifier, name, key in medicines()
                   if all(word in key for word in words)]
        matched.sort(key=lambda item: (not item[1].casefold().startswith(query.casefold()), len(item[1]), item[1]))
        return {"items": [{"id": identifier, "label": name, "detail": "RxNorm " + identifier,
                            "answer": "Medicine or supplement to discuss: " + name + "."}
                           for identifier, name in matched[:20]],
                "total": len(matched), "attribution": ATTRIBUTION}
    else:
        raise ValueError("Choose Goals, Health topics or Medicines and supplements")
    matched = [item for item in candidates
               if all(word in (item["label"] + " " + item["detail"]).casefold() for word in words)]
    return {"items": matched[:20], "total": len(matched), "attribution": ATTRIBUTION}
