"""Isolated browser fixture: real call socket, storage and tools; scripted model replies only.

Run with PYTHONPATH=src:<repo> and a temporary STELLIS_DATA_DIR. Never a product entrypoint.
When the person mentions a walk, the model proposes the walk goal for yesterday and marks its
agenda topic covered; otherwise it asks whether there is anything else.
"""
import json

from stellis import intake, server


async def stream_tokens(messages, tools=None):
    context = json.loads(messages[0]['content'].rsplit('\n', 1)[1])
    said = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
    names = {tool['function']['name'] for tool in tools or []}
    goal = next((item for item in context['loggable'] if item['item'].startswith('goal:')), None)
    if 'log_entry' in names and goal and 'walk' in said.lower():
        yield {'id': 'call_log', 'name': 'log_entry',
               'arguments': {'item': goal['item'], 'when': 'yesterday', 'evidence': said}}
        yield {'id': 'call_topic', 'name': 'topic_done', 'arguments': {'key': goal['item']}}
        return
    if messages[-1]['role'] == 'tool':
        yield 'Check the date before I log it.'
        return
    yield 'Thanks for telling me. Is there anything else?'


intake.stream_tokens = stream_tokens
app = server.app
