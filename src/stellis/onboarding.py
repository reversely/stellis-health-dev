"""Durable first-account setup; proposals become workspace objects only after review."""
from __future__ import annotations

import asyncio
import json
import threading
from stellis import agent_templates, agents, agent_runtime, auth, collections, notebooks, pages, runtime_settings, storage

_LOCK = threading.Lock()
USES = [
    {"id":"meetings", "name":"Meetings", "icon":"microphone", "collection":"Work", "notebook":"Meetings", "agents":["steward"], "description":"Keep recordings, notes and to-dos together."},
    {"id":"emails", "name":"Emails", "icon":"inbox", "collection":"Work", "notebook":"Correspondence", "agents":["steward","writing"], "description":"Keep correspondence and prepare drafts for review."},
    {"id":"learning", "name":"Learning", "icon":"notebook", "collection":"Learning", "notebook":"Learning", "agents":["steward","tutor"], "description":"Learn with a tutor that can read a screen you share."},
    {"id":"projects", "name":"Projects", "icon":"folder", "collection":"Work", "notebook":"Projects", "agents":["steward","writing"], "description":"Give a project its own notes, sources and agents."},
    {"id":"home", "name":"Home projects", "icon":"folder-plus", "collection":"Home", "notebook":"Home projects", "agents":["steward"], "description":"Keep plans, decisions and next steps in one place."},
    {"id":"family", "name":"Family", "icon":"calendar", "collection":"Home", "notebook":"Family", "agents":["steward","schedule"], "description":"Organize shared plans and the details you want to remember."},
    {"id":"research", "name":"Deep research", "icon":"search", "collection":"Work", "notebook":"Research", "agents":["steward","research"], "description":"Ask an agent to investigate and cite its sources."},
    {"id":"slides", "name":"Slide decks", "icon":"layout-dashboard", "collection":"Work", "notebook":"Presentations", "agents":["steward","slides"], "description":"Turn notebook sources into a first slide deck."},
]


def _read():
    with storage.connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS onboarding_setup (id INTEGER PRIMARY KEY CHECK(id=1), state_json TEXT NOT NULL)")
        row = conn.execute("SELECT state_json FROM onboarding_setup WHERE id=1").fetchone()
    return json.loads(row[0]) if row else {"step":"welcome", "uses":[], "ready":None, "created":[]}


def _save(state):
    with storage.connect() as conn:
        conn.execute("INSERT OR REPLACE INTO onboarding_setup VALUES (1, ?)", (json.dumps(state),))


def available(account_id):
    return auth.needs_onboarding(account_id) or bool(_read().get("editing"))


def reopen(account_id):
    with _LOCK:
        state = _read()
        if not auth.needs_onboarding(account_id) and not state.get("editing"):
            state.update(step="welcome", editing=True, uses=[], agent_choices={}, task_choices={}, scan=None)
            _save(state)
    return status(account_id)


def _require(account_id):
    if not available(account_id):
        raise ValueError("This account has already finished setup")


def status(account_id):
    from stellis import local_setup
    state = _read()
    defaults = {book['name'].lower():book['todo_enabled'] for book in notebooks.list_notebooks()}
    inherited = {group['name'].lower():group['todo_list']=='on' for group in collections.list_collections()}
    return {**state, "task_defaults":defaults, "collection_task_defaults":inherited, "required":available(account_id), "catalog":USES,
            "proposals":[item for item in USES if item["id"] in state["uses"]], "runtime":runtime_settings.status(), "local_setup":local_setup.status()}


def choose(account_id, uses, step, agent_choices=None, task_choices=None):
    _require(account_id)
    if any(item not in {entry["id"] for entry in USES} for item in uses):
        raise ValueError("Choose a listed use")
    if task_choices is not None:
        if not isinstance(task_choices, dict) or len(task_choices) > 32 or any(
                not isinstance(key, str) or not 1 <= len(key) <= 100 or type(value) is not bool
                for key, value in task_choices.items()):
            raise ValueError("Choose whether each notebook suggests tasks")
    if agent_choices is not None:
        if not isinstance(agent_choices, dict) or len(agent_choices) > 32:
            raise ValueError("Choose agents for the proposed notebooks")
        allowed = set(agent_templates.TEMPLATES)
        for key, values in agent_choices.items():
            if not isinstance(key, str) or len(key) > 100 or not isinstance(values, list) or len(values) > len(allowed):
                raise ValueError("Invalid notebook agent selection")
            if any(not isinstance(value, str) or value not in allowed for value in values):
                raise ValueError("Choose an available agent template")
    with _LOCK:
        state = _read(); state.update(uses=list(dict.fromkeys(uses)),step=step)
        if agent_choices is not None:
            state["agent_choices"] = {key:list(dict.fromkeys(values)) for key,values in agent_choices.items()}
        if task_choices is not None:
            state['task_choices'] = dict(task_choices)
        _save(state)
    return status(account_id)


async def check(account_id):
    _require(account_id)
    route = await asyncio.to_thread(runtime_settings.check)
    observed = route["observed"]
    if observed["inference"]["state"] != "available" or not route["agent_configured"]:
        raise ValueError("The inference model or agent runtime is unavailable. Configure this deployment, then check again.")
    if route["local_inference"] and observed["agent"]["state"] != "reported":
        raise ValueError("The managed agent is not using the configured local model. Check its route in Settings.")
    default = next(item for item in agents.list_agents() if item["is_default"])
    reply = await agent_runtime.ask(default["id"], "This is a connection check during first setup. Reply with one short sentence saying you are ready to help.")
    with _LOCK:
        state = _read(); state["ready"] = {"checked_at":observed["checked_at"], "model":route["agent_model"], "local":route["local_inference"], "job_id":reply["job_id"]}; _save(state)
    return status(account_id)


def complete(account_id, proposal_id=None, group_ids=None):
    if not available(account_id):
        return {"complete":True, "created":_read()["created"]}
    with _LOCK:
        state = _read()
        if state["step"] != "review":
            raise ValueError("Review your notebooks before finishing setup")
        if (state.get("scan") or {}).get("state") in {"reading","planning"}:
            raise ValueError("Wait for reading to finish or stop it before setup")
        from stellis import onboarding_sources
        imported = onboarding_sources.reviewed(proposal_id, group_ids or [])
        created = []
        chosen = [item for item in USES if item["id"] in state["uses"]]
        chosen += [{"id":g["id"],"notebook":g["name"],"collection":g["collection"],"agents":["steward", "writing"],"sources":g["sources"]} for g in imported]
        selected_policies = {}
        for item in chosen:
            if item['id'] in state.get('task_choices', {}):
                name = item['notebook'].casefold()
                setting = state['task_choices'][item['id']]
                if name in selected_policies and selected_policies[name] != setting:
                    raise ValueError("Choose the same task setting for repeated notebook names")
                selected_policies[name] = setting
        for item in chosen:
            collection = next((c for c in collections.list_collections() if c["name"].casefold()==item["collection"].casefold()),None)
            if collection is None: collection = collections.create(item["collection"])
            book = next((b for b in notebooks.list_notebooks() if b["name"].casefold()==item["notebook"].casefold()),None)
            if book is None:
                book = notebooks.create(item["notebook"])
                collections.assign_notebook(book["id"],collection["id"])
            if item['notebook'].casefold() in selected_policies:
                notebooks.update(book['id'], todo_list='on' if selected_policies[item['notebook'].casefold()] else 'off')
            deployed = [agents.deploy(template, book["id"]) for template in state.get("agent_choices", {}).get(item["id"], item["agents"])]
            if item.get("sources"):
                onboarding_sources.file_sources(book["id"],item["sources"])
            created.append({"notebook_id":book["id"], "name":book["name"], "agent_ids":[a["id"] for a in deployed]})
        default = next(item for item in agents.list_agents() if item["is_default"])
        if default["name"] == "General" and not any(a["name"]=="Chief of Staff" for a in agents.list_agents()):
            agents.update(default["id"],name="Chief of Staff",role="Coordinates your notebooks and agents")
        state.update(step="complete",created=created,editing=False); _save(state)
        auth.complete_onboarding(account_id)
    return {"complete":True, "created":created}
