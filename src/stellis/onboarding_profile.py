"""Confirmed personal setup fields and a speech adapter for the active field."""
import datetime
import re

from stellis import auth, intake, onboarding, health_preferences

INTERESTS = [
    {"id": "wellness", "label": "General wellness", "note": "General wellness and preventive care"},
    {"id": "nutrition", "label": "Nutrition", "note": "Nutrition"},
    {"id": "fitness", "label": "Movement", "note": "Fitness and movement"},
    {"id": "sleep", "label": "Sleep", "note": "Sleep"},
    {"id": "emotional-wellbeing", "label": "Emotional wellbeing", "note": "Emotional wellbeing"},
    {"id": "pregnancy", "label": "Pregnancy", "note": "Pregnancy"},
    {"id": "sexual-health", "label": "Sexual health", "note": "Sexual health"},
    {"id": "dental-care", "label": "Dental care", "note": "Dental care"},
]
FIELDS = [
    {"id": "name", "question": "First, what should I call you?", "kind": "text"},
    {"id": "gender", "question": "How do you describe your gender?", "kind": "text",
     "choices": ["Woman", "Man", "Non-binary", "Prefer not to say"]},
    {"id": "period", "question": "Do you have a period?", "kind": "choice",
     "choices": ["Yes", "No", "Not currently", "Prefer not to say"]},
    {"id": "birth_date", "question": "When is your birth date?", "kind": "date"},
    {"id": "conditions", "question": "Do you have any preexisting health conditions?", "kind": "long",
     "library": "health", "choices": ["None that I know of", "I'd rather skip this"]},
    {"id": "medicines", "question": "Do you take any medicines or supplements?", "kind": "long",
     "library": "medicines", "choices": ["None", "I'll add them later"]},
    {"id": "goals", "question": "What health goals would you like help navigating?", "kind": "long",
     "library": "goals"},
    {"id": "interests", "question": "Which other areas interest you?", "kind": "multiple",
     "choices": INTERESTS},
    {"id": "cycle_tracking", "question": "Are you interested in cycle tracking?", "kind": "choice",
     "choices": ["Yes", "No", "Maybe later"]},
]
BY_ID = {field["id"]: field for field in FIELDS}
FINISH = ("You're all set. I'll suggest notebooks from the interests you shared. "
          "Choose Review notebooks to check them and make any changes. You can adjust them later too. Goodbye.")


def fields(profile):
    show_cycle = str(profile.get("gender") or "").casefold() in {"woman", "female"} or profile.get("period") == "Yes"
    return [field for field in FIELDS if field["id"] != "cycle_tracking" or show_cycle]


def status():
    state = onboarding._read()
    profile = dict(state.get("profile", {}))
    preference = health_preferences.preferences()["experiences_periods"]
    if preference is not None:
        profile["period"] = "Yes" if preference else "No"
    return {"answers": profile, "fields": fields(profile),
            "step": state.get("profile_step", "name"), "complete": state.get("profile_completed", False)}


def save(account_id, field, value):
    """Save only an explicitly confirmed field in the account's setup state."""
    onboarding._require(account_id)
    if field not in BY_ID:
        raise ValueError("Choose a listed setup field")
    definition = BY_ID[field]
    if value is not None:
        if field == "interests":
            if not isinstance(value, list) or any(item not in {i["id"] for i in INTERESTS} for item in value):
                raise ValueError("Choose listed interests")
            value = list(dict.fromkeys(value))
        elif not isinstance(value, str) or len(value) > (2000 if definition["kind"] == "long" else 100):
            raise ValueError("Enter a shorter answer")
        else:
            value = value.strip()
            if definition["kind"] == "choice" and value not in definition["choices"]:
                raise ValueError("Choose a listed answer")
            if field == "birth_date" and value:
                try:
                    date = datetime.date.fromisoformat(value)
                except ValueError as exc:
                    raise ValueError("Enter a valid birth date") from exc
                if date > datetime.date.today() or date.year < 1900:
                    raise ValueError("Enter a birth date between 1900 and today")
    with onboarding._LOCK:
        state = onboarding._read()
        profile = state.setdefault("profile", {})
        profile[field] = value
        if field in {"gender", "period"} and not any(f["id"] == "cycle_tracking" for f in fields(profile)):
            profile.pop("cycle_tracking", None)
        sequence = [f["id"] for f in fields(profile)]
        state["profile_step"] = sequence[sequence.index(field) + 1] if sequence.index(field) + 1 < len(sequence) else "complete"
        state["profile_completed"] = state["profile_step"] == "complete"
        onboarding._save(state)
    if field == "period":
        # Share the tracker visibility preference; gender does not establish period status.
        health_preferences.save({"Yes": True, "No": False}.get(value))
    if field == "name" and value:
        current = auth.profile(account_id)
        auth.update_profile(value, current["email"], account_id)
    _seed_notes(profile)
    return status()


def _seed_notes(profile):
    """Project confirmed setup answers into editable intake notes for review."""
    state = intake.load()
    setup = onboarding._read()
    previous = setup.get("profile_note_values", {})
    existing = {section["heading"]: [item for item in section["items"]
                                    if item not in previous.get(section["heading"], [])]
                for section in state["notes"]}
    interest_notes = [i["note"] for i in INTERESTS if i["id"] in (profile.get("interests") or [])]
    def lines(value):
        return [line.strip()[:intake.MAX_ITEM] for line in re.split(r"[\n;]", value or "") if line.strip()]
    additions = {"Goals": [*lines(profile.get("goals")), *interest_notes],
                 "Conditions": lines(profile.get("conditions")), "Medicines": lines(profile.get("medicines"))}
    if profile.get("cycle_tracking") == "Yes":
        additions["Goals"].append("Menstrual health and cycle tracking")
    for heading, values in additions.items():
        for value in values:
            if value and value not in existing.get(heading, []):
                existing.setdefault(heading, []).append(value)
    intake.save_notes([{"heading": key, "items": values} for key, values in existing.items()], state["notes_revision"])
    with onboarding._LOCK:
        setup = onboarding._read()
        setup["profile_note_values"] = additions
        onboarding._save(setup)


def candidate(field, text):
    """Parse an editable speech candidate without confirming or persisting it."""
    text = text.strip().strip(".!?, ")
    if field == "name":
        text = re.sub(r"^(?:hi|hello|hey)[,!]?\s*", "", text, flags=re.I)
        return re.sub(r"^(?:my name is|call me|i am|i'm|it's|this is|actually)\s+", "", text, flags=re.I)[:100]
    if field == "interests":
        aliases = {"wellness": ["wellness", "general health"], "fitness": ["fitness", "exercise", "movement"], "emotional-wellbeing": ["emotional", "mental health", "stress"]}
        return [item["id"] for item in INTERESTS
                if any(word in text.casefold() for word in aliases.get(item["id"], [item["label"].casefold()]))]
    if field in {"period", "cycle_tracking"}:
        if "prefer not" in text.casefold(): return "Prefer not to say" if field == "period" else "Maybe later"
        if "not currently" in text.casefold(): return "Not currently" if field == "period" else "Maybe later"
        if re.match(r"^(yes|i do|i have)\b", text, re.I): return "Yes"
        if re.match(r"^(no|i don.t)\b", text, re.I): return "No"
    if field == "birth_date":
        text = re.sub(r"^(?:my birthday is|my date of birth is|i was born on|it is|it's)\s+", "", text, flags=re.I)
        cleaned = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", text, flags=re.I)
        for fmt in ("%Y-%m-%d", "%B %d %Y", "%B %d, %Y", "%d %B %Y", "%m/%d/%Y"):
            try:
                return datetime.datetime.strptime(cleaned, fmt).date().isoformat()
            except ValueError:
                pass
        return ""
    for choice in BY_ID[field].get("choices", []):
        if isinstance(choice, str) and choice.casefold() == text.casefold():
            return choice
    if field == "gender":
        if re.search(r"\b(woman|female)\b", text, re.I):
            return "Woman"
        if re.search(r"\b(man|male)\b", text, re.I):
            return "Man"
        if "non" in text.casefold() and "binary" in text.casefold():
            return "Non-binary"
    return text


class VoiceField:
    """Use the call's real recognition and synthesis for one confirmable field."""
    update_notes = None

    def __init__(self, field):
        if field not in BY_ID and field != "complete":
            raise ValueError("Choose a listed setup field")
        self.field = field
        self.end_after_opening = field == "complete"
        self.value = None
        self.last = ""

    def load(self):
        return {"notes": [], "notes_revision": 0}

    def opening(self):
        if self.field == "complete":
            return FINISH
        question = BY_ID[self.field]["question"]
        name = status()["answers"].get("name")
        return f"Thanks, {name}. {question}" if self.field == "gender" and name else question

    def add_person_turn(self, text):
        text = " ".join(str(text).split())
        if not text or len(text) > 2000:
            raise ValueError("Enter an answer of at most 2000 characters")
        self.last = text
        return text

    def extend_person_turn(self, text):
        self.last += " " + text
        return self.last

    def drop_agent_reply(self):
        pass

    def add_agent_turn(self, text):
        pass

    async def reply(self, timings):
        normalized = self.last.casefold().strip(" .!,")
        if self.field == "complete":
            yield FINISH
            yield intake.END_MARK
            return
        from stellis.call_lifecycle import wants_end
        if wants_end(self.last):
            yield "We can pause setup here. Your confirmed answers are saved. Return to setup when you're ready to continue. Goodbye."
            yield intake.END_MARK
            return
        if normalized.startswith(("please wait", "wait", "give me a moment", "one moment", "i need a moment")):
            yield "Take your time. You can continue when you're ready."
            return
        help_request = normalized.endswith('?') or normalized.startswith((
            "what options", "what do you mean", "why do you need", "can you give examples",
            "what do you usually offer", "what counts", "i'm not sure", "i don't know"))
        if help_request and self.field in {"goals", "medicines", "conditions"}:
            explanations = {
                "goals": "You can work on movement, sleep, nutrition, stress, appointments or symptoms. Choose several goals or write your own.",
                "medicines": "Medicines include prescriptions, over-the-counter products and supplements. Search a generic or brand name in the health library. You can edit the name or add it later.",
                "conditions": "You can include a diagnosed condition or a concern you want to discuss. Search health topics for examples, or leave this unspecified. I won't assume you have a diagnosis.",
            }
            yield explanations[self.field]
            return
        if help_request:
            options = BY_ID[self.field].get("choices", [])
            labels = [choice if isinstance(choice, str) else choice["label"] for choice in options]
            yield ("You can choose " + ", ".join(labels) + ". You can also skip this question.") if labels else "You can answer in your own words or skip this question."
            return
        if self.value is not None and normalized in {"yes", "yes that's right", "that's right", "correct", "right"}:
            yield "Thank you."
            yield {"action": "profile_confirm", "field": self.field}
            return
        if self.value is not None and normalized in {"no", "no that's wrong", "not right"}:
            self.value = None
            yield "You can correct the field or tell me your answer again."
            return
        value = candidate(self.field, self.last)
        if BY_ID[self.field]["kind"] == "choice" and value not in BY_ID[self.field]["choices"]:
            yield "You can choose " + ", ".join(BY_ID[self.field]["choices"]) + ". You can also skip this question."
            return
        if self.field in {"birth_date", "interests"} and not value:
            yield "Please enter or choose your answer in the field. You can also skip this question."
            return
        self.value = value
        yield {"action": "profile_answer", "field": self.field, "value": self.value, "heard": self.last}
        yield "Is that right? You can correct the field before continuing."
